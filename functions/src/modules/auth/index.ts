import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  AUTHORIZATION_CONTRACT_VERSION,
  authorizationDecisionSchema,
  sessionRevokeResultSchema,
} from '../../../../shared/contracts/authorization.contract.js';
import {
  bootstrapTenantResultSchema,
  staffPinVerifyResultSchema,
} from '../../../../shared/contracts/identity.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import {
  writeAuditEvent,
  writeAuditEventInTransaction,
} from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import { isPlatformAdmin } from '../admin/index.js';
import {
  layersFromSnapshots,
  resolveTenantConfig,
} from '../config/service.js';
import {
  computeNextSessionVersion,
  decideAuthorization,
  mapAuthorizationMembership,
  mapIdentity,
  mapMembership,
  nowIso,
  provisionFirstOwnerTenant,
  readEmail,
  readPhoneNumber,
  readString,
  requireUid,
} from '../tenant/service.js';
import {
  buildStaffSession,
  computePinFailureState,
  isPinLocked,
  parseOwnerRegistrationInput,
  parseStaffAuthorizationInput,
  parseStaffPinVerifyInput,
  parseStaffSessionRevokeInput,
  pinRemainingAttempts,
  requireRegistrationEmail,
  STAFF_ACCESS_DENIED_MESSAGE,
  STAFF_PIN_INCORRECT_MESSAGE,
  STAFF_PIN_LENGTH_MESSAGE,
  STAFF_PIN_LOCKED_MESSAGE,
  STAFF_REVOKE_DENIED_MESSAGE,
  STAFF_REVOKE_NOT_FOUND_MESSAGE,
  verifyPinHash,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

export const callableAuthRegisterOwner = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const email = requireRegistrationEmail(readEmail(token));

    const { shopName, displayName: rawDisplayName } =
      parseOwnerRegistrationInput(request.data);
    const displayName = rawDisplayName ?? null;

    const db = getDb();
    const existing = await db
      .collectionGroup('members')
      .where('uid', '==', uid)
      .limit(1)
      .get();

    let tenantId: string;
    if (!existing.empty) {
      const parent = existing.docs[0].ref.parent.parent;
      if (!parent) {
        throw new HttpsError('internal', 'Không tìm thấy cửa hàng.');
      }
      tenantId = parent.id;
    } else {
      const provisioned = await provisionFirstOwnerTenant(db, {
        uid,
        email,
        phoneNumber: readPhoneNumber(token),
        displayName,
        shopName,
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
          detail: { email },
        }).catch(() => undefined);
      }
    }

    const [userSnap, memberSnap] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.doc(`tenants/${tenantId}/members/${uid}`).get(),
    ]);

    return bootstrapTenantResultSchema.parse({
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
    });
  },
);

type PinVerifyOutcome =
  | {
      kind: 'session';
      result: ReturnType<typeof buildStaffSession>;
      remainingAttempts: null;
    }
  | {
      kind: 'failure';
      failedAttempts: number;
      remainingAttempts: number;
      lockedUntil: string | null;
    };

/**
 * Server verification of a tenant-scoped Staff PIN (REQ-AUTH-002). The caller
 * identity comes from Firebase Auth; the membership supplies the hash, role,
 * reduced permission set, and `sessionVersion`. Config supplies PIN length,
 * attempt limit, lock time, and session duration. Auth owns the lock state.
 *
 * All transaction reads finish before the writes. A failed attempt still
 * commits its counter (and lock) before the callable returns `permission-
 * denied`, so the plaintext PIN is never stored or logged.
 */
export const callableAuthStaffPinVerify = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseStaffPinVerifyInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const platformRef = db.doc('platform/config');
    const tenantRef = db.doc(`tenants/${input.tenantId}`);

    const outcome = await db.runTransaction<PinVerifyOutcome>(
      async (transaction) => {
        const [memberSnap, platformSnap, tenantSnap] = await Promise.all([
          transaction.get(memberRef),
          transaction.get(platformRef),
          transaction.get(tenantRef),
        ]);

        const membership = memberSnap.exists ? memberSnap.data() : undefined;
        if (
          !membership ||
          membership.membershipType !== 'staff' ||
          membership.isActive === false
        ) {
          throw new HttpsError(
            'permission-denied',
            STAFF_ACCESS_DENIED_MESSAGE,
          );
        }

        const policy = resolveTenantConfig(
          layersFromSnapshots(
            platformSnap.exists ? platformSnap.data() : undefined,
            tenantSnap.exists ? tenantSnap.get('configOverrides') : undefined,
          ),
        ).values.pinPolicy;

        const now = new Date();
        const nowIsoValue = now.toISOString();

        if (input.pin.length !== policy.length) {
          throw new HttpsError('invalid-argument', STAFF_PIN_LENGTH_MESSAGE);
        }

        const lockedUntil = readString(membership.pinLockedUntil);
        if (isPinLocked(lockedUntil, now)) {
          throw new HttpsError('permission-denied', STAFF_PIN_LOCKED_MESSAGE, {
            remainingAttempts: 0,
            lockedUntil,
          });
        }

        const roles = Array.isArray(membership.roles)
          ? membership.roles.map(String)
          : [];
        const permissions = Array.isArray(membership.permissions)
          ? membership.permissions.map(String)
          : [];
        const sessionVersion =
          typeof membership.sessionVersion === 'number'
            ? membership.sessionVersion
            : 1;

        const matches = await verifyPinHash(
          input.pin,
          readString(membership.staffPinHash),
        );

        if (matches) {
          const session = buildStaffSession({
            tenantId: input.tenantId,
            uid,
            deviceId: input.deviceId,
            roles,
            permissions,
            sessionVersion,
            policy,
            issuedAt: nowIsoValue,
          });
          transaction.set(
            memberRef,
            {
              pinFailedAttempts: 0,
              pinLockedUntil: null,
              lastLoginAt: nowIsoValue,
              updatedAt: nowIsoValue,
            },
            { merge: true },
          );
          writeAuditEventInTransaction(transaction, {
            tenantId: input.tenantId,
            actorUid: uid,
            actorType: 'staff',
            role: roles[0] ?? null,
            action: 'StaffSessionStarted',
            targetType: 'member',
            targetId: uid,
            detail: { deviceId: input.deviceId, sessionId: session.sessionId },
          });
          return { kind: 'session', result: session, remainingAttempts: null };
        }

        const failure = computePinFailureState(
          typeof membership.pinFailedAttempts === 'number'
            ? membership.pinFailedAttempts
            : 0,
          policy,
          now,
        );
        transaction.set(
          memberRef,
          {
            pinFailedAttempts: failure.failedAttempts,
            pinLockedUntil: failure.lockedUntil,
            updatedAt: nowIsoValue,
          },
          { merge: true },
        );
        if (failure.lockedUntil) {
          writeAuditEventInTransaction(transaction, {
            tenantId: input.tenantId,
            actorUid: uid,
            actorType: 'staff',
            role: roles[0] ?? null,
            action: 'StaffPinLocked',
            targetType: 'member',
            targetId: uid,
            detail: {
              failedAttempts: failure.failedAttempts,
              lockedUntil: failure.lockedUntil,
            },
          });
        }

        return {
          kind: 'failure',
          failedAttempts: failure.failedAttempts,
          remainingAttempts: pinRemainingAttempts(
            failure.failedAttempts,
            policy.maxFailedAttempts,
          ),
          lockedUntil: failure.lockedUntil,
        };
      },
    );

    if (outcome.kind === 'failure') {
      throw new HttpsError(
        'permission-denied',
        outcome.lockedUntil
          ? STAFF_PIN_LOCKED_MESSAGE
          : STAFF_PIN_INCORRECT_MESSAGE,
        {
          remainingAttempts: outcome.remainingAttempts,
          lockedUntil: outcome.lockedUntil,
        },
      );
    }

    return staffPinVerifyResultSchema.parse({
      session: outcome.result,
      remainingAttempts: outcome.remainingAttempts,
    });
  },
);

/**
 * Server authorization decision for one Staff operation (REQ-ACL-001). The
 * caller independently proves tenant membership from Firestore; UI state never
 * participates. An ADMIN bypass writes an automatic audit event
 * (NFR-PRIV-001).
 */
export const callableAuthAuthorizeStaff = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const isAdmin = isPlatformAdmin(token);
  const input = parseStaffAuthorizationInput(request.data);

  const db = getDb();
  const memberSnap = await db
    .doc(`tenants/${input.tenantId}/members/${uid}`)
    .get();

  const decision = decideAuthorization({
    uid,
    tenantId: input.tenantId,
    permission: input.permission,
    sessionVersion: input.sessionVersion,
    membership: mapAuthorizationMembership(
      memberSnap.exists ? memberSnap.data() : undefined,
    ),
    isAdmin,
    decidedAt: nowIso(),
  });

  if (decision.isAdminBypass) {
    await writeAuditEvent({
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'admin',
      role: 'admin',
      action: 'AdminAuthorizationBypass',
      targetType: 'member',
      targetId: uid,
      detail: { permission: input.permission },
    }).catch(() => undefined);
  }

  return authorizationDecisionSchema.parse(decision);
});

/**
 * Owner command: revoke every Staff session for one membership by increasing
 * `sessionVersion` (REQ-AUTH-002). Auth owns session revocation; the version
 * lives on the shared membership document. Writes one `SessionEnded` audit
 * event.
 */
export const callableAuthRevokeStaffSessions = onCall(
  CALL_OPTIONS,
  async (request) => {
    const actorUid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = isPlatformAdmin(token);
    assertAppCheck(request);
    const input = parseStaffSessionRevokeInput(request.data);

    const db = getDb();
    const actorRef = db.doc(`tenants/${input.tenantId}/members/${actorUid}`);
    const targetRef = db.doc(`tenants/${input.tenantId}/members/${input.uid}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const [actorSnap, targetSnap] = await Promise.all([
        transaction.get(actorRef),
        transaction.get(targetRef),
      ]);

      const actor = actorSnap.exists ? actorSnap.data() : undefined;
      if (
        !isAdmin &&
        (!actor ||
          actor.isActive === false ||
          actor.membershipType !== 'owner')
      ) {
        throw new HttpsError('permission-denied', STAFF_REVOKE_DENIED_MESSAGE);
      }
      if (!targetSnap.exists) {
        throw new HttpsError('not-found', STAFF_REVOKE_NOT_FOUND_MESSAGE);
      }

      const revokedAt = nowIso();
      const sessionVersion = computeNextSessionVersion(
        targetSnap.get('sessionVersion'),
      );
      transaction.set(
        targetRef,
        { sessionVersion, updatedAt: revokedAt },
        { merge: true },
      );
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid,
        actorType: isAdmin ? 'admin' : 'owner',
        role: isAdmin ? 'admin' : 'owner',
        action: 'SessionEnded',
        targetType: 'member',
        targetId: input.uid,
        detail: { sessionVersion },
      });

      return { sessionVersion, revokedAt };
    });

    return sessionRevokeResultSchema.parse({
      schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
      tenantId: input.tenantId,
      uid: input.uid,
      sessionVersion: outcome.sessionVersion,
      revokedAt: outcome.revokedAt,
    });
  },
);
