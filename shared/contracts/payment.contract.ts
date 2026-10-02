import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  vndSchema,
} from '../validation.js';

export const PAYMENT_CONTRACT_VERSION = 1;

/** Manual M1 settlement methods. Automatic provider events are M3. */
export const paymentMethodSchema = z.enum(['cash', 'vietQr']);

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

/**
 * A confirmed Payment is immutable. Reversal and refund create linked
 * compensating records, so those records carry a `reversed` or `refunded`
 * status while the original stays `confirmed` (REQ-PAY-001).
 */
export const paymentStatusSchema = z.enum([
  'confirmed',
  'reversed',
  'refunded',
]);

export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

/**
 * Tenant merchant details for a dynamic VietQR instruction. Payment owns this
 * shape; the values are read from the tenant document `vietQr` map.
 */
export const vietQrMerchantConfigSchema = z.strictObject({
  bankBin: z.string().regex(/^\d{6}$/),
  accountNo: z.string().trim().min(1).max(32),
  accountName: z.string().trim().min(1).max(120),
  template: z.string().trim().min(1).max(32).default('compact2'),
});

export type VietQrMerchantConfig = z.infer<typeof vietQrMerchantConfigSchema>;

/**
 * Dynamic VietQR instruction snapshot. `addInfo` and `amountVnd` are dynamic
 * per Order; the bank fields are tenant-static (glossary: VietQR).
 */
export const vietQrInstructionSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  method: z.literal('vietQr'),
  bankBin: z.string().regex(/^\d{6}$/),
  accountNo: z.string().min(1),
  accountName: z.string().min(1),
  template: z.string().min(1),
  amountVnd: vndSchema,
  addInfo: z.string().min(1),
  qrPayload: z.string().min(1),
});

export type VietQrInstruction = z.infer<typeof vietQrInstructionSchema>;

export const paymentConfirmInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  method: paymentMethodSchema,
  amountVnd: nonNegativeIntSchema,
  idempotencyKey: z.string().min(8).max(128),
});

export type PaymentConfirmInput = z.infer<typeof paymentConfirmInputSchema>;

export const paymentInstructionInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
});

export type PaymentInstructionInput = z.infer<
  typeof paymentInstructionInputSchema
>;

/**
 * One confirmed Payment record. The record is written once and never updated;
 * a linked compensating record handles reversal or refund (REQ-CAS-001,
 * REQ-PAY-001, docs/data-model.md §6).
 */
export const paymentRecordSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  paymentId: z.string().min(1),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  amountVnd: vndSchema,
  method: paymentMethodSchema,
  status: paymentStatusSchema,
  vietQrInstruction: vietQrInstructionSchema.nullable(),
  actorUid: z.string().min(1),
  idempotencyKey: z.string().min(1),
  /** Linked original Payment for a compensating reversal or refund record. */
  linkedPaymentId: z.string().min(1).nullable().default(null),
  correctionKind: z.enum(['reversal', 'refund']).nullable().default(null),
  reason: z.string().min(1).max(500).nullable().default(null),
  /** Replaceable provider seam identity; never carries secret material. */
  providerId: z.string().min(1).max(40).nullable().default(null),
  providerRef: z.string().min(1).max(200).nullable().default(null),
  confirmedAt: isoUtcTimestampSchema,
  createdAt: isoUtcTimestampSchema,
});

export type PaymentRecord = z.infer<typeof paymentRecordSchema>;

export const paymentConfirmationResultSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  status: z.enum(['confirmed', 'replayed']),
  payment: paymentRecordSchema,
  /** Ordering owns the Order; Payment reports the resulting status. */
  orderStatus: z.enum([
    'pending',
    'cooking',
    'ready',
    'served',
    'paid',
    'cancelled',
  ]),
});

export type PaymentConfirmationResult = z.infer<
  typeof paymentConfirmationResultSchema
>;

export const paymentInstructionResultSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  instruction: vietQrInstructionSchema,
});

export type PaymentInstructionResult = z.infer<
  typeof paymentInstructionResultSchema
>;

/** Deterministic Payment id so one Order has at most one M1 Payment. */
export function paymentIdFor(orderId: string): string {
  return `payment_${orderId}`;
}

/**
 * Deterministic id for one linked compensating record. One Order owns at most
 * one reversal and one refund, so a retry reuses the same document
 * (REQ-PAY-001, docs/data-model.md §10).
 */
export function correctionPaymentIdFor(
  orderId: string,
  kind: 'reversal' | 'refund',
): string {
  return `payment_${orderId}__${kind}`;
}

/**
 * Feature flag key under `platform/config.values`. The provider adapter stays
 * behind a flag so the default manual flow never calls a provider
 * (REQ-PAY-001, P0-L08).
 */
export const PAYMENT_PROVIDER_FLAG_KEY = 'paymentProviderEnabled';

/**
 * Automatic transfer confirmation stays behind its own flag, so enabling the
 * provider seam never turns on posting (REQ-PAY-002, P0-L08 extension).
 */
export const PAYMENT_AUTO_CONFIRM_FLAG_KEY = 'paymentAutomaticConfirmEnabled';

/**
 * Replaceable payment provider identities. `manual` stays the default adapter;
 * `automatic` is the test-only signed-event seam and is never the default.
 */
export const paymentProviderIdSchema = z.enum(['manual', 'fake', 'automatic']);

export type PaymentProviderId = z.infer<typeof paymentProviderIdSchema>;

/**
 * Normalized provider payload. `strictObject` rejects any extra key, so a
 * payload carrying a secret field fails before any record is written
 * (P0-L08, docs/RULES_FIREBASE.md §7).
 */
export const paymentProviderPayloadSchema = z.strictObject({
  providerEventId: z.string().min(1).max(128),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  amountVnd: vndSchema,
  outcome: z.enum(['settled', 'failed']),
});

export type PaymentProviderPayload = z.infer<
  typeof paymentProviderPayloadSchema
>;

/**
 * Adapter output persisted as evidence. It never carries a secret or raw
 * provider body (P0-L08).
 */
export const paymentProviderSettlementSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  providerId: paymentProviderIdSchema,
  providerEventId: z.string().min(1).max(128),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  amountVnd: vndSchema,
  outcome: z.enum(['settled', 'failed']),
  mappedAt: isoUtcTimestampSchema,
});

export type PaymentProviderSettlement = z.infer<
  typeof paymentProviderSettlementSchema
>;

export const paymentProviderEvidenceSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  evidenceId: z.string().min(1),
  settlement: paymentProviderSettlementSchema,
  recordedAt: isoUtcTimestampSchema,
});

export type PaymentProviderEvidence = z.infer<
  typeof paymentProviderEvidenceSchema
>;

export const paymentProviderSettleInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  providerId: paymentProviderIdSchema,
  payload: paymentProviderPayloadSchema,
  /**
   * Provider signature over the normalized payload. It is verified by the
   * adapter and never persisted (REQ-PAY-002, docs/module/payment.md).
   */
  signature: z.string().min(1).max(512).optional(),
});

export type PaymentProviderSettleInput = z.infer<
  typeof paymentProviderSettleInputSchema
>;

/**
 * Automatic confirmation request: a signed provider event. The server verifies
 * the signature, matches the Order, and posts exactly once (REQ-PAY-002).
 */
export const paymentAutoConfirmInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  providerId: paymentProviderIdSchema,
  payload: paymentProviderPayloadSchema,
  signature: z.string().min(1).max(512),
});

export type PaymentAutoConfirmInput = z.infer<
  typeof paymentAutoConfirmInputSchema
>;

export const paymentProviderSettleResultSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  status: z.enum(['mapped', 'replayed']),
  evidence: paymentProviderEvidenceSchema,
});

export type PaymentProviderSettleResult = z.infer<
  typeof paymentProviderSettleResultSchema
>;

export const paymentAutoConfirmResultSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  status: z.enum(['confirmed', 'replayed']),
  payment: paymentRecordSchema,
  orderStatus: z.enum([
    'pending',
    'cooking',
    'ready',
    'served',
    'paid',
    'cancelled',
  ]),
  evidence: paymentProviderEvidenceSchema,
});

export type PaymentAutoConfirmResult = z.infer<
  typeof paymentAutoConfirmResultSchema
>;

/** Deterministic evidence id so a retry never writes a second record. */
export function providerEvidenceIdFor(
  orderId: string,
  providerEventId: string,
): string {
  return `provider_${orderId}__${providerEventId}`;
}

/**
 * One paid Order selected for the retention archive. The copy keeps the record
 * recoverable while the source keeps `archivedAt` (NFR-RET-001).
 */
export const paymentArchiveLineSchema = z.strictObject({
  paymentId: z.string().min(1),
  confirmedAt: isoUtcTimestampSchema,
  archivePath: z.string().min(1),
});

export type PaymentArchiveLine = z.infer<typeof paymentArchiveLineSchema>;

/**
 * Immutable archive plan composed by Payment from confirmed Payments older than
 * the configured retention window (NFR-RET-001, NFR-REL-001).
 */
export const paymentArchivePlanSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  cutoffAt: isoUtcTimestampSchema,
  retentionYears: z.number().int().positive(),
  lines: z.array(paymentArchiveLineSchema),
  createdAt: isoUtcTimestampSchema,
});

export type PaymentArchivePlan = z.infer<typeof paymentArchivePlanSchema>;
