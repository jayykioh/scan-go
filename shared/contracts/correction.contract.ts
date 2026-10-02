import { z } from 'zod';
import { isoUtcTimestampSchema, vndSchema } from '../validation.js';
import {
  PAYMENT_CONTRACT_VERSION,
  paymentRecordSchema,
} from './payment.contract.js';
import { orderStatusSchema } from './order.contract.js';

/** Only a paid Order is correctable, and only by reversal or refund. */
export const paymentCorrectionKindSchema = z.enum(['reversal', 'refund']);

export type PaymentCorrectionKind = z.infer<typeof paymentCorrectionKindSchema>;

/**
 * Authorized correction request. The reason is mandatory and the server owns
 * the amount validation against the immutable original Payment
 * (REQ-PAY-001, docs/module/payment.md).
 */
export const paymentCorrectionInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  kind: paymentCorrectionKindSchema,
  /** Optional partial amount; defaults to the full original amount. */
  amountVnd: vndSchema.optional(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(8).max(128),
});

export type PaymentCorrectionInput = z.infer<
  typeof paymentCorrectionInputSchema
>;

/**
 * Correction result. The original Payment is returned unchanged and the linked
 * compensating record is returned beside it (REQ-PAY-001).
 */
export const paymentCorrectionResultSchema = z.strictObject({
  schemaVersion: z.literal(PAYMENT_CONTRACT_VERSION),
  status: z.enum(['corrected', 'replayed']),
  kind: paymentCorrectionKindSchema,
  originalPayment: paymentRecordSchema,
  compensatingPayment: paymentRecordSchema,
  orderStatus: orderStatusSchema,
});

export type PaymentCorrectionResult = z.infer<
  typeof paymentCorrectionResultSchema
>;
