import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  PROMOTION_CONTRACT_VERSION,
  promotionCommandResultSchema,
  promotionListResultSchema,
  type Promotion,
} from '../../../../shared/contracts/promotion.contract.js';
import {
  CAMPAIGN_CONTRACT_VERSION,
  campaignMeasurementResultSchema,
  campaignSuggestionResultSchema,
  campaignSuggestionSchema,
} from '../../../../shared/contracts/campaign.contract.js';
import {
  PROMOTION_AI_CONTRACT_VERSION,
  promotionAiAnswerInputSchema,
  promotionAiConfirmInputSchema,
  promotionAiResultSchema,
  promotionAiSessionInputSchema,
  promotionAiSessionSchema,
  promotionAiStartInputSchema,
  type PromotionAiSession,
} from '../../../../shared/contracts/promotionAi.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { assertRateLimit } from '../../shared/rateLimit.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  buildAiUsageRecord,
  monthKeyFromDayKey,
  toIsoTimestamp,
} from '../ai/service.js';
import {
  buildLoyaltyConfigDocument,
  resolveLoyaltyConfig,
} from '../loyalty/service.js';
import { dayKeyFromIso, shiftDayKey } from '../reporting/service.js';
import { resolvePublicOrderRateLimit } from '../table-access/service.js';
import {
  assertFeatureEntitlement,
  loadSubscriptionState,
} from '../subscription/service.js';
import {
  CAMPAIGN_IDEMPOTENCY_CONFLICT_MESSAGE,
  CAMPAIGN_NOT_FOUND_MESSAGE,
  buildApproveCampaignRequestHash,
  buildCampaignMeasurement,
  buildCampaignSuggestion,
  campaignSuggestionCollectionPath,
  parseApproveCampaignInput,
  parseMeasureCampaignInput,
  parseSuggestCampaignInput,
  toCampaignSuggestion,
} from './campaign.service.js';
import {
  assertActiveOwnerMember,
  assertPromotionAdvancedAllowed,
  assertPromotionCapacity,
  buildPromotionDocument,
  evaluatePromotionForCart,
  mapStoredPromotion,
  nowIso,
  parsePromotionEvaluateInput,
  parsePromotionListInput,
  parsePromotionSetStatusInput,
  parsePromotionUpsertInput,
  PROMOTION_LIST_LIMIT,
  PROMOTION_NOT_FOUND_MESSAGE,
  PROMOTION_QUICK_SOURCE_MESSAGE,
} from './service.js';
import {
  buildPromotionAiDraft,
  emptyPromotionAiAnswers,
  mergePromotionAiAnswer,
  nextPromotionAiStep,
  questionForStep,
  PROMOTION_AI_NOT_READY,
  PROMOTION_AI_SESSION_NOT_FOUND,
} from './ai-builder.service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

function promotionCollection(tenantId: string): string {
  return `tenants/${tenantId}/promotions`;
}

function promotionAiSessionCollection(tenantId: string): string {
  return `tenants/${tenantId}/promotionAiSessions`;
}

function parsePromotionAi<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success || parsed.data === undefined) {
    throw new HttpsError('invalid-argument', 'Dữ liệu tạo khuyến mãi AI không hợp lệ.');
  }
  return parsed.data;
}

/** Start a resumable, structured Owner conversation for a Promotion (REQ-PRO-007). */
export const callablePromotionAiStart = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập để tạo khuyến mãi AI.');
  assertAppCheck(request);
  const input = parsePromotionAi(promotionAiStartInputSchema, request.data);
  const db = getDb();
  assertFeatureEntitlement(await loadSubscriptionState(db, input.tenantId), 'promotions');
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const memberSnap = await memberRef.get();
  assertActiveOwnerMember(memberSnap.data());
  const now = nowIso();
  const ref = db.collection(promotionAiSessionCollection(input.tenantId)).doc();
  const step = 'goal' as const;
  const session = promotionAiSessionSchema.parse({
    schemaVersion: PROMOTION_AI_CONTRACT_VERSION,
    sessionId: ref.id,
    tenantId: input.tenantId,
    status: 'collecting',
    step,
    answers: emptyPromotionAiAnswers(),
    messages: [{ messageId: `${ref.id}-goal`, role: 'assistant', questionKey: step, text: questionForStep(step), createdAt: now }],
    draft: null,
    sourceIds: [],
    missingData: false,
    missingDataNotes: [],
    createdByUid: uid,
    provider: 'rule-based',
    model: 'structured-v1',
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
  });
  await ref.set(session);
  return promotionAiResultSchema.parse({ schemaVersion: PROMOTION_AI_CONTRACT_VERSION, session });
});

/** Resume a persisted structured promotion conversation. */
export const callablePromotionAiGet = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập để tiếp tục.');
  assertAppCheck(request);
  const input = parsePromotionAi(promotionAiSessionInputSchema, request.data);
  const db = getDb();
  const memberSnap = await db.doc(`tenants/${input.tenantId}/members/${uid}`).get();
  assertActiveOwnerMember(memberSnap.data());
  const snap = await db.doc(`${promotionAiSessionCollection(input.tenantId)}/${input.sessionId}`).get();
  if (!snap.exists || snap.get('createdByUid') !== uid) throw new HttpsError('not-found', PROMOTION_AI_SESSION_NOT_FOUND);
  const session = promotionAiSessionSchema.parse({ ...(snap.data() ?? {}), sessionId: input.sessionId });
  return promotionAiResultSchema.parse({ schemaVersion: PROMOTION_AI_CONTRACT_VERSION, session });
});

/** Save one structured answer and ask only the next required question. */
export const callablePromotionAiAnswer = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập để trả lời.');
  assertAppCheck(request);
  const input = parsePromotionAi(promotionAiAnswerInputSchema, request.data);
  const db = getDb();
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const sessionRef = db.doc(`${promotionAiSessionCollection(input.tenantId)}/${input.sessionId}`);
  const memberSnap = await memberRef.get();
  assertActiveOwnerMember(memberSnap.data());
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists || sessionSnap.get('createdByUid') !== uid) throw new HttpsError('not-found', PROMOTION_AI_SESSION_NOT_FOUND);
  const current = promotionAiSessionSchema.parse({ ...(sessionSnap.data() ?? {}), sessionId: input.sessionId });
  if (current.status !== 'collecting' && current.status !== 'ready') throw new HttpsError('failed-precondition', 'Phiên này không còn nhận câu trả lời.');
  if (input.step !== current.step) throw new HttpsError('failed-precondition', 'Câu hỏi này không còn là câu hỏi hiện tại.');
  const answers = mergePromotionAiAnswer(current.answers, input.step, input.answer);
  const step = nextPromotionAiStep(answers);
  const now = nowIso();
  let draft = null;
  let status: 'collecting' | 'ready' = 'collecting';
  if (step === 'review') {
    draft = buildPromotionAiDraft(answers);
    status = 'ready';
  }
  const messages = status === 'collecting'
    ? [...current.messages, { messageId: `${input.sessionId}-${current.messages.length}`, role: 'assistant' as const, questionKey: step, text: questionForStep(step), createdAt: now }]
    : current.messages;
  const session = promotionAiSessionSchema.parse({ ...current, status, step, answers, draft, messages, updatedAt: now });
  await sessionRef.set(session);
  return promotionAiResultSchema.parse({ schemaVersion: PROMOTION_AI_CONTRACT_VERSION, session });
});

/** Discard a resumable conversation without touching Promotions. */
export const callablePromotionAiDiscard = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập để hủy phiên.');
  assertAppCheck(request);
  const input = parsePromotionAi(promotionAiSessionInputSchema, request.data);
  const db = getDb();
  const ref = db.doc(`${promotionAiSessionCollection(input.tenantId)}/${input.sessionId}`);
  const memberSnap = await db.doc(`tenants/${input.tenantId}/members/${uid}`).get();
  assertActiveOwnerMember(memberSnap.data());
  const snap = await ref.get();
  if (!snap.exists || snap.get('createdByUid') !== uid) throw new HttpsError('not-found', PROMOTION_AI_SESSION_NOT_FOUND);
  const session = promotionAiSessionSchema.parse({ ...(snap.data() ?? {}), sessionId: input.sessionId, status: 'cancelled', updatedAt: nowIso() });
  await ref.set(session);
  return promotionAiResultSchema.parse({ schemaVersion: PROMOTION_AI_CONTRACT_VERSION, session });
});

/** Confirm once, then create an inactive deterministic Promotion. */
export const callablePromotionAiConfirm = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Cần đăng nhập để xác nhận.');
  assertAppCheck(request);
  const input = parsePromotionAi(promotionAiConfirmInputSchema, request.data);
  const db = getDb();
  assertFeatureEntitlement(await loadSubscriptionState(db, input.tenantId), 'promotions');
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const sessionRef = db.doc(`${promotionAiSessionCollection(input.tenantId)}/${input.sessionId}`);
  const idempotencyRef = db.doc(`tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`);
  const now = nowIso();
  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const sessionSnap = await transaction.get(sessionRef);
    const idemSnap = await transaction.get(idempotencyRef);
    assertActiveOwnerMember(memberSnap.data());
    if (!sessionSnap.exists || sessionSnap.get('createdByUid') !== uid) throw new HttpsError('not-found', PROMOTION_AI_SESSION_NOT_FOUND);
    const session = promotionAiSessionSchema.parse({ ...(sessionSnap.data() ?? {}), sessionId: input.sessionId });
    if (idemSnap.exists) return session;
    if (session.status !== 'ready' || session.draft === null) throw new HttpsError('failed-precondition', PROMOTION_AI_NOT_READY);
    const promotionRef = db.collection(promotionCollection(input.tenantId)).doc();
    const subscription = await loadSubscriptionState(db, input.tenantId);
    assertPromotionAdvancedAllowed(subscription.entitlements, { benefit: session.draft.benefit, eligibility: session.draft.eligibility });
    const promotion = buildPromotionDocument({ promotionId: promotionRef.id, tenantId: input.tenantId, name: session.draft.name, priority: session.draft.priority, startsAt: session.draft.startsAt, endsAt: session.draft.endsAt, eligibility: session.draft.eligibility, benefit: session.draft.benefit, status: 'inactive', source: 'manual', now, createdAt: now });
    transaction.set(promotionRef, promotion);
    const confirmed = promotionAiSessionSchema.parse({ ...session, status: 'confirmed', updatedAt: now, confirmedAt: now });
    transaction.set(sessionRef, confirmed);
    transaction.set(idempotencyRef, { command: 'promotionAiConfirm', status: 'applied', createdAt: now, promotionId: promotionRef.id });
    writeAuditEventInTransaction(transaction, { tenantId: input.tenantId, actorUid: uid, actorType: 'owner', role: 'owner', action: 'PromotionAiConfirmed', targetType: 'promotion', targetId: promotionRef.id, detail: { sessionId: input.sessionId } });
    return confirmed;
  });
  return promotionAiResultSchema.parse({ schemaVersion: PROMOTION_AI_CONTRACT_VERSION, session: outcome });
});

/**
 * Server promotion calculation. The client supplies only menu ids, quantities,
 * option ids, an optional code, and an optional verified Loyalty member; the
 * server resolves current prices, selects one best eligible promotion (never
 * stacking), and returns an integer-VND result (REQ-PRO-001).
 *
 * This is a public Customer calculation, so it requires App Check and the
 * configured public rate limit, but no sign-in.
 */
export const callablePromotionEvaluate = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const input = parsePromotionEvaluateInput(request.data);
    const db = getDb();
    const limit = await resolvePublicOrderRateLimit(db);
    assertRateLimit(`promotion-evaluate:${input.tenantId}`, limit);
    // A typed code is guessable, so it gets its own bounded attempt budget.
    if (input.code) {
      assertRateLimit(`promotion-code:${input.tenantId}`, limit);
    }

    const { result } = await evaluatePromotionForCart(
      db,
      input.tenantId,
      input.lines,
      {
        code: input.code ?? null,
        loyaltyMemberId: input.loyaltyMemberId ?? null,
      },
    );
    return result;
  },
);

/** Active member query: every non-archived Promotion of the Tenant, bounded. */
export const callablePromotionList = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Cần đăng nhập để xem khuyến mãi.');
  }
  assertAppCheck(request);
  const input = parsePromotionListInput(request.data);
  const db = getDb();

  const memberSnap = await db
    .doc(`tenants/${input.tenantId}/members/${uid}`)
    .get();
  if (!memberSnap.exists || memberSnap.get('isActive') === false) {
    throw new HttpsError(
      'permission-denied',
      'Bạn không thuộc cửa hàng này.',
    );
  }

  const snapshot = await db
    .collection(promotionCollection(input.tenantId))
    .where('archivedAt', '==', null)
    .limit(PROMOTION_LIST_LIMIT)
    .get();
  return promotionListResultSchema.parse({
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    promotions: snapshot.docs.map((docSnap) =>
      mapStoredPromotion(docSnap.id, input.tenantId, docSnap.data()),
    ),
  });
});

/** Owner command: create or update a Promotion. */
export const callablePromotionUpsert = onCall(CALL_OPTIONS, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Cần đăng nhập để quản lý khuyến mãi.');
  }
  assertAppCheck(request);
  const input = parsePromotionUpsertInput(request.data);
  const db = getDb();
  const subscription = await loadSubscriptionState(db, input.tenantId);
  assertFeatureEntitlement(subscription, 'promotions');
  // A Free plan may only use a basic benefit with basic conditions.
  assertPromotionAdvancedAllowed(subscription.entitlements, input);

  const collectionRef = db.collection(promotionCollection(input.tenantId));
  const promotionRef = input.promotionId
    ? db.doc(`${promotionCollection(input.tenantId)}/${input.promotionId}`)
    : collectionRef.doc();
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

  const promotion = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const existingSnap = await transaction.get(promotionRef);
    assertActiveOwnerMember(memberSnap.data());
    if (input.promotionId && !existingSnap.exists) {
      throw new HttpsError('not-found', PROMOTION_NOT_FOUND_MESSAGE);
    }
    // The quick discount is owned by the Settings page, so the Promotion page
    // cannot rewrite or re-source it (REQ-PRO-002).
    if (existingSnap.exists && existingSnap.get('source') === 'quick') {
      throw new HttpsError('failed-precondition', PROMOTION_QUICK_SOURCE_MESSAGE);
    }

    const now = nowIso();
    const existing = existingSnap.exists
      ? mapStoredPromotion(
          promotionRef.id,
          input.tenantId,
          existingSnap.data() ?? {},
        )
      : null;
    const next = buildPromotionDocument({
      promotionId: promotionRef.id,
      tenantId: input.tenantId,
      name: input.name,
      priority: input.priority,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      eligibility: input.eligibility,
      benefit: input.benefit,
      status: existing?.status ?? 'inactive',
      source: input.source ?? 'manual',
      now,
      createdAt: existingSnap.get('createdAt') ?? now,
    });
    transaction.set(promotionRef, next);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: 'owner',
      role: 'owner',
      action: 'PromotionChanged',
      targetType: 'promotion',
      targetId: promotionRef.id,
      detail: { benefitType: next.benefit.type, status: next.status },
    });
    return next;
  });

  return promotionCommandResultSchema.parse({
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    command: 'upsert',
    status: 'applied',
    promotion,
    appliedAt: nowIso(),
  });
});

/** Owner command: activate, deactivate, or archive a Promotion. */
export const callablePromotionSetStatus = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Cần đăng nhập để quản lý khuyến mãi.',
      );
    }
    assertAppCheck(request);
    const input = parsePromotionSetStatusInput(request.data);
    const db = getDb();
    const subscription = await loadSubscriptionState(db, input.tenantId);
    assertFeatureEntitlement(subscription, 'promotions');

    // The plan cap applies at the moment a Promotion becomes active, so a Free
    // tenant can still keep drafts (REQ-PRO-006).
    if (input.status === 'active') {
      const activeSnap = await db
        .collection(promotionCollection(input.tenantId))
        .where('status', '==', 'active')
        .get();
      const others = activeSnap.docs.filter(
        (docSnap) => docSnap.id !== input.promotionId,
      ).length;
      assertPromotionCapacity(subscription.entitlements, others);
    }

    const promotionRef = db.doc(
      `${promotionCollection(input.tenantId)}/${input.promotionId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const promotion = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const promotionSnap = await transaction.get(promotionRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!promotionSnap.exists) {
        throw new HttpsError('not-found', PROMOTION_NOT_FOUND_MESSAGE);
      }
      const existing = mapStoredPromotion(
        input.promotionId,
        input.tenantId,
        promotionSnap.data() ?? {},
      );
      const now = nowIso();
      const next: Promotion = {
        ...existing,
        status: input.status,
        archivedAt: input.status === 'archived' ? now : null,
        updatedAt: now,
      };
      transaction.set(promotionRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'PromotionChanged',
        targetType: 'promotion',
        targetId: input.promotionId,
        reason: input.reason ?? null,
        detail: { status: input.status },
      });
      return next;
    });

    return promotionCommandResultSchema.parse({
      schemaVersion: PROMOTION_CONTRACT_VERSION,
      command: 'setStatus',
      status: 'applied',
      promotion,
      appliedAt: nowIso(),
    });
  },
);

const MAX_CAMPAIGN_DAYS = 7;
const MAX_CAMPAIGN_ORDERS = 500;
const CAMPAIGN_DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

function tenantTimezone(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : CAMPAIGN_DEFAULT_TIMEZONE;
}

function dayIsoBounds(fromDay: string, toDay: string): { from: string; to: string } {
  const iso = (day: string): string =>
    `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z`;
  return { from: iso(fromDay), to: `${iso(toDay).slice(0, 11)}23:59:59.999Z` };
}

/**
 * Owner command: ask AI for a Promotion or Loyalty campaign suggestion.
 *
 * The run reads only bounded authorized aggregates, writes the suggestion and
 * its usage record, and NEVER changes a Promotion or Loyalty configuration.
 * Applying a suggestion requires the separate Owner approval command
 * (REQ-PRO-001, REQ-LOY-001, NFR-SEC-003).
 */
export const callablePromotionSuggestCampaign = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Cần đăng nhập để tạo gợi ý chiến dịch.',
      );
    }
    assertAppCheck(request);
    const input = parseSuggestCampaignInput(request.data);
    const db = getDb();
    assertFeatureEntitlement(
      await loadSubscriptionState(db, input.tenantId),
      'promotions',
    );

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    assertActiveOwnerMember(memberSnap.data());

    const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
    const timezone = tenantTimezone(tenantSnap.get('timezone'));
    const now = nowIso();
    const today = dayKeyFromIso(now, timezone);
    const toDay = input.toDay ?? today;
    const fromDay = input.fromDay ?? shiftDayKey(toDay, -6);

    const dailySnap = await db
      .collection(`tenants/${input.tenantId}/dailyStats`)
      .where(FieldPath.documentId(), '>=', fromDay)
      .where(FieldPath.documentId(), '<=', toDay)
      .limit(MAX_CAMPAIGN_DAYS)
      .get();
    const sourceDayKeys = dailySnap.docs.map((docSnap) => docSnap.id);

    const loyalty = await resolveLoyaltyConfig(db, input.tenantId);
    const suggestionRef = db
      .collection(campaignSuggestionCollectionPath(input.tenantId))
      .doc();
    const suggestion = buildCampaignSuggestion({
      suggestionId: suggestionRef.id,
      tenantId: input.tenantId,
      channel: input.channel,
      goal: input.goal,
      sourceDayKeys,
      currentLoyalty: {
        earnRateVnd: loyalty.earnRateVnd,
        pointsPerEarnRate: loyalty.pointsPerEarnRate,
        welcomePoints: loyalty.welcomePoints,
      },
      provider: 'rule-based',
      model: 'deterministic-v1',
      now,
    });

    const usageRef = db.collection(`tenants/${input.tenantId}/aiUsage`).doc();
    const usage = buildAiUsageRecord({
      usageId: usageRef.id,
      tenantId: input.tenantId,
      response: {
        provider: 'rule-based',
        model: 'deterministic-v1',
        answer: suggestion.rationale,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostVnd: 0,
      },
      monthKey: monthKeyFromDayKey(dayKeyFromIso(now, timezone)),
      now,
      purpose: 'campaignSuggestion',
    });

    await db.runTransaction(async (transaction) => {
      const freshMember = await transaction.get(memberRef);
      assertActiveOwnerMember(freshMember.data());
      transaction.set(suggestionRef, suggestion);
      transaction.set(usageRef, usage);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'CampaignSuggested',
        targetType: 'campaign_suggestion',
        targetId: suggestion.suggestionId,
        detail: {
          channel: suggestion.channel,
          goal: suggestion.goal,
          missingData: suggestion.missingData,
        },
      });
    });

    return campaignSuggestionResultSchema.parse({
      schemaVersion: CAMPAIGN_CONTRACT_VERSION,
      status: 'suggested',
      suggestion,
    });
  },
);

/**
 * Owner command: approve an AI campaign suggestion. Only this human-approved
 * command changes business state: it creates an active Promotion or updates the
 * tenant Loyalty configuration (NFR-SEC-003). Without approval nothing changes.
 */
export const callablePromotionApproveCampaign = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Cần đăng nhập để duyệt chiến dịch.',
      );
    }
    assertAppCheck(request);
    const input = parseApproveCampaignInput(request.data);
    const db = getDb();
    assertFeatureEntitlement(
      await loadSubscriptionState(db, input.tenantId),
      'promotions',
    );

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const suggestionRef = db.doc(
      `${campaignSuggestionCollectionPath(input.tenantId)}/${input.suggestionId}`,
    );
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );
    const now = nowIso();
    const loyalty = await resolveLoyaltyConfig(db, input.tenantId);
    const requestHash = buildApproveCampaignRequestHash({
      tenantId: input.tenantId,
      suggestionId: input.suggestionId,
      reason: input.reason ?? null,
    });

    const outcome = await db.runTransaction<{
      replayed: boolean;
      suggestion: ReturnType<typeof toCampaignSuggestion>;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const suggestionSnap = await transaction.get(suggestionRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!suggestionSnap.exists) {
        throw new HttpsError('not-found', CAMPAIGN_NOT_FOUND_MESSAGE);
      }
      const suggestion = toCampaignSuggestion(
        input.suggestionId,
        suggestionSnap.data() ?? {},
      );
      if (idempotencySnap.exists) {
        const record = idempotencySnap.data() as
          | { requestHash?: string }
          | undefined;
        if ((record?.requestHash ?? null) !== requestHash) {
          throw new HttpsError(
            'already-exists',
            CAMPAIGN_IDEMPOTENCY_CONFLICT_MESSAGE,
          );
        }
        return { replayed: true, suggestion };
      }
      if (suggestion.status === 'approved') {
        return { replayed: true, suggestion };
      }

      if (suggestion.channel === 'promotion') {
        if (!suggestion.proposedPromotion) {
          throw new HttpsError('failed-precondition', CAMPAIGN_NOT_FOUND_MESSAGE);
        }
        const promotionRef = db
          .collection(promotionCollection(input.tenantId))
          .doc();
        transaction.set(
          promotionRef,
          buildPromotionDocument({
            promotionId: promotionRef.id,
            tenantId: input.tenantId,
            name: suggestion.proposedPromotion.name,
            priority: suggestion.proposedPromotion.priority,
            startsAt: suggestion.proposedPromotion.startsAt,
            endsAt: suggestion.proposedPromotion.endsAt,
            eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY },
            benefit: suggestion.proposedPromotion.benefit,
            status: 'active',
            source: 'manual',
            now,
            createdAt: now,
          }),
        );
      } else {
        if (!suggestion.proposedLoyalty) {
          throw new HttpsError('failed-precondition', CAMPAIGN_NOT_FOUND_MESSAGE);
        }
        transaction.set(
          db.doc(`tenants/${input.tenantId}/loyaltyConfig/current`),
          buildLoyaltyConfigDocument(
            input.tenantId,
            loyalty,
            {
              tenantId: input.tenantId,
              earnRateVnd: suggestion.proposedLoyalty.earnRateVnd,
              pointsPerEarnRate: suggestion.proposedLoyalty.pointsPerEarnRate,
              welcomePoints: suggestion.proposedLoyalty.welcomePoints,
            },
            now,
          ),
        );
      }

      const approved = campaignSuggestionSchema.parse({
        ...suggestion,
        status: 'approved',
        approvedByUid: uid,
        approvedAt: now,
      });
      transaction.set(suggestionRef, approved);
      transaction.set(idempotencyRef, {
        command: 'approveCampaign',
        requestHash,
        status: 'applied',
        createdAt: now,
      });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'CampaignApproved',
        targetType: 'campaign_suggestion',
        targetId: input.suggestionId,
        reason: input.reason ?? null,
        detail: { channel: suggestion.channel, goal: suggestion.goal },
      });
      return { replayed: false, suggestion: approved };
    });

    return campaignSuggestionResultSchema.parse({
      schemaVersion: CAMPAIGN_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'approved',
      suggestion: outcome.suggestion,
    });
  },
);

/**
 * Owner query: measure return rate, average order value, and gross profit after
 * discount for a campaign window (REQ-PRO-001, REQ-LOY-001). It mutates no
 * business state and states the limitation when data is missing.
 */
export const callablePromotionMeasureCampaign = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        'unauthenticated',
        'Cần đăng nhập để đo chiến dịch.',
      );
    }
    assertAppCheck(request);
    const input = parseMeasureCampaignInput(request.data);
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveOwnerMember(memberSnap.data());

    const suggestionRef = db.doc(
      `${campaignSuggestionCollectionPath(input.tenantId)}/${input.suggestionId}`,
    );
    const suggestionSnap = await suggestionRef.get();
    if (!suggestionSnap.exists) {
      throw new HttpsError('not-found', CAMPAIGN_NOT_FOUND_MESSAGE);
    }
    const suggestion = toCampaignSuggestion(
      input.suggestionId,
      suggestionSnap.data() ?? {},
    );

    const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
    const timezone = tenantTimezone(tenantSnap.get('timezone'));
    const now = nowIso();
    const periodEnd = dayKeyFromIso(now, timezone);
    const periodStart = shiftDayKey(periodEnd, -6);
    const bounds = dayIsoBounds(periodStart, periodEnd);

    const dailySnap = await db
      .collection(`tenants/${input.tenantId}/dailyStats`)
      .where(FieldPath.documentId(), '>=', periodStart)
      .where(FieldPath.documentId(), '<=', periodEnd)
      .limit(MAX_CAMPAIGN_DAYS)
      .get();

    let paidOrderCount = 0;
    let revenueVnd = 0;
    let costVnd = 0;
    let grossProfitVnd = 0;
    const sourceIds: string[] = [];
    for (const daySnap of dailySnap.docs) {
      sourceIds.push(daySnap.id);
      paidOrderCount += Number(daySnap.get('paidOrderCount') ?? 0);
      revenueVnd += Number(daySnap.get('revenueVnd') ?? 0);
      costVnd += Number(daySnap.get('costVnd') ?? 0);
      grossProfitVnd += Number(daySnap.get('grossProfitVnd') ?? 0);
    }

    const ordersSnap = await db
      .collection(`tenants/${input.tenantId}/orders`)
      .where('status', '==', 'paid')
      .orderBy('createdAt', 'desc')
      .limit(MAX_CAMPAIGN_ORDERS)
      .get();

    const visitsByMember = new Map<string, number>();
    for (const orderSnap of ordersSnap.docs) {
      let createdAt: string;
      try {
        createdAt = toIsoTimestamp(orderSnap.get('createdAt'));
      } catch {
        continue;
      }
      if (createdAt < bounds.from || createdAt > bounds.to) {
        continue;
      }
      const memberId = orderSnap.get('loyaltyMemberId');
      if (typeof memberId !== 'string' || memberId.length === 0) {
        continue;
      }
      visitsByMember.set(memberId, (visitsByMember.get(memberId) ?? 0) + 1);
    }
    const distinctLoyaltyMembers = visitsByMember.size;
    const returningLoyaltyMembers = [...visitsByMember.values()].filter(
      (count) => count >= 2,
    ).length;

    const measurement = buildCampaignMeasurement({
      tenantId: input.tenantId,
      suggestionId: suggestion.suggestionId,
      channel: suggestion.channel,
      periodStart,
      periodEnd,
      paidOrderCount,
      revenueVnd,
      costVnd,
      grossProfitVnd,
      distinctLoyaltyMembers,
      returningLoyaltyMembers,
      sourceIds,
      now,
    });

    return campaignMeasurementResultSchema.parse({
      schemaVersion: CAMPAIGN_CONTRACT_VERSION,
      measurement,
    });
  },
);
