import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';

export const PROMOTION_CONTRACT_VERSION = 1;

export const promotionStatusSchema = z.enum(['active', 'inactive', 'archived']);
export type PromotionStatus = z.infer<typeof promotionStatusSchema>;

/**
 * Promotion benefit. `percentOff` uses whole percent and an optional integer
 * VND cap; `fixedAmount` is a flat integer VND discount. Both stay integer VND
 * (REQ-PRO-001, NFR-DATA-001).
 */
export const promotionBenefitTypeSchema = z.enum([
  'percentOff',
  'fixedAmount',
]);
export type PromotionBenefitType = z.infer<typeof promotionBenefitTypeSchema>;

export const promotionBenefitSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('percentOff'),
    percent: z.number().int().min(1).max(100),
    maxDiscountVnd: vndSchema.nullable(),
  }),
  z.strictObject({
    type: z.literal('fixedAmount'),
    amountVnd: positiveIntSchema,
  }),
]);
export type PromotionBenefit = z.infer<typeof promotionBenefitSchema>;

export const promotionEligibilitySchema = z.strictObject({
  /** Cart subtotal must reach this value when present. */
  minSubtotalVnd: vndSchema.nullable(),
  /** At least one cart line must reference one of these menu items. */
  menuItemIds: z.array(z.string().min(1)).nullable(),
});
export type PromotionEligibility = z.infer<typeof promotionEligibilitySchema>;

export const promotionSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  promotionId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(120),
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

/** One evaluated cart line. The server resolves the price, not the client. */
export const promotionCartLineSchema = z.strictObject({
  menuItemId: z.string().min(1),
  quantity: positiveIntSchema,
});
export type PromotionCartLine = z.infer<typeof promotionCartLineSchema>;

export const promotionEvaluateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  lines: z.array(promotionCartLineSchema).min(1).max(100),
});
export type PromotionEvaluateInput = z.infer<
  typeof promotionEvaluateInputSchema
>;

export const promotionSnapshotSchema = z.strictObject({
  promotionId: z.string().min(1),
  name: z.string().min(1),
  benefitType: promotionBenefitTypeSchema,
  priority: z.number().int(),
  discountVnd: vndSchema,
});
export type PromotionSnapshot = z.infer<typeof promotionSnapshotSchema>;

export const promotionEvaluationResultSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  subtotalVnd: vndSchema,
  discountVnd: vndSchema,
  totalVnd: vndSchema,
  appliedPromotion: promotionSnapshotSchema.nullable(),
  consideredPromotionIds: z.array(z.string().min(1)),
  evaluatedAt: isoUtcTimestampSchema,
});
export type PromotionEvaluationResult = z.infer<
  typeof promotionEvaluationResultSchema
>;

export const promotionUpsertInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  promotionId: z.string().min(1).nullable(),
  name: z.string().trim().min(1).max(120),
  priority: z.number().int(),
  startsAt: isoUtcTimestampSchema.nullable().optional(),
  endsAt: isoUtcTimestampSchema.nullable().optional(),
  eligibility: promotionEligibilitySchema,
  benefit: promotionBenefitSchema,
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
 * Integer-VND discount for one promotion. The result is clamped to the
 * subtotal, so a fixed amount or cap can never make a total negative
 * (REQ-PRO-001, NFR-DATA-001).
 */
export function computePromotionDiscount(
  promotion: Promotion,
  subtotalVnd: number,
): number {
  if (!Number.isInteger(subtotalVnd) || subtotalVnd < 0) {
    throw new TypeError('subtotalVnd must be a non-negative integer');
  }
  const benefit = promotion.benefit;
  let discount: number;
  if (benefit.type === 'percentOff') {
    // Whole-percent math stays integer: floor(subtotal * percent / 100).
    discount = Math.floor((subtotalVnd * benefit.percent) / 100);
    if (benefit.maxDiscountVnd !== null) {
      discount = Math.min(discount, benefit.maxDiscountVnd);
    }
  } else {
    discount = benefit.amountVnd;
  }
  return Math.min(Math.max(discount, 0), subtotalVnd);
}

/**
 * Deterministic single-promotion selection. v1 never stacks promotions. The
 * best discount wins; equal benefits resolve by higher priority, then by the
 * stable promotion id (docs/module/promotion.md).
 */
export function selectBestPromotion(
  promotions: readonly Promotion[],
  subtotalVnd: number,
  menuItemIds: readonly string[],
  nowIso: string,
): { promotion: Promotion; discountVnd: number } | null {
  const eligible = promotions.filter(
    (promotion) =>
      isPromotionWindowOpen(promotion, nowIso) &&
      (promotion.eligibility.minSubtotalVnd === null ||
        subtotalVnd >= promotion.eligibility.minSubtotalVnd) &&
      (promotion.eligibility.menuItemIds === null ||
        promotion.eligibility.menuItemIds.some((id) =>
          menuItemIds.includes(id),
        )),
  );
  if (eligible.length === 0) {
    return null;
  }
  const scored = eligible
    .map((promotion) => ({
      promotion,
      discountVnd: computePromotionDiscount(promotion, subtotalVnd),
    }))
    .filter((entry) => entry.discountVnd > 0);
  if (scored.length === 0) {
    return null;
  }
  scored.sort((left, right) => {
    if (left.discountVnd !== right.discountVnd) {
      return right.discountVnd - left.discountVnd;
    }
    if (left.promotion.priority !== right.promotion.priority) {
      return right.promotion.priority - left.promotion.priority;
    }
    return left.promotion.promotionId < right.promotion.promotionId ? -1 : 1;
  });
  return scored[0];
}
