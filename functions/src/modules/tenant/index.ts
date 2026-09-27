import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  IDENTITY_CONTRACT_VERSION,
  type FirebaseIdentity,
  type Membership,
  type TenantSummary,
} from '../../../../shared/contracts/identity.contract.js';
import { getDb } from '../../shared/firestore.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

const DEFAULT_TENANT_NAME = 'Cửa hàng của tôi';
const DEFAULT_INDUSTRY = 'quan_an';
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

function nowIso(): string {
  return new Date().toISOString();
}

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapIdentity(
  uid: string,
  data: DocumentData,
  isAdmin: boolean,
): FirebaseIdentity {
  const createdAt = readString(data.createdAt) ?? nowIso();
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    uid,
    phoneNumber: readString(data.phoneNumber),
    displayName: readString(data.displayName),
    locale: data.locale === 'en' ? 'en' : 'vi',
    activeTenantId: readString(data.activeTenantId),
    isAdmin,
    createdAt,
    updatedAt: readString(data.updatedAt) ?? createdAt,
  };
}

function mapMembership(
  tenantId: string,
  uid: string,
  data: DocumentData,
): Membership {
  const createdAt = readString(data.createdAt) ?? nowIso();
  const roles = Array.isArray(data.roles) ? data.roles.map(String) : [];
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.map(String)
    : [];
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    tenantId,
    uid,
    membershipType: data.membershipType === 'staff' ? 'staff' : 'owner',
    roles,
    permissions,
    isActive: data.isActive !== false,
    sessionVersion:
      typeof data.sessionVersion === 'number' ? data.sessionVersion : 1,
    lastLoginAt: readString(data.lastLoginAt),
    createdAt,
    updatedAt: readString(data.updatedAt) ?? createdAt,
  };
}

export const callableTenantBootstrap = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    const token = request.auth?.token as Record<string, unknown> | undefined;
    const phoneNumber = readString(token?.phone_number);
    const isAdmin = token?.admin === true;

    const db = getDb();
    const userRef = db.doc(`users/${uid}`);
    const existingMemberships = await db
      .collectionGroup('members')
      .where('uid', '==', uid)
      .limit(10)
      .get();

    const now = nowIso();
    const memberTenantIds = existingMemberships.docs
      .map((doc) => doc.ref.parent.parent?.id)
      .filter((id): id is string => Boolean(id));

    let tenantId: string;
    if (memberTenantIds.length === 0) {
      const tenantRef = db.collection('tenants').doc();
      tenantId = tenantRef.id;
      const batch = db.batch();
      batch.set(tenantRef, {
        shopName: DEFAULT_TENANT_NAME,
        industry: DEFAULT_INDUSTRY,
        timezone: DEFAULT_TIMEZONE,
        pricingTier: 'free',
        paymentMode: 'payLater',
        onboardingChecklist: {},
        configOverrides: {},
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      });
      batch.set(tenantRef.collection('members').doc(uid), {
        uid,
        membershipType: 'owner',
        roles: ['owner'],
        permissions: [],
        isActive: true,
        staffPinHash: null,
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        sessionVersion: 1,
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      });
      batch.set(
        userRef,
        {
          phoneNumber,
          displayName: null,
          locale: 'vi',
          activeTenantId: tenantId,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true },
      );
      await batch.commit();
    } else {
      tenantId = memberTenantIds[0];
      const userSnap = await userRef.get();
      const currentActive = readString(userSnap.get('activeTenantId'));
      const activeTenantId =
        currentActive && memberTenantIds.includes(currentActive)
          ? currentActive
          : tenantId;
      await userRef.set(
        { phoneNumber, activeTenantId, updatedAt: now },
        { merge: true },
      );
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
  const shopName = readString(data.shopName)?.trim() || DEFAULT_TENANT_NAME;

  const db = getDb();
  const now = nowIso();
  const tenantRef = db.collection('tenants').doc();
  const userRef = db.doc(`users/${uid}`);
  const memberData = {
    uid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    staffPinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    sessionVersion: 1,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const batch = db.batch();
  batch.set(tenantRef, {
    shopName,
    industry: DEFAULT_INDUSTRY,
    timezone: DEFAULT_TIMEZONE,
    pricingTier: 'free',
    paymentMode: 'payLater',
    onboardingChecklist: {},
    configOverrides: {},
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  batch.set(tenantRef.collection('members').doc(uid), memberData);
  batch.set(
    userRef,
    { activeTenantId: tenantRef.id, updatedAt: now },
    { merge: true },
  );
  await batch.commit();

  const userSnap = await userRef.get();
  return {
    identity: mapIdentity(uid, userSnap.data() ?? {}, isAdmin),
    membership: mapMembership(tenantRef.id, uid, memberData),
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
