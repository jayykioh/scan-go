import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  i18nLocaleSchema,
  type I18nLocale,
  type UpdateLocaleInput,
} from '../../../../shared/contracts/i18n.contract.js';

export {
  getI18nCatalog,
  localizeMenuContent,
  resolveI18nLocale,
  translateI18n,
  EN_I18N_MESSAGES,
  VI_I18N_MESSAGES,
} from '../../../../shared/contracts/i18n.contract.js';

export const I18N_INVALID_MESSAGE = 'Ngôn ngữ không hợp lệ.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

/** Validate the authenticated locale-persistence boundary (REQ-I18N-001). */
export function parseUpdateLocaleInput(data: unknown): UpdateLocaleInput {
  const parsed = i18nLocaleSchema.safeParse(
    (data as { locale?: unknown } | undefined)?.locale,
  );
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', I18N_INVALID_MESSAGE);
  }
  // Reject any extra field on the strict boundary.
  if (
    typeof data === 'object' &&
    data !== null &&
    Object.keys(data as Record<string, unknown>).some((key) => key !== 'locale')
  ) {
    throw new HttpsError('invalid-argument', I18N_INVALID_MESSAGE);
  }
  return { locale: parsed.data };
}

/**
 * Read the persisted interface locale from a user profile. A missing or
 * malformed value falls back to `vi` and reports `isPersisted: false`, so a
 * returning user keeps a valid locale (REQ-I18N-001).
 */
export function readStoredLocale(data: DocumentData | undefined): {
  locale: I18nLocale;
  isPersisted: boolean;
} {
  const raw = data?.locale;
  if (raw === 'vi' || raw === 'en') {
    return { locale: raw, isPersisted: true };
  }
  return { locale: 'vi', isPersisted: false };
}
