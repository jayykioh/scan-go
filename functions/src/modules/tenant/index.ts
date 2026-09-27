import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  type TenantSummary,
} from '../../../../shared/contracts/identity.contract.js';
import { getDb } from '../../shared/firestore.js';
import {
  mapIdentity,
  mapMembership,
  nowIso,
  provisionOwnerTenant,
  readEmail,
  readPhoneNumber,
  readString,
  requireUid,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

export const callableTenantBootstrap = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const email = readEmail(token);
    const phoneNumber = readPhoneNumber(token);
    const isAdmin = token?.admin === true;

    const db = getDb();
    const userRef = db.doc(`users/${uid}`);
    const existingMemberships = await db
      .collectionGroup('members')
      .where('uid', '==', uid)
      .limit(10)
      .get();

    const memberTenantIds = existingMemberships.docs
      .map((doc) => doc.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id));

    let tenantId: string;
    if (memberTenantIds.length === 0) {
      tenantId = await provisionOwnerTenant(db, {
        uid,
        email,
        phoneNumber,
        displayName: null,
        isNewUser: true,
      });
    } else {
      tenantId = memberTenantIds[0];
      const userSnap = await userRef.get();
      const currentActive = readString(userSnap.get('activeTenantId'));
      const activeTenantId =
        currentActive && memberTenantIds.includes(currentActive)
          ? currentActive
          : tenantId;
      const profile: Record<string, unknown> = {
        activeTenantId,
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

    return {
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
    };
  },
);

export const callableTenantCreate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  const token = request.auth?.token as Record<string, unknown> | undefined;
  const isAdmin = token?.admin === true;

  const data = (request.data ?? {}) as { shopName?: unknown };
  const shopName = readString(data.shopName)?.trim() || undefined;

  const db = getDb();
  const tenantId = await provisionOwnerTenant(db, {
    uid,
    email: readEmail(token),
    phoneNumber: readPhoneNumber(token),
    displayName: null,
    shopName,
  });

  const [userSnap, memberSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`tenants/${tenantId}/members/${uid}`).get(),
  ]);

  return {
    identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
    membership: mapMembership(tenantId, uid, memberSnap.data() ?? {}),
  };
});

export const callableTenantListMemberships = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const db = getDb();
    const [userSnap, memberSnaps] = await Promise.all([
      db.doc(`users/${uid}`).get(),
      db.collectionGroup('members').where('uid', '==', uid).get(),
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

    return { identity, tenants };
  },
);

export const callableTenantSelectActive = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const isAdmin = token?.admin === true;

    const data = (request.data ?? {}) as { tenantId?: unknown };
    const tenantId = readString(data.tenantId);
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'Thiếu tenantId.');
    }

    const db = getDb();
    const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists || memberSnap.get('isActive') === false) {
      throw new HttpsError(
        'permission-denied',
        'Bạn không thuộc cửa hàng này.',
      );
    }

    const now = nowIso();
    const userRef = db.doc(`users/${uid}`);
    await userRef.set(
      { activeTenantId: tenantId, updatedAt: now },
      { merge: true },
    );
    const userSnap = await userRef.get();

    return {
      identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
      activeTenantId: tenantId,
    };
  },
);
