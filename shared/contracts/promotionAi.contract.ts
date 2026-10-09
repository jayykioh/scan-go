import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';
import {
  campaignGoalSchema,
  type CampaignGoal,
} from './campaign.contract.js';
import {
  promotionBenefitSchema,
  promotionEligibilitySchema,
  promotionUpsertInputSchema,
  type PromotionBenefit,
  type PromotionEligibility,
  type PromotionUpsertInput,
} from './promotion.contract.js';

/** Structured promotion-builder conversation (REQ-PRO-007, REQ-AI-008). */
export const PROMOTION_AI_CONTRACT_VERSION = 1;

export const promotionAiSessionStatusSchema = z.enum([
  'collecting',
  'ready',
  'confirmed',
  'cancelled',
  'expired',
]);
export type PromotionAiSessionStatus = z.infer<
  typeof promotionAiSessionStatusSchema
>;

export const promotionAiStepSchema = z.enum([
  'goal',
  'benefitType',
  'benefitDetails',
  'target',
  'conditions',
  'schedule',
  'identity',
  'review',
]);
export type PromotionAiStep = z.infer<typeof promotionAiStepSchema>;

export const promotionAiBenefitTypeSchema = z.enum([
  'percentOff',
  'fixedAmount',
  'buyXGetY',
  'freeItem',
  'bundlePrice',
  'pointsRedemption',
]);
export type PromotionAiBenefitType = z.infer<
  typeof promotionAiBenefitTypeSchema
>;

export const promotionAiAnswersSchema = z.strictObject({
  goal: campaignGoalSchema.nullable(),
  benefitType: promotionAiBenefitTypeSchema.nullable(),
  percent: z.number().int().min(1).max(100).nullable(),
  maxDiscountVnd: vndSchema.nullable(),
  amountVnd: positiveIntSchema.nullable(),
  buyQuantity: positiveIntSchema.nullable(),
  getQuantity: positiveIntSchema.nullable(),
  buyMenuItemIds: z.array(z.string().min(1)).max(50),
  getMenuItemIds: z.array(z.string().min(1)).max(50),
  rewardFree: z.boolean().nullable(),
  rewardPercent: z.number().int().min(1).max(100).nullable(),
  giftMenuItemIds: z.array(z.string().min(1)).max(50),
  giftQuantity: positiveIntSchema.nullable(),
  bundleMenuItemIds: z.array(z.string().min(1)).max(50),
  bundleQuantity: z.number().int().min(2).max(20).nullable(),
  bundlePriceVnd: vndSchema.nullable(),
  pointsCost: positiveIntSchema.nullable(),
  pointsRewardType: z.enum(['percentOff', 'fixedAmount', 'freeItem']).nullable(),
  pointsRewardPercent: z.number().int().min(1).max(100).nullable(),
  pointsRewardAmountVnd: positiveIntSchema.nullable(),
  pointsRewardMenuItemIds: z.array(z.string().min(1)).max(50),
  targetSegment: z.enum(['all', 'newCustomer', 'visitCountAtLeast', 'loyaltyTierAtLeast']).nullable(),
  targetVisitCount: positiveIntSchema.nullable(),
  targetMinPoints: nonNegativeIntSchema.nullable(),
  minSubtotalVnd: vndSchema.nullable(),
  minQuantity: positiveIntSchema.nullable(),
  eligibilityMenuItemIds: z.array(z.string().min(1)).max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  timeFromMinuteOfDay: z.number().int().min(0).max(1439).nullable(),
  timeToMinuteOfDay: z.number().int().min(0).max(1439).nullable(),
  code: z.string().trim().min(3).max(32).nullable(),
  name: z.string().trim().min(1).max(120).nullable(),
  priority: z.number().int().nullable(),
  startsAt: isoUtcTimestampSchema.nullable(),
  endsAt: isoUtcTimestampSchema.nullable(),
});
export type PromotionAiAnswers = z.infer<typeof promotionAiAnswersSchema>;

export const promotionAiMessageSchema = z.strictObject({
  messageId: z.string().min(1),
  role: z.literal('assistant'),
  questionKey: promotionAiStepSchema,
  text: z.string().min(1).max(500),
  createdAt: isoUtcTimestampSchema,
});
export type PromotionAiMessage = z.infer<typeof promotionAiMessageSchema>;

export const promotionAiDraftSchema = z.strictObject({
  name: z.string().min(1).max(120),
  priority: z.number().int(),
  startsAt: isoUtcTimestampSchema.nullable(),
  endsAt: isoUtcTimestampSchema.nullable(),
  eligibility: promotionEligibilitySchema,
  benefit: promotionBenefitSchema,
});
export type PromotionAiDraft = z.infer<typeof promotionAiDraftSchema>;

export const promotionAiSessionSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_AI_CONTRACT_VERSION),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  status: promotionAiSessionStatusSchema,
  step: promotionAiStepSchema,
  answers: promotionAiAnswersSchema,
  messages: z.array(promotionAiMessageSchema).max(40),
  draft: promotionAiDraftSchema.nullable(),
  sourceIds: z.array(z.string().min(1)).max(50),
  missingData: z.boolean(),
  missingDataNotes: z.array(z.string().min(1).max(200)).max(10),
  createdByUid: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
  confirmedAt: isoUtcTimestampSchema.nullable(),
});
export type PromotionAiSession = z.infer<typeof promotionAiSessionSchema>;

export const promotionAiStartInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});
export type PromotionAiStartInput = z.infer<typeof promotionAiStartInputSchema>;

export const promotionAiSessionInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
});
export type PromotionAiSessionInput = z.infer<typeof promotionAiSessionInputSchema>;

export const promotionAiAnswerInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  step: promotionAiStepSchema,
  answer: z.union([
    z.string().trim().min(1).max(1000),
    z.number(),
    z.boolean(),
    z.array(z.string().min(1).max(120)).max(50),
    z.record(z.string(), z.unknown()),
  ]),
});
export type PromotionAiAnswerInput = z.infer<typeof promotionAiAnswerInputSchema>;

export const promotionAiConfirmInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  sessionId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
});
export type PromotionAiConfirmInput = z.infer<typeof promotionAiConfirmInputSchema>;

export const promotionAiResultSchema = z.strictObject({
  schemaVersion: z.literal(PROMOTION_AI_CONTRACT_VERSION),
  session: promotionAiSessionSchema,
});
export type PromotionAiResult = z.infer<typeof promotionAiResultSchema>;

/** Convert a completed structured session into the existing promotion command. */
export function promotionAiDraftToUpsertInput(
  draft: PromotionAiDraft,
  tenantId: string,
): PromotionUpsertInput {
  return promotionUpsertInputSchema.parse({
    tenantId,
    promotionId: null,
    name: draft.name,
    priority: draft.priority,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    eligibility: draft.eligibility,
    benefit: draft.benefit,
    source: 'manual',
  });
}

export type PromotionAiDraftParts = {
  goal: CampaignGoal | null;
  benefit: PromotionBenefit | null;
  eligibility: PromotionEligibility | null;
};
