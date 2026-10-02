import {
  AUDIT_CONTRACT_VERSION,
  type AuditEvent,
} from '../contracts/audit.contract.js';
import { OWNER_UID_FIXTURE, TENANT_A_FIXTURE } from './identity.fixture.js';

export const ownerRegisteredAuditFixture: AuditEvent = {
  schemaVersion: AUDIT_CONTRACT_VERSION,
  eventId: 'audit-owner-registered-001',
  tenantId: TENANT_A_FIXTURE,
  actorUid: OWNER_UID_FIXTURE,
  actorType: 'owner',
  role: 'owner',
  action: 'OwnerRegistered',
  targetType: 'tenant',
  targetId: TENANT_A_FIXTURE,
  requestId: null,
  reason: null,
  metadata: { email: 'owner@example.com' },
  createdAt: '2026-09-12T03:05:00.000Z',
};

export const staffPinLockedAuditFixture: AuditEvent = {
  schemaVersion: AUDIT_CONTRACT_VERSION,
  eventId: 'audit-staff-pin-locked-001',
  tenantId: TENANT_A_FIXTURE,
  actorUid: 'uid-staff-001',
  actorType: 'staff',
  role: 'cashier',
  action: 'StaffPinLocked',
  targetType: 'member',
  targetId: 'uid-staff-001',
  requestId: 'req-pin-001',
  reason: 'five_failed_attempts',
  metadata: { failedAttempts: 5, lockMinutes: 15 },
  createdAt: '2026-09-12T09:20:00.000Z',
};

export const configChangedAuditFixture: AuditEvent = {
  schemaVersion: AUDIT_CONTRACT_VERSION,
  eventId: 'audit-config-changed-001',
  tenantId: TENANT_A_FIXTURE,
  actorUid: OWNER_UID_FIXTURE,
  actorType: 'owner',
  role: 'owner',
  action: 'ConfigurationChanged',
  targetType: 'tenant',
  targetId: TENANT_A_FIXTURE,
  requestId: null,
  reason: null,
  metadata: { overrides: { timezone: 'Asia/Tokyo' } },
  createdAt: '2026-09-12T04:30:00.000Z',
};

export const adminActionAuditFixture: AuditEvent = {
  schemaVersion: AUDIT_CONTRACT_VERSION,
  eventId: 'audit-admin-action-001',
  tenantId: TENANT_A_FIXTURE,
  actorUid: 'uid-admin-001',
  actorType: 'admin',
  role: 'admin',
  action: 'AdminTenantInspect',
  targetType: 'tenant',
  targetId: TENANT_A_FIXTURE,
  requestId: 'req-admin-001',
  reason: 'support',
  metadata: {},
  createdAt: '2026-09-12T10:00:00.000Z',
};
