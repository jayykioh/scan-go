import { describe, expect, it } from 'vitest';
import { toOperationTables } from './useOperationTables';
import type { TenantTable } from '../data/adapters/table.adapter';
import type { TableConfig } from '../types';

function tenantTable(overrides: Partial<TenantTable>): TenantTable {
  return {
    tableId: 't1',
    name: 'Bàn 01',
    isActive: true,
    tokenVersion: 1,
    activeToken: 'tok',
    qrPayload: null,
    nfcWritten: true,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    area: null,
    seats: null,
    position: null,
    ...overrides,
  };
}

describe('toOperationTables', () => {
  it('uses the configured Tenant plan with its area, seats, and cell', () => {
    const tables = toOperationTables(
      [
        tenantTable({
          tableId: 't1',
          name: 'Bàn 01',
          area: 'Tầng 1',
          seats: 4,
          position: { x: 2, y: 1 },
        }),
      ],
      [{ id: 'mock', name: 'Bàn mock' }],
    );

    expect(tables).toEqual([
      {
        tableId: 't1',
        name: 'Bàn 01',
        area: 'Tầng 1',
        seats: 4,
        position: { x: 2, y: 1 },
      },
    ]);
  });

  it('falls back to the demo list when the Tenant has no tables', () => {
    const tables = toOperationTables([], [
      { id: '1', name: 'Bàn 01' },
      { id: '2', name: 'Bàn 02' },
    ]);

    expect(tables).toEqual([
      { tableId: '1', name: 'Bàn 01', area: null, seats: null, position: null },
      { tableId: '2', name: 'Bàn 02', area: null, seats: null, position: null },
    ]);
  });

  it('returns nothing when neither source has a table', () => {
    expect(toOperationTables([], [])).toEqual([]);
  });
});
