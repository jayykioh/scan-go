import { describe, expect, it } from 'vitest';
import type { PopularTable } from '@contracts/reporting.contract';
import {
  buildTablePerformanceRows,
  TABLE_PERFORMANCE_READ_LIMIT,
} from './TablePerformance';

/** A table stat row with every field explicit, so each test reads on its own. */
function table(overrides: Partial<PopularTable> = {}): PopularTable {
  return {
    tableId: 'table-01',
    tableName: 'Bàn 1',
    createdOrderCount: 3,
    cancelledOrderCount: 0,
    paidOrderCount: 2,
    revenueVnd: 200000,
    costVnd: 88000,
    grossProfitVnd: 112000,
    reversedVnd: 0,
    refundedVnd: 0,
    ...overrides,
  };
}

describe('buildTablePerformanceRows', () => {
  it('carries the name, paid orders, revenue and gross profit of each table', () => {
    const { rows } = buildTablePerformanceRows([table()]);

    expect(rows).toEqual([
      {
        tableId: 'table-01',
        tableName: 'Bàn 1',
        paidOrderCount: 2,
        revenueVnd: 200000,
        grossProfitVnd: 112000,
      },
    ]);
  });

  it('orders rows by revenue, highest first', () => {
    const { rows } = buildTablePerformanceRows([
      table({ tableId: 'table-low', tableName: 'Bàn 9', revenueVnd: 50000 }),
      table({ tableId: 'table-high', tableName: 'Bàn 2', revenueVnd: 900000 }),
      table({ tableId: 'table-mid', tableName: 'Bàn 5', revenueVnd: 300000 }),
    ]);

    expect(rows.map((row) => row.tableId)).toEqual([
      'table-high',
      'table-mid',
      'table-low',
    ]);
  });

  it('keeps the takeaway row instead of hiding it', () => {
    const { rows } = buildTablePerformanceRows([
      table({ tableId: 'takeaway', tableName: 'Mang về' }),
    ]);

    expect(rows.map((row) => row.tableName)).toEqual(['Mang về']);
  });

  it('uses the name stored with the stats, not a current table lookup', () => {
    const { rows } = buildTablePerformanceRows([
      table({ tableId: 'table-07', tableName: 'Bàn 7 (tên cũ)' }),
    ]);

    expect(rows[0]?.tableName).toBe('Bàn 7 (tên cũ)');
  });

  it('returns no rows and no truncation flag for an empty period', () => {
    const result = buildTablePerformanceRows([]);

    expect(result.rows).toEqual([]);
    expect(result.mayBeTruncated).toBe(false);
  });

  it('flags that more tables may exist once the read limit is reached', () => {
    const many = Array.from({ length: TABLE_PERFORMANCE_READ_LIMIT }, (_, i) =>
      table({ tableId: `table-${i}`, tableName: `Bàn ${i}` }),
    );

    expect(buildTablePerformanceRows(many).mayBeTruncated).toBe(true);
  });

  it('does not flag truncation below the read limit', () => {
    const few = Array.from({ length: TABLE_PERFORMANCE_READ_LIMIT - 1 }, (_, i) =>
      table({ tableId: `table-${i}`, tableName: `Bàn ${i}` }),
    );

    expect(buildTablePerformanceRows(few).mayBeTruncated).toBe(false);
  });
});
