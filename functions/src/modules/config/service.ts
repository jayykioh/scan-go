import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore } from 'firebase-admin/firestore';
import {
  tenantConfigOverrideInputSchema,
  type ResolvedConfig,
  type TenantConfigOverrideInput,
} from '../../../../shared/contracts/config.contract.js';
import { resolveConfig } from '../../../../shared/config/resolve.js';
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

  const adminRaw = platformSnap.exists ? platformSnap.get('values') : null;
  const allowedRaw = platformSnap.exists
    ? platformSnap.get('allowedTenantOverrideKeys')
    : null;
  const tenantRaw = tenantSnap.exists
    ? tenantSnap.get('configOverrides')
    : null;

  return {
    admin: isPlainObject(adminRaw) ? adminRaw : null,
    tenant: isPlainObject(tenantRaw) ? tenantRaw : null,
    allowedTenantOverrideKeys: Array.isArray(allowedRaw)
      ? allowedRaw.map(String)
      : null,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
  try {
    return resolveConfig({
      admin: layers.admin,
      tenant: layers.tenant,
      allowedTenantOverrideKeys: layers.allowedTenantOverrideKeys,
    });
  } catch (error) {
    if (error instanceof AppError) {
      throw new HttpsError('invalid-argument', error.message);
    }
    throw error;
  }
}
