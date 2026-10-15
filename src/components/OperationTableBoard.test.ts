import { describe, expect, it } from 'vitest';
import { summarizeOrdersByTable } from './OperationTableBoard';
import type { Order } from '../types';

function order(overrides: Partial<Order>): Order {
  return {
    id: 'order-1',
    tableId: 'table-1',
    items: [],
    total: 100000,
    status: 'pending',
    timestamp: new Date('2026-10-13T07:00:00.000Z'),
    paymentMode: 'Pay-Later',
    ...overrides,
  };
}

describe('summarizeOrdersByTable', () => {
  it('counts orders per table and keeps the oldest timestamp', () => {
    const summary = summarizeOrdersByTable([
      order({ id: 'a', tableId: 't1', timestamp: new Date('2026-10-13T07:10:00.000Z') }),
      order({ id: 'b', tableId: 't1', timestamp: new Date('2026-10-13T07:00:00.000Z') }),
      order({ id: 'c', tableId: 't2', timestamp: new Date('2026-10-13T07:05:00.000Z') }),
    ]);

    expect(summary.get('t1')?.count).toBe(2);
    expect(summary.get('t1')?.oldestAt?.toISOString()).toBe(
      '2026-10-13T07:00:00.000Z',
    );
    expect(summary.get('t2')?.count).toBe(1);
  });

  it('reports no table for a queue with no orders', () => {
    expect(summarizeOrdersByTable([]).size).toBe(0);
  });

  it('groups takeaway orders under their reserved table label', () => {
    const summary = summarizeOrdersByTable([
      order({ id: 'a', tableId: 'Mang về', orderType: 'takeaway' }),
    ]);

    expect(summary.get('Mang về')?.count).toBe(1);
  });
});
