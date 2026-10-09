import { describe, expect, it } from 'vitest';
import {
  EMPTY_TABLE_LAYOUT,
  TABLE_FLOOR_COLUMNS,
  TABLE_FLOOR_ROWS,
  TABLE_MAX_SEATS,
  readStoredTableLayout,
  tableConfigureInputSchema,
  tableLinkContextSchema,
  tableTokenRotationSchema,
} from './table.contract.js';
import {
  activeTableLinkContextFixture,
  expiredTableLinkContextFixture,
  firstTableTokenFixture,
  revokedTableLinkContextFixture,
  rotatedTableTokenFixture,
  unknownTableLinkContextFixture,
} from '../fixtures/table.fixture.js';

describe('TableLinkContext contract', () => {
  it('accepts the active, revoked, expired, and unknown token fixtures', () => {
    for (const fixture of [
      activeTableLinkContextFixture,
      revokedTableLinkContextFixture,
      expiredTableLinkContextFixture,
      unknownTableLinkContextFixture,
    ]) {
      expect(tableLinkContextSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects a revoked token that reports itself active', () => {
    expect(
      tableLinkContextSchema.safeParse({
        ...revokedTableLinkContextFixture,
        isActive: true,
      }).success,
    ).toBe(false);
  });
});

describe('TableTokenRotation contract', () => {
  it('accepts the first and rotated token fixtures', () => {
    expect(tableTokenRotationSchema.safeParse(firstTableTokenFixture).success).toBe(
      true,
    );
    expect(
      tableTokenRotationSchema.safeParse(rotatedTableTokenFixture).success,
    ).toBe(true);
  });

  it('rejects a version that does not follow the previous version', () => {
    expect(
      tableTokenRotationSchema.safeParse({
        ...rotatedTableTokenFixture,
        newTokenVersion: 5,
      }).success,
    ).toBe(false);
  });
});

describe('TableConfigureInput contract (REQ-TBL-002)', () => {
  const base = {
    tenantId: 'tenant-a',
    tableId: 'table-1',
    area: 'Sân vườn',
    seats: 4,
    position: { x: 3, y: 2 },
  };

  it('accepts a full layout, including explicit nulls that clear a value', () => {
    expect(tableConfigureInputSchema.safeParse(base).success).toBe(true);
    expect(
      tableConfigureInputSchema.safeParse({
        ...base,
        area: null,
        seats: null,
        position: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a position outside the floor grid', () => {
    for (const position of [
      { x: -1, y: 0 },
      { x: TABLE_FLOOR_COLUMNS, y: 0 },
      { x: 0, y: TABLE_FLOOR_ROWS },
      { x: 1.5, y: 0 },
    ]) {
      expect(
        tableConfigureInputSchema.safeParse({ ...base, position }).success,
      ).toBe(false);
    }
  });

  it('rejects a seat count outside one to the maximum', () => {
    for (const seats of [0, TABLE_MAX_SEATS + 1, 2.5]) {
      expect(
        tableConfigureInputSchema.safeParse({ ...base, seats }).success,
      ).toBe(false);
    }
  });

  it('rejects an unknown field instead of silently dropping it', () => {
    expect(
      tableConfigureInputSchema.safeParse({ ...base, pixelX: 120 }).success,
    ).toBe(false);
  });
});

describe('readStoredTableLayout', () => {
  it('returns empty layout for a row written before the floor plan existed', () => {
    expect(readStoredTableLayout({ name: 'Bàn 1', archivedAt: null })).toEqual(
      EMPTY_TABLE_LAYOUT,
    );
    expect(readStoredTableLayout(undefined)).toEqual(EMPTY_TABLE_LAYOUT);
  });

  it('reads a saved layout back unchanged', () => {
    expect(
      readStoredTableLayout({
        area: 'Tầng 2',
        seats: 6,
        position: { x: 1, y: 9 },
      }),
    ).toEqual({ area: 'Tầng 2', seats: 6, position: { x: 1, y: 9 } });
  });

  it('falls back to empty when a stored value is out of range', () => {
    expect(readStoredTableLayout({ seats: 999 })).toEqual(EMPTY_TABLE_LAYOUT);
    expect(readStoredTableLayout({ position: { x: 99, y: 0 } })).toEqual(
      EMPTY_TABLE_LAYOUT,
    );
  });
});
