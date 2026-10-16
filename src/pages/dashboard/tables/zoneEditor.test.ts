import { describe, expect, it } from 'vitest';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import { buildZoneSavePlan, storedAreaLabel } from './zoneEditor';

function table(
  tableId: string,
  name: string,
  area: string | null,
  position: { x: number; y: number } | null = null,
): TenantTable {
  return {
    tableId,
    name,
    isActive: true,
    tokenVersion: 1,
    activeToken: `tok-${tableId}`,
    qrPayload: null,
    nfcWritten: false,
    archivedAt: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    area,
    seats: 4,
    position,
    areaWaiterUids: [],
  };
}

/** REQ-TBL-009: one save writes creates, area moves, and Waiters. */
describe('buildZoneSavePlan', () => {
  it('creates the authored tables in free cells and ticks existing ones in', () => {
    const plan = buildZoneSavePlan({
      originalLabel: null,
      label: 'Sân vườn',
      tables: [table('t1', 'Bàn 1', null, { x: 0, y: 0 })],
      selectedTableIds: ['t1'],
      draftTables: [
        { name: 'Bàn 7', seats: '6' },
        { name: 'Bàn 8', seats: '' },
      ],
      occupiedPositions: [{ x: 0, y: 0 }],
      waiterUids: ['waiter-1'],
      currentWaiterUids: [],
    });

    expect(plan.creates).toEqual([
      { name: 'Bàn 7', seats: 6, position: { x: 1, y: 0 } },
      { name: 'Bàn 8', seats: null, position: { x: 2, y: 0 } },
    ]);
    expect(plan.relabels).toEqual([
      { table: expect.objectContaining({ tableId: 't1' }), area: 'Sân vườn' },
    ]);
    expect(plan.releasedLabel).toBeNull();
    expect(plan.assign).toEqual({ label: 'Sân vườn', waiterUids: ['waiter-1'] });
    expect(plan.overflow).toBe(0);
  });

  it('drops a table that is no longer ticked out of the zone only', () => {
    const plan = buildZoneSavePlan({
      originalLabel: 'Sân vườn',
      label: 'Sân vườn',
      tables: [
        table('t1', 'Bàn 1', 'Sân vườn'),
        table('t2', 'Bàn 2', 'Sân vườn'),
        table('t3', 'Bàn 3', 'Tầng 2'),
      ],
      selectedTableIds: ['t1'],
      draftTables: [],
      occupiedPositions: [],
      waiterUids: [],
      currentWaiterUids: [],
    });

    expect(plan.relabels).toEqual([
      { table: expect.objectContaining({ tableId: 't2' }), area: null },
    ]);
    expect(plan.assign).toBeNull();
  });

  it('moves the whole zone to a new name and releases the old assignment', () => {
    const plan = buildZoneSavePlan({
      originalLabel: 'Sân vườn',
      label: 'Hiên trước',
      tables: [table('t1', 'Bàn 1', 'Sân vườn')],
      selectedTableIds: ['t1'],
      draftTables: [],
      occupiedPositions: [],
      waiterUids: ['waiter-1'],
      currentWaiterUids: ['waiter-1'],
    });

    expect(plan.releasedLabel).toBe('Sân vườn');
    expect(plan.assign).toEqual({
      label: 'Hiên trước',
      waiterUids: ['waiter-1'],
    });
  });

  it('writes the assignment when only the Waiters changed, in any order', () => {
    const plan = buildZoneSavePlan({
      originalLabel: 'Sân vườn',
      label: 'Sân vườn',
      tables: [],
      selectedTableIds: [],
      draftTables: [],
      occupiedPositions: [],
      waiterUids: ['waiter-2', 'waiter-1'],
      currentWaiterUids: ['waiter-1', 'waiter-2'],
    });

    expect(plan.assign).toBeNull();
  });

  it('sends nothing for waiters when a brand new zone has none', () => {
    const plan = buildZoneSavePlan({
      originalLabel: null,
      label: 'Sân vườn',
      tables: [],
      selectedTableIds: [],
      draftTables: [],
      occupiedPositions: [],
      waiterUids: [],
      currentWaiterUids: [],
    });

    expect(plan.assign).toBeNull();
  });

  it('reports authored tables the floor grid could not hold', () => {
    const occupied = [];
    for (let y = 0; y < 10; y += 1) {
      for (let x = 0; x < 12; x += 1) {
        occupied.push({ x, y });
      }
    }

    const plan = buildZoneSavePlan({
      originalLabel: null,
      label: 'Sân vườn',
      tables: [],
      selectedTableIds: [],
      draftTables: [{ name: 'Bàn 7', seats: '' }],
      occupiedPositions: occupied,
      waiterUids: [],
      currentWaiterUids: [],
    });

    expect(plan.creates).toEqual([]);
    expect(plan.overflow).toBe(1);
  });

  it('stores the default area as no name instead of its label', () => {
    expect(storedAreaLabel('Khu chính')).toBeNull();
    expect(storedAreaLabel('Sân vườn')).toBe('Sân vườn');
  });
});
