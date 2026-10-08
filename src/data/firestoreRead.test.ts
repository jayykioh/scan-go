import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dailyItemStatsFixture,
  dailyStatsFixture,
  dailyTableStatsFixture,
  REPORTING_DAY_FIXTURE,
} from '@shared/fixtures/reporting.fixture';

const mocks = vi.hoisted(() => ({
  getFirebaseFirestore: vi.fn(),
  getFirebaseAuth: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ kind: 'collection', args }),
  doc: (...args: unknown[]) => ({ kind: 'doc', args }),
  query: (...args: unknown[]) => ({ kind: 'query', args }),
  where: (...args: unknown[]) => ({ kind: 'where', args }),
  orderBy: (...args: unknown[]) => ({ kind: 'orderBy', args }),
  limit: (...args: unknown[]) => ({ kind: 'limit', args }),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
  getDocs: (...args: unknown[]) => mocks.getDocs(...args),
}));

vi.mock('../services/firebase/client', () => ({
  getFirebaseFirestore: () => mocks.getFirebaseFirestore(),
  getFirebaseAuth: () => mocks.getFirebaseAuth(),
}));

import {
  readLoyaltyConfig,
  readPromotions,
  readReportingSummary,
  resolvePeriodRange,
} from './firestoreRead';

function docSnapshot(id: string, data: Record<string, unknown>) {
  return { id, exists: () => true, data: () => data, get: (key: string) => data[key] };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('resolvePeriodRange', () => {
  it('returns the single day for a day period', () => {
    expect(resolvePeriodRange('day', '20260912')).toEqual({
      fromDay: '20260912',
      toDay: '20260912',
    });
  });

  it('starts the week on Monday', () => {
    expect(resolvePeriodRange('week', '20260912')).toEqual({
      fromDay: '20260907',
      toDay: '20260913',
    });
  });

  it('covers the whole calendar month', () => {
    expect(resolvePeriodRange('month', '20260912')).toEqual({
      fromDay: '20260901',
      toDay: '20260930',
    });
  });
});

describe('readReportingSummary', () => {
  it('aggregates the daily stats tree directly', async () => {
    mocks.getFirebaseFirestore.mockReturnValue({});
    mocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    mocks.getDoc
      .mockResolvedValueOnce(docSnapshot('u1', { activeTenantId: 't1' }))
      .mockResolvedValueOnce(docSnapshot('t1', { timezone: 'Asia/Ho_Chi_Minh' }));
    mocks.getDocs
      .mockResolvedValueOnce({ docs: [docSnapshot(REPORTING_DAY_FIXTURE, dailyStatsFixture)] })
      .mockResolvedValueOnce({ docs: [docSnapshot('i1', dailyItemStatsFixture)] })
      .mockResolvedValueOnce({ docs: [docSnapshot('tb1', dailyTableStatsFixture)] });

    const result = await readReportingSummary('day', REPORTING_DAY_FIXTURE);

    expect(result.tenantId).toBe('t1');
    expect(result.dayCount).toBe(1);
    expect(result.totals.revenueVnd).toBe(dailyStatsFixture.revenueVnd);
    expect(result.popularItems[0]?.itemId).toBe('i1');
    expect(result.tables[0]?.tableId).toBe('tb1');
  });

  it('rejects when no tenant is selected', async () => {
    mocks.getFirebaseFirestore.mockReturnValue({});
    mocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    mocks.getDoc.mockResolvedValueOnce(docSnapshot('u1', {}));

    await expect(readReportingSummary('day', REPORTING_DAY_FIXTURE)).rejects.toThrow(
      'Chưa chọn cửa hàng',
    );
  });
});

describe('readPromotions', () => {
  it('maps stored promotion documents and injects the tenant id', async () => {
    mocks.getFirebaseFirestore.mockReturnValue({});
    mocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    mocks.getDoc.mockResolvedValueOnce(docSnapshot('u1', { activeTenantId: 't1' }));
    mocks.getDocs.mockResolvedValueOnce({
      docs: [
        docSnapshot('p1', {
          schemaVersion: 1,
          tenantId: 't1',
          name: 'Giảm 10%',
          status: 'active',
          priority: 1,
          startsAt: null,
          endsAt: null,
          eligibility: { minSubtotalVnd: null, menuItemIds: null },
          benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
          archivedAt: null,
        }),
      ],
    });

    const result = await readPromotions();
    expect(result).toHaveLength(1);
    expect(result[0]?.promotionId).toBe('p1');
    expect(result[0]?.tenantId).toBe('t1');
  });
});

describe('readLoyaltyConfig', () => {
  it('returns the stored configuration when present', async () => {
    mocks.getFirebaseFirestore.mockReturnValue({});
    mocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    mocks.getDoc
      .mockResolvedValueOnce(docSnapshot('u1', { activeTenantId: 't1' }))
      .mockResolvedValueOnce(
        docSnapshot('default', {
          tenantId: 't1',
          earnRateVnd: 5000,
          pointsPerEarnRate: 2,
          welcomePoints: 10,
          updatedAt: '2026-09-01T00:00:00.000Z',
        }),
      );

    const result = await readLoyaltyConfig();
    expect(result.earnRateVnd).toBe(5000);
    expect(result.welcomePoints).toBe(10);
  });

  it('falls back to documented defaults when the document is missing', async () => {
    mocks.getFirebaseFirestore.mockReturnValue({});
    mocks.getFirebaseAuth.mockReturnValue({ currentUser: { uid: 'u1' } });
    mocks.getDoc
      .mockResolvedValueOnce(docSnapshot('u1', { activeTenantId: 't1' }))
      .mockResolvedValueOnce({
        id: 'default',
        exists: () => false,
        data: () => ({}),
        get: () => undefined,
      });

    const result = await readLoyaltyConfig();
    expect(result.earnRateVnd).toBe(10000);
    expect(result.pointsPerEarnRate).toBe(1);
  });
});
