import { HttpsError } from 'firebase-functions/v2/https';
import {
  FEEDBACK_CONTRACT_VERSION,
  feedbackRecordSchema,
  feedbackSubmitInputSchema,
  type FeedbackKind,
  type FeedbackRecord,
  type FeedbackSubmitInput,
  type FeedbackVerificationState,
} from '../../../../shared/contracts/feedback.contract.js';
import { maskPersonalData } from '../../shared/pii.js';

export const FEEDBACK_INVALID_MESSAGE = 'Phản hồi không hợp lệ.';
export const FEEDBACK_TENANT_DENIED_MESSAGE =
  'Không tìm thấy cửa hàng cho phản hồi này.';

// Re-exported so existing Feedback callers and tests keep one masking seam.
export { maskPersonalData };

export function parseFeedbackSubmitInput(data: unknown): FeedbackSubmitInput {
  const parsed = feedbackSubmitInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', FEEDBACK_INVALID_MESSAGE);
  }
  return parsed.data;
}

/** `verified` only when a matching Order reference exists (REQ-FDB-001). */
export function resolveVerificationState(
  orderExists: boolean,
): FeedbackVerificationState {
  return orderExists ? 'verified' : 'unverified';
}

export interface BuildFeedbackRecordInput {
  feedbackId: string;
  tenantId: string;
  kind: FeedbackKind;
  rating?: number;
  message?: string;
  orderId: string | null;
  verificationState: FeedbackVerificationState;
  now: string;
}

export function buildFeedbackRecord(
  input: BuildFeedbackRecordInput,
): FeedbackRecord {
  const message = input.message ?? null;
  return feedbackRecordSchema.parse({
    schemaVersion: FEEDBACK_CONTRACT_VERSION,
    feedbackId: input.feedbackId,
    tenantId: input.tenantId,
    kind: input.kind,
    rating: input.kind === 'review' ? (input.rating ?? null) : null,
    message,
    maskedMessage: message === null ? null : maskPersonalData(message),
    orderId: input.orderId,
    verificationState: input.verificationState,
    actorType: 'customer',
    actorUid: null,
    topicTags: [],
    createdAt: input.now,
  });
}
