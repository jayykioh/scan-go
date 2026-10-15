import { httpsCallable } from 'firebase/functions';
import {
  reportingRebuildResultSchema,
  type ReportingPeriod,
  type ReportingRebuildInput,
  type ReportingRebuildResult,
  type ReportingSummaryResult,
  type ReportingTotals,
} from '@contracts/reporting.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';
import { readReportingSummary } from '../firestoreRead';

export interface ReportingSummaryRequest {
  tenantId: string;
  period: ReportingPeriod;
  anchorDay?: string;
}

/** Format integer VND for display. Money never becomes a float. */
export function formatVnd(amountVnd: number): string {
  return `${Math.trunc(amountVnd).toLocaleString('vi-VN')}đ`;
}

/**
 * Net revenue for a period: gross revenue less reversals and refunds. Gross
 * profit already subtracts both (`functions/src/modules/reporting/service.ts`),
 * so any figure shown beside it must use this base (REQ-RPT-001).
 */
export function netRevenueVnd(totals: ReportingTotals): number {
  return totals.revenueVnd - totals.reversedVnd - totals.refundedVnd;
}

/**
 * Cost as a rounded integer percent of net revenue (REQ-RPT-001). Null when net
 * revenue is not positive, so the screen shows "no data" rather than 0%.
 */
export function foodCostPercent(totals: ReportingTotals): number | null {
  const netRevenue = netRevenueVnd(totals);
  if (netRevenue <= 0) return null;
  return Math.round((totals.costVnd * 100) / netRevenue);
}

/** Average value of a paid order. Null when nothing was paid (REQ-RPT-001). */
export function averageOrderValueVnd(
  totals: ReportingTotals,
): number | null {
  if (totals.paidOrderCount <= 0) return null;
  return Math.floor(netRevenueVnd(totals) / totals.paidOrderCount);
}

/**
 * Cancelled orders as a rounded integer percent of created orders. Null when no
 * order was created (REQ-RPT-001).
 */
export function cancellationRatePercent(
  totals: ReportingTotals,
): number | null {
  if (totals.createdOrderCount <= 0) return null;
  return Math.round(
    (totals.cancelledOrderCount * 100) / totals.createdOrderCount,
  );
}

/**
 * Reversals plus refunds as a rounded integer percent of gross revenue. Null
 * when there is no revenue to divide by (REQ-RPT-001).
 */
export function refundRatePercent(totals: ReportingTotals): number | null {
  if (totals.revenueVnd <= 0) return null;
  return Math.round(
    ((totals.reversedVnd + totals.refundedVnd) * 100) / totals.revenueVnd,
  );
}

/**
 * Owner Reporting summary (REQ-RPT-001). The rules let an active tenant member
 * read the materialized `dailyStats` tree, so the client aggregates it directly
 * without a server round-trip.
 */
export async function getReportingSummary(
  request: ReportingSummaryRequest,
): Promise<ReportingSummaryResult> {
  return readReportingSummary(
    request.period,
    request.anchorDay,
    request.tenantId,
  );
}

/**
 * Owner rebuild command (REQ-RPT-002). Rebuilds the materialized daily stats for
 * an inclusive tenant-local day range. Only the Owner or a server-verified ADMIN
 * may call it.
 */
export async function rebuildReportingDailyStats(
  request: ReportingRebuildInput,
): Promise<ReportingRebuildResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ReportingRebuildInput, ReportingRebuildResult>(
    functions,
    'callableReportingRebuildDailyStats',
  );
  const result = await callable(request);
  return reportingRebuildResultSchema.parse(result.data);
}
