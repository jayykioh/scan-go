import { httpsCallable } from 'firebase/functions';
import {
  aiAskResultSchema,
  type AiAskInput,
  type AiAskResult,
} from '@contracts/ai.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

/** Stable published callable name (docs/RULES_FIREBASE.md §2). */
export const AI_ASK_CALLABLE = 'callableAiAsk';

/**
 * Parse one server AI answer through the frozen contract before the UI reads
 * it. A malformed or invented shape fails here (REQ-AI-001, NFR-AI-001).
 */
export function parseAiAskResult(data: unknown): AiAskResult {
  return aiAskResultSchema.parse(data);
}

/**
 * Read-only Owner assistant seam (REQ-AI-001). The server re-verifies the Owner
 * membership, assembles a permission-scoped context from authorized tenant
 * data, and never mutates business state. Missing data returns a warning, not
 * an invented value. The client never holds an AI provider secret.
 */
export async function askAiQuestion(input: AiAskInput): Promise<AiAskResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<AiAskInput, AiAskResult>(
    functions,
    AI_ASK_CALLABLE,
  );
  const result = await callable(input);
  return parseAiAskResult(result.data);
}
