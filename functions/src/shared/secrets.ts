import { defineSecret } from 'firebase-functions/params';

/**
 * Firebase Secret Manager keys for the AI provider adapters (ADR 0008,
 * REQ-AI-004). Create the Gemini key once with the Firebase CLI:
 *
 *   firebase functions:secrets:set GEMINI_API_KEY
 *
 * A secret is injected only into a function that lists it in its `secrets`
 * option, and Firebase deploy fails when a bound secret does not exist. The
 * value is read at runtime through `process.env`; it is never logged, returned,
 * or placed in a client bundle.
 */
export const geminiApiKeySecret = defineSecret('GEMINI_API_KEY');
