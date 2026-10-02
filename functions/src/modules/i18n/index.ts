import { onCall } from 'firebase-functions/v2/https';
import {
  I18N_CONTRACT_VERSION,
  localeResultSchema,
} from '../../../../shared/contracts/i18n.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import {
  nowIso,
  parseUpdateLocaleInput,
  readStoredLocale,
  requireUid,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

/**
 * Read the authenticated user's persisted interface locale. A missing profile
 * or unsupported value resolves to `vi` with `isPersisted: false`, so a new or
 * returning user always receives a supported locale (REQ-I18N-001).
 */
export const callableI18nGetLocale = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);

  const db = getDb();
  const snap = await db.doc(`users/${uid}`).get();
  const stored = readStoredLocale(snap.exists ? snap.data() : undefined);

  return localeResultSchema.parse({
    schemaVersion: I18N_CONTRACT_VERSION,
    locale: stored.locale,
    isPersisted: stored.isPersisted,
  });
});

/**
 * Persist the authenticated user's interface locale. The server validates the
 * locale through the typed contract before writing `users/{uid}.locale`; the
 * write is a merge so no other profile field changes (REQ-I18N-001).
 */
export const callableI18nSetLocale = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseUpdateLocaleInput(request.data);

  const db = getDb();
  await db.doc(`users/${uid}`).set(
    { locale: input.locale, updatedAt: nowIso() },
    { merge: true },
  );

  return localeResultSchema.parse({
    schemaVersion: I18N_CONTRACT_VERSION,
    locale: input.locale,
    isPersisted: true,
  });
});
