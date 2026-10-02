import { httpsCallable } from 'firebase/functions';
import {
  getI18nCatalog,
  resolveI18nLocale,
  translateI18n,
  type I18nCatalog,
  type I18nLocale,
  type I18nMessageKey,
  type LocaleResult,
} from '@contracts/i18n.contract';
import {
  getFirebaseAuth,
  getFirebaseFunctions,
} from '../../services/firebase/client';

export const I18N_STORAGE_KEY = 'scango.locale';

const I18N_GET_LOCALE = 'callableI18nGetLocale';
const I18N_SET_LOCALE = 'callableI18nSetLocale';

function readStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') {
    return [];
  }
  return Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? navigator.languages
    : [navigator.language];
}

/**
 * Read the cached interface locale. The cache covers a Customer without an
 * account and the signed-in user before the server read completes
 * (REQ-I18N-001).
 */
export function readCachedLocale(
  storage: Pick<Storage, 'getItem'> | null = readStorage(),
): I18nLocale | null {
  if (!storage) {
    return null;
  }
  try {
    const raw = storage.getItem(I18N_STORAGE_KEY);
    return raw === 'vi' || raw === 'en' ? raw : null;
  } catch {
    return null;
  }
}

/** Cache an interface locale so the next load opens in the same language. */
export function writeCachedLocale(
  locale: I18nLocale,
  storage: Pick<Storage, 'setItem'> | null = readStorage(),
): void {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(I18N_STORAGE_KEY, locale);
  } catch {
    // The interface stays usable when storage is unavailable or full.
  }
}

/**
 * Resolve the opening locale from the cached choice, then the browser
 * languages. `resolveI18nLocale` is the single typed decision function
 * (REQ-I18N-001).
 */
export function resolveInterfaceLocale(options?: {
  cached?: string | null;
  browserLocales?: readonly string[];
}): I18nLocale {
  return resolveI18nLocale({
    savedLocale: options?.cached ?? readCachedLocale(),
    browserLocales: options?.browserLocales ?? browserLanguages(),
  });
}

export function catalogFor(locale: I18nLocale): I18nCatalog {
  return getI18nCatalog(locale);
}

export function translate(locale: I18nLocale, key: I18nMessageKey): string {
  return translateI18n(locale, key);
}

function hasAuthenticatedUser(): boolean {
  return Boolean(getFirebaseAuth()?.currentUser);
}

/**
 * Read the persisted locale for an authenticated user. A Customer without an
 * account or a missing Firebase configuration returns `null` so the caller
 * keeps the cached or browser locale.
 */
export async function fetchRemoteLocale(): Promise<LocaleResult | null> {
  const functions = getFirebaseFunctions();
  if (!functions || !hasAuthenticatedUser()) {
    return null;
  }
  const callable = httpsCallable<void, LocaleResult>(
    functions,
    I18N_GET_LOCALE,
  );
  const result = await callable();
  return result.data;
}

/**
 * Persist the locale for an authenticated user through the server boundary.
 * The local cache is written first so the switch is immediate; a Customer
 * without an account keeps only the cache (REQ-I18N-001).
 */
export async function saveRemoteLocale(
  locale: I18nLocale,
): Promise<LocaleResult | null> {
  writeCachedLocale(locale);
  const functions = getFirebaseFunctions();
  if (!functions || !hasAuthenticatedUser()) {
    return null;
  }
  const callable = httpsCallable<{ locale: I18nLocale }, LocaleResult>(
    functions,
    I18N_SET_LOCALE,
  );
  const result = await callable({ locale });
  return result.data;
}
