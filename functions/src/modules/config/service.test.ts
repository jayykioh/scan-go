import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  mergeOverrideMaps,
  parseTenantOverrideInput,
  resolveTenantConfig,
} from './service.js';

describe('parseTenantOverrideInput', () => {
  it('accepts the allowed tenant keys', () => {
    expect(
      parseTenantOverrideInput({
        locale: 'en',
        timezone: 'Asia/Tokyo',
        pinPolicy: { length: 4 },
      }),
    ).toEqual({
      locale: 'en',
      timezone: 'Asia/Tokyo',
      pinPolicy: { length: 4 },
    });
  });

  it('denies a forbidden tenant override key', () => {
    expect(() => parseTenantOverrideInput({ currency: 'USD' })).toThrow(
      HttpsError,
    );
  });

  it('denies an invalid tenant override value', () => {
    expect(() => parseTenantOverrideInput({ locale: 'fr' })).toThrow(
      HttpsError,
    );
  });

  it('denies an unknown nested pinPolicy key', () => {
    expect(() =>
      parseTenantOverrideInput({ pinPolicy: { length: 6, foo: 1 } }),
    ).toThrow(HttpsError);
  });
});

describe('mergeOverrideMaps', () => {
  it('merges nested pinPolicy fields', () => {
    expect(
      mergeOverrideMaps(
        { pinPolicy: { length: 6, lockMinutes: 15 } },
        { pinPolicy: { length: 4 } },
      ),
    ).toEqual({ pinPolicy: { length: 4, lockMinutes: 15 } });
  });
});

describe('resolveTenantConfig', () => {
  it('denies a forbidden stored tenant override', () => {
    expect(() =>
      resolveTenantConfig({
        admin: null,
        tenant: { currency: 'USD' },
        allowedTenantOverrideKeys: null,
      }),
    ).toThrow(HttpsError);
  });

  it('resolves stored layers with tenant source', () => {
    const resolved = resolveTenantConfig({
      admin: { timezone: 'Asia/Bangkok' },
      tenant: { timezone: 'Asia/Tokyo' },
      allowedTenantOverrideKeys: ['locale', 'timezone'],
    });
    expect(resolved.values.timezone).toBe('Asia/Tokyo');
    expect(resolved.sources.timezone).toBe('tenant');
  });
});
