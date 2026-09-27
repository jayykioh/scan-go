import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import {
  IDENTITY_CONTRACT_VERSION,
  type FirebaseIdentity,
  type Membership,
} from '../../../../shared/contracts/identity.contract.js';

export const DEFAULT_TENANT_NAME = 'Cửa hàng của tôi';
export const DEFAULT_INDUSTRY = 'quan_an';
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function nowIso(): string {
  return new Date().toISOString();
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

export function readEmail(
  token: Record<string, unknown> | undefined,
): string | null {
  return readString(token?.email);
}

export function readPhoneNumber(
  token: Record<string, unknown> | undefined,
): string | null {
  return readString(token?.phone_number);
}

export function mapIdentity(
  uid: string,
  data: DocumentData,
  isAdmin: boolean,
): FirebaseIdentity {
  const createdAt = readString(data.createdAt) ?? nowIso();
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    uid,
    email: readString(data.email),
    phoneNumber: readString(data.phoneNumber),
    displayName: readString(data.displayName),
    locale: data.locale === 'en' ? 'en' : 'vi',
    activeTenantId: readString(data.activeTenantId),
    isAdmin,
    createdAt,
    updatedAt: readString(data.updatedAt) ?? createdAt,
  };
}

export function mapMembership(
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

export interface OwnerProvisionInput {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  shopName?: string | null;
  isNewUser?: boolean;
}

export async function provisionOwnerTenant(
  db: Firestore,
  input: OwnerProvisionInput,
): Promise<string> {
  const now = nowIso();
  const tenantRef = db.collection('tenants').doc();
  const ownerMember = {
    uid: input.uid,
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
  const profile: Record<string, unknown> = {
    activeTenantId: tenantRef.id,
    updatedAt: now,
  };
  if (input.email) profile.email = input.email;
  if (input.phoneNumber) profile.phoneNumber = input.phoneNumber;
  if (input.displayName) profile.displayName = input.displayName;
  if (input.isNewUser) {
    profile.locale = 'vi';
    profile.createdAt = now;
  }

  const batch = db.batch();
  batch.set(tenantRef, {
    shopName: input.shopName?.trim() || DEFAULT_TENANT_NAME,
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
  batch.set(tenantRef.collection('members').doc(input.uid), ownerMember);
  batch.set(db.doc(`users/${input.uid}`), profile, { merge: true });
  await batch.commit();

  return tenantRef.id;
}
