import {
  resolvedConfigSchema,
  type ResolvedConfig,
} from '../contracts/config.contract.js';
import { resolveConfig } from '../config/resolve.js';

export const adminConfigLayerFixture: Record<string, unknown> = {
  timezone: 'Asia/Bangkok',
};

export const tenantConfigLayerFixture: Record<string, unknown> = {
  locale: 'en',
  timezone: 'Asia/Tokyo',
};

export const invalidTenantConfigLayerFixture: Record<string, unknown> = {
  currency: 'USD',
};

export function defaultResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig();
}

export function adminResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig({ admin: adminConfigLayerFixture });
}

export function tenantWinsResolvedConfigFixture(): ResolvedConfig {
  return resolveConfig({
    admin: adminConfigLayerFixture,
    tenant: tenantConfigLayerFixture,
  });
}

export function parseResolvedConfigFixture(value: unknown): ResolvedConfig {
  return resolvedConfigSchema.parse(value);
}
