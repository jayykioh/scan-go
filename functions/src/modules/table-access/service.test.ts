import { beforeEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildPublicTableLinkDocument,
  buildTableDocument,
  buildTableLayoutPatch,
  computeNextTokenVersion,
  generateTableToken,
  parseTableConfigureInput,
  parseTableCreateInput,
  parseTableResolveInput,
  toTableLinkContext,
} from './service.js';
import {
  assertRateLimit,
  checkRateLimit,
  resetRateLimits,
} from '../../shared/rateLimit.js';
import {
  activeTableLinkContextFixture,
  NEW_TABLE_TOKEN_FIXTURE,
  OLD_TABLE_TOKEN_FIXTURE,
} from '../../../../shared/fixtures/table.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

describe('generateTableToken', () => {
  it('is opaque, random, and URL-safe', () => {
    const tokens = new Set<string>();
    for (let index = 0; index < 300; index += 1) {
      const token = generateTableToken();
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(32);
      tokens.add(token);
    }
    expect(tokens.size).toBe(300);
  });

  it('never repeats between two calls', () => {
    expect(generateTableToken()).not.toBe(generateTableToken());
  });
});

describe('computeNextTokenVersion', () => {
  it('starts at 1 and increments', () => {
    expect(computeNextTokenVersion(undefined)).toBe(1);
    expect(computeNextTokenVersion(0)).toBe(1);
    expect(computeNextTokenVersion(1)).toBe(2);
    expect(computeNextTokenVersion(7)).toBe(8);
  });
});

describe('toTableLinkContext', () => {
  it('maps an active link to the minimal active context', () => {
    const context = toTableLinkContext(NEW_TABLE_TOKEN_FIXTURE, {
      tenantId: TENANT_A_FIXTURE,
      tableId: activeTableLinkContextFixture.tableId,
      tableName: activeTableLinkContextFixture.tableName,
      tokenVersion: 2,
      isActive: true,
      createdAt: activeTableLinkContextFixture.createdAt,
      revokedAt: null,
    });
    expect(context.status).toBe('active');
    expect(context.isActive).toBe(true);
  });

  it('maps an inactive link to a revoked context', () => {
    const context = toTableLinkContext(OLD_TABLE_TOKEN_FIXTURE, {
      tenantId: TENANT_A_FIXTURE,
      tableId: activeTableLinkContextFixture.tableId,
      tableName: activeTableLinkContextFixture.tableName,
      tokenVersion: 1,
      isActive: false,
      createdAt: activeTableLinkContextFixture.createdAt,
      revokedAt: '2026-09-12T06:00:00.000Z',
    });
    expect(context.status).toBe('revoked');
    expect(context.isActive).toBe(false);
  });
});

describe('public table link document', () => {
  it('contains only minimal public table context', () => {
    const doc = buildPublicTableLinkDocument({
      tenantId: TENANT_A_FIXTURE,
      tableId: activeTableLinkContextFixture.tableId,
      tableName: activeTableLinkContextFixture.tableName,
      tokenVersion: 1,
      now: '2026-09-12T06:00:00.000Z',
    });
    expect(Object.keys(doc).sort()).toEqual(
      [
        'createdAt',
        'isActive',
        'revokedAt',
        'schemaVersion',
        'tableId',
        'tableName',
        'tenantId',
        'tokenVersion',
      ].sort(),
    );
    expect(doc).not.toHaveProperty('staffPinHash');
    expect(doc).not.toHaveProperty('costPriceVnd');
  });

  it('builds a table document with a single active token', () => {
    const doc = buildTableDocument({
      name: 'Bàn 5',
      token: NEW_TABLE_TOKEN_FIXTURE,
      now: '2026-09-12T06:00:00.000Z',
    });
    expect(doc.activeToken).toBe(NEW_TABLE_TOKEN_FIXTURE);
    expect(doc.tokenVersion).toBe(1);
    expect(doc.qrPayload).toBe(`/menu/${NEW_TABLE_TOKEN_FIXTURE}`);
  });
});

describe('table input validation', () => {
  it('rejects a missing name and unknown keys', () => {
    expect(() =>
      parseTableCreateInput({ tenantId: TENANT_A_FIXTURE }),
    ).toThrow(HttpsError);
    expect(() =>
      parseTableCreateInput({
        tenantId: TENANT_A_FIXTURE,
        name: 'Bàn 1',
        token: 'forged',
      }),
    ).toThrow(HttpsError);
  });

  it('accepts a resolve input with or without a tenant scope', () => {
    expect(
      parseTableResolveInput({ token: NEW_TABLE_TOKEN_FIXTURE, tenantId: null }),
    ).toEqual({ token: NEW_TABLE_TOKEN_FIXTURE, tenantId: null });
  });

  it('parses a floor-plan layout and rejects one outside the grid', () => {
    expect(
      parseTableConfigureInput({
        tenantId: TENANT_A_FIXTURE,
        tableId: 'table-1',
        area: 'Sân vườn',
        seats: 4,
        position: { x: 2, y: 3 },
      }),
    ).toEqual({
      tenantId: TENANT_A_FIXTURE,
      tableId: 'table-1',
      area: 'Sân vườn',
      seats: 4,
      position: { x: 2, y: 3 },
    });
    expect(() =>
      parseTableConfigureInput({
        tenantId: TENANT_A_FIXTURE,
        tableId: 'table-1',
        area: null,
        seats: 4,
        position: { x: 0, y: 99 },
      }),
    ).toThrow(HttpsError);
  });
});

describe('buildTableLayoutPatch (REQ-TBL-002)', () => {
  it('replaces all three layout fields and stamps updatedAt', () => {
    expect(
      buildTableLayoutPatch(
        {
          tenantId: TENANT_A_FIXTURE,
          tableId: 'table-1',
          area: 'Tầng 2',
          seats: 6,
          position: { x: 1, y: 1 },
        },
        '2026-10-08T10:00:00.000Z',
      ),
    ).toEqual({
      area: 'Tầng 2',
      seats: 6,
      position: { x: 1, y: 1 },
      updatedAt: '2026-10-08T10:00:00.000Z',
    });
  });

  it('clears a value with an explicit null instead of leaving a stale one', () => {
    expect(
      buildTableLayoutPatch(
        {
          tenantId: TENANT_A_FIXTURE,
          tableId: 'table-1',
          area: null,
          seats: null,
          position: null,
        },
        '2026-10-08T10:00:00.000Z',
      ),
    ).toEqual({
      area: null,
      seats: null,
      position: null,
      updatedAt: '2026-10-08T10:00:00.000Z',
    });
  });
});

describe('rate limit contract', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it('allows the first call and rejects the next beyond the limit', () => {
    const now = 1_000;
    expect(checkRateLimit('token-1', 1, now)).toBe(true);
    expect(checkRateLimit('token-1', 1, now + 1)).toBe(false);
    expect(checkRateLimit('token-2', 1, now + 1)).toBe(true);
  });

  it('resets after the one-minute window', () => {
    expect(checkRateLimit('token-1', 1, 0)).toBe(true);
    expect(checkRateLimit('token-1', 1, 60_001)).toBe(true);
  });

  it('throws a resource-exhausted error when the limit is exceeded', () => {
    assertRateLimit('token-1', 1, 0);
    expect(() => assertRateLimit('token-1', 1, 1)).toThrow(HttpsError);
  });
});
