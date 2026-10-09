import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';

/**
 * Promotion contract v2 (REQ-PRO-001…REQ-PRO-006).
 *
 * v1 offered only `percentOff` and `fixedAmount` on a whole cart. v2 adds
 * item-level benefits (buy X get Y, free item, bundle price) and a Loyalty
 * point redemption, plus time, weekday, code, and customer-segment
 * eligibility. Every amount stays integer VND (NFR-DATA-001) and every
 * calculation stays deterministic so the client and the server can never
 * disagree about a total (REQ-PRO-001).
 */
export const PROMOTION_CONTRACT_VERSION = 2;

/**
 * Upper bounds that keep one cart from producing an unbounded order. The
 * server enforces them, so a crafted request cannot grow an Order without
 * limit.
 */
export const PROMOTION_MAX_GIFT_LINES = 20;
export const PROMOTION_MAX_GIFT_QUANTITY = 10;
export const PROMOTION_MAX_BUNDLE_QUANTITY = 20;

export const promotionStatusSchema = z.enum(['active', 'inactive', 'archived']);
export type PromotionStatus = z.infer<typeof promotionStatusSchema>;

/** How a promotion came to exist. `quick` is the Settings page shortcut. */
export const promotionSourceSchema = z.enum(['manual', 'quick']);
export type PromotionSource = z.infer<typeof promotionSourceSchema>;

/** Reserved id of the single quick discount owned by the Settings page. */
export const QUICK_DISCOUNT_PROMOTION_ID = 'quick-discount';

export const promotionBenefitTypeSchema = z.enum([
  'percentOff',
  'fixedAmount',
  'buyXGetY',
  'freeItem',
  'bundlePrice',
  'pointsRedemption',
]);
export type PromotionBenefitType = z.infer<typeof promotionBenefitTypeSchema>;

/**
 * Benefit types a Free plan may use. Everything else needs Lite or Pro
 * (REQ-PRO-006).
 */
export const PROMOTION_BASIC_BENEFIT_TYPES: readonly PromotionBenefitType[] = [
  'percentOff',
  'fixedAmount',
];

// ---------------------------------------------------------------------------
// Benefit building blocks. Each one is a plain strict object so it can live
// inside a discriminated union without a refinement wrapper.
// ---------------------------------------------------------------------------

/**
 * Whole-percent discount with an optional integer VND cap. It applies to the
 * cart subtotal; `eligibility` decides whether it applies at all, not what it
 * applies to.
 */
const percentOffBenefitSchema = z.strictObject({
  type: z.literal('percentOff'),
  percent: z.number().int().min(1).max(100),
  maxDiscountVnd: vndSchema.nullable(),
});

/** Flat integer VND discount. */
const fixedAmountBenefitSchema = z.strictObject({
  type: z.literal('fixedAmount'),
  amountVnd: positiveIntSchema,
});

/** A gift of `quantity` units chosen from `menuItemIds`, charged at 0 VND. */
const freeItemRewardSchema = z.strictObject({
  type: z.literal('freeItem'),
  menuItemIds: z.array(z.string().min(1)).min(1),
  quantity: z.number().int().min(1).max(PROMOTION_MAX_GIFT_QUANTITY),
});

/** How the reward units of a buy-X-get-Y promotion are charged. */
const buyXGetYRewardSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('free') }),
  z.strictObject({
    type: z.literal('percentOff'),
    percent: z.number().int().min(1).max(100),
  }),
]);

/**
 * Buy `buyQuantity` units, get `getQuantity` units at the reward price.
 *
 * `buyMenuItemIds === null` means any menu item counts towards the buy side.
 * When every `getMenuItemIds` entry is also a buy entry the promotion is a
 * same-item deal (mua 1 tặng 1): the reward units are drawn from the same pool
 * as the paid units. Otherwise the reward units must be present in the cart on
 * their own (mua A tặng B).
 */
const buyXGetYBenefitSchema = z.strictObject({
  type: z.literal('buyXGetY'),
  buyMenuItemIds: z.array(z.string().min(1)).min(1).nullable(),
  buyQuantity: z.number().int().min(1).max(PROMOTION_MAX_BUNDLE_QUANTITY),
  getMenuItemIds: z.array(z.string().min(1)).min(1),
  getQuantity: z.number().int().min(1).max(PROMOTION_MAX_BUNDLE_QUANTITY),
  reward: buyXGetYRewardSchema,
});

/** N units from a set for one fixed bundle price (combo tiết kiệm). */
const bundlePriceBenefitSchema = z.strictObject({
  type: z.literal('bundlePrice'),
  menuItemIds: z.array(z.string().min(1)).min(1),
  quantity: z.number().int().min(2).max(PROMOTION_MAX_BUNDLE_QUANTITY),
  bundlePriceVnd: vndSchema,
});

/** The reward a point redemption buys. It never stacks with another reward. */
const pointsRewardSchema = z.discriminatedUnion('type', [
  percentOffBenefitSchema,
  fixedAmountBenefitSchema,
  freeItemRewardSchema,
]);

/** Spend `pointsCost` Loyalty points for one reward (REQ-PRO-004). */
const pointsRedemptionBenefitSchema = z.strictObject({
  type: z.literal('pointsRedemption'),
  pointsCost: positiveIntSchema,
  reward: pointsRewardSchema,
});

export const promotionBenefitSchema = z.discriminatedUnion('type', [
  percentOffBenefitSchema,
  fixedAmountBenefitSchema,
  buyXGetYBenefitSchema,
  freeItemRewardSchema,
  bundlePriceBenefitSchema,
  pointsRedemptionBenefitSchema,
]);
export type PromotionBenefit = z.infer<typeof promotionBenefitSchema>;

// ---------------------------------------------------------------------------
// Eligibility
// ---------------------------------------------------------------------------

/** Daily local-time window in tenant time; `from > to` spans midnight. */
export const promotionTimeWindowSchema = z.strictObject({
  fromMinuteOfDay: z.number().int().min(0).max(1439),
  toMinuteOfDay: z.number().int().min(0).max(1439),
});
export type PromotionTimeWindow = z.infer<typeof promotionTimeWindowSchema>;

/** Who the promotion is for. `all` is the default and matches everyone. */
export const promotionCustomerSegmentSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('all') }),
  z.strictObject({ type: z.literal('newCustomer') }),
  z.strictObject({
    type: z.literal('visitCountAtLeast'),
    visitCount: positiveIntSchema,
  }),
  z.strictObject({
    type: z.literal('loyaltyTierAtLeast'),
    minPoints: nonNegativeIntSchema,
  }),
]);
export type PromotionCustomerSegment = z.infer<
  typeof promotionCustomerSegmentSchema
>;

export const promotionEligibilitySchema = z.strictObject({
  /** Cart subtotal must reach this value when present. */
  minSubtotalVnd: vndSchema.nullable(),
  /** Total cart quantity must reach this value when present. */
  minQuantity: positiveIntSchema.nullable(),
  /** At least one cart line must reference one of these menu items. */
  menuItemIds: z.array(z.string().min(1)).nullable(),
  /** Happy hour: the tenant-local time must fall inside this window. */
  timeWindow: promotionTimeWindowSchema.nullable(),
  /** Tenant-local weekdays, 0 = Sunday. Null means every day. */
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1).nullable(),
  /** Customer must type this code when present. */
  code: z.string().trim().min(3).max(32).nullable(),
  /** Customer must match this segment when present. */
  customerSegment: promotionCustomerSegmentSchema.nullable(),
});
export type PromotionEligibility = z.infer<typeof promotionEligibilitySchema>;

/** The empty eligibility: applies to every cart. */
export const EMPTY_PROMOTION_ELIGIBILITY: PromotionEligibility = {
  minSubtotalVnd: null,
  minQuantity: null,
  menuItemIds: null,
  timeWindow: null,
  daysOfWeek: null,
  code: null,
  customerSegment: null,
};

/**
 * Eligibility fields a Free plan may use. Happy hour, weekday, a typed code,
 * and a customer segment are Lite and Pro only (REQ-PRO-006).
 */
export function hasAdvancedEligibility(
  eligibility: PromotionEligibility,
): boolean {
  return (
    eligibility.timeWindow !== null ||
    eligibility.daysOfWeek !== null ||
    eligibility.code !== null ||
    (eligibility.customerSegment !== null &&
      eligibility.customerSegment.type !== 'all')
  );
}

/** True when a Free plan may use this promotion (REQ-PRO-006). */
export function isBasicPromotion(
  benefit: PromotionBenefit,
  eligibility: PromotionEligibility,
): boolean {
  return (
    PROMOTION_BASIC_BENEFIT_TYPES.includes(benefit.type) &&
    !hasAdvancedEligibility(eligibility)
  );
}

// ---------------------------------------------------------------------------
// Stored promotion
// ---------------------------------------------------------------------------

export const promotionSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  promotionId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(120),
  source: promotionSourceSchema,
  status: promotionStatusSchema,
  priority: z.number().int(),
  startsAt: isoUtcTimestampSchema.nullable(),
  endsAt: isoUtcTimestampSchema.nullable(),
  eligibility: promotionEligibilitySchema,
  benefit: promotionBenefitSchema,
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
  archivedAt: isoUtcTimestampSchema.nullable(),
});
export type Promotion = z.infer<typeof promotionSchema>;

// ---------------------------------------------------------------------------
// Cart facts and evaluation
// ---------------------------------------------------------------------------

/**
 * One requested cart line. `selectedOptionIds` lets the evaluation resolve the
 * same unit price as the Order, so the discount a Customer sees is computed on
 * the same subtotal the Order records (REQ-ORD-001, REQ-PRO-001).
 */
export const promotionCartLineSchema = z.strictObject({
  menuItemId: z.string().min(1),
  quantity: positiveIntSchema,
  selectedOptionIds: z.array(z.string().min(1)).default([]),
});
export type PromotionCartLine = z.infer<typeof promotionCartLineSchema>;

/** One menu item the evaluation may need, including gift candidates. */
export interface PromotionMenuItemFact {
  menuItemId: string;
  name: string;
  unitPriceVnd: number;
  isAvailable: boolean;
}

/** One resolved cart line with its authoritative price. */
export interface PromotionCartLineFact {
  menuItemId: string;
  quantity: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}

/** The Loyalty facts a segment or point redemption needs. */
export interface PromotionLoyaltyFacts {
  memberId: string;
  isVerified: boolean;
  pointBalance: number;
  visitCount: number;
}

/**
 * Everything the deterministic evaluation reads. The server builds this from
 * the public menu projection and the Loyalty member record; no client money
 * ever enters it (NFR-DATA-001).
 */
export interface PromotionCartFacts {
  subtotalVnd: number;
  lines: readonly PromotionCartLineFact[];
  /**
   * Cart items plus every menu item referenced by a candidate promotion, so a
   * gift item that is not in the cart still resolves its name and price.
   */
  menuItems: readonly PromotionMenuItemFact[];
  loyaltyMember: PromotionLoyaltyFacts | null;
  /** Tenant-local minute of day, 0..1439. */
  localMinuteOfDay: number;
  /** Tenant-local weekday, 0 = Sunday. */
  localDayOfWeek: number;
}

/** Why a promotion did not apply. The UI translates the code. */
export const promotionIneligibilityReasonSchema = z.enum([
  'windowClosed',
  'belowMinSubtotal',
  'belowMinQuantity',
  'menuItemMissing',
  'outsideTimeWindow',
  'wrongDayOfWeek',
  'codeRequired',
  'codeMismatch',
  'segmentMismatch',
  'loyaltyRequired',
  'insufficientPoints',
  'noReward',
]);
export type PromotionIneligibilityReason = z.infer<
  typeof promotionIneligibilityReasonSchema
>;

export interface PromotionEligibilityOutcome {
  eligible: boolean;
  reason: PromotionIneligibilityReason | null;
}

export interface PromotionGiftLine {
  menuItemId: string;
  name: string;
  quantity: number;
  unitPriceVnd: number;
}

export interface PromotionBenefitOutcome {
  /** Integer VND removed from the paid subtotal. */
  discountVnd: number;
  /**
   * Menu value of the gift lines. A gift is not subtracted from the subtotal,
   * because the Customer never paid it; it is reported separately so the Owner
   * sees what the promotion gave away (REQ-PRO-003).
   */
  giftValueVnd: number;
  giftLines: PromotionGiftLine[];
  pointsRedeemed: number;
}

export const promotionEvaluatedLineSchema = z.strictObject({
  menuItemId: z.string().min(1),
  quantity: positiveIntSchema,
  unitPriceVnd: vndSchema,
  lineTotalVnd: vndSchema,
  lineDiscountVnd: vndSchema,
});
export type PromotionEvaluatedLine = z.infer<
  typeof promotionEvaluatedLineSchema
>;

export const promotionGiftLineSchema = z.strictObject({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  quantity: positiveIntSchema,
  unitPriceVnd: vndSchema,
});
export type PromotionGiftLineSnapshot = z.infer<
  typeof promotionGiftLineSchema
>;

export const promotionSnapshotSchema = z.strictObject({
  promotionId: z.string().min(1),
  name: z.string().min(1),
  benefitType: promotionBenefitTypeSchema,
  priority: z.number().int(),
  /** Integer VND taken off the paid subtotal. */
  discountVnd: vndSchema,
  /** Menu value of the gift lines, reported but never subtracted. */
  giftValueVnd: vndSchema,
  code: z.string().min(1).nullable(),
});
export type PromotionSnapshot = z.infer<typeof promotionSnapshotSchema>;

export const promotionEvaluateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  lines: z.array(promotionCartLineSchema).min(1).max(100),
  /** The code the Customer typed, when the UI asked for one. */
  code: z.string().trim().min(1).max(32).nullable().optional(),
  /** The verified Loyalty member, needed by a segment or point redemption. */
  loyaltyMemberId: z.string().min(1).nullable().optional(),
});
export type PromotionEvaluateInput = z.infer<
  typeof promotionEvaluateInputSchema
>;

export const promotionEvaluationResultSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  subtotalVnd: vndSchema,
  discountVnd: vndSchema,
  giftValueVnd: vndSchema,
  totalVnd: vndSchema,
  appliedPromotion: promotionSnapshotSchema.nullable(),
  lines: z.array(promotionEvaluatedLineSchema),
  giftLines: z.array(promotionGiftLineSchema),
  pointsRedeemed: nonNegativeIntSchema,
  /** True when at least one promotion would apply if the Customer typed a code. */
  codeRequired: z.boolean(),
  /** Why each considered promotion did not apply, for an honest UI. */
  ineligibilityReasons: z.array(promotionIneligibilityReasonSchema),
  consideredPromotionIds: z.array(z.string().min(1)),
  evaluatedAt: isoUtcTimestampSchema,
});
export type PromotionEvaluationResult = z.infer<
  typeof promotionEvaluationResultSchema
>;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const promotionUpsertInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  promotionId: z.string().min(1).nullable(),
  name: z.string().trim().min(1).max(120),
  priority: z.number().int(),
  startsAt: isoUtcTimestampSchema.nullable().optional(),
  endsAt: isoUtcTimestampSchema.nullable().optional(),
  eligibility: promotionEligibilitySchema,
  benefit: promotionBenefitSchema,
  /** Defaults to `manual`. The Settings page owns the `quick` record. */
  source: promotionSourceSchema.optional(),
});
export type PromotionUpsertInput = z.infer<typeof promotionUpsertInputSchema>;

export const promotionCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  command: z.enum(['upsert', 'setStatus']),
  status: z.literal('applied'),
  promotion: promotionSchema.nullable(),
  appliedAt: isoUtcTimestampSchema,
});
export type PromotionCommandResult = z.infer<
  typeof promotionCommandResultSchema
>;

export const promotionSetStatusInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  promotionId: z.string().min(1),
  status: promotionStatusSchema,
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
export type PromotionSetStatusInput = z.infer<
  typeof promotionSetStatusInputSchema
>;

export const promotionListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});
export type PromotionListInput = z.infer<typeof promotionListInputSchema>;

export const promotionListResultSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  promotions: z.array(promotionSchema),
});
export type PromotionListResult = z.infer<typeof promotionListResultSchema>;

// ---------------------------------------------------------------------------
// Deterministic calculation
// ---------------------------------------------------------------------------

/** True when the promotion is active and inside its configured window. */
export function isPromotionWindowOpen(
  promotion: Promotion,
  nowIso: string,
): boolean {
  if (promotion.status !== 'active' || promotion.archivedAt !== null) {
    return false;
  }
  const now = Date.parse(nowIso);
  if (promotion.startsAt !== null && now < Date.parse(promotion.startsAt)) {
    return false;
  }
  if (promotion.endsAt !== null && now > Date.parse(promotion.endsAt)) {
    return false;
  }
  return true;
}

/**
 * Whole-percent math stays integer: `floor(amount * percent / 100)`, then the
 * optional cap, then the clamp to the amount (REQ-PRO-001, NFR-DATA-001).
 */
export function computePercentOffVnd(
  amountVnd: number,
  percent: number,
  maxDiscountVnd: number | null,
): number {
  let discount = Math.floor((amountVnd * percent) / 100);
  if (maxDiscountVnd !== null) {
    discount = Math.min(discount, maxDiscountVnd);
  }
  return clampDiscount(discount, amountVnd);
}

/**
 * A discount never exceeds the amount it discounts, and never leaves a
 * positive order with a zero payable total: the payment path needs at least
 * one VND to settle. A fully free Order is deliberately out of scope.
 */
export function clampDiscount(discountVnd: number, amountVnd: number): number {
  const ceiling = amountVnd > 0 ? amountVnd - 1 : 0;
  return Math.min(Math.max(Math.trunc(discountVnd), 0), ceiling);
}

/** True when the tenant-local minute falls inside the window. */
export function isInsideTimeWindow(
  window: PromotionTimeWindow,
  minuteOfDay: number,
): boolean {
  const { fromMinuteOfDay: from, toMinuteOfDay: to } = window;
  if (from <= to) {
    return minuteOfDay >= from && minuteOfDay <= to;
  }
  // A window such as 22:00 → 02:00 spans midnight.
  return minuteOfDay >= from || minuteOfDay <= to;
}

function resolveMenuItem(
  facts: PromotionCartFacts,
  menuItemId: string,
): PromotionMenuItemFact | null {
  return (
    facts.menuItems.find((item) => item.menuItemId === menuItemId) ?? null
  );
}

/** Every cart unit, expanded one entry per unit, most expensive first. */
function expandUnits(
  facts: PromotionCartFacts,
  menuItemIds: readonly string[] | null,
): PromotionCartLineFact[] {
  const units: PromotionCartLineFact[] = [];
  for (const line of facts.lines) {
    if (menuItemIds !== null && !menuItemIds.includes(line.menuItemId)) {
      continue;
    }
    for (let index = 0; index < line.quantity; index += 1) {
      units.push({ ...line, quantity: 1 });
    }
  }
  return units.sort(
    (left, right) =>
      right.unitPriceVnd - left.unitPriceVnd ||
      (left.menuItemId < right.menuItemId ? -1 : 1),
  );
}

/**
 * Eligibility for one promotion. A code mismatch is reported separately from
 * a genuine ineligibility so the UI can ask for the code instead of saying
 * the promotion does not exist.
 */
export function evaluatePromotionEligibility(
  promotion: Promotion,
  facts: PromotionCartFacts,
  nowIso: string,
  typedCode: string | null,
): PromotionEligibilityOutcome {
  if (!isPromotionWindowOpen(promotion, nowIso)) {
    return { eligible: false, reason: 'windowClosed' };
  }
  const eligibility = promotion.eligibility;
  if (
    eligibility.minSubtotalVnd !== null &&
    facts.subtotalVnd < eligibility.minSubtotalVnd
  ) {
    return { eligible: false, reason: 'belowMinSubtotal' };
  }
  const totalQuantity = facts.lines.reduce(
    (sum, line) => sum + line.quantity,
    0,
  );
  if (
    eligibility.minQuantity !== null &&
    totalQuantity < eligibility.minQuantity
  ) {
    return { eligible: false, reason: 'belowMinQuantity' };
  }
  if (
    eligibility.menuItemIds !== null &&
    !eligibility.menuItemIds.some((menuItemId) =>
      facts.lines.some((line) => line.menuItemId === menuItemId),
    )
  ) {
    return { eligible: false, reason: 'menuItemMissing' };
  }
  if (
    eligibility.timeWindow !== null &&
    !isInsideTimeWindow(eligibility.timeWindow, facts.localMinuteOfDay)
  ) {
    return { eligible: false, reason: 'outsideTimeWindow' };
  }
  if (
    eligibility.daysOfWeek !== null &&
    !eligibility.daysOfWeek.includes(facts.localDayOfWeek)
  ) {
    return { eligible: false, reason: 'wrongDayOfWeek' };
  }
  if (eligibility.code !== null) {
    if (typedCode === null) {
      return { eligible: false, reason: 'codeRequired' };
    }
    if (typedCode.trim().toUpperCase() !== eligibility.code.toUpperCase()) {
      return { eligible: false, reason: 'codeMismatch' };
    }
  }
  const segment = eligibility.customerSegment;
  if (segment !== null && segment.type !== 'all') {
    const member = facts.loyaltyMember;
    if (member === null || !member.isVerified) {
      return { eligible: false, reason: 'loyaltyRequired' };
    }
    if (segment.type === 'newCustomer' && member.visitCount > 0) {
      return { eligible: false, reason: 'segmentMismatch' };
    }
    if (
      segment.type === 'visitCountAtLeast' &&
      member.visitCount < segment.visitCount
    ) {
      return { eligible: false, reason: 'segmentMismatch' };
    }
    if (
      segment.type === 'loyaltyTierAtLeast' &&
      member.pointBalance < segment.minPoints
    ) {
      return { eligible: false, reason: 'segmentMismatch' };
    }
  }
  if (promotion.benefit.type === 'pointsRedemption') {
    const member = facts.loyaltyMember;
    if (member === null || !member.isVerified) {
      return { eligible: false, reason: 'loyaltyRequired' };
    }
    if (member.pointBalance < promotion.benefit.pointsCost) {
      return { eligible: false, reason: 'insufficientPoints' };
    }
  }
  return { eligible: true, reason: null };
}

/** The cheapest available gift candidate, deterministic by id on a tie. */
function pickGiftItem(
  facts: PromotionCartFacts,
  menuItemIds: readonly string[],
): PromotionMenuItemFact | null {
  const candidates = menuItemIds
    .map((menuItemId) => resolveMenuItem(facts, menuItemId))
    .filter(
      (item): item is PromotionMenuItemFact =>
        item !== null && item.isAvailable,
    )
    .sort(
      (left, right) =>
        left.unitPriceVnd - right.unitPriceVnd ||
        (left.menuItemId < right.menuItemId ? -1 : 1),
    );
  return candidates[0] ?? null;
}

function buildGiftLines(
  giftItem: PromotionMenuItemFact,
  quantity: number,
): PromotionGiftLine[] {
  return [
    {
      menuItemId: giftItem.menuItemId,
      name: giftItem.name,
      quantity,
      unitPriceVnd: 0,
    },
  ];
}

/**
 * Buy-X-get-Y. A same-item deal draws its reward units from the same pool as
 * the paid units; a cross-item deal needs the reward units in the cart on
 * their own. The cheapest qualifying reward units are the free ones, so the
 * result is deterministic and never more generous than the rule states.
 */
function computeBuyXGetY(
  benefit: Extract<PromotionBenefit, { type: 'buyXGetY' }>,
  facts: PromotionCartFacts,
): PromotionBenefitOutcome {
  const empty: PromotionBenefitOutcome = {
    discountVnd: 0,
    giftValueVnd: 0,
    giftLines: [],
    pointsRedeemed: 0,
  };
  const getUnits = expandUnits(facts, benefit.getMenuItemIds);
  if (getUnits.length === 0) {
    return empty;
  }
  const sameItemPool = benefit.getMenuItemIds.every(
    (menuItemId) =>
      benefit.buyMenuItemIds === null ||
      benefit.buyMenuItemIds.includes(menuItemId),
  );
  let freeCount: number;
  if (sameItemPool) {
    const bundleSize = benefit.buyQuantity + benefit.getQuantity;
    freeCount =
      Math.floor(getUnits.length / bundleSize) * benefit.getQuantity;
  } else {
    const buyUnits = expandUnits(facts, benefit.buyMenuItemIds);
    freeCount =
      Math.floor(buyUnits.length / benefit.buyQuantity) *
      benefit.getQuantity;
  }
  freeCount = Math.min(freeCount, getUnits.length);
  if (freeCount <= 0) {
    return empty;
  }
  // `getUnits` is sorted most expensive first, so the tail is the cheapest.
  const freeUnits = getUnits.slice(getUnits.length - freeCount);
  const freeValueVnd = freeUnits.reduce(
    (sum, unit) => sum + unit.unitPriceVnd,
    0,
  );
  const discountVnd =
    benefit.reward.type === 'free'
      ? freeValueVnd
      : Math.floor((freeValueVnd * benefit.reward.percent) / 100);
  return {
    discountVnd,
    giftValueVnd: 0,
    giftLines: [],
    pointsRedeemed: 0,
  };
}

/**
 * Bundle price: every complete group of `quantity` units from the set is
 * charged at `bundlePriceVnd`. The group takes the most expensive units, which
 * is what a Customer picking a combo expects.
 */
function computeBundlePrice(
  benefit: Extract<PromotionBenefit, { type: 'bundlePrice' }>,
  facts: PromotionCartFacts,
): PromotionBenefitOutcome {
  const units = expandUnits(facts, benefit.menuItemIds);
  const groups = Math.floor(units.length / benefit.quantity);
  if (groups <= 0) {
    return { discountVnd: 0, giftValueVnd: 0, giftLines: [], pointsRedeemed: 0 };
  }
  const bundled = units.slice(0, groups * benefit.quantity);
  const bundledValueVnd = bundled.reduce(
    (sum, unit) => sum + unit.unitPriceVnd,
    0,
  );
  const discountVnd = bundledValueVnd - benefit.bundlePriceVnd * groups;
  return {
    discountVnd: Math.max(discountVnd, 0),
    giftValueVnd: 0,
    giftLines: [],
    pointsRedeemed: 0,
  };
}

function computeReward(
  reward: Extract<
    PromotionBenefit,
    { type: 'percentOff' | 'fixedAmount' | 'freeItem' }
  >,
  facts: PromotionCartFacts,
): PromotionBenefitOutcome {
  if (reward.type === 'percentOff') {
    return {
      discountVnd: computePercentOffVnd(
        facts.subtotalVnd,
        reward.percent,
        reward.maxDiscountVnd,
      ),
      giftValueVnd: 0,
      giftLines: [],
      pointsRedeemed: 0,
    };
  }
  if (reward.type === 'fixedAmount') {
    return {
      discountVnd: reward.amountVnd,
      giftValueVnd: 0,
      giftLines: [],
      pointsRedeemed: 0,
    };
  }
  const giftItem = pickGiftItem(facts, reward.menuItemIds);
  if (giftItem === null) {
    return { discountVnd: 0, giftValueVnd: 0, giftLines: [], pointsRedeemed: 0 };
  }
  return {
    discountVnd: 0,
    giftValueVnd: giftItem.unitPriceVnd * reward.quantity,
    giftLines: buildGiftLines(giftItem, reward.quantity),
    pointsRedeemed: 0,
  };
}

/**
 * The benefit a promotion produces for one cart. Integer VND only; the caller
 * clamps the final total.
 */
export function computePromotionBenefit(
  promotion: Promotion,
  facts: PromotionCartFacts,
): PromotionBenefitOutcome {
  const benefit = promotion.benefit;
  if (benefit.type === 'buyXGetY') {
    return computeBuyXGetY(benefit, facts);
  }
  if (benefit.type === 'bundlePrice') {
    return computeBundlePrice(benefit, facts);
  }
  if (benefit.type === 'pointsRedemption') {
    const reward = computeReward(benefit.reward, facts);
    return { ...reward, pointsRedeemed: benefit.pointsCost };
  }
  return computeReward(benefit, facts);
}

export interface PromotionSelection {
  promotion: Promotion;
  outcome: PromotionBenefitOutcome;
  /** Cash discount, already clamped to the paid subtotal. */
  discountVnd: number;
  /** Menu value of the gifts this promotion adds. */
  giftValueVnd: number;
  /** What the promotion is worth to the Customer: cash plus gifts. */
  totalValueVnd: number;
}

/**
 * Deterministic single-promotion selection. v1 never stacks promotions. The
 * promotion worth the most to the Customer wins; equal value resolves by
 * higher priority, then by the stable promotion id
 * (docs/module/promotion.md).
 */
export function selectBestPromotion(
  promotions: readonly Promotion[],
  facts: PromotionCartFacts,
  nowIso: string,
  typedCode: string | null,
): {
  selection: PromotionSelection | null;
  reasons: PromotionIneligibilityReason[];
} {
  const reasons: PromotionIneligibilityReason[] = [];
  const scored: PromotionSelection[] = [];
  for (const promotion of promotions) {
    const eligibility = evaluatePromotionEligibility(
      promotion,
      facts,
      nowIso,
      typedCode,
    );
    if (!eligibility.eligible) {
      if (eligibility.reason !== null) {
        reasons.push(eligibility.reason);
      }
      continue;
    }
    const outcome = computePromotionBenefit(promotion, facts);
    const discountVnd = clampDiscount(outcome.discountVnd, facts.subtotalVnd);
    const totalValueVnd = discountVnd + outcome.giftValueVnd;
    if (totalValueVnd <= 0) {
      reasons.push('noReward');
      continue;
    }
    scored.push({
      promotion,
      outcome,
      discountVnd,
      giftValueVnd: outcome.giftValueVnd,
      totalValueVnd,
    });
  }
  if (scored.length === 0) {
    return { selection: null, reasons };
  }
  scored.sort((left, right) => {
    if (left.totalValueVnd !== right.totalValueVnd) {
      return right.totalValueVnd - left.totalValueVnd;
    }
    if (left.promotion.priority !== right.promotion.priority) {
      return right.promotion.priority - left.promotion.priority;
    }
    return left.promotion.promotionId < right.promotion.promotionId ? -1 : 1;
  });
  return { selection: scored[0], reasons };
}

/**
 * Spread the applied discount over the cart lines so an Order can report net
 * revenue per item. Whole VND; the last line absorbs the rounding remainder so
 * the line discounts always add back to the order discount.
 */
export function allocateLineDiscounts(
  facts: PromotionCartFacts,
  discountVnd: number,
): PromotionEvaluatedLine[] {
  const total = facts.subtotalVnd;
  let allocated = 0;
  return facts.lines.map((line, index) => {
    const isLast = index === facts.lines.length - 1;
    const share = isLast
      ? discountVnd - allocated
      : total > 0
        ? Math.floor((discountVnd * line.lineTotalVnd) / total)
        : 0;
    const lineDiscountVnd = Math.min(Math.max(share, 0), line.lineTotalVnd);
    allocated += lineDiscountVnd;
    return {
      menuItemId: line.menuItemId,
      quantity: line.quantity,
      unitPriceVnd: line.unitPriceVnd,
      lineTotalVnd: line.lineTotalVnd,
      lineDiscountVnd,
    };
  });
}

/**
 * Read a v1 promotion document as v2. v1 had no `source`, `minQuantity`,
 * `timeWindow`, `daysOfWeek`, `code`, or `customerSegment`, and only the two
 * basic benefit types.
 */
export function mapPromotionV1ToV2(
  data: Record<string, unknown>,
  promotionId: string,
  tenantId: string,
): Promotion {
  const eligibility = (data.eligibility ?? {}) as Record<string, unknown>;
  const benefit = (data.benefit ?? {}) as Record<string, unknown>;
  const benefitType = benefit.type;
  if (benefitType !== 'percentOff' && benefitType !== 'fixedAmount') {
    throw new TypeError(`Unsupported promotion v1 benefit: ${String(benefitType)}`);
  }
  return promotionSchema.parse({
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    promotionId,
    tenantId,
    name: data.name,
    source: 'manual',
    status: data.status,
    priority: data.priority,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    eligibility: {
      minSubtotalVnd: eligibility.minSubtotalVnd ?? null,
      minQuantity: null,
      menuItemIds: eligibility.menuItemIds ?? null,
      timeWindow: null,
      daysOfWeek: null,
      code: null,
      customerSegment: null,
    },
    benefit:
      benefitType === 'percentOff'
        ? {
            type: 'percentOff',
            percent: benefit.percent,
            maxDiscountVnd: benefit.maxDiscountVnd ?? null,
          }
        : { type: 'fixedAmount', amountVnd: benefit.amountVnd },
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt ?? null,
  });
}

/** Parse a stored promotion document at any supported schema version. */
export function parseStoredPromotion(
  data: Record<string, unknown>,
  promotionId: string,
  tenantId: string,
): Promotion {
  if (data.schemaVersion === 1) {
    return mapPromotionV1ToV2(data, promotionId, tenantId);
  }
  return promotionSchema.parse({ ...data, promotionId, tenantId });
}
