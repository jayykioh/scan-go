import { describe, expect, it } from 'vitest';
import {
  CONFIG_CONTRACT_VERSION,
  configValuesSchema,
  platformConfigOverrideInputSchema,
  resolvedConfigSchema,
  tenantConfigOverrideInputSchema,
  tenantVisibleConfigSchema,
  updatePlatformConfigResultSchema,
  updateTenantConfigResultSchema,
} from './config.contract.js';
import { CONFIG_DEFAULTS } from '../config/defaults.js';
import {
  adminResolvedConfigFixture,
  defaultResolvedConfigFixture,
  platformConfigUpdateResultFixture,
  platformOverrideInputFixture,
  tenantConfigUpdateResultFixture,
  tenantOverrideInputFixture,
  tenantVisibleResolvedConfigFixture,
  tenantWinsResolvedConfigFixture,
} from '../fixtures/config.fixture.js';

describe('configValuesSchema', () => {
  it('accepts the typed defaults', () => {
    expect(configValuesSchema.safeParse(CONFIG_DEFAULTS).success).toBe(true);
  });

  it('rejects an unknown top-level key', () => {
    expect(
      configValuesSchema.safeParse({ ...CONFIG_DEFAULTS, feature: true }).success,
    ).toBe(false);
  });

  it('rejects a non-VND currency and an invalid locale', () => {
    expect(
      configValuesSchema.safeParse({ ...CONFIG_DEFAULTS, currency: 'USD' })
        .success,
    ).toBe(false);
    expect(
      configValuesSchema.safeParse({ ...CONFIG_DEFAULTS, locale: 'fr' }).success,
    ).toBe(false);
  });

  it('rejects an out-of-range PIN length', () => {
    expect(
      configValuesSchema.safeParse({
        ...CONFIG_DEFAULTS,
        pinPolicy: { ...CONFIG_DEFAULTS.pinPolicy, length: 3 },
      }).success,
    ).toBe(false);
  });
});

describe('tenantConfigOverrideInputSchema', () => {
  it('accepts the approved tenant keys', () => {
    expect(
      tenantConfigOverrideInputSchema.safeParse(tenantOverrideInputFixture)
        .success,
    ).toBe(true);
  });

  it('rejects a forbidden key without a write path', () => {
    for (const key of ['currency', 'retention', 'backup', 'rateLimit']) {
      expect(
        tenantConfigOverrideInputSchema.safeParse({ [key]: 'USD' }).success,
      ).toBe(false);
    }
  });

  it('rejects an invalid value and an unknown nested PIN key', () => {
    expect(
      tenantConfigOverrideInputSchema.safeParse({ locale: 'fr' }).success,
    ).toBe(false);
    expect(
      tenantConfigOverrideInputSchema.safeParse({
        pinPolicy: { length: 6, foo: 1 },
      }).success,
    ).toBe(false);
  });
});

describe('platformConfigOverrideInputSchema', () => {
  it('accepts product-default fields', () => {
    expect(
      platformConfigOverrideInputSchema.safeParse(platformOverrideInputFixture)
        .success,
    ).toBe(true);
  });

  it('rejects fixed schemaVersion and currency fields', () => {
    expect(
      platformConfigOverrideInputSchema.safeParse({ schemaVersion: 2 }).success,
    ).toBe(false);
    expect(
      platformConfigOverrideInputSchema.safeParse({ currency: 'USD' }).success,
    ).toBe(false);
  });

  it('rejects an ADMIN attempt to change the tenant allow-list', () => {
    expect(
      platformConfigOverrideInputSchema.safeParse({
        allowedTenantOverrideKeys: ['locale'],
      }).success,
    ).toBe(false);
  });
});

describe('resolvedConfigSchema', () => {
  it('accepts default, ADMIN, and Tenant source fixtures', () => {
    for (const fixture of [
      defaultResolvedConfigFixture(),
      adminResolvedConfigFixture(),
      tenantWinsResolvedConfigFixture(),
    ]) {
      expect(resolvedConfigSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects an unknown source value', () => {
    const fixture = defaultResolvedConfigFixture();
    expect(
      resolvedConfigSchema.safeParse({
        ...fixture,
        sources: { ...fixture.sources, locale: 'cloud' },
      }).success,
    ).toBe(false);
  });
});

describe('tenantVisibleConfigSchema', () => {
  it('accepts the tenant-visible fixture', () => {
    expect(
      tenantVisibleConfigSchema.safeParse(tenantVisibleResolvedConfigFixture())
        .success,
    ).toBe(true);
  });

  it('rejects platform-only values and their sources', () => {
    const fixture = tenantVisibleResolvedConfigFixture();
    expect(
      tenantVisibleConfigSchema.safeParse({
        ...fixture,
        values: { ...fixture.values, retention: { years: 5 } },
      }).success,
    ).toBe(false);
    expect(
      tenantVisibleConfigSchema.safeParse({
        ...fixture,
        sources: { ...fixture.sources, 'retention.years': 'default' },
      }).success,
    ).toBe(false);
  });
});

describe('update result contracts', () => {
  it('accepts the tenant and platform update result fixtures', () => {
    expect(
      updateTenantConfigResultSchema.safeParse(tenantConfigUpdateResultFixture())
        .success,
    ).toBe(true);
    expect(
      updatePlatformConfigResultSchema.safeParse(
        platformConfigUpdateResultFixture(),
      ).success,
    ).toBe(true);
  });

  it('omits platform-only leaves from the tenant update result', () => {
    const tenantResult = tenantConfigUpdateResultFixture();
    expect('retention' in tenantResult.resolvedConfig.values).toBe(false);
    expect('backup' in tenantResult.resolvedConfig.values).toBe(false);
    expect('rateLimit' in tenantResult.resolvedConfig.values).toBe(false);

    const adminResult = platformConfigUpdateResultFixture();
    expect(adminResult.resolvedConfig.values.retention.years).toBeGreaterThan(0);
    expect(
      adminResult.resolvedConfig.values.backup.retentionDays,
    ).toBeGreaterThan(0);
    expect(
      adminResult.resolvedConfig.values.rateLimit.publicOrderPerMinute,
    ).toBeGreaterThan(0);
  });

  it('rejects a negative config version', () => {
    expect(
      updateTenantConfigResultSchema.safeParse({
        ...tenantConfigUpdateResultFixture(),
        configVersion: -1,
      }).success,
    ).toBe(false);
  });

  it('pins the contract version', () => {
    expect(
      updateTenantConfigResultSchema.safeParse({
        ...tenantConfigUpdateResultFixture(),
        schemaVersion: CONFIG_CONTRACT_VERSION + 1,
      }).success,
    ).toBe(false);
  });
});
