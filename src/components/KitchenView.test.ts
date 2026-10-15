import { describe, expect, it } from 'vitest';
import {
  buildKitchenAvailabilityGroups,
  isKitchenQueueOrder,
  kitchenBoardStates,
  kitchenWaitMinutes,
  kitchenWaitTone,
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

/**
 * The tile shows how long a ticket has waited and gets louder with age, so the
 * longest wait is the easiest tile to spot (REQ-KDS-001).
 */
describe('kitchenWaitMinutes', () => {
  const placedAt = new Date('2026-09-12T07:00:00.000Z');

  it('counts whole minutes waited', () => {
    expect(kitchenWaitMinutes(placedAt, placedAt.getTime())).toBe(0);
    expect(kitchenWaitMinutes(placedAt, placedAt.getTime() + 90_000)).toBe(1);
    expect(kitchenWaitMinutes(placedAt, placedAt.getTime() + 3_600_000)).toBe(60);
  });

  it('never shows a negative wait when the clocks disagree', () => {
    expect(kitchenWaitMinutes(placedAt, placedAt.getTime() - 120_000)).toBe(0);
  });
});

describe('kitchenWaitTone', () => {
  it('stays calm, turns amber at ten minutes, red at twenty', () => {
    expect(kitchenWaitTone(0)).toBe('calm');
    expect(kitchenWaitTone(9)).toBe('calm');
    expect(kitchenWaitTone(10)).toBe('warn');
    expect(kitchenWaitTone(19)).toBe('warn');
    expect(kitchenWaitTone(20)).toBe('late');
    expect(kitchenWaitTone(90)).toBe('late');
  });
});

/**
 * The floor plan tells the cook which tables are waiting and how many Orders
 * each one holds, so the tile prints a count and takes the wait colour
 * (REQ-KDS-001, REQ-UX-003).
 */
describe('kitchenBoardStates', () => {
  const now = new Date('2026-09-12T07:30:00.000Z').getTime();

  it('counts the queued Orders per table and tones the oldest wait', () => {
    const states = kitchenBoardStates(
      [
        order({ id: 'a', tableId: 't1', timestamp: new Date('2026-09-12T07:25:00.000Z') }),
        order({ id: 'b', tableId: 't1', timestamp: new Date('2026-09-12T07:29:00.000Z') }),
        order({ id: 'c', tableId: 't2', timestamp: new Date('2026-09-12T07:00:00.000Z') }),
      ],
      now,
    );

    expect(states.get('t1')).toEqual({
      state: 'occupied',
      count: 2,
      detail: 'chờ 5p',
      tone: 'calm',
    });
    // t2 waited thirty minutes, so its tile goes red.
    expect(states.get('t2')?.count).toBe(1);
    expect(states.get('t2')?.tone).toBe('late');
  });

  it('leaves out a table with nothing waiting and hides unpaid Pay-First', () => {
    const states = kitchenBoardStates(
      [
        order({ id: 'a', tableId: 't1', status: 'ready' }),
        order({ id: 'b', tableId: 't2', paymentMode: 'Pay-First' }),
      ],
      now,
    );

    expect(states.size).toBe(0);
  });
});
