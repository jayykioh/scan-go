import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

/**
 * Product feedback contract (REQ-FDB-004, REQ-FDB-005, REQ-FDB-006).
 *
 * Customer feedback (REQ-FDB-001) is about the shop: a review or an issue with
 * an Order. Product feedback is the other direction — an operator using ScanGo
 * reports a bug, a UX problem, or a feature request about ScanGo itself, and
 * may attach screenshots stored in Firebase Storage.
 *
 * The record is tenant-scoped and server-written, exactly like the rest of the
 * Feedback module: the client never writes a business collection directly
 * (docs/RULES.md, ADR 0001). Attachments are uploaded straight to Storage under
 * the author's own tenant/uid prefix, and Storage Rules are the write gate
 * (REQ-FDB-005).
 */
export const PRODUCT_FEEDBACK_CONTRACT_VERSION = 1;

export const productFeedbackCategorySchema = z.enum([
  'bug',
  'ux',
  'feature',
  'performance',
  'other',
]);
export type ProductFeedbackCategory = z.infer<
  typeof productFeedbackCategorySchema
>;

export const productFeedbackSeveritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);
export type ProductFeedbackSeverity = z.infer<
  typeof productFeedbackSeveritySchema
>;

export const productFeedbackStatusSchema = z.enum([
  'received',
  'in_progress',
  'resolved',
]);
export type ProductFeedbackStatus = z.infer<
  typeof productFeedbackStatusSchema
>;

/** The role the reporter held when the report was written. */
export const productFeedbackActorRoleSchema = z.enum([
  'owner',
  'staff',
  'kitchen',
  'cashier',
  'admin',
]);
export type ProductFeedbackActorRole = z.infer<
  typeof productFeedbackActorRoleSchema
>;

export const PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH = 2000;
export const PRODUCT_FEEDBACK_MAX_ATTACHMENTS = 3;
export const PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/**
 * Storage segment for product-feedback screenshots. Kept here so the client,
 * the Cloud Function, and the Security Rules tests all read one definition.
 */
export const PRODUCT_FEEDBACK_ATTACHMENT_SEGMENT = 'feedbackAttachments';

/**
 * The only prefix a reporter may upload to: their own Tenant, their own uid.
 * A path outside it is rejected by the server and by Storage Rules.
 */
export function productFeedbackAttachmentPrefix(
  tenantId: string,
  uid: string,
): string {
  return `tenants/${tenantId}/${PRODUCT_FEEDBACK_ATTACHMENT_SEGMENT}/${uid}`;
}

/**
 * One attachment as recorded on the feedback document. `storagePath` is a
 * Storage object path, never a download URL: a URL would expire and would leak
 * a token into the record.
 */
export const productFeedbackAttachmentSchema = z.strictObject({
  storagePath: z.string().min(1).max(512),
  contentType: z.enum(PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES),
});
export type ProductFeedbackAttachment = z.infer<
  typeof productFeedbackAttachmentSchema
>;

/** A submission from a signed-in Tenant member. */
export const productFeedbackSubmitInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  category: productFeedbackCategorySchema,
  severity: productFeedbackSeveritySchema,
  message: z
    .string()
    .trim()
    .min(PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH)
    .max(PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH),
  attachments: z
    .array(productFeedbackAttachmentSchema)
    .max(PRODUCT_FEEDBACK_MAX_ATTACHMENTS)
    .optional(),
  /** Route the reporter was on, so triage has context without a screenshot. */
  screenContext: z.string().trim().min(1).max(200).optional(),
});
export type ProductFeedbackSubmitInput = z.infer<
  typeof productFeedbackSubmitInputSchema
>;

/** Append-only status history entry, mirroring the Feedback ticket shape. */
export const productFeedbackHistoryEntrySchema = z.strictObject({
  at: isoUtcTimestampSchema,
  actorUid: z.string().min(1),
  fromStatus: productFeedbackStatusSchema.nullable(),
  toStatus: productFeedbackStatusSchema,
  reason: z.string().min(1).max(500).nullable(),
});
export type ProductFeedbackHistoryEntry = z.infer<
  typeof productFeedbackHistoryEntrySchema
>;

export const productFeedbackRecordSchema = z.strictObject({
  schemaVersion: z.literal(PRODUCT_FEEDBACK_CONTRACT_VERSION),
  feedbackId: z.string().min(1),
  tenantId: z.string().min(1),
  category: productFeedbackCategorySchema,
  severity: productFeedbackSeveritySchema,
  status: productFeedbackStatusSchema,
  message: z
    .string()
    .min(PRODUCT_FEEDBACK_MESSAGE_MIN_LENGTH)
    .max(PRODUCT_FEEDBACK_MESSAGE_MAX_LENGTH),
  attachments: z
    .array(productFeedbackAttachmentSchema)
    .max(PRODUCT_FEEDBACK_MAX_ATTACHMENTS),
  actorUid: z.string().min(1),
  actorRole: productFeedbackActorRoleSchema,
  screenContext: z.string().min(1).max(200).nullable(),
  history: z.array(productFeedbackHistoryEntrySchema).min(1).max(50),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type ProductFeedbackRecord = z.infer<typeof productFeedbackRecordSchema>;

/** Minimal response. It never echoes the message back. */
export const productFeedbackSubmitResultSchema = z.strictObject({
  schemaVersion: z.literal(PRODUCT_FEEDBACK_CONTRACT_VERSION),
  feedbackId: z.string().min(1),
  tenantId: z.string().min(1),
  status: productFeedbackStatusSchema,
  attachmentCount: z.number().int().nonnegative().max(
    PRODUCT_FEEDBACK_MAX_ATTACHMENTS,
  ),
  createdAt: isoUtcTimestampSchema,
});
export type ProductFeedbackSubmitResult = z.infer<
  typeof productFeedbackSubmitResultSchema
>;

/** Owner inbox query. `limit` is bounded so one read stays cheap. */
export const productFeedbackListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
});
export type ProductFeedbackListInput = z.infer<
  typeof productFeedbackListInputSchema
>;

export const productFeedbackListResultSchema = z.strictObject({
  schemaVersion: z.literal(PRODUCT_FEEDBACK_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  items: z.array(productFeedbackRecordSchema).max(100),
});
export type ProductFeedbackListResult = z.infer<
  typeof productFeedbackListResultSchema
>;

/** Owner triage command. A status change always records a reason. */
export const productFeedbackSetStatusInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  feedbackId: z.string().min(1),
  toStatus: productFeedbackStatusSchema,
  reason: z.string().trim().min(1).max(500),
});
export type ProductFeedbackSetStatusInput = z.infer<
  typeof productFeedbackSetStatusInputSchema
>;

export const productFeedbackSetStatusResultSchema = z.strictObject({
  schemaVersion: z.literal(PRODUCT_FEEDBACK_CONTRACT_VERSION),
  status: z.literal('applied'),
  record: productFeedbackRecordSchema,
});
export type ProductFeedbackSetStatusResult = z.infer<
  typeof productFeedbackSetStatusResultSchema
>;
