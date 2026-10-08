import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  vndSchema,
} from '../validation.js';

/**
 * Reporting contract (REQ-RPT-001, REQ-RPT-002, ADR 0005).
 *
 * Daily stats are derived from immutable Orders and Payments. They are
 * rebuildable per tenant-local `yyyymmdd` day and never replace the source
 * records. Money stays integer VND; timestamps stay server UTC.
 */
export const REPORTING_CONTRACT_VERSION = 1;

export const dayKeySchema = z
  .string()
  .regex(/^\d{8}$/, 'Expected a tenant-local yyyymmdd day key');

export const reportingPeriodSchema = z.enum(['day', 'week', 'month']);
export type ReportingPeriod = z.infer<typeof reportingPeriodSchema>;

/** Gross profit may be negative, so it is a signed integer, never a float. */
export const signedVndSchema = z.number().int();

export const reportingTotalsSchema = z.strictObject({
  createdOrderCount: nonNegativeIntSchema,
  cancelledOrderCount: nonNegativeIntSchema,
  paidOrderCount: nonNegativeIntSchema,
  reversedOrderCount: nonNegativeIntSchema,
  refundedOrderCount: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: signedVndSchema,
  reversedVnd: vndSchema,
  refundedVnd: vndSchema,
});

export type ReportingTotals = z.infer<typeof reportingTotalsSchema>;

export const dailyStatsSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  dayKey: dayKeySchema,
  ...reportingTotalsSchema.shape,
  version: nonNegativeIntSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type DailyStats = z.infer<typeof dailyStatsSchema>;

export const dailyItemStatsSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  dayKey: dayKeySchema,
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  paidQuantity: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: signedVndSchema,
  reversedVnd: vndSchema,
  refundedVnd: vndSchema,
});

export type DailyItemStats = z.infer<typeof dailyItemStatsSchema>;

export const dailyTableStatsSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  dayKey: dayKeySchema,
  tableId: z.string().min(1),
  tableName: z.string().min(1),
  createdOrderCount: nonNegativeIntSchema,
  cancelledOrderCount: nonNegativeIntSchema,
  paidOrderCount: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: signedVndSchema,
  reversedVnd: vndSchema,
  refundedVnd: vndSchema,
});

export type DailyTableStats = z.infer<typeof dailyTableStatsSchema>;

export const reportingSummaryInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  period: reportingPeriodSchema,
  anchorDay: dayKeySchema.optional(),
});

export type ReportingSummaryInput = z.infer<
  typeof reportingSummaryInputSchema
>;

export const popularItemSchema = z.strictObject({
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  paidQuantity: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: signedVndSchema,
});

export type PopularItem = z.infer<typeof popularItemSchema>;

export const popularTableSchema = z.strictObject({
  tableId: z.string().min(1),
  tableName: z.string().min(1),
  createdOrderCount: nonNegativeIntSchema,
  cancelledOrderCount: nonNegativeIntSchema,
  paidOrderCount: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitVnd: signedVndSchema,
  reversedVnd: vndSchema,
  refundedVnd: vndSchema,
});

export type PopularTable = z.infer<typeof popularTableSchema>;

/** Per-day totals inside a period, used to draw an income trend chart. */
export const reportingDayPointSchema = z.strictObject({
  dayKey: dayKeySchema,
  totals: reportingTotalsSchema,
});

export type ReportingDayPoint = z.infer<typeof reportingDayPointSchema>;

export const reportingSummaryResultSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  period: reportingPeriodSchema,
  fromDay: dayKeySchema,
  toDay: dayKeySchema,
  dayCount: nonNegativeIntSchema,
  totals: reportingTotalsSchema,
  /** One entry per day that has stored daily stats, ordered by dayKey asc. */
  dailyBreakdown: z.array(reportingDayPointSchema).max(62),
  popularItems: z.array(popularItemSchema).max(20),
  tables: z.array(popularTableSchema).max(50),
});

export type ReportingSummaryResult = z.infer<
  typeof reportingSummaryResultSchema
>;

export const reportingRebuildInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  fromDay: dayKeySchema,
  toDay: dayKeySchema,
});

export type ReportingRebuildInput = z.infer<
  typeof reportingRebuildInputSchema
>;

export const reportingRebuildResultSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  fromDay: dayKeySchema,
  toDay: dayKeySchema,
  rebuiltDayCount: nonNegativeIntSchema,
  orderCount: nonNegativeIntSchema,
  paymentCount: nonNegativeIntSchema,
  /**
   * True when the bounded source read hit its record cap and a complete
   * rebuild was not possible, so no partial aggregate was written
   * (REQ-RPT-002, NFR-REL-001).
   */
  truncated: z.boolean(),
  rebuiltAt: isoUtcTimestampSchema,
});

export type ReportingRebuildResult = z.infer<
  typeof reportingRebuildResultSchema
>;

export const reportingReconciliationSchema = z.strictObject({
  schemaVersion: z.literal(REPORTING_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  dayKey: dayKeySchema,
  matches: z.boolean(),
  differences: z.array(z.string().min(1)).max(50),
});

export type ReportingReconciliation = z.infer<
  typeof reportingReconciliationSchema
>;
