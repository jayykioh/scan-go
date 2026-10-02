import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  aiAskInputSchema,
  aiAskResultSchema,
  aiFeedbackGroupingInputSchema,
  aiFeedbackGroupingResultSchema,
  aiWeeklyAnalysisInputSchema,
  aiWeeklyAnalysisResultSchema,
  type AiAskInput,
  type AiFeedbackGroupingInput,
  type AiFeedbackGroupingResult,
  type AiWeeklyAnalysisInput,
  type AiWeeklyAnalysisResult,
} from '../../../../shared/contracts/ai.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { maskPersonalData } from '../../shared/pii.js';
import { writeAuditEvent } from '../../shared/audit.js';
import { dayKeyFromIso, nowIso } from '../reporting/service.js';
import {
  readConfigLayers,
  resolveTenantConfig,
} from '../config/service.js';
import {
  AI_BUDGET_EXCEEDED_MESSAGE,
  AI_DEFAULT_TIMEZONE,
  AI_INVALID_MESSAGE,
  AI_PERMISSION_DENIED_MESSAGE,
  MAX_AI_ITEM_STATS,
  assembleSafeContext,
  assertAiOwnerMember,
  assertNoSecretMaterial,
  assertQuestionInPermission,
  buildAiResult,
  buildAiUsageRecord,
  computeWarnings,
  estimateAiReservationVnd,
  hasSecretMaterial,
  mapDailyItemStats,
  mapDailyStats,
  monthKeyFromDayKey,
  readIngredients,
  readMenuItems,
  reserveAiBudget,
  resolveAiProvider,
  settleAiBudget,
  type AiProviderResponse,
} from './service.js';
import {
  MAX_FEEDBACK_SCAN,
  groupFeedbackThemes,
  type FeedbackAnalysisRow,
} from './feedback-grouping.js';
import { runWeeklyAnalysis } from './weekly.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

/**
 * Read-only Owner assistant baseline (REQ-AI-001). Assembles a bounded,
 * authorized, PII-free context from Reporting daily stats and Inventory
 * metadata, computes deterministic warnings, and records usage cost.
 *
 * It writes only the `aiUsage` accounting record. It never changes money,
 * prices, permissions, inventory, or any other business state.
 */
export const callableAiAsk = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const parsed = aiAskInputSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', AI_INVALID_MESSAGE);
  }
  const input: AiAskInput = parsed.data;
  const isAdmin =
    (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
    true;
  const db = getDb();

  const memberSnap = await db
    .doc(`tenants/${input.tenantId}/members/${uid}`)
    .get();
  assertAiOwnerMember(memberSnap.exists ? memberSnap.data() : undefined, isAdmin);
  assertQuestionInPermission(input.question);
  if (hasSecretMaterial(input.question)) {
    throw new HttpsError('permission-denied', AI_PERMISSION_DENIED_MESSAGE);
  }

  const now = nowIso();
  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  const timezoneRaw = tenantSnap.get('timezone');
  const timezone =
    typeof timezoneRaw === 'string' && timezoneRaw.length > 0
      ? timezoneRaw
      : AI_DEFAULT_TIMEZONE;
  const dayKey = input.dayKey ?? dayKeyFromIso(now, timezone);
  const monthKey = monthKeyFromDayKey(dayKeyFromIso(now, timezone));

  // Config owns the provider selection and the per-tenant monthly budget
  // (REQ-AI-004, REQ-AI-005, NFR-AI-002).
  const resolvedConfig = resolveTenantConfig(
    await readConfigLayers(db, input.tenantId),
  );
  const { provider: providerName, monthlyBudgetVnd } = resolvedConfig.values.ai;

  // Resolve the concrete adapter first so the reservation matches its real
  // cost profile. The reservation is atomic, so concurrent calls cannot both
  // pass the cap (REQ-AI-005, NFR-AI-002).
  const provider = resolveAiProvider(providerName);
  // Mask the Owner question before it reaches any provider (NFR-PRIV-002).
  const safeQuestion = maskPersonalData(input.question);

  const dayRef = db.doc(`tenants/${input.tenantId}/dailyStats/${dayKey}`);
  const [daySnap, itemsSnap, menuItems, ingredients] = await Promise.all([
    dayRef.get(),
    dayRef.collection('items').limit(MAX_AI_ITEM_STATS).get(),
    readMenuItems(db, input.tenantId),
    readIngredients(db, input.tenantId),
  ]);

  const dayStats = daySnap.exists
    ? [
        {
          stats: mapDailyStats(input.tenantId, dayKey, daySnap.data() ?? {}),
          items: itemsSnap.docs.map((itemSnap) =>
            mapDailyItemStats(
              input.tenantId,
              dayKey,
              itemSnap.id,
              itemSnap.data(),
            ),
          ),
        },
      ]
    : [];

  const context = assembleSafeContext({
    tenantId: input.tenantId,
    dayStats,
    menuItems,
    ingredients,
  });
  const warnings = computeWarnings(context);
  // Reserve only around the provider call, so no failure between the
  // reservation and the call can leak budget.
  const estimatedReservationVnd = estimateAiReservationVnd(
    provider.provider,
    safeQuestion,
  );
  const reservation = await reserveAiBudget(db, {
    tenantId: input.tenantId,
    monthKey,
    monthlyBudgetVnd,
    estimatedCostVnd: estimatedReservationVnd,
    now,
  });
  if (!reservation.reserved) {
    await writeAuditEvent({
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'system',
      role: null,
      action: 'AiBudgetExceeded',
      targetType: 'aiUsage',
      targetId: null,
      reason: null,
      detail: {
        monthKey,
        monthlyBudgetVnd,
        spentVnd: reservation.spentVnd,
        outstandingVnd: reservation.outstandingVnd,
        purpose: 'warnings',
      },
    });
    throw new HttpsError('resource-exhausted', AI_BUDGET_EXCEEDED_MESSAGE);
  }
  let response: AiProviderResponse;
  try {
    response = await provider.generate({
      question: safeQuestion,
      context,
      warnings,
    });
  } catch (error) {
    // Release the reservation even when the provider fails, so a failed call
    // never locks budget forever.
    await settleAiBudget(db, {
      tenantId: input.tenantId,
      monthKey,
      reservedVnd: reservation.reservedVnd,
      actualCostVnd: 0,
      now,
    });
    throw error;
  }
  // Release the reservation and commit the actual integer-VND cost.
  await settleAiBudget(db, {
    tenantId: input.tenantId,
    monthKey,
    reservedVnd: reservation.reservedVnd,
    actualCostVnd: response.estimatedCostVnd,
    now,
  });
  const result = buildAiResult({
    tenantId: input.tenantId,
    question: safeQuestion,
    context,
    warnings,
    response,
    now,
  });
  assertNoSecretMaterial(result);

  const usageRef = db.collection(`tenants/${input.tenantId}/aiUsage`).doc();
  const usage = buildAiUsageRecord({
    usageId: usageRef.id,
    tenantId: input.tenantId,
    response,
    monthKey,
    now,
  });
  await usageRef.set(usage);

  return aiAskResultSchema.parse(result);
});

function parseAiInput<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  data: unknown,
): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success || parsed.data === undefined) {
    throw new HttpsError('invalid-argument', AI_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * Owner weekly analysis command (REQ-AI-002). Runs one grounded analysis for
 * the previous completed tenant-local week and writes bounded `aiInsights`.
 * The scheduled function calls the same code path.
 */
export const callableAiRunWeeklyAnalysis = onCall(
  CALL_OPTIONS,
  async (request): Promise<AiWeeklyAnalysisResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseAiInput<AiWeeklyAnalysisInput>(
      aiWeeklyAnalysisInputSchema,
      request.data,
    );
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;
    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertAiOwnerMember(
      memberSnap.exists ? memberSnap.data() : undefined,
      isAdmin,
    );

    return runWeeklyAnalysis(db, input.tenantId);
  },
);

/**
 * Owner feedback grouping command (REQ-FDB-002, NFR-PRIV-002). Reads bounded
 * masked feedback, groups repeated themes, cites source feedback IDs, and never
 * echoes raw text or personal data.
 */
export const callableAiGroupFeedback = onCall(
  CALL_OPTIONS,
  async (request): Promise<AiFeedbackGroupingResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseAiInput<AiFeedbackGroupingInput>(
      aiFeedbackGroupingInputSchema,
      request.data,
    );
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;
    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertAiOwnerMember(
      memberSnap.exists ? memberSnap.data() : undefined,
      isAdmin,
    );

    const limit = input.limit ?? 100;
    const feedbackSnap = await db
      .collection(`tenants/${input.tenantId}/feedback`)
      .orderBy('createdAt', 'desc')
      .limit(Math.min(limit, MAX_FEEDBACK_SCAN))
      .get();
    const feedback: FeedbackAnalysisRow[] = feedbackSnap.docs.map(
      (feedbackDoc) => ({
        feedbackId: feedbackDoc.id,
        rating:
          typeof feedbackDoc.get('rating') === 'number'
            ? (feedbackDoc.get('rating') as number)
            : null,
        maskedMessage:
          typeof feedbackDoc.get('maskedMessage') === 'string'
            ? (feedbackDoc.get('maskedMessage') as string)
            : null,
        message:
          typeof feedbackDoc.get('message') === 'string'
            ? (feedbackDoc.get('message') as string)
            : null,
      }),
    );

    const resolvedConfig = resolveTenantConfig(
      await readConfigLayers(db, input.tenantId),
    );
    const provider = resolveAiProvider(resolvedConfig.values.ai.provider);
    return aiFeedbackGroupingResultSchema.parse(
      groupFeedbackThemes({
        tenantId: input.tenantId,
        feedback,
        provider: provider.provider,
        model: provider.model,
        now: nowIso(),
      }),
    );
  },
);

/**
 * Weekly safety net: run the grounded weekly analysis for every tenant in its
 * own timezone. A failure for one tenant never blocks the others (REQ-AI-002).
 */
export const scheduledAiWeeklyAnalysis = onSchedule(
  {
    region: 'us-central1',
    timeZone: AI_DEFAULT_TIMEZONE,
    schedule: 'every monday 03:00',
  },
  async () => {
    const db = getDb();
    const tenantsSnap = await db.collection('tenants').limit(1000).get();
    for (const tenantSnap of tenantsSnap.docs) {
      try {
        await runWeeklyAnalysis(db, tenantSnap.id);
      } catch {
        // Keep the schedule alive; the on-demand command surfaces the error.
      }
    }
  },
);
