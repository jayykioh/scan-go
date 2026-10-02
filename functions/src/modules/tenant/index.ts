import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  bootstrapTenantResultSchema,
  listMembershipsResultSchema,
  selectActiveTenantResultSchema,
  type TenantSummary,
} from '../../../../shared/contracts/identity.contract.js';
import {
  onboardingChecklistSchema,
  type OnboardingChecklist,
} from '../../../../shared/contracts/onboarding.contract.js';
import {
  AUTHORIZATION_CONTRACT_VERSION,
  customerPhoneQueryResultSchema,
  customerPhoneRecordSchema,
} from '../../../../shared/contracts/authorization.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEvent, writeAuditEventInTransaction } from '../../shared/audit.js';
import {
  LIST_MEMBERSHIPS_LIMIT,
  TENANT_ONBOARDING_DENIED_MESSAGE,
  applyOnboardingStep,
  assertOwnerMember,
  buildTenantOnboardingChecklist,
  decideBootstrap,
  decideCustomerPhoneAccess,
  mapAuthorizationMembership,
  mapIdentity,
  mapMembership,
  nowIso,
  parseCustomerPhoneQueryInput,
  parseOnboardingStateInput,
  parseOnboardingUpdateInput,
  parseTenantBootstrapInput,
  parseTenantCreateInput,
  parseTenantListMembershipsInput,
  parseTenantSelectActiveInput,
  projectCustomerPhone,
  provisionFirstOwnerTenant,
  provisionOwnerTenant,
  readEmail,
  readPhoneNumber,
  readString,
  requireActiveMembership,
  requireUid,
  resolveCustomerPhoneQueryLimit,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

export const callableTenantBootstrap = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    parseTenantBootstrapInput(request.data);

    const token = request.auth?.token as Record<string, unknown> | undefined;
    const email = readEmail(token);
    const phoneNumber = readPhoneNumber(token);
    const isAdmin = token?.admin === true;

    const db = getDb();
    const userRef = db.doc(`users/${uid}`);
    const [userSnapBefore, existingMemberships] = await Promise.all([
      userRef.get(),
      db.collectionGroup('members').where('uid', '==', uid).limit(10).get(),
    ]);

    const memberTenantIds = existingMemberships.docs
      .map((doc) => doc.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id));

    const decision = decideBootstrap(
      memberTenantIds,
      readString(userSnapBefore.get('activeTenantId')),
    );

    let tenantId: string;
    if (decision.kind === 'provision') {
      const provisioned = await provisionFirstOwnerTenant(db, {
        uid,
        email,
        phoneNumber,
        displayName: null,
        isNewUser: true,
      });
      tenantId = provisioned.tenantId;
      if (provisioned.created) {
        await writeAuditEvent({
          tenantId,
          actorUid: uid,
          actorType: 'owner',
          role: 'owner',
          action: 'TenantCreated',
          targetType: 'tenant',
          targetId: tenantId,
        });
      }
    } else {
      tenantId = decision.tenantId;
      const profile: Record<string, unknown> = {
        activeTenantId: decision.activeTenantId,
        updatedAt: nowIso(),
      };
      if (email) profile.email = email;
      if (phoneNumber) profile.phoneNumber = phoneNumber;
      await userRef.set(profile, { merge: true });
    }

    const [userSnap, memberSnap] = await Promise.all([
      userRef.get(),
      db.doc(`tenants/${tenantId}/members/${uid}`).get(),
    ]);

    return bootstrapTenantResultSchema.parse({
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
    });
  },
);

export const callableTenantCreate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const isAdmin = token?.admin === true;

  const { shopName } = parseTenantCreateInput(request.data);

  const db = getDb();
  const tenantId = await provisionOwnerTenant(db, {
    uid,
    email: readEmail(token),
    phoneNumber: readPhoneNumber(token),
    displayName: null,
    shopName,
  });

  await writeAuditEvent({
    tenantId,
    actorUid: uid,
    actorType: 'owner',
    role: 'owner',
    action: 'TenantCreated',
    targetType: 'tenant',
    targetId: tenantId,
  });

  const [userSnap, memberSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`tenants/${tenantId}/members/${uid}`).get(),
  ]);

  return bootstrapTenantResultSchema.parse({
    identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
    membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
  });
});

export const callableTenantListMemberships = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    parseTenantListMembershipsInput(request.data);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const db = getDb();
    const [userSnap, memberSnaps] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db
        .collectionGroup('members')
        .where('uid', '==', uid)
        .limit(LIST_MEMBERSHIPS_LIMIT)
        .get(),
    ]);

    const identity = mapIdentity(uid, userSnap.data() ?? {}, isAdmin);
    const tenants: TenantSummary[] = [];

    for (const memberDoc of memberSnaps.docs) {
      const tenantRef = memberDoc.ref.parent.parent;
      if (!tenantRef) {
        continue;
      }
      const tenantSnap = await tenantRef.get();
      const tenantData = tenantSnap.data() ?? {};
      if (tenantData.archivedAt) {
        continue;
      }
      const roles = memberDoc.get('roles');
      tenants.push({
        tenantId: tenantRef.id,
        shopName: readString(tenantData.shopName) ?? 'Cửa hàng',
        membershipType:
          memberDoc.get('membershipType') === 'staff' ? 'staff' : 'owner',
        roles: Array.isArray(roles) ? roles.map(String) : [],
        isActive: memberDoc.get('isActive') !== false,
        isActiveTenant: identity.activeTenantId === tenantRef.id,
      });
    }

    return listMembershipsResultSchema.parse({ identity, tenants });
  },
);

export const callableTenantSelectActive = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const { tenantId } = parseTenantSelectActiveInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    // Verify membership before the write. A rejection keeps the prior
    // activeTenantId because this handler then stops.
    requireActiveMembership(
      memberSnap.exists ? memberSnap.data() : undefined,
    );

    const userRef = db.doc(`users/${uid}`);
    const userSnapBefore = await userRef.get();
    const previousActiveTenantId = readString(
      userSnapBefore.get('activeTenantId'),
    );

    const now = nowIso();
    await userRef.set(
      { activeTenantId: tenantId, updatedAt: now },
      { merge: true },
    );

    await writeAuditEvent({
      tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'ActiveTenantChanged',
      targetType: 'tenant',
      targetId: tenantId,
      detail: { previousActiveTenantId },
    });

    const userSnap = await userRef.get();

    return selectActiveTenantResultSchema.parse({
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      activeTenantId: tenantId,
    });
  },
);

/**
 * Read the onboarding checklist for one Tenant. Only an active Owner
 * membership of that Tenant may read (REQ-ONB-001, NFR-SEC-001).
 */
export const callableTenantOnboardingGet = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const { tenantId } = parseOnboardingStateInput(request.data);

    const db = getDb();
    const memberSnap = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    assertOwnerMember(memberSnap.exists ? memberSnap.data() : undefined);

    const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', TENANT_ONBOARDING_DENIED_MESSAGE);
    }

    return onboardingChecklistSchema.parse(
      buildTenantOnboardingChecklist(
        tenantId,
        tenantSnap.data(),
        nowIso(),
      ),
    ) satisfies OnboardingChecklist;
  },
);

/**
 * Mark one onboarding step complete for one Tenant. Tenant owns the
 * `onboardingChecklist` field, so only this callable writes it. The update is
 * idempotent: a repeated step keeps its first completion timestamp
 * (REQ-ONB-001).
 */
export const callableTenantOnboardingUpdate = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOnboardingUpdateInput(request.data);

    const db = getDb();
    const tenantRef = db.doc(`tenants/${input.tenantId}`);
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const checklist = await db.runTransaction(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const tenantSnap = await transaction.get(tenantRef);
      assertOwnerMember(memberSnap.exists ? memberSnap.data() : undefined);
      if (!tenantSnap.exists) {
        throw new HttpsError('not-found', TENANT_ONBOARDING_DENIED_MESSAGE);
      }

      const now = nowIso();
      const completion = applyOnboardingStep(
        tenantSnap.data(),
        input.step,
        now,
      );
      transaction.set(
        tenantRef,
        { onboardingChecklist: completion, updatedAt: now },
        { merge: true },
      );
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'OnboardingStepCompleted',
        targetType: 'tenant',
        targetId: input.tenantId,
        detail: { step: input.step },
      });

      return buildTenantOnboardingChecklist(
        input.tenantId,
        { ...(tenantSnap.data() ?? {}), onboardingChecklist: completion },
        now,
      );
    });

    return onboardingChecklistSchema.parse(checklist);
  },
);

/**
 * Role-permission query for Customer phone data. The server derives one
 * `AuthorizationDecision` from the stored membership and the named
 * `customer.phone.read` permission, then keeps or omits the phone field per
 * row. ADMIN bypass is unrestricted; this read records no audit event
 * (NFR-PRIV-001).
 */
export const callableTenantListCustomerPhones = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCustomerPhoneQueryInput(request.data);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    const membership = isAdmin
      ? undefined
      : mapAuthorizationMembership(
          memberSnap.exists ? memberSnap.data() : undefined,
        );

    const decision = decideCustomerPhoneAccess({
      uid,
      tenantId: input.tenantId,
      membership,
      isAdmin,
      decidedAt: nowIso(),
    });

    const snap = await db
      .collection(`tenants/${input.tenantId}/loyaltyMembers`)
      .limit(resolveCustomerPhoneQueryLimit(input))
      .get();

    const records = snap.docs.map((docSnap) => {
      const data = docSnap.data() ?? {};
      const displayName =
        typeof data.displayName === 'string'
          ? data.displayName
          : typeof data.name === 'string'
            ? data.name
            : null;
      const phone = typeof data.phone === 'string' ? data.phone : null;
      return customerPhoneRecordSchema.parse(
        projectCustomerPhone(decision, {
          memberId: docSnap.id,
          displayName,
          phone,
        }),
      );
    });

    return customerPhoneQueryResultSchema.parse({
      schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
      decision,
      records,
    });
  },
);
