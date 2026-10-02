import { describe, expect, it } from 'vitest';
import { isKitchenQueueOrder } from './KitchenView';
import type { Order } from '../types';

function order(overrides: Partial<Order>): Order {
  return {
    id: 'order-1',
    tableId: 'table-1',
    items: [],
    total: 100000,
    status: 'pending',
    timestamp: new Date('2026-09-12T07:00:00.000Z'),
    paymentMode: 'Pay-Later',
    ...overrides,
  };
}

describe('isKitchenQueueOrder', () => {
  it('shows Pay-Later pending and cooking Orders to Kitchen', () => {
    expect(isKitchenQueueOrder(order({ paymentMode: 'Pay-Later' }))).toBe(true);
    expect(
      isKitchenQueueOrder(order({ paymentMode: 'Pay-Later', status: 'cooking' })),
    ).toBe(true);
  });

  it('hides a Pay-First Order until payment records paidAt', () => {
    expect(isKitchenQueueOrder(order({ paymentMode: 'Pay-First' }))).toBe(false);
    expect(
      isKitchenQueueOrder(
        order({
          paymentMode: 'Pay-First',
          paidAt: '2026-09-12T07:20:00.000Z',
        }),
      ),
    ).toBe(true);
  });

  it('excludes ready, served, and paid Orders', () => {
    expect(isKitchenQueueOrder(order({ status: 'ready' }))).toBe(false);
    expect(isKitchenQueueOrder(order({ status: 'served' }))).toBe(false);
    expect(isKitchenQueueOrder(order({ status: 'paid' }))).toBe(false);
  });
});
