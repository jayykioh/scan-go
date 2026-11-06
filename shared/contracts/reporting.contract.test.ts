import { describe, expect, it } from 'vitest';
import {
  REPORTING_CONTRACT_VERSION,
  dailyItemStatsSchema,
  dailyStatsSchema,
  dailyTableStatsSchema,
  reportingRebuildResultSchema,
  reportingSummaryInputSchema,
  reportingSummaryResultSchema,
} from './reporting.contract.js';
import {
  dailyItemStatsFixture,
  dailyStatsFixture,
  dailyTableStatsFixture,
  reportingRebuildResultFixture,
  reportingSummaryResultFixture,
} from '../fixtures/reporting.fixture.js';

describe('dailyStatsSchema', () => {
  it('accepts the stored day fixture with integer VND money', () => {
    expect(dailyStatsSchema.safeParse(dailyStatsFixture).success).toBe(true);
    expect(Number.isInteger(dailyStatsFixture.revenueVnd)).toBe(true);
    expect(Number.isInteger(dailyStatsFixture.costVnd)).toBe(true);
  });

  it('rejects a floating money value', () => {
    expect(
      dailyStatsSchema.safeParse({ ...dailyStatsFixture, revenueVnd: 1.5 })
        .success,
    ).toBe(false);
    expect(
      dailyStatsSchema.safeParse({ ...dailyStatsFixture, costVnd: 0.5 }).success,
    ).toBe(false);
  });

  it('rejects a negative revenue and an unknown key', () => {
    expect(
      dailyStatsSchema.safeParse({ ...dailyStatsFixture, revenueVnd: -1 })
        .success,
    ).toBe(false);
    expect(
      dailyStatsSchema.safeParse({ ...dailyStatsFixture, notAField: 1 }).success,
    ).toBe(false);
  });

  it('rejects a non-UTC updatedAt timestamp', () => {
    expect(
      dailyStatsSchema.safeParse({
        ...dailyStatsFixture,
        updatedAt: '2026-09-12T07:00:00+07:00',
      }).success,
    ).toBe(false);
  });

  it('accepts a signed negative gross profit', () => {
    expect(
      dailyStatsSchema.safeParse({
        ...dailyStatsFixture,
        grossProfitVnd: -50000,
      }).success,
    ).toBe(true);
  });
});

describe('daily item and table stats schemas', () => {
  it('accept the item and table fixtures', () => {
    expect(dailyItemStatsSchema.safeParse(dailyItemStatsFixture).success).toBe(
      true,
    );
    expect(dailyTableStatsSchema.safeParse(dailyTableStatsFixture).success).toBe(
      true,
    );
  });

  it('reject an invalid day key', () => {
    expect(
      dailyItemStatsSchema.safeParse({
        ...dailyItemStatsFixture,
        dayKey: '2026-09-12',
      }).success,
    ).toBe(false);
  });
});

describe('reporting summary and rebuild schemas', () => {
  it('accept the summary and rebuild result fixtures', () => {
    expect(
      reportingSummaryResultSchema.safeParse(reportingSummaryResultFixture)
        .success,
    ).toBe(true);
    expect(
      reportingRebuildResultSchema.safeParse(reportingRebuildResultFixture)
        .success,
    ).toBe(true);
  });

  it('reject a floating total and a wrong contract version', () => {
    expect(
      reportingSummaryResultSchema.safeParse({
        ...reportingSummaryResultFixture,
        totals: {
          ...reportingSummaryResultFixture.totals,
          grossProfitVnd: 1.25,
        },
      }).success,
    ).toBe(false);
    expect(
      reportingRebuildResultSchema.safeParse({
        ...reportingRebuildResultFixture,
        schemaVersion: REPORTING_CONTRACT_VERSION + 1,
      }).success,
    ).toBe(false);
  });

  it('caps popular items and tables', () => {
    expect(
      reportingSummaryResultSchema.safeParse({
        ...reportingSummaryResultFixture,
        popularItems: Array.from({ length: 21 }, () =>
          reportingSummaryResultFixture.popularItems[0],
        ),
      }).success,
    ).toBe(false);
  });
});

describe('reporting summary input (REQ-RPT-001)', () => {
  it('accepts a custom range with both day keys', () => {
    expect(
      reportingSummaryInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        period: 'custom',
        fromDay: '20261101',
        toDay: '20261107',
      }).success,
    ).toBe(true);
  });

  it('rejects a custom range without both bounds or with the days reversed', () => {
    expect(
      reportingSummaryInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        period: 'custom',
        fromDay: '20261101',
      }).success,
    ).toBe(false);
    expect(
      reportingSummaryInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        period: 'custom',
        fromDay: '20261107',
        toDay: '20261101',
      }).success,
    ).toBe(false);
  });

  it('keeps the quick periods anchor-based', () => {
    expect(
      reportingSummaryInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        period: 'week',
        anchorDay: '20261106',
      }).success,
    ).toBe(true);
  });
});
