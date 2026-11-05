import { describe, expect, it } from 'vitest';
import { INVOICE_PAGE_SIZE, paginateInvoices } from './CashierView';
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
