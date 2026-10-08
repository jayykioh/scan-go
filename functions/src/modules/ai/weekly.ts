import type { Firestore } from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';
import {
  AI_CONTRACT_VERSION,
  aiInsightSchema,
  aiWeeklyAnalysisResultSchema,
  type AiInsight,
  type AiInsightDepartment,
  type AiInsightPriority,
  type AiWeeklyAnalysisResult,
  type AiWarning,
} from '../../../../shared/contracts/ai.contract.js';
import { dayKeySchema } from '../../../../shared/contracts/reporting.contract.js';
import {
  dayKeyFromIso,
  nowIso,
  resolvePeriodRange,
  shiftDayKey,
} from '../reporting/service.js';
import { writeAuditEvent } from '../../shared/audit.js';
import {
  readConfigLayers,
  resolveTenantConfig,
} from '../config/service.js';
import {
  AI_DEFAULT_TIMEZONE,
  MAX_AI_ITEM_STATS,
  assembleSafeContext,
  buildAiUsageRecord,
  computeWarnings,
  hasSecretMaterial,
  isAiBudgetExhausted,
  mapDailyItemStats,
  mapDailyStats,
  monthKeyFromDayKey,
  readIngredients,
  readMenuItems,
  resolveAiProvider,
  sumAiUsageCostVnd,
  type AiProviderRegistry,
} from './service.js';

const MAX_USAGE_RECORDS = 1000;
const MAX_WEEK_DAYS = 7;

export interface WeeklyPeriod {
  periodStart: string;
  periodEnd: string;
}

/**
 * Previous completed tenant-local week (Monday..Sunday). The week runs in the
 * tenant IANA timezone, so the same UTC instant can map to different weeks
 * across tenants (REQ-AI-002, RULES §4).
 */
export function resolveWeeklyPeriod(
  now: string,
  timezone: string,
): WeeklyPeriod {
  const today = dayKeyFromIso(now, timezone);
  const { fromDay } = resolvePeriodRange('week', today);
  const periodStart = shiftDayKey(fromDay, -7);
  return { periodStart, periodEnd: shiftDayKey(periodStart, 6) };
}

export function weeklyAnalysisKey(
  tenantId: string,
  period: WeeklyPeriod,
): string {
  return `${tenantId}:${period.periodStart}:${period.periodEnd}`;
}

/** Deterministic id so a repeated run overwrites the same week (idempotent). */
export function insightDocId(
  tenantId: string,
  period: WeeklyPeriod,
  index: number,
): string {
  return `${tenantId}-insight-${period.periodStart}-${period.periodEnd}-${String(
    index,
  ).padStart(2, '0')}`;
}

const DEPARTMENT_BY_KIND: Record<AiWarning['kind'], AiInsightDepartment> = {
  loss: 'menu',
  lowProfit: 'menu',
  lowStock: 'inventory',
  priceIncrease: 'inventory',
  revenueDrop: 'finance',
  missingData: 'operations',
};

const PRIORITY_BY_SEVERITY: Record<AiWarning['severity'], AiInsightPriority> = {
  info: 'low',
  warning: 'medium',
  critical: 'critical',
};

const TITLE_BY_KIND: Record<AiWarning['kind'], string> = {
  loss: 'Món bán dưới giá vốn',
  lowProfit: 'Món biên lợi nhuận thấp',
  lowStock: 'Nguyên liệu sắp hết',
  priceIncrease: 'Nguyên liệu tăng giá nhập',
  revenueDrop: 'Doanh thu giảm so với ngày trước',
  missingData: 'Thiếu dữ liệu để kết luận',
};

export interface BuildWeeklyInsightsInput {
  tenantId: string;
  period: WeeklyPeriod;
  warnings: AiWarning[];
  provider: string;
  model: string;
  now: string;
}

/**
 * Turn grounded deterministic warnings into a bounded Insight list. Every
 * insight cites its sources, and a missing-data entry is labelled and carries
 * the gaps instead of an invented value (REQ-AI-002, NFR-AI-001).
 */
export function buildWeeklyInsights(
  input: BuildWeeklyInsightsInput,
): AiInsight[] {
  const analysisKey = weeklyAnalysisKey(input.tenantId, input.period);
  const missingNotes = input.warnings
    .filter((warning) => warning.kind === 'missingData')
    .map((warning) => warning.message)
    .slice(0, 5);

  return input.warnings.map((warning, index) =>
    aiInsightSchema.parse({
      schemaVersion: AI_CONTRACT_VERSION,
      insightId: insightDocId(input.tenantId, input.period, index),
      tenantId: input.tenantId,
      analysisKey,
      department: DEPARTMENT_BY_KIND[warning.kind],
      priority: PRIORITY_BY_SEVERITY[warning.severity],
      periodStart: dayKeySchema.parse(input.period.periodStart),
      periodEnd: dayKeySchema.parse(input.period.periodEnd),
      title: TITLE_BY_KIND[warning.kind],
      detail: warning.message,
      sourceIds: warning.sourceIds,
      confidence: warning.kind === 'missingData' ? 0.3 : 0.8,
      missingData: warning.kind === 'missingData',
      missingDataNotes: warning.kind === 'missingData' ? missingNotes : [],
      status: 'new',
      provider: input.provider,
      model: input.model,
      generatedAt: input.now,
    }),
  );
}

async function readWeeklyDayStats(
  db: Firestore,
  tenantId: string,
  period: WeeklyPeriod,
) {
  const dailySnap = await db
    .collection(`tenants/${tenantId}/dailyStats`)
    .where(FieldPath.documentId(), '>=', period.periodStart)
    .where(FieldPath.documentId(), '<=', period.periodEnd)
    .limit(MAX_WEEK_DAYS)
    .get();

  const dayStats: Array<{
    stats: ReturnType<typeof mapDailyStats>;
    items: ReturnType<typeof mapDailyItemStats>[];
  }> = [];
  for (const daySnap of dailySnap.docs) {
    const dayKey = daySnap.id;
    const itemsSnap = await db
      .collection(`tenants/${tenantId}/dailyStats/${dayKey}/items`)
      .limit(MAX_AI_ITEM_STATS)
      .get();
    dayStats.push({
      stats: mapDailyStats(tenantId, dayKey, daySnap.data()),
      items: itemsSnap.docs.map((itemSnap) =>
        mapDailyItemStats(tenantId, dayKey, itemSnap.id, itemSnap.data()),
      ),
    });
  }
  return dayStats;
}

export interface RunWeeklyAnalysisOptions {
  now?: string;
  env?: Record<string, string | undefined>;
  registry?: AiProviderRegistry;
}

/**
 * Run one grounded weekly analysis for one tenant in tenant time. Insights are
 * written to `aiInsights` with deterministic ids, so a repeated run for the
 * same week is idempotent and never duplicates. The run writes only AI records
 * and never changes business state (REQ-AI-002, NFR-SEC-003).
 */
export async function runWeeklyAnalysis(
  db: Firestore,
  tenantId: string,
  options: RunWeeklyAnalysisOptions = {},
): Promise<AiWeeklyAnalysisResult> {
  const now = options.now ?? nowIso();
  const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
  const timezoneRaw = tenantSnap.get('timezone');
  const timezone =
    typeof timezoneRaw === 'string' && timezoneRaw.length > 0
      ? timezoneRaw
      : AI_DEFAULT_TIMEZONE;
  const period = resolveWeeklyPeriod(now, timezone);
  const monthKey = monthKeyFromDayKey(dayKeyFromIso(now, timezone));

  const [dayStats, menuItems, ingredients] = await Promise.all([
    readWeeklyDayStats(db, tenantId, period),
    readMenuItems(db, tenantId),
    readIngredients(db, tenantId),
  ]);

  const context = assembleSafeContext({
    tenantId,
    dayStats,
    menuItems,
    ingredients,
  });
  const resolvedConfig = resolveTenantConfig(
    await readConfigLayers(db, tenantId),
  );
  const warnings = computeWarnings(context, {
    revenueDropPercent: resolvedConfig.values.ai.revenueDropPercent,
    lowMarginPercent: resolvedConfig.values.ai.lowMarginPercent,
  });
  const { provider: providerName, monthlyBudgetVnd } = resolvedConfig.values.ai;
  const provider = resolveAiProvider(
    providerName,
    options.env ?? process.env,
    options.registry ?? {},
  );

  // Budget is enforced before any provider call; over budget the run degrades
  // to deterministic insights and records an audit event (NFR-AI-002).
  const usageSnap = await db
    .collection(`tenants/${tenantId}/aiUsage`)
    .where('monthKey', '==', monthKey)
    .limit(MAX_USAGE_RECORDS)
    .get();
  const spentVnd = sumAiUsageCostVnd(
    usageSnap.docs.map((usageDoc) => ({
      estimatedCostVnd: Number(usageDoc.get('estimatedCostVnd') ?? 0),
    })),
  );

  let providerNameUsed = provider.provider;
  let modelUsed = provider.model;
  if (isAiBudgetExhausted({ monthlyBudgetVnd, spentVnd })) {
    await writeAuditEvent({
      tenantId,
      actorUid: null,
      actorType: 'system',
      role: null,
      action: 'AiBudgetExceeded',
      targetType: 'aiUsage',
      targetId: null,
      reason: null,
      detail: {
        monthKey,
        monthlyBudgetVnd,
        spentVnd,
        purpose: 'weeklyAnalysis',
      },
    });
  } else {
    const question = `Phân tích tuần ${period.periodStart}..${period.periodEnd}`;
    if (hasSecretMaterial(question)) {
      throw new Error('Secret-like material is not allowed in an AI prompt.');
    }
    const response = await provider.generate({ question, context, warnings });
    providerNameUsed = response.provider;
    modelUsed = response.model;
    const usageRef = db.collection(`tenants/${tenantId}/aiUsage`).doc();
    await usageRef.set(
      buildAiUsageRecord({
        usageId: usageRef.id,
        tenantId,
        response,
        monthKey,
        now,
        purpose: 'weeklyAnalysis',
      }),
    );
  }

  const insights = buildWeeklyInsights({
    tenantId,
    period,
    warnings,
    provider: providerNameUsed,
    model: modelUsed,
    now,
  });

  const batch = db.batch();
  for (const insight of insights) {
    batch.set(
      db.doc(`tenants/${tenantId}/aiInsights/${insight.insightId}`),
      insight,
    );
  }
  await batch.commit();

  return aiWeeklyAnalysisResultSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    tenantId,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    insightIds: insights.map((insight) => insight.insightId),
    insightCount: insights.length,
    missingData: insights.some((insight) => insight.missingData),
    provider: providerNameUsed,
    model: modelUsed,
    generatedAt: now,
  });
}
