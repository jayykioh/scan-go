import { httpsCallable } from 'firebase/functions';
import {
  reportingRebuildResultSchema,
  type ReportingPeriod,
  type ReportingRebuildInput,
  type ReportingRebuildResult,
  type ReportingSummaryResult,
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
 * Owner Reporting summary (REQ-RPT-001). The rules let an active tenant member
 * read the materialized `dailyStats` tree, so the client aggregates it directly
 * without a server round-trip.
 */
export async function getReportingSummary(
  request: ReportingSummaryRequest,
): Promise<ReportingSummaryResult> {
  return readReportingSummary(request.period, request.anchorDay);
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
