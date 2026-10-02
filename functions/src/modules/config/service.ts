import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  platformConfigOverrideInputSchema,
  tenantConfigOverrideInputSchema,
  tenantVisibleConfigSchema,
  type ConfigSource,
  type PlatformConfigOverrideInput,
  type ResolvedConfig,
  type TenantConfigOverrideInput,
  type TenantVisibleResolvedConfig,
} from '../../../../shared/contracts/config.contract.js';
import {
  resolveAllowedTenantOverrideKeys,
  resolveConfig,
} from '../../../../shared/config/resolve.js';
import { AppError } from '../../../../shared/errors.js';

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

export function parseTenantOverrideInput(
  data: unknown,
): TenantConfigOverrideInput {
  const parsed = tenantConfigOverrideInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      'Cấu hình cửa hàng không hợp lệ hoặc chứa khóa bị cấm.',
    );
  }
  return parsed.data;
}

export function parsePlatformOverrideInput(
  data: unknown,
): PlatformConfigOverrideInput {
  const parsed = platformConfigOverrideInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      'Cấu hình nền tảng không hợp lệ hoặc chứa trường bị cấm.',
    );
  }
  return parsed.data;
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readPlainObject(
  value: unknown,
): Record<string, unknown> | null {
  return isPlainObject(value) ? value : null;
}

export interface ConfigLayers {
  admin: Record<string, unknown> | null;
  tenant: Record<string, unknown> | null;
  allowedTenantOverrideKeys: string[] | null;
}

export async function readConfigLayers(
  db: Firestore,
  tenantId: string,
): Promise<ConfigLayers> {
  const [platformSnap, tenantSnap] = await Promise.all([
    db.doc('platform/config').get(),
    db.doc(`tenants/${tenantId}`).get(),
  ]);

  return layersFromSnapshots(
    platformSnap.exists ? platformSnap.data() : undefined,
    tenantSnap.exists ? tenantSnap.get('configOverrides') : undefined,
  );
}

export function layersFromSnapshots(
  platformData: Record<string, unknown> | undefined,
  tenantOverrides: unknown,
): ConfigLayers {
  const adminRaw = platformData ? platformData.values : null;
  const allowedRaw = platformData
    ? platformData.allowedTenantOverrideKeys
    : null;
  return {
    admin: readPlainObject(adminRaw),
    tenant: readPlainObject(tenantOverrides),
    allowedTenantOverrideKeys: Array.isArray(allowedRaw)
      ? allowedRaw.map(String)
      : null,
  };
}

export function mergeOverrideMaps(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) {
      continue;
    }
    const existing = result[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = mergeOverrideMaps(existing, value);
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function resolveTenantConfig(layers: ConfigLayers): ResolvedConfig {
  return resolveWithHttpsError(() =>
    resolveConfig({
      admin: layers.admin,
      tenant: layers.tenant,
      allowedTenantOverrideKeys: layers.allowedTenantOverrideKeys,
    }),
  );
}

export function resolvePlatformConfig(
  layers: Pick<ConfigLayers, 'admin' | 'allowedTenantOverrideKeys'>,
): ResolvedConfig {
  return resolveWithHttpsError(() =>
    resolveConfig({
      admin: layers.admin,
      allowedTenantOverrideKeys: layers.allowedTenantOverrideKeys,
    }),
  );
}

const TENANT_VISIBLE_VALUE_KEYS = [
  'locale',
  'timezone',
  'currency',
  'ai',
] as const;

/**
 * Strip platform-only leaves (`retention`, `backup`, `rateLimit`) and their
 * sources before returning configuration to a tenant member.
 */
export function toTenantVisibleResolvedConfig(
  resolved: ResolvedConfig,
): TenantVisibleResolvedConfig {
  const sources: Record<string, ConfigSource> = {};
  for (const [key, source] of Object.entries(resolved.sources)) {
    if (
      (TENANT_VISIBLE_VALUE_KEYS as readonly string[]).includes(key) ||
      key.startsWith('pinPolicy.') ||
      key.startsWith('ai.')
    ) {
      sources[key] = source;
    }
  }

  return tenantVisibleConfigSchema.parse({
    schemaVersion: resolved.schemaVersion,
    values: {
      locale: resolved.values.locale,
      timezone: resolved.values.timezone,
      currency: resolved.values.currency,
      pinPolicy: resolved.values.pinPolicy,
      ai: resolved.values.ai,
    },
    sources,
    allowedTenantOverrideKeys: resolved.allowedTenantOverrideKeys,
  });
}

function resolveWithHttpsError(resolve: () => ResolvedConfig): ResolvedConfig {
  try {
    return resolve();
  } catch (error) {
    if (error instanceof AppError) {
      throw new HttpsError('invalid-argument', error.message);
    }
    throw error;
  }
}

export function computeNextConfigVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0
    ? current + 1
    : 1;
}

export function resolveAllowedKeys(
  allowedKeys: readonly string[] | null | undefined,
): string[] {
  return [...resolveAllowedTenantOverrideKeys(allowedKeys)];
}

/**
 * Reject a forbidden tenant override key before any write. `allowedKeys`
 * comes from `platform/config`; `null` means the approved defaults apply.
 */
export function assertAllowedTenantOverrideKeys(
  overrides: Record<string, unknown>,
  allowedKeys: readonly string[] | null | undefined,
): void {
  const allowed = new Set(resolveAllowedKeys(allowedKeys));
  for (const key of Object.keys(overrides)) {
    if (!allowed.has(key)) {
      throw new HttpsError(
        'invalid-argument',
        `Không được phép ghi đè cấu hình: ${key}`,
      );
    }
  }
}

export function assertActiveMember(
  memberData: Record<string, unknown> | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      'Bạn không thuộc cửa hàng này.',
    );
  }
}

export function assertActiveOwnerMember(
  memberData: Record<string, unknown> | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      'Chỉ chủ cửa hàng đổi được cấu hình.',
    );
  }
}
