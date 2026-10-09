import { describe, expect, it } from 'vitest';
import { aggregateTableServiceStatus } from './tableStatus.js';

const row = (
  tableId: unknown,
  status: unknown,
  createdAt: unknown = '2026-10-08T10:00:00.000Z',
  paidAt: unknown = null,
) => ({ tableId, status, createdAt, paidAt });

describe('aggregateTableServiceStatus (REQ-TBL-003)', () => {
  it('returns no rows when no table has an open Order', () => {
    expect(aggregateTableServiceStatus([])).toEqual([]);
  });

  it('marks a table with a pending Order occupied', () => {
    expect(aggregateTableServiceStatus([row('table-1', 'pending')])).toEqual([
      {
        tableId: 'table-1',
        state: 'occupied',
        activeOrderCount: 1,
        readyOrderCount: 0,
        unsettledOrderCount: 0,
        oldestActiveOrderAt: '2026-10-08T10:00:00.000Z',
      },
    ]);
  });

  it('marks a ready Order foodReady and a settled served Order occupied', () => {
    const result = aggregateTableServiceStatus([
      row('table-1', 'ready'),
      row('table-2', 'served', '2026-10-08T10:00:00.000Z', '2026-10-08T10:30:00.000Z'),
    ]);
    expect(result.map((entry) => [entry.tableId, entry.state])).toEqual([
      ['table-1', 'foodReady'],
      ['table-2', 'occupied'],
    ]);
  });

  it('marks a served, unsettled Order awaitingPayment', () => {
    const [entry] = aggregateTableServiceStatus([row('table-1', 'served')]);
    expect(entry.state).toBe('awaitingPayment');
    expect(entry.unsettledOrderCount).toBe(1);
  });

  it('folds several Orders of one table and keeps the oldest timestamp', () => {
    const [entry] = aggregateTableServiceStatus([
      row('table-1', 'pending', '2026-10-08T10:05:00.000Z'),
      row('table-1', 'ready', '2026-10-08T10:01:00.000Z'),
    ]);
    expect(entry.activeOrderCount).toBe(2);
    expect(entry.readyOrderCount).toBe(1);
    expect(entry.oldestActiveOrderAt).toBe('2026-10-08T10:01:00.000Z');
  });

  it('ignores takeaway Orders and rows without a table', () => {
    expect(
      aggregateTableServiceStatus([
        row('takeaway', 'pending'),
        row(null, 'pending'),
        row(undefined, 'pending'),
        row('', 'pending'),
      ]),
    ).toEqual([]);
  });

  it('sorts by table id so the projection is deterministic', () => {
    expect(
      aggregateTableServiceStatus([
        row('table-9', 'pending'),
        row('table-2', 'pending'),
        row('table-10', 'pending'),
      ]).map((entry) => entry.tableId),
    ).toEqual(['table-10', 'table-2', 'table-9']);
  });
});
