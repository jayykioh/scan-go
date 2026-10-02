import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';
import {
  promotionBenefitSchema,
  type PromotionBenefit,
} from './promotion.contract.js';

/**
 * Promotion and Loyalty campaign contract (REQ-PRO-001, REQ-LOY-001,
 * NFR-SEC-003).
 *
 * AI suggests a campaign from authorized aggregates and writes only the
 * suggestion record. An Owner command approves and applies it. Measurement
 * reports return rate, average order value, and gross profit after discount.
 * A suggestion never changes business state without human approval.
 */
export const CAMPAIGN_CONTRACT_VERSION = 1;

export const campaignChannelSchema = z.enum(['promotion', 'loyalty']);
export type CampaignChannel = z.infer<typeof campaignChannelSchema>;

export const campaignGoalSchema = z.enum([
  'increaseReturnRate',
  'increaseOrderValue',
  'increaseGrossProfit',
]);
export type CampaignGoal = z.infer<typeof campaignGoalSchema>;

export const campaignSuggestionStatusSchema = z.enum(['suggested', 'approved']);
export type CampaignSuggestionStatus = z.infer<
  typeof campaignSuggestionStatusSchema
>;

/** Proposed Loyalty campaign values; integer points and integer VND. */
export const proposedLoyaltySchema = z.strictObject({
  earnRateVnd: positiveIntSchema,
  pointsPerEarnRate: positiveIntSchema,
  welcomePoints: nonNegativeIntSchema,
});
export type ProposedLoyalty = z.infer<typeof proposedLoyaltySchema>;

/** Proposed Promotion campaign values. */
export const proposedPromotionSchema = z.strictObject({
  name: z.string().min(1).max(120),
  priority: z.number().int(),
  startsAt: isoUtcTimestampSchema.nullable(),
  endsAt: isoUtcTimestampSchema.nullable(),
  benefit: promotionBenefitSchema,
});
export type ProposedPromotion = z.infer<typeof proposedPromotionSchema>;

export const campaignSuggestionSchema = z.strictObject({
  schemaVersion: z.literal(CAMPAIGN_CONTRACT_VERSION),
  suggestionId: z.string().min(1),
  tenantId: z.string().min(1),
  channel: campaignChannelSchema,
  goal: campaignGoalSchema,
  title: z.string().min(1).max(120),
  rationale: z.string().min(1).max(500),
  sourceIds: z.array(z.string().min(1)).max(50),
  missingData: z.boolean(),
  missingDataNotes: z.array(z.string().min(1).max(200)).max(5),
  proposedPromotion: proposedPromotionSchema.nullable(),
  proposedLoyalty: proposedLoyaltySchema.nullable(),
  status: campaignSuggestionStatusSchema,
  provider: z.string().min(1),
  model: z.string().min(1),
  generatedAt: isoUtcTimestampSchema,
  approvedByUid: z.string().min(1).nullable(),
  approvedAt: isoUtcTimestampSchema.nullable(),
});
export type CampaignSuggestion = z.infer<typeof campaignSuggestionSchema>;

export const suggestCampaignInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  channel: campaignChannelSchema,
  goal: campaignGoalSchema,
  fromDay: z.string().regex(/^\d{8}$/).optional(),
  toDay: z.string().regex(/^\d{8}$/).optional(),
});
export type SuggestCampaignInput = z.infer<typeof suggestCampaignInputSchema>;

export const approveCampaignInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  suggestionId: z.string().min(1),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type ApproveCampaignInput = z.infer<typeof approveCampaignInputSchema>;

export const campaignSuggestionResultSchema = z.strictObject({
  schemaVersion: z.literal(CAMPAIGN_CONTRACT_VERSION),
  status: z.enum(['suggested', 'approved', 'replayed']),
  suggestion: campaignSuggestionSchema,
});
export type CampaignSuggestionResult = z.infer<
  typeof campaignSuggestionResultSchema
>;

export const measureCampaignInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  suggestionId: z.string().min(1),
});
export type MeasureCampaignInput = z.infer<typeof measureCampaignInputSchema>;

/**
 * Post-campaign measurement. Return rate is integer basis points so no floating
 * ratio is stored. Gross profit is measured after discount because the
 * Reporting revenue already excludes the applied Promotion discount.
 */
export const campaignMeasurementSchema = z.strictObject({
  schemaVersion: z.literal(CAMPAIGN_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  suggestionId: z.string().min(1),
  channel: campaignChannelSchema,
  periodStart: z.string().regex(/^\d{8}$/),
  periodEnd: z.string().regex(/^\d{8}$/),
  paidOrderCount: nonNegativeIntSchema,
  revenueVnd: vndSchema,
  costVnd: vndSchema,
  grossProfitAfterDiscountVnd: z.number().int(),
  averageOrderValueVnd: vndSchema,
  distinctLoyaltyMembers: nonNegativeIntSchema,
  returningLoyaltyMembers: nonNegativeIntSchema,
  /** Integer basis points, 0..10000. */
  returnRateBps: z.number().int().min(0).max(10000),
  sourceIds: z.array(z.string().min(1)).max(100),
  missingData: z.boolean(),
  missingDataNotes: z.array(z.string().min(1).max(200)).max(5),
  measuredAt: isoUtcTimestampSchema,
});
export type CampaignMeasurement = z.infer<typeof campaignMeasurementSchema>;

export const campaignMeasurementResultSchema = z.strictObject({
  schemaVersion: z.literal(CAMPAIGN_CONTRACT_VERSION),
  measurement: campaignMeasurementSchema,
});
export type CampaignMeasurementResult = z.infer<
  typeof campaignMeasurementResultSchema
>;

/**
 * Deterministic proposed Promotion for one goal. Integer VND only; the Owner
 * must approve before it is applied (NFR-SEC-003).
 */
export function buildProposedPromotion(
  goal: CampaignGoal,
  name: string,
): ProposedPromotion {
  const benefit: PromotionBenefit =
    goal === 'increaseOrderValue'
      ? { type: 'fixedAmount', amountVnd: 10000 }
      : { type: 'percentOff', percent: goal === 'increaseGrossProfit' ? 5 : 10, maxDiscountVnd: null };
  return proposedPromotionSchema.parse({
    name,
    priority: 100,
    startsAt: null,
    endsAt: null,
    benefit,
  });
}

/** Integer floor average order value; zero when there is no paid order. */
export function computeAverageOrderValueVnd(
  revenueVnd: number,
  paidOrderCount: number,
): number {
  if (paidOrderCount <= 0) {
    return 0;
  }
  return Math.floor(revenueVnd / paidOrderCount);
}

/** Integer basis-point return rate, clamped to 0..10000. */
export function computeReturnRateBps(
  returningMembers: number,
  distinctMembers: number,
): number {
  if (distinctMembers <= 0) {
    return 0;
  }
  const bps = Math.round((returningMembers / distinctMembers) * 10000);
  return Math.min(Math.max(bps, 0), 10000);
}
