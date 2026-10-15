import { describe, expect, it } from 'vitest';
import {
  INVOICE_PAGE_SIZE,
  ordersForTable,
  paginateInvoices,
  resolveCustomerName,
} from './CashierView';
import type { LoyaltyMemberView } from '@contracts/loyalty.contract';
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

function member(overrides: Partial<LoyaltyMemberView>): LoyaltyMemberView {
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

/** REQ-CAS-003: the dialog shows the table's own unpaid bills, oldest first. */
describe('ordersForTable', () => {
  it('keeps only that table’s unpaid Orders, oldest first', () => {
    const orders = [
      order({ id: 'b', tableId: 'table-1', timestamp: new Date('2026-09-12T09:00:00.000Z') }),
      order({ id: 'a', tableId: 'table-1', timestamp: new Date('2026-09-12T07:00:00.000Z') }),
      order({ id: 'other', tableId: 'table-2' }),
      order({ id: 'paid', tableId: 'table-1', status: 'paid' }),
    ];
    expect(ordersForTable(orders, 'table-1').map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('returns nothing for a table with no open bill', () => {
    expect(ordersForTable([order({ id: 'paid', status: 'paid' })], 'table-1')).toEqual([]);
  });
});

/** REQ-CAS-003: five settled invoices a page, with the page clamped. */
describe('paginateInvoices', () => {
  const invoices = Array.from({ length: 6 }, (_, index) =>
    order({ id: `invoice-${index + 1}`, status: 'paid' }),
  );

  it('pages five invoices at a time', () => {
    expect(INVOICE_PAGE_SIZE).toBe(5);
    const first = paginateInvoices(invoices, 1);
    expect(first.rows.map((entry) => entry.id)).toEqual([
      'invoice-1',
      'invoice-2',
      'invoice-3',
      'invoice-4',
      'invoice-5',
    ]);
    expect(first.pageCount).toBe(2);
    expect(paginateInvoices(invoices, 2).rows.map((entry) => entry.id)).toEqual([
      'invoice-6',
    ]);
  });

  it('clamps a page past the end and an empty history', () => {
    expect(paginateInvoices(invoices, 9).page).toBe(2);
    expect(paginateInvoices(invoices, 0).page).toBe(1);
    const empty = paginateInvoices([], 3);
    expect(empty).toEqual({ rows: [], page: 1, pageCount: 1 });
  });
});

/** REQ-CAS-003: a returning customer's name is printed on the bill. */
describe('resolveCustomerName', () => {
  it('resolves the name from the Order’s Loyalty member id', () => {
    const bill = order({ loyaltyMemberId: 'member_0900000001' });
    expect(resolveCustomerName([member({})], bill)).toBe('Khách Cũ');
  });

  it('prints no name without a member id, a missing member, or a blank name', () => {
    expect(resolveCustomerName([member({})], order({}))).toBeNull();
    expect(
      resolveCustomerName([], order({ loyaltyMemberId: 'member_0900000001' })),
    ).toBeNull();
    expect(
      resolveCustomerName(
        [member({ displayName: '   ' })],
        order({ loyaltyMemberId: 'member_0900000001' }),
      ),
    ).toBeNull();
  });
});
