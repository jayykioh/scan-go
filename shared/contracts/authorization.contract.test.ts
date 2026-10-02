import { describe, expect, it } from 'vitest';
import {
  authorizationDecisionSchema,
  authorizationRequestSchema,
  sessionRevokeResultSchema,
  staffAuthorizationRequestSchema,
  staffSessionRevokeInputSchema,
} from './authorization.contract.js';
import {
  adminBypassDecisionFixture,
  allowedDecisionFixture,
  deniedDecisionFixture,
  noMembershipDecisionFixture,
  sessionRevokedDecisionFixture,
  staffAuthorizationRequestFixture,
  unauthenticatedDecisionFixture,
} from '../fixtures/authorization.fixture.js';
import { TENANT_A_FIXTURE } from '../fixtures/identity.fixture.js';

describe('AuthorizationDecision contract', () => {
  it('accepts the decision fixtures', () => {
    for (const fixture of [
      allowedDecisionFixture,
      deniedDecisionFixture,
      adminBypassDecisionFixture,
      sessionRevokedDecisionFixture,
      noMembershipDecisionFixture,
      unauthenticatedDecisionFixture,
    ]) {
      expect(authorizationDecisionSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects an ADMIN bypass that is not audited', () => {
    expect(
      authorizationDecisionSchema.safeParse({
        ...adminBypassDecisionFixture,
        isAudited: false,
      }).success,
    ).toBe(false);
  });

  it('rejects an allowed decision with a denied reason', () => {
    expect(
      authorizationDecisionSchema.safeParse({
        ...deniedDecisionFixture,
        allowed: true,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown extra key', () => {
    expect(
      authorizationDecisionSchema.safeParse({
        ...allowedDecisionFixture,
        rogue: true,
      }).success,
    ).toBe(false);
  });
});

describe('AuthorizationRequest contract', () => {
  it('requires an explicit tenantId for the command', () => {
    expect(
      authorizationRequestSchema.safeParse({
        tenantId: TENANT_A_FIXTURE,
        permission: 'order.settle',
      }).success,
    ).toBe(true);
    expect(
      authorizationRequestSchema.safeParse({ permission: 'order.settle' })
        .success,
    ).toBe(false);
  });

  it('never accepts activeTenantId as authorization proof', () => {
    expect(
      authorizationRequestSchema.safeParse({
        activeTenantId: TENANT_A_FIXTURE,
        permission: 'order.settle',
      }).success,
    ).toBe(false);
  });
});

describe('StaffAuthorizationRequest contract', () => {
  it('requires the session version presented by the Staff session', () => {
    expect(
      staffAuthorizationRequestSchema.safeParse(staffAuthorizationRequestFixture)
        .success,
    ).toBe(true);
    expect(
      staffAuthorizationRequestSchema.safeParse({
        tenantId: TENANT_A_FIXTURE,
        permission: 'order.settle',
      }).success,
    ).toBe(false);
  });

  it('still rejects activeTenantId and unknown keys', () => {
    expect(
      staffAuthorizationRequestSchema.safeParse({
        ...staffAuthorizationRequestFixture,
        activeTenantId: TENANT_A_FIXTURE,
      }).success,
    ).toBe(false);
  });

  it('rejects a negative session version', () => {
    expect(
      staffAuthorizationRequestSchema.safeParse({
        ...staffAuthorizationRequestFixture,
        sessionVersion: -1,
      }).success,
    ).toBe(false);
  });
});

describe('Staff session revoke contract', () => {
  it('accepts a tenant and member input and a positive revoke result', () => {
    expect(
      staffSessionRevokeInputSchema.safeParse({
        tenantId: TENANT_A_FIXTURE,
        uid: 'staff-uid',
      }).success,
    ).toBe(true);
    expect(
      sessionRevokeResultSchema.safeParse({
        schemaVersion: 1,
        tenantId: TENANT_A_FIXTURE,
        uid: 'staff-uid',
        sessionVersion: 4,
        revokedAt: '2026-09-12T09:06:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('rejects a non-positive revoke result version', () => {
    expect(
      sessionRevokeResultSchema.safeParse({
        schemaVersion: 1,
        tenantId: TENANT_A_FIXTURE,
        uid: 'staff-uid',
        sessionVersion: 0,
        revokedAt: '2026-09-12T09:06:00.000Z',
      }).success,
    ).toBe(false);
  });
});
