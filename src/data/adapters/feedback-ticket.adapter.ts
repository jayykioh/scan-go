import { httpsCallable } from 'firebase/functions';
import {
  feedbackTicketResultSchema,
  type CreateFeedbackTicketInput,
  type FeedbackTicketResult,
} from '@contracts/feedback.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

/** Stable published callable name (docs/RULES_FIREBASE.md §2). */
export const FEEDBACK_CREATE_TICKET_CALLABLE = 'callableFeedbackCreateTicket';

export function parseFeedbackTicketResult(data: unknown): FeedbackTicketResult {
  return feedbackTicketResultSchema.parse(data);
}

/**
 * Owner command: open one ticket for a set of reports (REQ-FDB-003). The server
 * re-verifies the Owner membership and that every report exists in the tenant.
 */
export async function createFeedbackTicket(
  input: CreateFeedbackTicketInput,
): Promise<FeedbackTicketResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    CreateFeedbackTicketInput,
    FeedbackTicketResult
  >(functions, FEEDBACK_CREATE_TICKET_CALLABLE);
  const result = await callable(input);
  return parseFeedbackTicketResult(result.data);
}
