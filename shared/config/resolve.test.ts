import { describe, expect, it } from 'vitest';
import {
  CONFIG_CONTRACT_VERSION,
  resolvedConfigSchema,
} from '../contracts/config.contract.js';
import { CONFIG_DEFAULTS } from './defaults.js';
import {
  resolveAllowedTenantOverrideKeys,
  resolveConfig,
} from './resolve.js';
import { AppError } from '../errors.js';
import {
  adminConfigLayerFixture,
  defaultResolvedConfigFixture,
  tenantConfigLayerFixture,
  tenantWinsResolvedConfigFixture,
} from '../fixtures/config.fixture.js';

describe('resolveConfig', () => {
  it('returns typed defaults with source "default"', () => {
    const resolved = resolveConfig();

    expect(resolved.schemaVersion).toBe(CONFIG_CONTRACT_VERSION);
    expect(resolved.values.locale).toBe(CONFIG_DEFAULTS.locale);
    expect(resolved.values.timezone).toBe(CONFIG_DEFAULTS.timezone);
    expect(resolved.values.pinPolicy.length).toBe(
      CONFIG_DEFAULTS.pinPolicy.length,
    );
    expect(resolved.sources.locale).toBe('default');
    expect(resolved.sources['pinPolicy.length']).toBe('default');
  });

  it('marks an ADMIN layer value with source "admin"', () => {
    const resolved = resolveConfig({ admin: adminConfigLayerFixture });

    expect(resolved.values.timezone).toBe('Asia/Bangkok');
    expect(resolved.sources.timezone).toBe('admin');
  });

  it('lets the allowed tenant value win with source "tenant"', () => {
    const resolved = resolveConfig({
      admin: adminConfigLayerFixture,
      tenant: tenantConfigLayerFixture,
    });

    expect(resolved.values.timezone).toBe('Asia/Tokyo');
    expect(resolved.values.locale).toBe('en');
    expect(resolved.sources.timezone).toBe('tenant');
    expect(resolved.sources.locale).toBe('tenant');
  });

  it('lets an allowed tenant pinPolicy value win with source "tenant"', () => {
    const resolved = resolveConfig({
      tenant: { pinPolicy: { length: 4, lockMinutes: 30 } },
    });

    expect(resolved.values.pinPolicy.length).toBe(4);
    expect(resolved.values.pinPolicy.lockMinutes).toBe(30);
    expect(resolved.sources['pinPolicy.length']).toBe('tenant');
    expect(resolved.sources['pinPolicy.maxFailedAttempts']).toBe('default');
  });

  it('denies a forbidden tenant override key', () => {
    expect(() =>
      resolveConfig({ tenant: { currency: 'USD' } }),
    ).toThrow(AppError);
  });

  it('denies an invalid configuration value', () => {
    expect(() =>
      resolveConfig({ admin: { pinPolicy: { length: 'six' } } }),
    ).toThrow(AppError);
  });

  it('rejects an unknown top-level key through the strict schema', () => {
    expect(() => resolveConfig({ admin: { feature: true } })).toThrow(AppError);
  });

  it('records a leaf source for every resolved value', () => {
    const resolved = resolveConfig({
      admin: { timezone: 'Asia/Bangkok' },
      tenant: { pinPolicy: { length: 4 } },
    });

    expect(resolved.sources['pinPolicy.length']).toBe('tenant');
    expect(resolved.sources['pinPolicy.maxFailedAttempts']).toBe('default');
    expect(resolved.sources.timezone).toBe('admin');
    expect(resolved.sources['backup.retentionDays']).toBe('default');
    expect(resolved.sources['retention.years']).toBe('default');
  });

  it('treats an empty allowed-key list as no tenant overrides', () => {
    expect(() =>
      resolveConfig({
        tenant: { locale: 'en' },
        allowedTenantOverrideKeys: [],
      }),
    ).toThrow(AppError);
  });

  it('filters unapproved keys out of a stored allowed-key list', () => {
    const resolved = resolveConfig({
      tenant: { locale: 'en' },
      allowedTenantOverrideKeys: ['locale', 'currency'],
    });

    expect(resolved.values.locale).toBe('en');
    expect(resolved.allowedTenantOverrideKeys).toEqual(['locale']);
  });
});

describe('resolveAllowedTenantOverrideKeys', () => {
  it('falls back to the approved keys when no list is stored', () => {
    expect(resolveAllowedTenantOverrideKeys(null)).toEqual([
      'locale',
      'timezone',
      'pinPolicy',
      'ai',
    ]);
  });

  it('keeps an explicit empty list empty', () => {
    expect(resolveAllowedTenantOverrideKeys([])).toEqual([]);
  });

  it('removes unapproved keys from a stored list', () => {
    expect(
      resolveAllowedTenantOverrideKeys(['locale', 'currency', 'backup']),
    ).toEqual(['locale']);
  });
});

describe('config fixtures', () => {
  it('default fixture parses against the resolved contract', () => {
    const fixture = defaultResolvedConfigFixture();
    expect(() => resolvedConfigSchema.parse(fixture)).not.toThrow();
    expect(fixture.sources.timezone).toBe('default');
  });

  it('tenant fixture parses and shows the tenant source', () => {
    const fixture = tenantWinsResolvedConfigFixture();
    expect(() => resolvedConfigSchema.parse(fixture)).not.toThrow();
    expect(fixture.sources.locale).toBe('tenant');
  });
});
