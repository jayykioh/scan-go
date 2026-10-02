import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatVnd,
  getReportingSummary,
  rebuildReportingDailyStats,
} from './reporting.adapter';
import {
  reportingRebuildResultFixture,
  reportingSummaryResultFixture,
} from '@shared/fixtures/reporting.fixture';

const mocks = vi.hoisted(() => ({
  getFirebaseFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mocks.httpsCallable(...args),
}));

vi.mock('../../services/firebase/client', () => ({
  getFirebaseFunctions: () => mocks.getFirebaseFunctions(),
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
  it('calls the Reporting callable and parses the Zod result', async () => {
    mocks.getFirebaseFunctions.mockReturnValue({});
    mocks.httpsCallable.mockReturnValue(
      vi.fn().mockResolvedValue({ data: reportingSummaryResultFixture }),
    );

    const result = await getReportingSummary({
      tenantId: 'tenant-alpha',
      period: 'day',
    });

    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      {},
      'callableReportingGetSummary',
    );
    expect(result.totals.revenueVnd).toBe(200000);
    expect(Number.isInteger(result.totals.grossProfitVnd)).toBe(true);
  });

  it('rejects when Firebase is not configured', async () => {
    mocks.getFirebaseFunctions.mockReturnValue(null);
    await expect(
      getReportingSummary({ tenantId: 'tenant-alpha', period: 'week' }),
    ).rejects.toThrow('Firebase');
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
