import { beforeEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertAreaWaiterUids,
  buildPublicTableLinkDocument,
  buildTableAreaDocument,
  buildTableDocument,
  buildTableLayoutPatch,
  computeNextTokenVersion,
  generateTableToken,
  parseTableConfigureInput,
  parseTableCreateInput,
  parseTableResolveInput,
  projectAssignedAreas,
  readStoredAreaAssignment,
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
import {
  TABLE_AREA_CONTRACT_VERSION,
  TABLE_CONTRACT_VERSION,
} from '../../../../shared/contracts/table.contract.js';

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

  // A QR printed before a contract bump is stored under the older version and
  // must keep resolving (REQ-TBL-001).
  it('resolves a link stored under an older contract version', () => {
    const context = toTableLinkContext(OLD_TABLE_TOKEN_FIXTURE, {
      schemaVersion: 1,
      tenantId: TENANT_A_FIXTURE,
      tableId: activeTableLinkContextFixture.tableId,
      tableName: activeTableLinkContextFixture.tableName,
      tokenVersion: 1,
      isActive: true,
      createdAt: activeTableLinkContextFixture.createdAt,
      revokedAt: null,
    });
    expect(context.schemaVersion).toBe(TABLE_CONTRACT_VERSION);
    expect(context.status).toBe('active');
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
      areaWaiterUids: [],
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
      areaWaiterUids: [],
      updatedAt: '2026-10-08T10:00:00.000Z',
    });
  });

  it('carries the area coverage the table moves into (REQ-TBL-004)', () => {
    expect(
      buildTableLayoutPatch(
        {
          tenantId: TENANT_A_FIXTURE,
          tableId: 'table-1',
          area: 'Sân vườn',
          seats: null,
          position: null,
        },
        '2026-10-08T10:00:00.000Z',
        ['waiter-1', 'waiter-2'],
      ),
    ).toMatchObject({ areaWaiterUids: ['waiter-1', 'waiter-2'] });
  });
});

describe('table area assignment (REQ-TBL-004)', () => {
  const activeWaiter = {
    uid: 'waiter-1',
    data: { roles: ['waiter'], isActive: true },
  };

  it('builds the stored area document the projections are computed from', () => {
    expect(
      buildTableAreaDocument({
        tenantId: TENANT_A_FIXTURE,
        label: 'Sân vườn',
        waiterUids: ['waiter-1'],
        updatedBy: 'owner-uid',
        now: '2026-10-16T10:00:00.000Z',
      }),
    ).toEqual({
      schemaVersion: TABLE_AREA_CONTRACT_VERSION,
      tenantId: TENANT_A_FIXTURE,
      label: 'Sân vườn',
      waiterUids: ['waiter-1'],
      updatedAt: '2026-10-16T10:00:00.000Z',
      updatedBy: 'owner-uid',
    });
  });

  it('accepts an empty assignment and an active Waiter', () => {
    expect(() => assertAreaWaiterUids([])).not.toThrow();
    expect(() => assertAreaWaiterUids([activeWaiter])).not.toThrow();
  });

  it('rejects a member without the Waiter role, an inactive member, and a stranger', () => {
    expect(() =>
      assertAreaWaiterUids([
        { uid: 'cashier-1', data: { roles: ['cashier'], isActive: true } },
      ]),
    ).toThrow(HttpsError);
    expect(() =>
      assertAreaWaiterUids([
        { uid: 'waiter-1', data: { roles: ['waiter'], isActive: false } },
      ]),
    ).toThrow(HttpsError);
    expect(() =>
      assertAreaWaiterUids([{ uid: 'ghost', data: undefined }]),
    ).toThrow(HttpsError);
  });

  it('recomputes one member projection from the area documents', () => {
    const areas = [
      { label: 'Sân vườn', waiterUids: ['waiter-1'] },
      { label: 'Tầng 2', waiterUids: ['waiter-2', 'waiter-1'] },
      { label: 'Khu chính', waiterUids: [] },
    ];

    expect(projectAssignedAreas(areas, 'waiter-1')).toEqual([
      'Sân vườn',
      'Tầng 2',
    ]);
    expect(projectAssignedAreas(areas, 'waiter-2')).toEqual(['Tầng 2']);
    expect(projectAssignedAreas(areas, 'waiter-3')).toEqual([]);
  });

  it('reads a stored area row tolerantly', () => {
    expect(
      readStoredAreaAssignment('area-1', {
        label: ' Sân vườn ',
        waiterUids: ['waiter-1', 7, ''],
      }),
    ).toEqual({ id: 'area-1', label: 'Sân vườn', waiterUids: ['waiter-1'] });
    expect(readStoredAreaAssignment('area-2', { waiterUids: [] })).toBeNull();
    expect(readStoredAreaAssignment('area-3', undefined)).toBeNull();
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
