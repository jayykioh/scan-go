import {
  IDENTITY_CONTRACT_VERSION,
  type BootstrapTenantResult,
  type FirebaseIdentity,
  type Membership,
  type StaffPinDeniedState,
  type StaffPinVerifyInput,
  type StaffPinVerifyResult,
  type StaffSession,
  type TenantSummary,
} from '../contracts/identity.contract.js';

const CREATED_AT = '2026-09-12T03:00:00.000Z';
const UPDATED_AT = '2026-09-12T04:30:00.000Z';

export const OWNER_UID_FIXTURE = 'uid-owner-001';
export const STAFF_UID_FIXTURE = 'uid-staff-001';
export const TENANT_A_FIXTURE = 'tenant-alpha';
export const TENANT_B_FIXTURE = 'tenant-bravo';

export const firebaseIdentityFixture: FirebaseIdentity = {
  schemaVersion: IDENTITY_CONTRACT_VERSION,
  uid: OWNER_UID_FIXTURE,
  email: 'owner@example.com',
  phoneNumber: null,
  displayName: 'Chủ quán',
  locale: 'vi',
  activeTenantId: TENANT_A_FIXTURE,
  isAdmin: false,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const adminIdentityFixture: FirebaseIdentity = {
  ...firebaseIdentityFixture,
  uid: 'uid-admin-001',
  email: 'admin@scango.app',
  displayName: 'ADMIN',
  isAdmin: true,
};

export const ownerMembershipFixture: Membership = {
  schemaVersion: IDENTITY_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  uid: OWNER_UID_FIXTURE,
  membershipType: 'owner',
  roles: ['owner'],
  permissions: [],
  isActive: true,
  sessionVersion: 1,
  lastLoginAt: UPDATED_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const staffMembershipFixture: Membership = {
  schemaVersion: IDENTITY_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  uid: STAFF_UID_FIXTURE,
  membershipType: 'staff',
  roles: ['cashier'],
  permissions: ['order.settle'],
  isActive: true,
  sessionVersion: 3,
  lastLoginAt: UPDATED_AT,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const tenantSummaryFixture: TenantSummary = {
  tenantId: TENANT_A_FIXTURE,
  shopName: 'Quán Alpha',
  membershipType: 'owner',
  roles: ['owner'],
  isActive: true,
  isActiveTenant: true,
};

export const inactiveTenantSummaryFixture: TenantSummary = {
  tenantId: TENANT_B_FIXTURE,
  shopName: 'Quán Bravo',
  membershipType: 'staff',
  roles: ['kitchen'],
  isActive: false,
  isActiveTenant: false,
};

export const bootstrapTenantResultFixture: BootstrapTenantResult = {
  identity: firebaseIdentityFixture,
  membership: ownerMembershipFixture,
};

export const staffSessionFixture: StaffSession = {
  schemaVersion: IDENTITY_CONTRACT_VERSION,
  sessionId: 'session-001',
  tenantId: TENANT_A_FIXTURE,
  uid: STAFF_UID_FIXTURE,
  deviceId: 'device-cashier-01',
  roles: ['cashier'],
  permissions: ['order.settle'],
  status: 'active',
  sessionVersion: 3,
  issuedAt: '2026-09-12T08:00:00.000Z',
  expiresAt: '2026-09-12T16:00:00.000Z',
  lastSeenAt: '2026-09-12T09:15:00.000Z',
  endedAt: null,
  pinFailedAttempts: 0,
  pinLockedUntil: null,
  pinPolicy: {
    length: 6,
    maxFailedAttempts: 5,
    lockMinutes: 15,
    sessionHours: 8,
  },
};

export const lockedStaffSessionFixture: StaffSession = {
  ...staffSessionFixture,
  status: 'locked',
  pinFailedAttempts: 5,
  pinLockedUntil: '2026-09-12T09:30:00.000Z',
};

export const staffPinVerifyInputFixture: StaffPinVerifyInput = {
  tenantId: TENANT_A_FIXTURE,
  deviceId: 'device-cashier-01',
  pin: '123456',
};

export const staffPinVerifyResultFixture: StaffPinVerifyResult = {
  session: staffSessionFixture,
  remainingAttempts: 5,
};

export const lockedStaffPinDeniedStateFixture: StaffPinDeniedState = {
  reason: 'locked',
  message: 'Phiên nhân viên đang bị khoá. Vui lòng thử lại sau.',
  remainingAttempts: 0,
  lockedUntil: '2026-09-12T09:30:00.000Z',
};

export const invalidStaffPinDeniedStateFixture: StaffPinDeniedState = {
  reason: 'invalid_pin',
  message: 'Mã PIN không đúng.',
  remainingAttempts: 3,
  lockedUntil: null,
};
