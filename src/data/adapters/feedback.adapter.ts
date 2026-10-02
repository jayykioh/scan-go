import { httpsCallable } from 'firebase/functions';
import {
  feedbackSubmitResultSchema,
  type FeedbackSubmitInput,
  type FeedbackSubmitResult,
} from '@contracts/feedback.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

/** Stable published callable name (docs/RULES_FIREBASE.md §2). */
export const FEEDBACK_SUBMIT_CALLABLE = 'callableFeedbackSubmit';

/** Parse one server feedback result through the frozen contract. */
export function parseFeedbackSubmitResult(data: unknown): FeedbackSubmitResult {
  return feedbackSubmitResultSchema.parse(data);
}

/**
 * Customer feedback seam (REQ-FDB-001). The server owns tenant scoping and the
 * verification state. The client sends no identity data.
 */
export async function submitFeedback(
  input: FeedbackSubmitInput,
): Promise<FeedbackSubmitResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<FeedbackSubmitInput, FeedbackSubmitResult>(
    functions,
    FEEDBACK_SUBMIT_CALLABLE,
  );
  const result = await callable(input);
  return parseFeedbackSubmitResult(result.data);
}
