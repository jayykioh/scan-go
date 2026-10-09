import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
} from '../validation.js';

export const SUBSCRIPTION_CONTRACT_VERSION = 1;

/**
 * v1 plans. `Enterprise` is deliberately outside v1, so it is not a valid
 * plan value anywhere on the server (docs/module/subscription.md).
 */
export const subscriptionPlanSchema = z.enum(['free', 'lite', 'pro']);
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
export const subscriptionPlans: readonly SubscriptionPlan[] =
  subscriptionPlanSchema.options;

/** A restricted capability the server enforces in trusted code (REQ-SUB-001). */
export const subscriptionFeatureSchema = z.enum([
  'promotions',
  'promotionAdvanced',
  'loyalty',
  'nfc',
  'kds',
  'ai',
  'automaticPayment',
]);
export type SubscriptionFeature = z.infer<typeof subscriptionFeatureSchema>;

export const planEntitlementsSchema = z.strictObject({
  schemaVersion: z.literal(SUBSCRIPTION_CONTRACT_VERSION),
  plan: subscriptionPlanSchema,
  /** `null` means unlimited for the plan. */
  maxTables: positiveIntSchema.nullable(),
  maxOrdersPerDay: positiveIntSchema.nullable(),
  /** How many Promotions may be `active` at once; `null` is unlimited. */
  maxActivePromotions: positiveIntSchema.nullable(),
  features: z.array(subscriptionFeatureSchema),
});
export type PlanEntitlements = z.infer<typeof planEntitlementsSchema>;

const PLAN_ENTITLEMENT_TABLE: Record<
  SubscriptionPlan,
  {
    maxTables: number | null;
    maxOrdersPerDay: number | null;
    maxActivePromotions: number | null;
    features: SubscriptionFeature[];
  }
> = {
  free: {
    maxTables: 3,
    maxOrdersPerDay: 15,
    maxActivePromotions: 1,
    features: ['promotions'],
  },
  lite: {
    maxTables: 10,
    maxOrdersPerDay: 200,
    maxActivePromotions: null,
    features: ['promotions', 'promotionAdvanced', 'loyalty'],
  },
  pro: {
    maxTables: null,
    maxOrdersPerDay: null,
    maxActivePromotions: null,
    features: [
      'promotions',
      'promotionAdvanced',
      'loyalty',
      'nfc',
      'kds',
      'ai',
      'automaticPayment',
    ],
  },
};

/**
 * Deterministic plan entitlement lookup. The same plan always resolves to the
 * same limits, so frontend visibility and server enforcement cannot drift
 * (REQ-SUB-001, docs/module/subscription.md).
 */
export function resolvePlanEntitlements(
  plan: SubscriptionPlan,
): PlanEntitlements {
  const row = PLAN_ENTITLEMENT_TABLE[plan];
  return planEntitlementsSchema.parse({
    schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
    plan,
    maxTables: row.maxTables,
    maxOrdersPerDay: row.maxOrdersPerDay,
    maxActivePromotions: row.maxActivePromotions,
    features: [...row.features],
  });
}

export function planAllowsFeature(
  entitlements: PlanEntitlements,
  feature: SubscriptionFeature,
): boolean {
  return entitlements.features.includes(feature);
}

/**
 * True when the plan may hold one more `active` Promotion. A Free plan holds
 * exactly one; Lite and Pro are unlimited (REQ-PRO-006, REQ-SUB-001).
 */
export function planAllowsAnotherActivePromotion(
  entitlements: PlanEntitlements,
  activePromotionCount: number,
): boolean {
  if (entitlements.maxActivePromotions === null) {
    return true;
  }
  return activePromotionCount < entitlements.maxActivePromotions;
}

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  return subscriptionPlanSchema.safeParse(value).success
    ? (value as SubscriptionPlan)
    : 'free';
}

export const subscriptionStateSchema = z.strictObject({
  schemaVersion: z.literal(SUBSCRIPTION_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  plan: subscriptionPlanSchema,
  entitlements: planEntitlementsSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type SubscriptionState = z.infer<typeof subscriptionStateSchema>;

export const subscriptionGetInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});
export type SubscriptionGetInput = z.infer<typeof subscriptionGetInputSchema>;

export const subscriptionGetResultSchema = z.strictObject({
  schemaVersion: z.literal(SUBSCRIPTION_CONTRACT_VERSION),
  state: subscriptionStateSchema,
});
export type SubscriptionGetResult = z.infer<typeof subscriptionGetResultSchema>;

export const subscriptionChangePlanInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  plan: subscriptionPlanSchema,
});
export type SubscriptionChangePlanInput = z.infer<
  typeof subscriptionChangePlanInputSchema
>;

export const subscriptionChangePlanResultSchema = z.strictObject({
  schemaVersion: z.literal(SUBSCRIPTION_CONTRACT_VERSION),
  status: z.enum(['changed', 'replayed']),
  state: subscriptionStateSchema,
});
export type SubscriptionChangePlanResult = z.infer<
  typeof subscriptionChangePlanResultSchema
>;

/** Audit action emitted by a plan change (docs/module/subscription.md). */
export const SUBSCRIPTION_CHANGED_ACTION = 'SubscriptionChanged';
export const ENTITLEMENT_CHANGED_ACTION = 'EntitlementChanged';
