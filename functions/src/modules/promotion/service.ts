import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  PROMOTION_CONTRACT_VERSION,
  allocateLineDiscounts,
  isBasicPromotion,
  parseStoredPromotion,
  promotionEvaluateInputSchema,
  promotionEvaluationResultSchema,
  promotionListInputSchema,
  promotionSchema,
  promotionSetStatusInputSchema,
  promotionUpsertInputSchema,
  selectBestPromotion,
  type Promotion,
  type PromotionCartFacts,
  type PromotionCartLine,
  type PromotionEvaluateInput,
  type PromotionEvaluationResult,
  type PromotionIneligibilityReason,
  type PromotionListInput,
  type PromotionMenuItemFact,
  type PromotionSetStatusInput,
  type PromotionUpsertInput,
} from '../../../../shared/contracts/promotion.contract.js';
import {
  planAllowsAnotherActivePromotion,
  type PlanEntitlements,
} from '../../../../shared/contracts/subscription.contract.js';
import {
  sumModifierDeltaVnd,
  type PublicMenuItem,
} from '../../../../shared/contracts/catalog.contract.js';
import { loadSubscriptionState } from '../subscription/service.js';
import { mapStoredLoyaltyMember } from '../loyalty/service.js';

export const PROMOTION_INVALID_MESSAGE = 'Dữ liệu khuyến mãi không hợp lệ.';
export const PROMOTION_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const PROMOTION_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được khuyến mãi.';
export const PROMOTION_NOT_FOUND_MESSAGE = 'Không tìm thấy khuyến mãi.';
export const PROMOTION_MENU_ITEM_MISSING_MESSAGE =
  'Món trong giỏ không còn khả dụng.';
export const PROMOTION_QUICK_SOURCE_MESSAGE =
  'Ưu đãi nhanh chỉ sửa được ở trang Cấu hình.';
export const PROMOTION_ADVANCED_DENIED_MESSAGE =
  'Gói hiện tại chỉ dùng được khuyến mãi giảm % hoặc giảm tiền. Nâng lên Lite để mở giờ vàng, mã ưu đãi, tặng món và đổi điểm.';
export const PROMOTION_LIMIT_MESSAGE =
  'Gói Free chỉ cho phép 1 khuyến mãi đang chạy. Hãy tạm dừng khuyến mãi khác hoặc nâng lên Lite.';
export const PROMOTION_LOYALTY_MEMBER_MISSING_MESSAGE =
  'Không tìm thấy hội viên để đổi điểm.';

export const PROMOTION_LIST_LIMIT = 100;
export const PROMOTION_DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PROMOTION_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      PROMOTION_MEMBER_DENIED_MESSAGE,
    );
  }
  if (memberData.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      PROMOTION_OWNER_DENIED_MESSAGE,
    );
  }
}

export function parsePromotionEvaluateInput(
  data: unknown,
): PromotionEvaluateInput {
  return parseOrInvalid<PromotionEvaluateInput>(
    promotionEvaluateInputSchema,
    data,
  );
}

export function parsePromotionUpsertInput(
  data: unknown,
): PromotionUpsertInput {
  return parseOrInvalid<PromotionUpsertInput>(promotionUpsertInputSchema, data);
}

export function parsePromotionSetStatusInput(
  data: unknown,
): PromotionSetStatusInput {
  return parseOrInvalid<PromotionSetStatusInput>(
    promotionSetStatusInputSchema,
    data,
  );
}

export function parsePromotionListInput(data: unknown): PromotionListInput {
  return parseOrInvalid<PromotionListInput>(promotionListInputSchema, data);
}

/** Read a stored Promotion at any supported schema version (REQ-PRO-001). */
export function mapStoredPromotion(
  promotionId: string,
  tenantId: string,
  data: DocumentData,
): Promotion {
  return parseStoredPromotion(data, promotionId, tenantId);
}

export interface BuildPromotionDocumentInput {
  promotionId: string;
  tenantId: string;
  name: string;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  eligibility: PromotionUpsertInput['eligibility'];
  benefit: PromotionUpsertInput['benefit'];
  status: Promotion['status'];
  source: Promotion['source'];
  now: string;
  createdAt: string;
}

export function buildPromotionDocument(
  input: BuildPromotionDocumentInput,
): Promotion {
  return promotionSchema.parse({
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    promotionId: input.promotionId,
    tenantId: input.tenantId,
    name: input.name,
    source: input.source,
    status: input.status,
    priority: input.priority,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    eligibility: input.eligibility,
    benefit: input.benefit,
    createdAt: input.createdAt,
    updatedAt: input.now,
    archivedAt: input.status === 'archived' ? input.now : null,
  });
}

// ---------------------------------------------------------------------------
// Tenant-local clock
// ---------------------------------------------------------------------------

/** Resolve the tenant IANA timezone, falling back to Vietnam time. */
export function resolveTenantTimezone(value: unknown): string {
  return typeof value === 'string' && value.length > 0
    ? value
    : PROMOTION_DEFAULT_TIMEZONE;
}

export interface LocalClock {
  minuteOfDay: number;
  dayOfWeek: number;
}

/**
 * Tenant-local minute of day and weekday, so a happy hour or a weekday rule
 * means the same thing to the Owner and to the server (REQ-PRO-005).
 */
export function resolveLocalClock(iso: string, timezone: string): LocalClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = formatter.formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(
    parts.find((part) => part.type === 'minute')?.value ?? '0',
  );
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Sun';
  const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    weekday,
  );
  // `hour12: false` can render midnight as 24 in some ICU builds.
  const normalizedHour = hour === 24 ? 0 : hour;
  return {
    minuteOfDay: normalizedHour * 60 + minute,
    dayOfWeek: dayOfWeek < 0 ? 0 : dayOfWeek,
  };
}

// ---------------------------------------------------------------------------
// Cart and menu resolution
// ---------------------------------------------------------------------------

export interface EvaluatedCart {
  subtotalVnd: number;
  lines: Array<PromotionCartLine & { unitPriceVnd: number; lineTotalVnd: number }>;
}

/**
 * Every menu item id a candidate promotion may need beyond the cart, so a gift
 * item that is not in the cart still resolves its name and price.
 */
export function collectPromotionMenuItemIds(
  promotions: readonly Promotion[],
): string[] {
  const ids = new Set<string>();
  for (const promotion of promotions) {
    const benefit = promotion.benefit;
    if (benefit.type === 'buyXGetY') {
      if (benefit.buyMenuItemIds !== null) {
        for (const id of benefit.buyMenuItemIds) {
          ids.add(id);
        }
      }
      for (const id of benefit.getMenuItemIds) {
        ids.add(id);
      }
      continue;
    }
    if (benefit.type === 'freeItem' || benefit.type === 'bundlePrice') {
      for (const id of benefit.menuItemIds) {
        ids.add(id);
      }
      continue;
    }
    if (benefit.type === 'pointsRedemption' && benefit.reward.type === 'freeItem') {
      for (const id of benefit.reward.menuItemIds) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

function toMenuItemFact(item: PublicMenuItem): PromotionMenuItemFact {
  return {
    menuItemId: item.menuItemId,
    name: item.name,
    unitPriceVnd: item.priceVnd,
    isAvailable: item.isAvailable,
  };
}

export interface LoadPromotionFactsInput {
  tenantId: string;
  lines: readonly PromotionCartLine[];
  promotions: readonly Promotion[];
  loyaltyMemberId: string | null;
  now: string;
  timezone: string;
  /**
   * Already-resolved public menu items. Ordering passes the map it read before
   * its transaction, so the evaluation does not read the same document twice.
   * Any gift candidate missing from the map is loaded here.
   */
  publicItems?: Map<string, PublicMenuItem>;
}

/** Every public menu item an evaluation needs: the cart plus gift candidates. */
export function requiredPromotionMenuItemIds(
  lines: readonly PromotionCartLine[],
  promotions: readonly Promotion[],
): string[] {
  const ids = new Set(lines.map((line) => line.menuItemId));
  for (const menuItemId of collectPromotionMenuItemIds(promotions)) {
    ids.add(menuItemId);
  }
  return [...ids];
}

/**
 * Build the deterministic facts one evaluation reads. Everything comes from
 * the server: the public menu projection, the tenant timezone, and the Loyalty
 * member record (NFR-DATA-001).
 */
export async function loadPromotionFacts(
  db: Firestore,
  input: LoadPromotionFactsInput,
): Promise<PromotionCartFacts> {
  const publicItems = new Map(input.publicItems ?? []);
  const missingIds = requiredPromotionMenuItemIds(
    input.lines,
    input.promotions,
  ).filter((menuItemId) => !publicItems.has(menuItemId));
  if (missingIds.length > 0) {
    const snaps = await db.getAll(
      ...missingIds.map((menuItemId) =>
        db.doc(`tenants/${input.tenantId}/publicMenuItems/${menuItemId}`),
      ),
    );
    snaps.forEach((snap, index) => {
      const parsed = parsePublicItem(missingIds[index], snap.data() ?? {});
      if (parsed) {
        publicItems.set(missingIds[index], parsed);
      }
    });
  }

  const cart = resolvePromotionCartFromMenu(
    input.lines,
    publicItems,
    input.promotions,
  );
  const menuItems: PromotionMenuItemFact[] = [];
  for (const menuItemId of requiredPromotionMenuItemIds(
    input.lines,
    input.promotions,
  )) {
    const item = publicItems.get(menuItemId);
    if (item) {
      menuItems.push(toMenuItemFact(item));
    }
  }

  const loyaltyMember = await loadPromotionLoyaltyFacts(
    db,
    input.tenantId,
    input.loyaltyMemberId,
  );
  const clock = resolveLocalClock(input.now, input.timezone);
  return {
    subtotalVnd: cart.subtotalVnd,
    lines: cart.lines.map((line) => ({
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      unitPriceVnd: line.unitPriceVnd,
      lineTotalVnd: line.lineTotalVnd,
    })),
    menuItems,
    loyaltyMember,
    localMinuteOfDay: clock.minuteOfDay,
    localDayOfWeek: clock.dayOfWeek,
  };
}

/**
 * Resolve the authoritative cart from an already-read public menu map. The
 * client sends only menu ids, quantities, and option ids, so no client money
 * reaches the calculation (REQ-PRO-001, NFR-DATA-001). The modifier deltas
 * resolve exactly as Ordering resolves them, so the discount base is the same
 * subtotal the Order records.
 */
export function resolvePromotionCartFromMenu(
  lines: readonly PromotionCartLine[],
  publicItems: Map<string, PublicMenuItem>,
  promotions: readonly Promotion[] = [],
): EvaluatedCart {
  const resolved: EvaluatedCart['lines'] = [];
  for (const line of lines) {
    const item = publicItems.get(line.menuItemId);
    if (!item || !item.isAvailable) {
      throw new HttpsError(
        'failed-precondition',
        PROMOTION_MENU_ITEM_MISSING_MESSAGE,
      );
    }
    const unitPriceVnd =
      item.priceVnd +
      sumModifierDeltaVnd(item.modifierGroups, line.selectedOptionIds);
    resolved.push({
      ...line,
      unitPriceVnd,
      lineTotalVnd: unitPriceVnd * line.quantity,
    });
  }
  void promotions;
  return {
    subtotalVnd: resolved.reduce((sum, line) => sum + line.lineTotalVnd, 0),
    lines: resolved,
  };
}

/** Resolve the verified Loyalty member the evaluation may use. */
export async function loadPromotionLoyaltyFacts(
  db: Firestore,
  tenantId: string,
  loyaltyMemberId: string | null,
): Promise<PromotionCartFacts['loyaltyMember']> {
  if (loyaltyMemberId === null) {
    return null;
  }
  const memberSnap = await db
    .doc(`tenants/${tenantId}/loyaltyMembers/${loyaltyMemberId}`)
    .get();
  if (!memberSnap.exists) {
    return null;
  }
  const member = mapStoredLoyaltyMember(
    loyaltyMemberId,
    tenantId,
    memberSnap.data() ?? {},
  );
  return {
    memberId: member.memberId,
    isVerified: member.isVerified,
    pointBalance: member.pointBalance,
    visitCount: member.visitCount,
  };
}

/** Load the active Promotion definitions of one tenant, bounded. */
export async function loadActivePromotions(
  db: Firestore,
  tenantId: string,
): Promise<Promotion[]> {
  const snapshot = await db
    .collection(`tenants/${tenantId}/promotions`)
    .where('status', '==', 'active')
    .limit(PROMOTION_LIST_LIMIT)
    .get();
  return snapshot.docs.map((docSnap) =>
    mapStoredPromotion(docSnap.id, tenantId, docSnap.data()),
  );
}

/** Parse one public menu item, or null when it is missing or malformed. */
export function parsePublicItem(
  menuItemId: string,
  data: DocumentData,
): PublicMenuItem | null {
  const priceVnd = data.priceVnd;
  if (typeof priceVnd !== 'number' || priceVnd < 0) {
    return null;
  }
  const modifierGroups = Array.isArray(data.modifierGroups)
    ? data.modifierGroups
    : [];
  return {
    schemaVersion: 1,
    menuItemId,
    tenantId: data.tenantId,
    name: typeof data.name === 'string' && data.name.length > 0 ? data.name : menuItemId,
    description: data.description ?? null,
    category: data.category ?? '',
    type: data.type ?? null,
    priceVnd,
    imageUrl: data.imageUrl ?? null,
    modifierGroups,
    isAvailable: data.isAvailable !== false,
    updatedAt: data.updatedAt,
  } as PublicMenuItem;
}

// ---------------------------------------------------------------------------
// The one evaluation engine
// ---------------------------------------------------------------------------

export interface EvaluatePromotionOptions {
  code: string | null;
  loyaltyMemberId: string | null;
  now?: string;
  /**
   * Pre-loaded facts. Ordering passes these so the reads happen before its
   * transaction; a callable omits them and the engine loads its own.
   */
  facts?: PromotionCartFacts;
  promotions?: Promotion[];
  /** Already-read public menu items, so a gift candidate is not read twice. */
  publicItems?: Map<string, PublicMenuItem>;
  /** Already-read tenant timezone. */
  timezone?: string;
  /** Already-read subscription state. */
  entitlements?: PlanEntitlements;
}

export interface PromotionEvaluationOutcome {
  result: PromotionEvaluationResult;
  /** The Loyalty member the evaluation used, when one was resolved. */
  loyaltyMemberId: string | null;
}

/**
 * The single deterministic Promotion evaluation. The public evaluate callable
 * and Order creation both call this, so the discount a Customer sees and the
 * discount an Order records can never drift (REQ-PRO-001).
 *
 * A plan without the `promotions` capability always totals without a discount,
 * while the frontend reads the same server result (REQ-SUB-001).
 */
export async function evaluatePromotionForCart(
  db: Firestore,
  tenantId: string,
  lines: readonly PromotionCartLine[],
  options: EvaluatePromotionOptions,
): Promise<PromotionEvaluationOutcome> {
  const now = options.now ?? nowIso();
  const entitlements =
    options.entitlements ??
    (await loadSubscriptionState(db, tenantId)).entitlements;
  const promotionsAllowed = entitlements.features.includes('promotions');

  let promotions: Promotion[];
  if (options.promotions) {
    promotions = [...options.promotions];
  } else if (!promotionsAllowed) {
    promotions = [];
  } else {
    promotions = await loadActivePromotions(db, tenantId);
  }

  let facts = options.facts;
  if (!facts) {
    const timezone =
      options.timezone ??
      resolveTenantTimezone(
        (await db.doc(`tenants/${tenantId}`).get()).get('timezone'),
      );
    facts = await loadPromotionFacts(db, {
      tenantId,
      lines,
      promotions,
      loyaltyMemberId: options.loyaltyMemberId,
      now,
      timezone,
      publicItems: options.publicItems,
    });
  }

  const { selection, reasons } = selectBestPromotion(
    promotions,
    facts,
    now,
    options.code,
  );
  const discountVnd = selection?.discountVnd ?? 0;
  const giftLines = selection?.outcome.giftLines ?? [];
  const pointsRedeemed = selection?.outcome.pointsRedeemed ?? 0;
  const ineligibilityReasons: PromotionIneligibilityReason[] = [...reasons];

  return {
    result: promotionEvaluationResultSchema.parse({
      schemaVersion: PROMOTION_CONTRACT_VERSION,
      tenantId,
      subtotalVnd: facts.subtotalVnd,
      discountVnd,
      giftValueVnd: selection?.giftValueVnd ?? 0,
      totalVnd: facts.subtotalVnd - discountVnd,
      appliedPromotion: selection
        ? {
            promotionId: selection.promotion.promotionId,
            name: selection.promotion.name,
            benefitType: selection.promotion.benefit.type,
            priority: selection.promotion.priority,
            discountVnd,
            giftValueVnd: selection.giftValueVnd,
            code: selection.promotion.eligibility.code,
          }
        : null,
      lines: allocateLineDiscounts(facts, discountVnd),
      giftLines: giftLines.map((gift) => ({
        menuItemId: gift.menuItemId,
        name: gift.name,
        quantity: gift.quantity,
        unitPriceVnd: gift.unitPriceVnd,
      })),
      pointsRedeemed,
      codeRequired:
        selection === null && ineligibilityReasons.includes('codeRequired'),
      ineligibilityReasons,
      consideredPromotionIds: promotions
        .map((promotion) => promotion.promotionId)
        .sort(),
      evaluatedAt: now,
    }),
    loyaltyMemberId: facts.loyaltyMember?.memberId ?? null,
  };
}

// ---------------------------------------------------------------------------
// Plan gates
// ---------------------------------------------------------------------------

/** Reject an advanced benefit or condition on a plan that does not allow it. */
export function assertPromotionAdvancedAllowed(
  entitlements: PlanEntitlements,
  input: Pick<PromotionUpsertInput, 'benefit' | 'eligibility'>,
): void {
  if (entitlements.features.includes('promotionAdvanced')) {
    return;
  }
  if (!isBasicPromotion(input.benefit, input.eligibility)) {
    throw new HttpsError(
      'failed-precondition',
      PROMOTION_ADVANCED_DENIED_MESSAGE,
    );
  }
}

/** Reject one more active Promotion when the plan limit is already reached. */
export function assertPromotionCapacity(
  entitlements: PlanEntitlements,
  activePromotionCount: number,
): void {
  if (!planAllowsAnotherActivePromotion(entitlements, activePromotionCount)) {
    throw new HttpsError('failed-precondition', PROMOTION_LIMIT_MESSAGE);
  }
}
