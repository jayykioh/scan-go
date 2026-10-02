import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';

export const LOYALTY_CONTRACT_VERSION = 1;

/** Bounded loyalty member list (NFR-PRIV-001). */
export const LOYALTY_MEMBER_LIST_LIMIT = 100;

export const LOYALTY_DEFAULT_EARN_RATE_VND = 10000;
export const LOYALTY_DEFAULT_POINTS_PER_EARN_RATE = 1;
export const LOYALTY_DEFAULT_WELCOME_POINTS = 0;

/**
 * Owner-configurable tenant Loyalty settings. Defaults match
 * docs/module/loyalty.md: one point per 10,000 VND and zero welcome points.
 */
export const loyaltyConfigSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  earnRateVnd: positiveIntSchema,
  pointsPerEarnRate: positiveIntSchema,
  welcomePoints: nonNegativeIntSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type LoyaltyConfig = z.infer<typeof loyaltyConfigSchema>;

export const loyaltyConfigValuesSchema = z.strictObject({
  earnRateVnd: positiveIntSchema,
  pointsPerEarnRate: positiveIntSchema,
  welcomePoints: nonNegativeIntSchema,
});

export const loyaltyTransactionKindSchema = z.enum([
  'earn',
  'redeem',
  'reverse',
  'welcome',
]);
export type LoyaltyTransactionKind = z.infer<
  typeof loyaltyTransactionKindSchema
>;

/**
 * Append-only Loyalty ledger entry. `points` is signed: earn and welcome are
 * positive, redeem is negative, and reverse carries the signed correction.
 * `balanceAfter` is the member balance at commit time (docs/data-model.md §6).
 */
export const loyaltyTransactionSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  transactionId: z.string().min(1),
  tenantId: z.string().min(1),
  memberId: z.string().min(1),
  kind: loyaltyTransactionKindSchema,
  points: z.number().int(),
  balanceAfter: nonNegativeIntSchema,
  orderId: z.string().min(1).nullable(),
  reason: z.string().min(1).max(500).nullable(),
  idempotencyKey: z.string().min(1),
  /**
   * Canonical hash of the originating request (tenant, member, action, points,
   * amount). A reused idempotency key with a different hash is a conflict
   * (REQ-LOY-001, docs/data-model.md §5).
   */
  requestHash: z.string().min(1).nullable().optional(),
  actorUid: z.string().min(1).nullable(),
  createdAt: isoUtcTimestampSchema,
});
export type LoyaltyTransaction = z.infer<typeof loyaltyTransactionSchema>;

/**
 * Stored member record. `verificationCodeHash` and `verificationExpiresAt` are
 * internal and never leave the server.
 */
export const loyaltyMemberSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  memberId: z.string().min(1),
  tenantId: z.string().min(1),
  /** Normalized `+84` phone, the only searchable Customer identity. */
  phone: z.string().regex(/^\+84\d{9}$/),
  displayName: z.string().min(1).max(80).nullable(),
  isVerified: z.boolean(),
  pointBalance: nonNegativeIntSchema,
  paidTotalVnd: vndSchema,
  visitCount: nonNegativeIntSchema,
  verificationCodeHash: z.string().min(1).nullable(),
  verificationExpiresAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type LoyaltyMember = z.infer<typeof loyaltyMemberSchema>;

/**
 * Permission-filtered member view. `phone` survives only when the server
 * authorization decision grants `customer.phone.read`; ADMIN stays unrestricted
 * and audited (NFR-PRIV-001).
 */
export const loyaltyMemberViewSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  memberId: z.string().min(1),
  displayName: z.string().min(1).max(80).nullable(),
  phone: z.string().min(1).nullable(),
  phoneVisible: z.boolean(),
  isVerified: z.boolean(),
  pointBalance: nonNegativeIntSchema,
  paidTotalVnd: vndSchema,
  visitCount: nonNegativeIntSchema,
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type LoyaltyMemberView = z.infer<typeof loyaltyMemberViewSchema>;

export const loyaltyRegisterInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  phone: z.string().trim().min(1).max(20),
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type LoyaltyRegisterInput = z.infer<typeof loyaltyRegisterInputSchema>;

export const loyaltyRegisterResultSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  status: z.enum(['registered', 'replayed']),
  member: loyaltyMemberViewSchema,
  /** True when the server issued a phone verification challenge. */
  verificationRequired: z.boolean(),
});
export type LoyaltyRegisterResult = z.infer<typeof loyaltyRegisterResultSchema>;

export const loyaltyVerifyInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  memberId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});
export type LoyaltyVerifyInput = z.infer<typeof loyaltyVerifyInputSchema>;

export const loyaltyVerifyResultSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  status: z.enum(['verified', 'replayed']),
  member: loyaltyMemberViewSchema,
});
export type LoyaltyVerifyResult = z.infer<typeof loyaltyVerifyResultSchema>;

export const loyaltyEarnInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  memberId: z.string().min(1),
  amountVnd: nonNegativeIntSchema,
  idempotencyKey: z.string().min(8).max(128),
});
export type LoyaltyEarnInput = z.infer<typeof loyaltyEarnInputSchema>;

export const loyaltyRedeemInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  memberId: z.string().min(1),
  points: positiveIntSchema,
  orderId: z.string().min(1).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type LoyaltyRedeemInput = z.infer<typeof loyaltyRedeemInputSchema>;

export const loyaltyReverseInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  memberId: z.string().min(1),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type LoyaltyReverseInput = z.infer<typeof loyaltyReverseInputSchema>;

export const loyaltyPointResultSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  status: z.enum(['applied', 'replayed']),
  member: loyaltyMemberViewSchema,
  transaction: loyaltyTransactionSchema,
});
export type LoyaltyPointResult = z.infer<typeof loyaltyPointResultSchema>;

export const loyaltyListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z
    .number()
    .int()
    .positive()
    .max(LOYALTY_MEMBER_LIST_LIMIT)
    .optional(),
});
export type LoyaltyListInput = z.infer<typeof loyaltyListInputSchema>;

export const loyaltyListResultSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  members: z.array(loyaltyMemberViewSchema),
});
export type LoyaltyListResult = z.infer<typeof loyaltyListResultSchema>;

export const loyaltyGetConfigInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});
export type LoyaltyGetConfigInput = z.infer<
  typeof loyaltyGetConfigInputSchema
>;

export const loyaltyConfigResultSchema = z.strictObject({
  schemaVersion: z.literal(LOYALTY_CONTRACT_VERSION),
  config: loyaltyConfigSchema,
});
export type LoyaltyConfigResult = z.infer<typeof loyaltyConfigResultSchema>;

export const loyaltyUpdateConfigInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  earnRateVnd: positiveIntSchema.optional(),
  pointsPerEarnRate: positiveIntSchema.optional(),
  welcomePoints: nonNegativeIntSchema.optional(),
});
export type LoyaltyUpdateConfigInput = z.infer<
  typeof loyaltyUpdateConfigInputSchema
>;

/** Normalize a Vietnamese phone to the stored `+84` shape, or null. */
export function normalizeLoyaltyPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '');
  if (/^0\d{9}$/.test(digits)) {
    return `+84${digits.slice(1)}`;
  }
  if (/^\+84\d{9}$/.test(digits)) {
    return digits;
  }
  if (/^84\d{9}$/.test(digits)) {
    return `+${digits}`;
  }
  return null;
}

export interface LoyaltyEarnRate {
  earnRateVnd: number;
  pointsPerEarnRate: number;
}

/**
 * Deterministic integer-VND earning: one point per completed `earnRateVnd`
 * block, multiplied by `pointsPerEarnRate`. Fractional blocks never round up
 * (REQ-LOY-001, docs/module/loyalty.md).
 */
export function computeEarnedPoints(
  amountVnd: number,
  rate: LoyaltyEarnRate,
): number {
  if (!Number.isInteger(amountVnd) || amountVnd < 0) {
    throw new TypeError('amountVnd must be a non-negative integer');
  }
  if (
    !Number.isInteger(rate.earnRateVnd) ||
    rate.earnRateVnd <= 0 ||
    !Number.isInteger(rate.pointsPerEarnRate) ||
    rate.pointsPerEarnRate <= 0
  ) {
    throw new TypeError('loyalty earn rate must be positive integers');
  }
  return Math.floor(amountVnd / rate.earnRateVnd) * rate.pointsPerEarnRate;
}

export function buildDefaultLoyaltyConfig(
  tenantId: string,
  now: string,
): LoyaltyConfig {
  return loyaltyConfigSchema.parse({
    schemaVersion: LOYALTY_CONTRACT_VERSION,
    tenantId,
    earnRateVnd: LOYALTY_DEFAULT_EARN_RATE_VND,
    pointsPerEarnRate: LOYALTY_DEFAULT_POINTS_PER_EARN_RATE,
    welcomePoints: LOYALTY_DEFAULT_WELCOME_POINTS,
    updatedAt: now,
  });
}

/** Deterministic ledger ids keep a retried command from writing twice. */
export function loyaltyEarnTransactionId(orderId: string): string {
  return `loyalty_earn_${orderId}`;
}

export function loyaltyReverseTransactionId(orderId: string): string {
  return `loyalty_reverse_${orderId}`;
}

export function loyaltyMemberIdFor(phone: string): string {
  return `member_${phone.replace('+', '')}`;
}
