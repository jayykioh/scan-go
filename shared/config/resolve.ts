import {
  CONFIG_CONTRACT_VERSION,
  configValuesSchema,
  tenantOverridableConfigKeys,
  type ConfigSource,
  type ResolvedConfig,
} from '../contracts/config.contract.js';
import { CONFIG_DEFAULTS } from './defaults.js';
import { AppError, ERROR_CODES } from '../errors.js';

export interface ResolveConfigInput {
  admin?: Record<string, unknown> | null;
  tenant?: Record<string, unknown> | null;
  allowedTenantOverrideKeys?: readonly string[] | null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectDefaultLeafSources(
  value: unknown,
  sources: Record<string, ConfigSource>,
  prefix = '',
): void {
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      collectDefaultLeafSources(child, sources, path);
    }
    return;
  }
  if (prefix) {
    sources[prefix] = 'default';
  }
}

function mergeLayer(
  base: Record<string, unknown>,
  layer: Record<string, unknown>,
  source: ConfigSource,
  sources: Record<string, ConfigSource>,
  prefix = '',
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(layer)) {
    if (value === undefined) {
      continue;
    }
    const path = prefix ? `${prefix}.${key}` : key;
    const current = result[key];
    if (isPlainObject(value) && isPlainObject(current)) {
      result[key] = mergeLayer(current, value, source, sources, path);
      continue;
    }
    result[key] = value;
    sources[path] = source;
  }
  return result;
}

export function resolveConfig(input: ResolveConfigInput = {}): ResolvedConfig {
  const allowed =
    input.allowedTenantOverrideKeys && input.allowedTenantOverrideKeys.length > 0
      ? [...input.allowedTenantOverrideKeys]
      : [...tenantOverridableConfigKeys];

  const sources: Record<string, ConfigSource> = {};
  const base = CONFIG_DEFAULTS as unknown as Record<string, unknown>;
  collectDefaultLeafSources(base, sources);

  let merged: Record<string, unknown> = { ...base };

  if (isPlainObject(input.admin)) {
    merged = mergeLayer(merged, input.admin, 'admin', sources);
  }

  if (isPlainObject(input.tenant)) {
    const allowedSet = new Set(allowed);
    for (const key of Object.keys(input.tenant)) {
      if (!allowedSet.has(key)) {
        throw new AppError(
          ERROR_CODES.invalidArgument,
          `Không được phép ghi đè cấu hình: ${key}`,
        );
      }
    }
    merged = mergeLayer(merged, input.tenant, 'tenant', sources);
  }

  const parsed = configValuesSchema.safeParse(merged);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.invalidArgument, 'Giá trị cấu hình không hợp lệ.');
  }

  return {
    schemaVersion: CONFIG_CONTRACT_VERSION,
    values: parsed.data,
    sources,
    allowedTenantOverrideKeys: allowed,
  };
}
