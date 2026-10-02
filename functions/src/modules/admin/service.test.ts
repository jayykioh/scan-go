import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  ADMIN_AUDIT_LIST_LIMIT,
  ADMIN_CUSTOMER_PHONE_LIST_LIMIT,
  ADMIN_TENANT_LIST_LIMIT,
} from '../../../../shared/contracts/admin.contract.js';
import { buildAuditEventData } from '../../shared/audit.js';
import {
  ADMIN_INVALID_MESSAGE,
  parseAdminChangeTenantInput,
  parseAdminCustomerPhoneInput,
  parseAdminListAuditInput,
  parseAdminListTenantsInput,
  parseAdminOpenTenantInput,
  resolveAuditListLimit,
  resolveCustomerPhoneLimit,
  resolveTenantListLimit,
  toAdminTenantSummary,
} from './service.js';
import {
  isPlatformAdmin,
  requirePlatformAdmin,
} from './index.js';
import { adminActionAuditFixture } from '../../../../shared/fixtures/audit.fixture.js';

function captureHttpsError(run: () => unknown): HttpsError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpsError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an HttpsError to be thrown.');
}

describe('ADMIN platform claim (REQ-ADM-001)', () => {
  it('accepts only the server-verified admin claim', () => {
    expect(isPlatformAdmin({ admin: true })).toBe(true);
    expect(isPlatformAdmin({ admin: false })).toBe(false);
    expect(isPlatformAdmin({})).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });

  it('denies a caller without the admin claim', () => {
    expect(() => requirePlatformAdmin({ admin: true })).not.toThrow();
    for (const token of [{ admin: false }, {}, undefined]) {
      const error = captureHttpsError(() => requirePlatformAdmin(token));
      expect(error.code).toBe('permission-denied');
    }
  });
});

describe('ADMIN delegated-command boundaries', () => {
  it('parses each strict input and rejects unknown fields', () => {
    expect(parseAdminListTenantsInput({})).toEqual({});
    expect(parseAdminOpenTenantInput({ tenantId: 'tenant-a' })).toEqual({
      tenantId: 'tenant-a',
    });
    expect(
      parseAdminChangeTenantInput({
        tenantId: 'tenant-a',
        action: 'archive',
        reason: 'support',
      }),
    ).toEqual({ tenantId: 'tenant-a', action: 'archive', reason: 'support' });
    expect(parseAdminListAuditInput({ tenantId: 'tenant-a' })).toEqual({
      tenantId: 'tenant-a',
    });
    expect(parseAdminCustomerPhoneInput({ tenantId: 'tenant-a' })).toEqual({
      tenantId: 'tenant-a',
    });

    for (const run of [
      () => parseAdminOpenTenantInput({}),
      () => parseAdminOpenTenantInput({ tenantId: 'a', extra: true }),
      () =>
        parseAdminChangeTenantInput({
          tenantId: 'a',
          action: 'delete',
          reason: 'x',
        }),
      () =>
        parseAdminChangeTenantInput({
          tenantId: 'a',
          action: 'archive',
          reason: '',
        }),
      () => parseAdminListAuditInput({ tenantId: 42 }),
      () => parseAdminCustomerPhoneInput({ tenantId: null }),
    ]) {
      const error = captureHttpsError(run);
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(ADMIN_INVALID_MESSAGE);
    }
  });

  it('bounds every list to the contract limit', () => {
    expect(resolveTenantListLimit({})).toBe(ADMIN_TENANT_LIST_LIMIT);
    expect(resolveAuditListLimit({ tenantId: 'a' })).toBe(
      ADMIN_AUDIT_LIST_LIMIT,
    );
    expect(resolveCustomerPhoneLimit({ tenantId: 'a' })).toBe(
      ADMIN_CUSTOMER_PHONE_LIST_LIMIT,
    );
    expect(resolveTenantListLimit({ limit: 5 })).toBe(5);
    expect(() => parseAdminListTenantsInput({ limit: 9999 })).toThrow(
      HttpsError,
    );
  });
});

describe('ADMIN Tenant summary projection (REQ-ADM-001)', () => {
  it('derives a bounded summary without granting authorization', () => {
    const summary = toAdminTenantSummary(
      'tenant-a',
      {
        shopName: 'Quán A',
        industry: 'quan_an',
        pricingTier: 'pro',
        paymentMode: 'payFirst',
        archivedAt: null,
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T01:00:00.000Z',
      },
      3,
    );
    expect(summary).toMatchObject({
      tenantId: 'tenant-a',
      shopName: 'Quán A',
      pricingTier: 'pro',
      paymentMode: 'payFirst',
      state: 'active',
      memberCount: 3,
    });
  });

  it('marks an archived Tenant and applies safe defaults', () => {
    const summary = toAdminTenantSummary(
      'tenant-b',
      { archivedAt: '2026-09-12T02:00:00.000Z' },
      0,
    );
    expect(summary.state).toBe('archived');
    expect(summary.pricingTier).toBe('free');
    expect(summary.paymentMode).toBe('payLater');
    expect(summary.shopName).toBe('tenant-b');
  });
});

describe('ADMIN automatic audit mapping', () => {
  it('maps an ADMIN action to the audit contract shape', () => {
    const eventId = 'audit-1';
    const data = buildAuditEventData(eventId, {
      tenantId: 'tenant-a',
      actorUid: 'uid-admin',
      actorType: 'admin',
      role: 'admin',
      action: 'AdminTenantArchived',
      targetType: 'tenant',
      targetId: 'tenant-a',
      reason: 'support',
      detail: { action: 'archive' },
    });
    expect(data).toMatchObject({
      eventId,
      tenantId: 'tenant-a',
      actorType: 'admin',
      role: 'admin',
      action: 'AdminTenantArchived',
      targetType: 'tenant',
      targetId: 'tenant-a',
      reason: 'support',
      metadata: { action: 'archive' },
    });
    expect(String(data.createdAt)).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('uses the frozen ADMIN audit fixture as the mapping reference', () => {
    expect(adminActionAuditFixture.actorType).toBe('admin');
    expect(adminActionAuditFixture.action).toBe('AdminTenantInspect');
  });
});
