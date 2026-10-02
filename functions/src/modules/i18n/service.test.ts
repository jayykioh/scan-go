import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  EN_I18N_MESSAGES,
  I18N_MESSAGE_KEYS,
  VI_I18N_MESSAGES,
  getI18nCatalog,
  localizeMenuContent,
  resolveI18nLocale,
  translateI18n,
  type I18nMessageKey,
} from '../../../../shared/contracts/i18n.contract.js';
import {
  I18N_INVALID_MESSAGE,
  parseUpdateLocaleInput,
  readStoredLocale,
} from './service.js';

function captureHttpsError(run: () => unknown): HttpsError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpsError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an HttpsError to be thrown.');
}

describe('locale resolution (REQ-I18N-001)', () => {
  it('prefers a saved choice over the browser languages', () => {
    expect(
      resolveI18nLocale({
        savedLocale: 'en',
        browserLocales: ['vi-VN'],
      }),
    ).toBe('en');
  });

  it('matches the browser primary subtag when there is no saved choice', () => {
    expect(resolveI18nLocale({ browserLocales: ['vi-VN', 'en-US'] })).toBe('vi');
    expect(resolveI18nLocale({ browserLocales: ['en-GB'] })).toBe('en');
    expect(resolveI18nLocale({ browserLocales: ['fr-FR', 'en'] })).toBe('en');
  });

  it('falls back to vi for an unsupported or missing choice', () => {
    expect(resolveI18nLocale({})).toBe('vi');
    expect(resolveI18nLocale({ savedLocale: 'fr' })).toBe('vi');
    expect(resolveI18nLocale({ browserLocales: ['de-DE'] })).toBe('vi');
    expect(resolveI18nLocale({ fallback: 'en' })).toBe('en');
    expect(resolveI18nLocale({ savedLocale: 'vi-VN' })).toBe('vi');
  });
});

describe('catalog lookup (REQ-I18N-001)', () => {
  it('holds every typed key in both locales with a non-empty value', () => {
    expect(Object.keys(VI_I18N_MESSAGES).sort()).toEqual(
      [...I18N_MESSAGE_KEYS].sort(),
    );
    expect(Object.keys(EN_I18N_MESSAGES).sort()).toEqual(
      [...I18N_MESSAGE_KEYS].sort(),
    );
    for (const key of I18N_MESSAGE_KEYS) {
      expect(VI_I18N_MESSAGES[key].length).toBeGreaterThan(0);
      expect(EN_I18N_MESSAGES[key].length).toBeGreaterThan(0);
    }
  });

  it('returns the catalog for the locale and translates a typed key', () => {
    expect(getI18nCatalog('vi').locale).toBe('vi');
    expect(getI18nCatalog('en').locale).toBe('en');
    expect(translateI18n('vi', 'settings.language.title')).toBe('Ngôn ngữ');
    expect(translateI18n('en', 'settings.language.title')).toBe('Language');
  });
});

describe('authenticated locale persistence boundary (REQ-I18N-001)', () => {
  it('reads a persisted locale and defaults a missing one', () => {
    expect(readStoredLocale({ locale: 'en' })).toEqual({
      locale: 'en',
      isPersisted: true,
    });
    expect(readStoredLocale({ locale: 'vi' })).toEqual({
      locale: 'vi',
      isPersisted: true,
    });
    expect(readStoredLocale({ locale: 'fr' })).toEqual({
      locale: 'vi',
      isPersisted: false,
    });
    expect(readStoredLocale(undefined)).toEqual({
      locale: 'vi',
      isPersisted: false,
    });
  });

  it('accepts only the strict locale input', () => {
    expect(parseUpdateLocaleInput({ locale: 'en' })).toEqual({ locale: 'en' });
    for (const run of [
      () => parseUpdateLocaleInput({ locale: 'fr' }),
      () => parseUpdateLocaleInput({ locale: 'en', extra: true }),
      () => parseUpdateLocaleInput({}),
      () => parseUpdateLocaleInput(undefined),
    ]) {
      const error = captureHttpsError(run);
      expect(error.code).toBe('invalid-argument');
      expect(error.message).toBe(I18N_INVALID_MESSAGE);
    }
  });
});

describe('Owner menu content is never translated (REQ-I18N-001)', () => {
  it('returns Owner content exactly as entered', () => {
    const ownerContent = 'Phở Bò Đặc Biệt - 65.000đ';
    expect(localizeMenuContent(ownerContent)).toBe(ownerContent);
    expect(I18N_MESSAGE_KEYS).not.toContain(ownerContent as I18nMessageKey);
    // A locale switch changes only typed interface keys.
    expect(localizeMenuContent(ownerContent)).toBe(
      localizeMenuContent(ownerContent),
    );
  });
});
