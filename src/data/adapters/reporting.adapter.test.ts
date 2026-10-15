import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  averageOrderValueVnd,
  cancellationRatePercent,
  foodCostPercent,
  formatVnd,
  getReportingSummary,
  netRevenueVnd,
  rebuildReportingDailyStats,
  refundRatePercent,
} from './reporting.adapter';
import type { ReportingTotals } from '@contracts/reporting.contract';
import {
  reportingRebuildResultFixture,
  reportingSummaryResultFixture,
} from '@shared/fixtures/reporting.fixture';

/** Totals with every field explicit, so each test reads as its own story. */
function totals(overrides: Partial<ReportingTotals> = {}): ReportingTotals {
  return {
    createdOrderCount: 0,
    cancelledOrderCount: 0,
    paidOrderCount: 0,
    reversedOrderCount: 0,
    refundedOrderCount: 0,
    revenueVnd: 0,
    costVnd: 0,
    grossProfitVnd: 0,
    reversedVnd: 0,
    refundedVnd: 0,
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  getFirebaseFunctions: vi.fn(),
  httpsCallable: vi.fn(),
  readReportingSummary: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mocks.httpsCallable(...args),
}));

vi.mock('../../services/firebase/client', () => ({
  getFirebaseFunctions: () => mocks.getFirebaseFunctions(),
}));

vi.mock('../firestoreRead', () => ({
  readReportingSummary: (...args: unknown[]) =>
    mocks.readReportingSummary(...args),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('formatVnd', () => {
  it('keeps money integer and appends the VND suffix', () => {
    const formatted = formatVnd(100000);
    expect(formatted.endsWith('đ')).toBe(true);
    expect(formatted).not.toContain(',');
    expect(formatVnd(100000.9)).toBe(formatted);
  });
});

describe('getReportingSummary', () => {
  it('reads the materialized daily stats directly through firestoreRead', async () => {
    mocks.readReportingSummary.mockResolvedValue(reportingSummaryResultFixture);

    const result = await getReportingSummary({
      tenantId: 'tenant-alpha',
      period: 'day',
    });

    expect(mocks.readReportingSummary).toHaveBeenCalledWith(
      'day',
      undefined,
      'tenant-alpha',
    );
    expect(result.totals.revenueVnd).toBe(200000);
    expect(Number.isInteger(result.totals.grossProfitVnd)).toBe(true);
  });
});

describe('rebuildReportingDailyStats', () => {
  it('calls the rebuild callable and parses the Zod result', async () => {
    mocks.getFirebaseFunctions.mockReturnValue({});
    mocks.httpsCallable.mockReturnValue(
      vi.fn().mockResolvedValue({ data: reportingRebuildResultFixture }),
    );

    const result = await rebuildReportingDailyStats({
      tenantId: 'tenant-alpha',
      fromDay: '20260912',
      toDay: '20260912',
    });

    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      {},
      'callableReportingRebuildDailyStats',
    );
    expect(result.rebuiltDayCount).toBe(1);
  });
});

describe('netRevenueVnd', () => {
  it('subtracts reversals and refunds from gross revenue', () => {
    expect(
      netRevenueVnd(
        totals({ revenueVnd: 200000, reversedVnd: 30000, refundedVnd: 20000 }),
      ),
    ).toBe(150000);
  });

  it('equals gross revenue when nothing was reversed or refunded', () => {
    expect(netRevenueVnd(totals({ revenueVnd: 200000 }))).toBe(200000);
  });

  it('can go negative when refunds exceed revenue', () => {
    expect(
      netRevenueVnd(totals({ revenueVnd: 10000, refundedVnd: 30000 })),
    ).toBe(-20000);
  });

  it('keeps gross profit consistent with net revenue minus cost', () => {
    const period = totals({
      revenueVnd: 200000,
      costVnd: 88000,
      reversedVnd: 30000,
      refundedVnd: 20000,
      grossProfitVnd: 62000,
    });

    expect(period.grossProfitVnd).toBe(netRevenueVnd(period) - period.costVnd);
  });
});

describe('foodCostPercent', () => {
  it('reports cost as a rounded integer percent of net revenue', () => {
    expect(foodCostPercent(totals({ revenueVnd: 200000, costVnd: 88000 }))).toBe(
      44,
    );
  });

  it('rounds half up rather than truncating', () => {
    expect(foodCostPercent(totals({ revenueVnd: 200000, costVnd: 89000 }))).toBe(
      45,
    );
  });

  it('returns null when there is no revenue to divide by', () => {
    expect(foodCostPercent(totals({ costVnd: 88000 }))).toBeNull();
  });

  it('returns null when refunds push net revenue below zero', () => {
    expect(
      foodCostPercent(
        totals({ revenueVnd: 10000, refundedVnd: 30000, costVnd: 5000 }),
      ),
    ).toBeNull();
  });
});

describe('averageOrderValueVnd', () => {
  it('floors net revenue across paid orders', () => {
    expect(
      averageOrderValueVnd(
        totals({ revenueVnd: 200000, paidOrderCount: 3 }),
      ),
    ).toBe(66666);
  });

  it('returns null when no order was paid', () => {
    expect(averageOrderValueVnd(totals({ revenueVnd: 200000 }))).toBeNull();
  });
});

describe('cancellationRatePercent', () => {
  it('reports cancelled orders as a rounded percent of created orders', () => {
    expect(
      cancellationRatePercent(
        totals({ createdOrderCount: 3, cancelledOrderCount: 1 }),
      ),
    ).toBe(33);
  });

  it('returns null when no order was created', () => {
    expect(cancellationRatePercent(totals({ cancelledOrderCount: 1 }))).toBeNull();
  });
});

describe('refundRatePercent', () => {
  it('reports reversals plus refunds against gross revenue', () => {
    expect(
      refundRatePercent(
        totals({ revenueVnd: 200000, reversedVnd: 30000, refundedVnd: 20000 }),
      ),
    ).toBe(25);
  });

  it('returns null when there is no revenue to divide by', () => {
    expect(refundRatePercent(totals({ refundedVnd: 20000 }))).toBeNull();
  });
});

describe('derived metrics on the shared fixture', () => {
  it('returns integers for every money figure', () => {
    const period = reportingSummaryResultFixture.totals;
    const money = [
      netRevenueVnd(period),
      averageOrderValueVnd(period),
      foodCostPercent(period),
      cancellationRatePercent(period),
      refundRatePercent(period),
    ];

    for (const value of money) {
      if (value !== null) expect(Number.isInteger(value)).toBe(true);
    }
  });

  // shortcut: the fixture is hand-written, so agreement here does not prove the
  // server's payment-sourced period revenue always equals the item-sourced sum.
  // Upgrade when a server-side test asserts the two totals against real Orders.
  it('keeps the fixture item revenue equal to its period revenue', () => {
    const itemRevenueVnd = reportingSummaryResultFixture.popularItems.reduce(
      (sum, item) => sum + item.revenueVnd,
      0,
    );

    expect(itemRevenueVnd).toBe(reportingSummaryResultFixture.totals.revenueVnd);
  });
});
