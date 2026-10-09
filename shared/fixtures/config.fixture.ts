import {
  CONFIG_CONTRACT_VERSION,
  resolvedConfigSchema,
  tenantVisibleConfigSchema,
  updatePlatformConfigResultSchema,
  updateTenantConfigResultSchema,
  type PlatformConfigOverrideInput,
  type ResolvedConfig,
  type TenantConfigOverrideInput,
  type TenantVisibleResolvedConfig,
  type UpdatePlatformConfigResult,
  type UpdateTenantConfigResult,
} from '../contracts/config.contract.js';
import { resolveConfig } from '../config/resolve.js';

/** ADMIN product-default layer stored under `platform/config.values`. */
export const adminConfigLayerFixture: Record<string, unknown> = {
  timezone: 'Asia/Bangkok',
};

/** A second ADMIN layer that changes non-tenant-overridable defaults too. */
export const platformConfigLayerFixture: Record<string, unknown> = {
  pinPolicy: { lockMinutes: 30 },
  backup: { retentionDays: 45 },
};

/** Allowed Tenant layer stored under `tenants/{tenantId}.configOverrides`. */
export const tenantConfigLayerFixture: Record<string, unknown> = {
  locale: 'en',
  timezone: 'Asia/Tokyo',
};

/** Forbidden Tenant layer that must be rejected without a write. */
export const invalidTenantConfigLayerFixture: Record<string, unknown> = {
  currency: 'USD',
};

export const tenantOverrideInputFixture: TenantConfigOverrideInput = {
  locale: 'en',
  timezone: 'Asia/Tokyo',
  pinPolicy: { length: 4 },
};

export const platformOverrideInputFixture: PlatformConfigOverrideInput = {
  timezone: 'Asia/Bangkok',
  retention: { years: 7 },
};

export function defaultResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig();
}

export function adminResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig({
    admin: {
      ...adminConfigLayerFixture,
      ...platformConfigLayerFixture,
    },
  });
}

export function tenantWinsResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig({
    admin: adminConfigLayerFixture,
    tenant: tenantConfigLayerFixture,
  });
}

export function tenantConfigUpdateResultFixture(): UpdateTenantConfigResult {
  return updateTenantConfigResultSchema.parse({
    schemaVersion: CONFIG_CONTRACT_VERSION,
    configVersion: 3,
    resolvedConfig: tenantVisibleResolvedConfigFixture(),
  });
}

export function platformConfigUpdateResultFixture(): UpdatePlatformConfigResult {
  return updatePlatformConfigResultSchema.parse({
    schemaVersion: CONFIG_CONTRACT_VERSION,
    configVersion: 2,
    resolvedConfig: adminResolvedConfigFixture(),
  });
}

export function parseResolvedConfigFixture(value: unknown): ResolvedConfig {
  return resolvedConfigSchema.parse(value);
}

/** Tenant-member view: platform-only leaves and their sources are removed. */
export function tenantVisibleResolvedConfigFixture(): TenantVisibleResolvedConfig {
  return tenantVisibleConfigSchema.parse({
    schemaVersion: CONFIG_CONTRACT_VERSION,
    values: {
      locale: 'en',
      timezone: 'Asia/Tokyo',
      currency: 'VND',
      pinPolicy: {
        length: 6,
        maxFailedAttempts: 5,
        lockMinutes: 15,
        sessionHours: 8,
      },
      ai: {
        provider: 'gemini',
        monthlyBudgetVnd: 500000,
        revenueDropPercent: 20,
        lowMarginPercent: 20,
      },
    },
    sources: {
      locale: 'tenant',
      timezone: 'tenant',
      currency: 'default',
      'pinPolicy.length': 'default',
      'pinPolicy.maxFailedAttempts': 'default',
      'pinPolicy.lockMinutes': 'default',
      'pinPolicy.sessionHours': 'default',
      'ai.provider': 'default',
      'ai.monthlyBudgetVnd': 'default',
      'ai.revenueDropPercent': 'default',
      'ai.lowMarginPercent': 'default',
    },
    allowedTenantOverrideKeys: ['locale', 'timezone', 'pinPolicy', 'ai'],
  });
}
