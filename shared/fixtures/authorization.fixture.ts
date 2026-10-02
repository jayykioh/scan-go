import {
  AUTHORIZATION_CONTRACT_VERSION,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type StaffAuthorizationRequest,
} from '../contracts/authorization.contract.js';
import {
  STAFF_UID_FIXTURE,
  TENANT_A_FIXTURE,
} from './identity.fixture.js';

export const authorizationRequestFixture: AuthorizationRequest = {
  tenantId: TENANT_A_FIXTURE,
  permission: 'order.settle',
};

export const staffAuthorizationRequestFixture: StaffAuthorizationRequest = {
  tenantId: TENANT_A_FIXTURE,
  permission: 'order.settle',
  sessionVersion: 3,
};

export const allowedDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: true,
  reason: 'allowed',
  uid: STAFF_UID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  role: 'cashier',
  permission: 'order.settle',
  grantedPermissions: ['order.settle'],
  isAdmin: false,
  isAdminBypass: false,
  isAudited: false,
  decidedAt: '2026-09-12T09:00:00.000Z',
};

export const deniedDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: false,
  reason: 'missing_permission',
  uid: STAFF_UID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  role: 'kitchen',
  permission: 'order.settle',
  grantedPermissions: ['order.transition'],
  isAdmin: false,
  isAdminBypass: false,
  isAudited: false,
  decidedAt: '2026-09-12T09:01:00.000Z',
};

export const adminBypassDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: true,
  reason: 'admin_bypass',
  uid: 'uid-admin-001',
  tenantId: TENANT_A_FIXTURE,
  role: 'admin',
  permission: 'order.settle',
  grantedPermissions: [],
  isAdmin: true,
  isAdminBypass: true,
  isAudited: true,
  decidedAt: '2026-09-12T09:02:00.000Z',
};

export const sessionRevokedDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: false,
  reason: 'session_revoked',
  uid: STAFF_UID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  role: 'cashier',
  permission: 'order.settle',
  grantedPermissions: ['order.settle'],
  isAdmin: false,
  isAdminBypass: false,
  isAudited: false,
  decidedAt: '2026-09-12T09:04:00.000Z',
};

export const noMembershipDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: false,
  reason: 'no_membership',
  uid: STAFF_UID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  role: null,
  permission: 'order.settle',
  grantedPermissions: [],
  isAdmin: false,
  isAdminBypass: false,
  isAudited: false,
  decidedAt: '2026-09-12T09:05:00.000Z',
};

export const unauthenticatedDecisionFixture: AuthorizationDecision = {
  schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
  allowed: false,
  reason: 'unauthenticated',
  uid: 'uid-anonymous',
  tenantId: null,
  role: null,
  permission: null,
  grantedPermissions: [],
  isAdmin: false,
  isAdminBypass: false,
  isAudited: false,
  decidedAt: '2026-09-12T09:03:00.000Z',
};
