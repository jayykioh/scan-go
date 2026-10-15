import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

/**
 * Feedback contract baseline (REQ-FDB-001, NFR-PRIV-002).
 *
 * A Customer submits a review or issue with an optional Order reference. The
 * server decides the verification state: `verified` only when a matching Order
 * exists in the tenant. Personal data is minimized: no name, phone, or email
 * field is accepted, and analysis text is masked.
 */
export const FEEDBACK_CONTRACT_VERSION = 1;

export const feedbackKindSchema = z.enum(['review', 'issue']);
export type FeedbackKind = z.infer<typeof feedbackKindSchema>;

export const feedbackRatingSchema = z.number().int().min(1).max(5);
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;

export const feedbackVerificationStateSchema = z.enum([
  'unverified',
  'verified',
]);
export type FeedbackVerificationState = z.infer<
  typeof feedbackVerificationStateSchema
>;

export const FEEDBACK_MESSAGE_MAX_LENGTH = 1000;

/**
 * Customer submission. The public path accepts no identity fields, so a name,
 * phone, or email cannot ride along (NFR-PRIV-002).
 */
export const feedbackSubmitInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    kind: feedbackKindSchema,
    rating: feedbackRatingSchema.optional(),
    message: z.string().min(1).max(FEEDBACK_MESSAGE_MAX_LENGTH).optional(),
    orderId: z.string().min(1).optional(),
    trackingToken: z.string().min(1).optional(),
  })
  .refine(
    (input) => input.kind !== 'review' || input.rating !== undefined || input.message !== undefined,
    { message: 'A review needs a rating or a message.' },
  )
  .refine((input) => input.kind !== 'issue' || input.message !== undefined, {
    message: 'An issue needs a message.',
  });

export type FeedbackSubmitInput = z.infer<typeof feedbackSubmitInputSchema>;

/** Stored record. Raw text stays permission-controlled; masked text is analysis input. */
export const feedbackRecordSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  feedbackId: z.string().min(1),
  tenantId: z.string().min(1),
  kind: feedbackKindSchema,
  rating: feedbackRatingSchema.nullable(),
  message: z.string().max(FEEDBACK_MESSAGE_MAX_LENGTH).nullable(),
  maskedMessage: z.string().max(FEEDBACK_MESSAGE_MAX_LENGTH).nullable(),
  orderId: z.string().min(1).nullable(),
  verificationState: feedbackVerificationStateSchema,
  actorType: z.literal('customer'),
  actorUid: z.null(),
  topicTags: z.array(z.string().min(1)).max(10),
  createdAt: isoUtcTimestampSchema,
});

export type FeedbackRecord = z.infer<typeof feedbackRecordSchema>;

/** Minimal Customer response. It never echoes raw text or personal data. */
export const feedbackSubmitResultSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  feedbackId: z.string().min(1),
  tenantId: z.string().min(1),
  verificationState: feedbackVerificationStateSchema,
  createdAt: isoUtcTimestampSchema,
});

export type FeedbackSubmitResult = z.infer<typeof feedbackSubmitResultSchema>;

/**
 * Feedback ticket workflow (REQ-FDB-003). A ticket moves through `received`,
 * `in_progress`, and `resolved` with an owner, priority, linked feedback IDs,
 * and an append-only history of state, actor, time, and reason.
 */
export const feedbackTicketStateSchema = z.enum([
  'received',
  'in_progress',
  'resolved',
]);
export type FeedbackTicketState = z.infer<typeof feedbackTicketStateSchema>;

export const feedbackTicketPrioritySchema = z.enum(['low', 'medium', 'high']);
export type FeedbackTicketPriority = z.infer<
  typeof feedbackTicketPrioritySchema
>;

/** Append-only ticket history entry (state, actor, time, and reason). */
export const feedbackTicketHistoryEntrySchema = z.strictObject({
  at: isoUtcTimestampSchema,
  actorUid: z.string().min(1),
  actorType: z.enum(['owner', 'staff']),
  fromState: feedbackTicketStateSchema.nullable(),
  toState: feedbackTicketStateSchema,
  reason: z.string().min(1).max(500).nullable(),
});
export type FeedbackTicketHistoryEntry = z.infer<
  typeof feedbackTicketHistoryEntrySchema
>;

export const feedbackTicketSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  ticketId: z.string().min(1),
  tenantId: z.string().min(1),
  state: feedbackTicketStateSchema,
  ownerUid: z.string().min(1).nullable(),
  priority: feedbackTicketPrioritySchema,
  feedbackIds: z.array(z.string().min(1)).min(1).max(50),
  history: z.array(feedbackTicketHistoryEntrySchema).min(1).max(100),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type FeedbackTicket = z.infer<typeof feedbackTicketSchema>;

export const createFeedbackTicketInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  feedbackIds: z.array(z.string().min(1)).min(1).max(50),
  priority: feedbackTicketPrioritySchema,
  ownerUid: z.string().min(1).nullable().optional(),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
export type CreateFeedbackTicketInput = z.infer<
  typeof createFeedbackTicketInputSchema
>;

export const updateFeedbackTicketInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ticketId: z.string().min(1),
  toState: feedbackTicketStateSchema,
  /** A change is only accepted when the reason is recorded. */
  reason: z.string().trim().min(1).max(500),
  ownerUid: z.string().min(1).nullable().optional(),
});
export type UpdateFeedbackTicketInput = z.infer<
  typeof updateFeedbackTicketInputSchema
>;

export const feedbackTicketResultSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  status: z.enum(['applied', 'replayed']),
  ticket: feedbackTicketSchema,
});
export type FeedbackTicketResult = z.infer<
  typeof feedbackTicketResultSchema
>;

/**
 * Customer report topics (REQ-FDB-007, REQ-FDB-008). The catalog is closed, so
 * a report can only land on a known topic or `other`. The tag is the only part a
 * model may decide; the count and the threshold are arithmetic in code.
 */
export const feedbackTopicKeySchema = z.enum([
  'food-quality',
  'service',
  'price',
  'cleanliness',
  'order-accuracy',
  'other',
]);
export type FeedbackTopicKey = z.infer<typeof feedbackTopicKeySchema>;

/** Whether the current window for this topic already raised its warning. */
export const feedbackTopicAlertStateSchema = z.enum(['none', 'alerted']);
export type FeedbackTopicAlertState = z.infer<
  typeof feedbackTopicAlertStateSchema
>;

export const FEEDBACK_TOPIC_RECENT_IDS_MAX = 20;

/**
 * One topic's counter. `count` is all-time; `windowCount` counts reports since
 * `windowStartedAt`, which resets once the configured window elapses. That makes
 * a surge detectable with one document read and no scheduled job.
 */
export const feedbackTopicSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  topicKey: feedbackTopicKeySchema,
  label: z.string().min(1).max(120),
  department: z.enum(['finance', 'menu', 'inventory', 'operations', 'customer']),
  count: z.number().int().nonnegative(),
  windowStartedAt: isoUtcTimestampSchema,
  windowCount: z.number().int().nonnegative(),
  recentFeedbackIds: z
    .array(z.string().min(1))
    .max(FEEDBACK_TOPIC_RECENT_IDS_MAX),
  lastFeedbackId: z.string().min(1),
  firstAt: isoUtcTimestampSchema,
  lastAt: isoUtcTimestampSchema,
  alertState: feedbackTopicAlertStateSchema,
  alertedAt: isoUtcTimestampSchema.nullable(),
  updatedAt: isoUtcTimestampSchema,
});
export type FeedbackTopic = z.infer<typeof feedbackTopicSchema>;

export const feedbackTopicListResultSchema = z.strictObject({
  schemaVersion: z.literal(FEEDBACK_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  topics: z.array(feedbackTopicSchema).max(50),
});
export type FeedbackTopicListResult = z.infer<
  typeof feedbackTopicListResultSchema
>;
