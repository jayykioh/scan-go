import { describe, expect, it, vi } from 'vitest';
import {
  groupUnpaidBills,
  mergeBillLines,
  resolveBillCustomerName,
  settleTableBill,
  type TableBill,
} from './cashierBill';
import type { LoyaltyMemberView } from '@contracts/loyalty.contract';
import type { Order, OrderItem } from '../types';

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: 'line-1',
    menuId: 'menu-pho',
    name: 'Phở bò',
    price: 60000,
    quantity: 1,
    ...overrides,
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    tableId: 'table-1',
    tableName: 'Bàn 1',
    items: [item()],
    total: 60000,
    status: 'pending',
    timestamp: new Date('2026-09-12T07:00:00.000Z'),
    paymentMode: 'Pay-Later',
    orderType: 'dineIn',
    ...overrides,
  };
}

function member(overrides: Partial<LoyaltyMemberView> = {}): LoyaltyMemberView {
  return {
    schemaVersion: 1,
    memberId: 'member_0900000001',
    displayName: 'Khách Cũ',
    phone: null,
    phoneVisible: false,
    isVerified: true,
    pointBalance: 3,
    paidTotalVnd: 300000,
    visitCount: 2,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

/** REQ-CAS-004: the same dish across Orders prints as one line. */
describe('mergeBillLines', () => {
  it('folds the same dish from two Orders into one line with the summed quantity', () => {
    const lines = mergeBillLines([
      order({ id: 'a', items: [item({ quantity: 2 })] }),
      order({ id: 'b', items: [item({ quantity: 1 })] }),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      name: 'Phở bò',
      quantity: 3,
      unitPriceVnd: 60000,
      totalVnd: 180000,
    });
  });

  it('keeps a different modifier set and a different price on their own lines', () => {
    const lines = mergeBillLines([
      order({
        items: [
          item({ quantity: 1 }),
          item({ quantity: 1, selectedModifiers: ['Ít béo'] }),
          item({ quantity: 1, price: 70000, name: 'Phở tái' }),
        ],
      }),
    ]);
    expect(lines.map((line) => [line.name, line.quantity])).toEqual([
      ['Phở bò', 1],
      ['Phở bò', 1],
      ['Phở tái', 1],
    ]);
  });
});

describe('groupUnpaidBills', () => {
  it('gives one table one bill, its Orders oldest first', () => {
    const bills = groupUnpaidBills([
      order({ id: 'b', timestamp: new Date('2026-09-12T09:00:00.000Z') }),
      order({ id: 'a', timestamp: new Date('2026-09-12T07:00:00.000Z') }),
      order({ id: 'other', tableId: 'table-2', tableName: 'Bàn 2' }),
      order({ id: 'paid', status: 'paid' }),
    ]);
    expect(bills).toHaveLength(2);
    expect(bills[0].key).toBe('table:table-1');
    expect(bills[0].orders.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(bills[0].orderCount).toBe(2);
  });

  it('sums the Orders’ own totals, so a Promotion discount stays applied', () => {
    const bill = groupUnpaidBills([
      order({ id: 'a', total: 50000 }),
      order({ id: 'b', total: 70000 }),
    ])[0];
    expect(bill.totalVnd).toBe(120000);
    // Lines add up to 120000 here, so there is nothing to print as a discount.
    expect(bill.discountVnd).toBe(0);
  });

  it('prints the line total above the bill total as a discount', () => {
    const discounted = groupUnpaidBills([
      order({
        items: [item({ quantity: 2 })],
        total: 108000,
      }),
    ])[0];
    expect(discounted.lineTotalVnd).toBe(120000);
    expect(discounted.discountVnd).toBe(12000);
  });

  it('keeps every takeaway Order its own bill', () => {
    const bills = groupUnpaidBills([
      order({ id: 'take-1', orderType: 'takeaway', tableName: 'Mang về' }),
      order({ id: 'take-2', orderType: 'takeaway', tableName: 'Mang về' }),
    ]);
    expect(bills.map((bill) => bill.key)).toEqual(['order:take-1', 'order:take-2']);
  });

  it('counts the dishes on the whole bill', () => {
    const bill = groupUnpaidBills([
      order({ id: 'a', items: [item({ quantity: 2 })] }),
      order({ id: 'b', items: [item({ quantity: 1, menuId: 'menu-tra', name: 'Trà đá', price: 10000 })] }),
    ])[0];
    expect(bill.itemCount).toBe(3);
    expect(bill.lines).toHaveLength(2);
  });

  it('returns nothing when every Order is paid', () => {
    expect(groupUnpaidBills([order({ status: 'paid' })])).toEqual([]);
  });
});

/** REQ-CAS-003: a returning customer's name is printed on the bill. */
describe('resolveBillCustomerName', () => {
  const bill = (orders: Order[]): TableBill => groupUnpaidBills(orders)[0];

  it('prints the name when every Order on the bill is that member’s', () => {
    const orders = [
      order({ id: 'a', loyaltyMemberId: 'member_0900000001' }),
      order({ id: 'b', loyaltyMemberId: 'member_0900000001' }),
    ];
    expect(resolveBillCustomerName([member()], bill(orders))).toBe('Khách Cũ');
  });

  it('keeps the name when a later round was ordered without the member', () => {
    const mixed = bill([
      order({ id: 'a', loyaltyMemberId: 'member_0900000001' }),
      order({ id: 'b' }),
    ]);
    expect(resolveBillCustomerName([member()], mixed)).toBe('Khách Cũ');
  });

  it('prints no name when two members share the table or none carries one', () => {
    const twoMembers = bill([
      order({ id: 'a', loyaltyMemberId: 'member_0900000001' }),
      order({ id: 'b', loyaltyMemberId: 'member_0900000002' }),
    ]);
    expect(resolveBillCustomerName([member()], twoMembers)).toBeNull();
    expect(resolveBillCustomerName([member()], bill([order({})]))).toBeNull();
  });

  it('prints no name for an unknown member or a blank display name', () => {
    const known = bill([order({ loyaltyMemberId: 'member_0900000001' })]);
    expect(resolveBillCustomerName([], known)).toBeNull();
    expect(
      resolveBillCustomerName([member({ displayName: '   ' })], known),
    ).toBeNull();
  });
});

/** REQ-CAS-004: one press collects the whole bill, Order by Order. */
describe('settleTableBill', () => {
  const bill = (): TableBill =>
    groupUnpaidBills([
      order({ id: 'a', timestamp: new Date('2026-09-12T07:00:00.000Z') }),
      order({ id: 'b', timestamp: new Date('2026-09-12T08:00:00.000Z') }),
    ])[0];

  it('settles every Order, oldest first', async () => {
    const settled: string[] = [];
    const result = await settleTableBill(bill(), async (entry) => {
      settled.push(entry.id);
    });
    expect(settled).toEqual(['a', 'b']);
    expect(result).toEqual({
      settledOrderIds: ['a', 'b'],
      failedOrderId: null,
      error: null,
    });
  });

  it('stops at the first failed Order and reports what settled', async () => {
    const settle = vi.fn(async (entry: Order) => {
      if (entry.id === 'b') throw new Error('Mất kết nối');
    });
    const result = await settleTableBill(bill(), settle);
    expect(settle).toHaveBeenCalledTimes(2);
    expect(result.settledOrderIds).toEqual(['a']);
    expect(result.failedOrderId).toBe('b');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('does not touch a later Order after a failure', async () => {
    const settle = vi.fn(async (entry: Order) => {
      if (entry.id === 'a') throw new Error('Bị từ chối');
    });
    const result = await settleTableBill(bill(), settle);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(result.settledOrderIds).toEqual([]);
    expect(result.failedOrderId).toBe('a');
  });
});
