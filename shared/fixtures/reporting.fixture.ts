import {
  REPORTING_CONTRACT_VERSION,
  type DailyItemStats,
  type DailyStats,
  type DailyTableStats,
  type ReportingRebuildResult,
  type ReportingSummaryResult,
} from '../contracts/reporting.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const REPORTING_DAY_FIXTURE = '20260912';
export const REPORTING_NOW_FIXTURE = '2026-09-13T00:00:00.000Z';

/** One stored tenant-local day with paid revenue, COGS, and gross profit. */
export const dailyStatsFixture: DailyStats = {
  schemaVersion: REPORTING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  dayKey: REPORTING_DAY_FIXTURE,
  createdOrderCount: 3,
  cancelledOrderCount: 1,
  paidOrderCount: 2,
  reversedOrderCount: 0,
  refundedOrderCount: 0,
  revenueVnd: 200000,
  costVnd: 88000,
  grossProfitVnd: 112000,
  reversedVnd: 0,
  refundedVnd: 0,
  version: 1,
  updatedAt: REPORTING_NOW_FIXTURE,
};

export const dailyItemStatsFixture: DailyItemStats = {
  schemaVersion: REPORTING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  dayKey: REPORTING_DAY_FIXTURE,
  itemId: 'item-pho-bo-001',
  itemName: 'Phở bò',
  paidQuantity: 4,
  revenueVnd: 200000,
  costVnd: 88000,
  grossProfitVnd: 112000,
  reversedVnd: 0,
  refundedVnd: 0,
};

export const dailyTableStatsFixture: DailyTableStats = {
  schemaVersion: REPORTING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  dayKey: REPORTING_DAY_FIXTURE,
  tableId: 'table-01',
  tableName: 'Bàn 1',
  createdOrderCount: 3,
  cancelledOrderCount: 1,
  paidOrderCount: 2,
  revenueVnd: 200000,
  costVnd: 88000,
  grossProfitVnd: 112000,
  reversedVnd: 0,
  refundedVnd: 0,
};

export const reportingSummaryResultFixture: ReportingSummaryResult = {
  schemaVersion: REPORTING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  period: 'day',
  fromDay: REPORTING_DAY_FIXTURE,
  toDay: REPORTING_DAY_FIXTURE,
  dayCount: 1,
  totals: {
    createdOrderCount: dailyStatsFixture.createdOrderCount,
    cancelledOrderCount: dailyStatsFixture.cancelledOrderCount,
    paidOrderCount: dailyStatsFixture.paidOrderCount,
    reversedOrderCount: dailyStatsFixture.reversedOrderCount,
    refundedOrderCount: dailyStatsFixture.refundedOrderCount,
    revenueVnd: dailyStatsFixture.revenueVnd,
    costVnd: dailyStatsFixture.costVnd,
    grossProfitVnd: dailyStatsFixture.grossProfitVnd,
    reversedVnd: dailyStatsFixture.reversedVnd,
    refundedVnd: dailyStatsFixture.refundedVnd,
  },
  popularItems: [
    {
      itemId: dailyItemStatsFixture.itemId,
      itemName: dailyItemStatsFixture.itemName,
      paidQuantity: dailyItemStatsFixture.paidQuantity,
      revenueVnd: dailyItemStatsFixture.revenueVnd,
      costVnd: dailyItemStatsFixture.costVnd,
      grossProfitVnd: dailyItemStatsFixture.grossProfitVnd,
    },
  ],
  tables: [
    {
      tableId: dailyTableStatsFixture.tableId,
      tableName: dailyTableStatsFixture.tableName,
      createdOrderCount: dailyTableStatsFixture.createdOrderCount,
      cancelledOrderCount: dailyTableStatsFixture.cancelledOrderCount,
      paidOrderCount: dailyTableStatsFixture.paidOrderCount,
      revenueVnd: dailyTableStatsFixture.revenueVnd,
      costVnd: dailyTableStatsFixture.costVnd,
      grossProfitVnd: dailyTableStatsFixture.grossProfitVnd,
      reversedVnd: dailyTableStatsFixture.reversedVnd,
      refundedVnd: dailyTableStatsFixture.refundedVnd,
    },
  ],
};

export const reportingRebuildResultFixture: ReportingRebuildResult = {
  schemaVersion: REPORTING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  fromDay: REPORTING_DAY_FIXTURE,
  toDay: REPORTING_DAY_FIXTURE,
  rebuiltDayCount: 1,
  orderCount: 3,
  paymentCount: 2,
  truncated: false,
  rebuiltAt: REPORTING_NOW_FIXTURE,
};
