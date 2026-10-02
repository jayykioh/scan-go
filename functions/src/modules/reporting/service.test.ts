/**
 * Reporting unit tests (REQ-RPT-001, REQ-RPT-002, ADR 0005).
 *
 * Daily stats are derived from immutable Orders and Payments, keyed by the
 * tenant-local calendar day. Money stays integer VND and gross profit is
 * signed. A repeated rebuild is idempotent.
 */
import { describe, expect, it } from 'vitest';
import {
  aggregateTotals,
  dayKeyFromIso,
  enumerateDayKeys,
  readBoundedPages,
  rebuildDailyStats,
  reconcileDailyStats,
  resolvePeriodRange,
  shiftDayKey,
  type ReportingOrderSource,
  type ReportingPaymentSource,
} from './service.js';

const TZ = 'Asia/Ho_Chi_Minh';

function paidOrder(overrides: Partial<ReportingOrderSource> = {}): ReportingOrderSource {
  return {
    orderId: 'order-1',
    status: 'paid',
    tableId: 'table-1',
    tableNameSnapshot: 'Bàn 1',
    createdAt: '2026-09-12T01:00:00.000Z',
    paidAt: '2026-09-12T02:00:00.000Z',
    cancelledAt: null,
    items: [
      {
        menuItemId: 'item-a',
        name: 'Phở bò',
        quantity: 2,
        lineTotalVnd: 100000,
        lineCostVnd: 44000,
      },
    ],
    ...overrides,
  };
}

function confirmedPayment(
  overrides: Partial<ReportingPaymentSource> = {},
): ReportingPaymentSource {
  return {
    paymentId: 'payment-1',
    orderId: 'order-1',
    amountVnd: 100000,
    status: 'confirmed',
    confirmedAt: '2026-09-12T02:00:00.000Z',
    createdAt: '2026-09-12T02:00:00.000Z',
    correctionKind: null,
    ...overrides,
  };
}

const NOW = '2026-09-13T00:00:00.000Z';

describe('tenant-local day keys', () => {
  it('resolves the day key in the tenant timezone, not UTC', () => {
    expect(dayKeyFromIso('2026-09-12T18:30:00.000Z', TZ)).toBe('20260913');
    expect(dayKeyFromIso('2026-09-12T16:59:00.000Z', TZ)).toBe('20260912');
  });

  it('shifts and enumerates day keys inclusively', () => {
    expect(shiftDayKey('20260912', -1)).toBe('20260911');
    expect(enumerateDayKeys('20260912', '20260914')).toEqual([
      '20260912',
      '20260913',
      '20260914',
    ]);
  });

  it('resolves day, week, and month ranges', () => {
    expect(resolvePeriodRange('day', '20260912')).toEqual({
      fromDay: '20260912',
      toDay: '20260912',
    });
    expect(resolvePeriodRange('week', '20260912')).toEqual({
      fromDay: '20260907',
      toDay: '20260913',
    });
    expect(resolvePeriodRange('month', '20260912')).toEqual({
      fromDay: '20260901',
      toDay: '20260930',
    });
    // A 31-day month ends on the 31st (REQ-RPT-001).
    expect(resolvePeriodRange('month', '20260115')).toEqual({
      fromDay: '20260101',
      toDay: '20260131',
    });
  });

  it('rejects a reversed range', () => {
    expect(() => enumerateDayKeys('20260914', '20260912')).toThrow();
  });
});

describe('readBoundedPages', () => {
  it('reads every page when the record count stays under the cap', async () => {
    const pages = [
      { lastDoc: 2, records: [1, 2] },
      { lastDoc: 4, records: [3, 4] },
      { lastDoc: null, records: [5] },
    ];
    let call = 0;
    const result = await readBoundedPages<number, number>(
      async () => pages[call++],
      2,
      10,
    );
    expect(result.records).toEqual([1, 2, 3, 4, 5]);
    expect(result.truncated).toBe(false);
  });

  it('flags truncation instead of silently dropping source records', async () => {
    const pages = [
      { lastDoc: 2, records: [1, 2] },
      { lastDoc: 4, records: [3, 4] },
      { lastDoc: 6, records: [5, 6] },
    ];
    let call = 0;
    const result = await readBoundedPages<number, number>(
      async () => pages[call++],
      2,
      4,
    );
    expect(result.records).toEqual([1, 2, 3, 4]);
    expect(result.truncated).toBe(true);
  });
});

describe('rebuildDailyStats', () => {
  it('builds paid revenue, COGS, and gross profit for one day', () => {
    const [bundle] = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260912',
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    });

    expect(bundle.doc).toMatchObject({
      dayKey: '20260912',
      createdOrderCount: 1,
      cancelledOrderCount: 0,
      paidOrderCount: 1,
      revenueVnd: 100000,
      costVnd: 44000,
      grossProfitVnd: 56000,
    });
    expect(Number.isInteger(bundle.doc.revenueVnd)).toBe(true);
    expect(bundle.items).toHaveLength(1);
    expect(bundle.items[0]).toMatchObject({
      itemId: 'item-a',
      paidQuantity: 2,
      revenueVnd: 100000,
      costVnd: 44000,
      grossProfitVnd: 56000,
    });
    expect(bundle.tables[0]).toMatchObject({
      tableId: 'table-1',
      paidOrderCount: 1,
      revenueVnd: 100000,
      costVnd: 44000,
      grossProfitVnd: 56000,
    });
  });

  it('counts created and unpaid cancelled orders on their own days', () => {
    const cancelled: ReportingOrderSource = {
      ...paidOrder({
        orderId: 'order-2',
        status: 'cancelled',
        paidAt: null,
        cancelledAt: '2026-09-13T03:00:00.000Z',
        items: [],
      }),
      createdAt: '2026-09-13T01:00:00.000Z',
    };

    const bundles = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260913',
      orders: [paidOrder(), cancelled],
      payments: [confirmedPayment()],
      now: NOW,
    });

    expect(bundles).toHaveLength(2);
    expect(bundles[0].doc.createdOrderCount).toBe(1);
    expect(bundles[1].doc.createdOrderCount).toBe(1);
    expect(bundles[1].doc.cancelledOrderCount).toBe(1);
  });

  it('applies reversal and refund as separate non-negative effects', () => {
    const reversal: ReportingPaymentSource = confirmedPayment({
      paymentId: 'payment-1__reversal',
      status: 'reversed',
      correctionKind: 'reversal',
      confirmedAt: '2026-09-13T02:00:00.000Z',
      createdAt: '2026-09-13T02:00:00.000Z',
    });

    const bundles = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260913',
      orders: [paidOrder()],
      payments: [confirmedPayment(), reversal],
      now: NOW,
    });

    expect(bundles[0].doc.revenueVnd).toBe(100000);
    expect(bundles[1].doc.reversedVnd).toBe(100000);
    expect(bundles[1].doc.reversedOrderCount).toBe(1);
    expect(bundles[1].doc.grossProfitVnd).toBe(-100000);
    expect(bundles[1].doc.revenueVnd).toBe(0);
  });

  it('is idempotent for identical sources', () => {
    const input = {
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260912',
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    };
    const first = rebuildDailyStats(input);
    const second = rebuildDailyStats(input);
    expect(second).toEqual(first);
  });

  it('emits an empty bounded document for a day with no sources', () => {
    const [bundle] = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260912',
      orders: [],
      payments: [],
      now: NOW,
    });
    expect(bundle.doc.revenueVnd).toBe(0);
    expect(bundle.doc.paidOrderCount).toBe(0);
  });
});

describe('aggregateTotals and reconciliation', () => {
  it('sums a bounded period and reconciles to source records', () => {
    const bundles = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260913',
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    });
    const totals = aggregateTotals(bundles.map((bundle) => bundle.doc));
    expect(totals.revenueVnd).toBe(100000);
    expect(totals.paidOrderCount).toBe(1);

    const matches = reconcileDailyStats({
      stats: bundles[0].doc,
      tenantId: 'tenant-1',
      timezone: TZ,
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    });
    expect(matches.matches).toBe(true);
    expect(matches.differences).toEqual([]);
  });

  it('reports differences when a stored day drifts from sources', () => {
    const [bundle] = rebuildDailyStats({
      tenantId: 'tenant-1',
      timezone: TZ,
      fromDay: '20260912',
      toDay: '20260912',
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    });
    const drifted = { ...bundle.doc, revenueVnd: 1 };

    const result = reconcileDailyStats({
      stats: drifted,
      tenantId: 'tenant-1',
      timezone: TZ,
      orders: [paidOrder()],
      payments: [confirmedPayment()],
      now: NOW,
    });
    expect(result.matches).toBe(false);
    expect(result.differences[0]).toContain('revenueVnd');
  });
});
