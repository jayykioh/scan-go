import { httpsCallable } from 'firebase/functions';
import {
  reportingRebuildResultSchema,
  reportingSummaryResultSchema,
  type ReportingPeriod,
  type ReportingRebuildInput,
  type ReportingRebuildResult,
  type ReportingSummaryResult,
} from '@contracts/reporting.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

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
 * Owner Reporting summary (REQ-RPT-001). The server re-verifies tenant
 * membership and returns the day, week, or month totals. The client parses the
 * result through the shared Zod contract before use.
 */
export async function getReportingSummary(
  request: ReportingSummaryRequest,
): Promise<ReportingSummaryResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ReportingSummaryRequest, ReportingSummaryResult>(
    functions,
    'callableReportingGetSummary',
  );
  const result = await callable(request);
  return reportingSummaryResultSchema.parse(result.data);
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
