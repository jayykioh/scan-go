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

/**
 * PayOS merchant credentials (REQ-PAY-003, REQ-PAY-004). Create all three once
 * with the Firebase CLI before the first deploy that binds them:
 *
 *   firebase functions:secrets:set PAYOS_CLIENT_ID
 *   firebase functions:secrets:set PAYOS_API_KEY
 *   firebase functions:secrets:set PAYOS_CHECKSUM_KEY
 *
 * `PAYOS_CHECKSUM_KEY` signs every outbound payment request and verifies every
 * inbound webhook; it must never leave the server. PayOS is available exactly
 * when these are bound, so removing them turns the integration off.
 */
export const payosClientIdSecret = defineSecret('PAYOS_CLIENT_ID');
export const payosApiKeySecret = defineSecret('PAYOS_API_KEY');
export const payosChecksumKeySecret = defineSecret('PAYOS_CHECKSUM_KEY');

/** Every PayOS secret a function must bind to reach the provider. */
export const payosSecrets = [
  payosClientIdSecret,
  payosApiKeySecret,
  payosChecksumKeySecret,
];
