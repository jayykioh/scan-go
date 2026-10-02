import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  vndSchema,
} from '../validation.js';
import { dayKeySchema } from './reporting.contract.js';

/**
 * AI contract baseline (REQ-AI-001, NFR-AI-001, NFR-PRIV-002, NFR-SEC-003).
 *
 * The server assembles a bounded, authorized, PII-free context and returns a
 * grounded answer with citations and formulas. Missing data produces a warning,
 * never an invented value. The AI never mutates business state.
 */
export const AI_CONTRACT_VERSION = 1;

export const aiWarningKindSchema = z.enum([
  'loss',
  'lowProfit',
  'lowStock',
  'missingData',
]);

export type AiWarningKind = z.infer<typeof aiWarningKindSchema>;

export const aiWarningSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AiWarningSeverity = z.infer<typeof aiWarningSeveritySchema>;

export const aiWarningSchema = z.strictObject({
  kind: aiWarningKindSchema,
  severity: aiWarningSeveritySchema,
  subjectId: z.string().min(1).nullable(),
  subjectName: z.string().min(1).nullable(),
  message: z.string().min(1),
  sourceIds: z.array(z.string().min(1)).max(20),
  formula: z.string().min(1),
});

export type AiWarning = z.infer<typeof aiWarningSchema>;

export const aiSourceSchema = z.strictObject({
  type: z.enum(['dailyStats', 'menuItem', 'ingredient', 'feedback']),
  id: z.string().min(1),
  label: z.string().min(1),
  period: z.string().min(1).nullable(),
});

export type AiSource = z.infer<typeof aiSourceSchema>;

export const aiAskInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  question: z.string().min(1).max(500),
  dayKey: dayKeySchema.optional(),
});

export type AiAskInput = z.infer<typeof aiAskInputSchema>;

export const aiAskResultSchema = z.strictObject({
  schemaVersion: z.literal(AI_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  answer: z.string().min(1),
  warnings: z.array(aiWarningSchema).max(20),
  sources: z.array(aiSourceSchema).max(50),
  period: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1),
  missingData: z.boolean(),
  /** Latest server update time of the cited tenant data (REQ-AI-003). */
  dataUpdatedAt: isoUtcTimestampSchema.nullable(),
  provider: z.string().min(1),
  model: z.string().min(1),
  generatedAt: isoUtcTimestampSchema,
});

export type AiAskResult = z.infer<typeof aiAskResultSchema>;

/** Tenant-local `yyyymm` budget period the usage is billed to. */
export const aiUsageMonthKeySchema = z.string().regex(/^\d{6}$/);

/** What one AI call was recorded for (REQ-AI-004, NFR-AI-002). */
export const aiPurposeSchema = z.enum([
  'warnings',
  'weeklyAnalysis',
  'feedbackGrouping',
  'campaignSuggestion',
  'evaluation',
]);
export type AiPurpose = z.infer<typeof aiPurposeSchema>;

export const aiUsageRecordSchema = z.strictObject({
  schemaVersion: z.literal(AI_CONTRACT_VERSION),
  usageId: z.string().min(1),
  tenantId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  inputTokens: nonNegativeIntSchema,
  outputTokens: nonNegativeIntSchema,
  estimatedCostVnd: vndSchema,
  purpose: aiPurposeSchema,
  monthKey: aiUsageMonthKeySchema,
  createdAt: isoUtcTimestampSchema,
});

export type AiUsageRecord = z.infer<typeof aiUsageRecordSchema>;

/**
 * Weekly Insight (REQ-AI-002, NFR-AI-001). Department, priority, period,
 * sources, confidence, and missing-data notes. It never stores raw model text.
 */
export const aiInsightDepartmentSchema = z.enum([
  'finance',
  'menu',
  'inventory',
  'operations',
  'customer',
]);
export type AiInsightDepartment = z.infer<typeof aiInsightDepartmentSchema>;

export const aiInsightPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type AiInsightPriority = z.infer<typeof aiInsightPrioritySchema>;

export const aiInsightStatusSchema = z.enum(['new', 'acknowledged', 'done']);
export type AiInsightStatus = z.infer<typeof aiInsightStatusSchema>;

export const aiInsightSchema = z
  .strictObject({
    schemaVersion: z.literal(AI_CONTRACT_VERSION),
    insightId: z.string().min(1),
    tenantId: z.string().min(1),
    /** Deterministic idempotency key: tenant week + slot. */
    analysisKey: z.string().min(1),
    department: aiInsightDepartmentSchema,
    priority: aiInsightPrioritySchema,
    periodStart: dayKeySchema,
    periodEnd: dayKeySchema,
    title: z.string().min(1).max(120),
    detail: z.string().min(1).max(500),
    sourceIds: z.array(z.string().min(1)).max(20),
    confidence: z.number().min(0).max(1),
    missingData: z.boolean(),
    missingDataNotes: z.array(z.string().min(1).max(200)).max(5),
    status: aiInsightStatusSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    generatedAt: isoUtcTimestampSchema,
  })
  .refine(
    (insight) => insight.missingData || insight.sourceIds.length > 0,
    'A grounded insight needs at least one cited source.',
  );

export type AiInsight = z.infer<typeof aiInsightSchema>;

export const aiWeeklyAnalysisInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type AiWeeklyAnalysisInput = z.infer<
  typeof aiWeeklyAnalysisInputSchema
>;

export const aiWeeklyAnalysisResultSchema = z.strictObject({
  schemaVersion: z.literal(AI_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  periodStart: dayKeySchema,
  periodEnd: dayKeySchema,
  insightIds: z.array(z.string().min(1)).max(50),
  insightCount: nonNegativeIntSchema,
  missingData: z.boolean(),
  provider: z.string().min(1),
  model: z.string().min(1),
  generatedAt: isoUtcTimestampSchema,
});

export type AiWeeklyAnalysisResult = z.infer<
  typeof aiWeeklyAnalysisResultSchema
>;

/**
 * Feedback theme grouping (REQ-FDB-002, NFR-PRIV-002). Every theme cites the
 * source feedback IDs and carries only masked examples.
 */
export const feedbackThemeSentimentSchema = z.enum([
  'positive',
  'negative',
  'mixed',
]);
export type FeedbackThemeSentiment = z.infer<
  typeof feedbackThemeSentimentSchema
>;

export const feedbackThemeSchema = z.strictObject({
  themeId: z.string().min(1),
  label: z.string().min(1).max(120),
  department: aiInsightDepartmentSchema,
  sentiment: feedbackThemeSentimentSchema,
  feedbackCount: nonNegativeIntSchema,
  sourceFeedbackIds: z.array(z.string().min(1)).min(1).max(50),
  maskedExamples: z.array(z.string().min(1).max(200)).max(3),
});

export type FeedbackTheme = z.infer<typeof feedbackThemeSchema>;

export const aiFeedbackGroupingInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
});

export type AiFeedbackGroupingInput = z.infer<
  typeof aiFeedbackGroupingInputSchema
>;

export const aiFeedbackGroupingResultSchema = z.strictObject({
  schemaVersion: z.literal(AI_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  themes: z.array(feedbackThemeSchema).max(10),
  processedCount: nonNegativeIntSchema,
  maskedCount: nonNegativeIntSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  generatedAt: isoUtcTimestampSchema,
});

export type AiFeedbackGroupingResult = z.infer<
  typeof aiFeedbackGroupingResultSchema
>;

/** Provider evaluation case and report (G2-06, ADR 0008). */
export const aiEvaluationCaseSchema = z.strictObject({
  caseId: z.string().min(1),
  input: z.string().min(1).max(500),
  expectsSource: z.boolean(),
});

export type AiEvaluationCase = z.infer<typeof aiEvaluationCaseSchema>;

export const aiEvaluationMetricSchema = z.strictObject({
  provider: z.string().min(1),
  model: z.string().min(1),
  callCount: nonNegativeIntSchema,
  usefulCount: nonNegativeIntSchema,
  groundedCount: nonNegativeIntSchema,
  vietnameseQuality: z.number().min(0).max(1),
  totalCostVnd: vndSchema,
  costPerUsefulResultVnd: vndSchema,
  averageLatencyMs: nonNegativeIntSchema,
});

export type AiEvaluationMetric = z.infer<typeof aiEvaluationMetricSchema>;

export const aiEvaluationReportSchema = z.strictObject({
  schemaVersion: z.literal(AI_CONTRACT_VERSION),
  caseCount: nonNegativeIntSchema,
  baselineProvider: z.string().min(1),
  metrics: z.array(aiEvaluationMetricSchema).min(1),
  recommendation: z.enum(['keep-default', 'evaluate-more', 'adopt-candidate']),
  generatedAt: isoUtcTimestampSchema,
});

export type AiEvaluationReport = z.infer<typeof aiEvaluationReportSchema>;
