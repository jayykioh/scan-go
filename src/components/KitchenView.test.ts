import { describe, expect, it } from 'vitest';
import {
  buildKitchenAvailabilityGroups,
  isKitchenQueueOrder,
} from './KitchenView';
import type { MenuItem, Order } from '../types';

function menuItem(overrides: Partial<MenuItem>): MenuItem {
  return {
    id: 'item-1',
    name: 'Phở bò',
    price: 45000,
    costPrice: 0,
    category: 'Món chính',
    image: '',
    description: '',
    inStock: true,
    stockCount: 999,
    ...overrides,
  };
}

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

describe('buildKitchenAvailabilityGroups', () => {
  const catalog = [
    menuItem({ id: 'a', category: 'Món chính', inStock: true }),
    menuItem({ id: 'b', category: 'Món chính', inStock: false }),
    menuItem({ id: 'c', category: 'Đồ uống', inStock: true }),
  ];

  it('groups active items by category', () => {
    const groups = buildKitchenAvailabilityGroups(catalog, catalog, true);
    expect(groups.map(([category]) => category)).toEqual([
      'Món chính',
      'Đồ uống',
    ]);
    expect(groups[0]?.[1]).toHaveLength(2);
  });

  it('keeps an unavailable item visible so it can be turned back on', () => {
    const liveAvailable = [catalog[0]!];
    const groups = buildKitchenAvailabilityGroups(catalog, liveAvailable, true);
    const mains = groups.find(([category]) => category === 'Món chính')?.[1];
    expect(mains?.find((item) => item.id === 'b')?.inStock).toBe(false);
    expect(mains?.find((item) => item.id === 'a')?.inStock).toBe(true);
  });

  it('uses the catalog availability until the live set reports', () => {
    const groups = buildKitchenAvailabilityGroups(catalog, [], false);
    const mains = groups.find(([category]) => category === 'Món chính')?.[1];
    expect(mains?.find((item) => item.id === 'b')?.inStock).toBe(false);
  });
});
