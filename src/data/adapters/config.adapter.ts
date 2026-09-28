import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  ResolvedConfig,
  TenantConfigOverrideInput,
  UpdateTenantConfigResult,
} from '@contracts/config.contract';
import { resolveConfig } from '@shared/config/resolve';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readActiveTenantId(
  db: NonNullable<ReturnType<typeof getFirebaseFirestore>>,
  uid: string,
): Promise<string | null> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) {
    return null;
  }
  const activeTenantId = userSnap.get('activeTenantId');
  return typeof activeTenantId === 'string' ? activeTenantId : null;
}

export async function getResolvedConfig(): Promise<ResolvedConfig | null> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    return null;
  }

  const tenantId = await readActiveTenantId(db, uid);

  const [platformSnap, tenantSnap] = await Promise.all([
    getDoc(doc(db, 'platform', 'config')),
    tenantId ? getDoc(doc(db, 'tenants', tenantId)) : Promise.resolve(null),
  ]);

  const admin = platformSnap.exists() ? platformSnap.get('values') : null;
  const allowedRaw = platformSnap.exists()
    ? platformSnap.get('allowedTenantOverrideKeys')
    : null;
  const tenant =
    tenantSnap && tenantSnap.exists()
      ? tenantSnap.get('configOverrides')
      : null;

  return resolveConfig({
    admin: isPlainObject(admin) ? admin : null,
    tenant: isPlainObject(tenant) ? tenant : null,
    allowedTenantOverrideKeys: Array.isArray(allowedRaw)
      ? allowedRaw.map(String)
      : null,
  });
}

export async function updateTenantConfig(
  overrides: TenantConfigOverrideInput,
): Promise<UpdateTenantConfigResult> {
  const functions = getFirebaseFunctions();
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!functions || !db || !uid) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }

  const tenantId = await readActiveTenantId(db, uid);
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }

  const callable = httpsCallable<
    { tenantId: string; overrides: TenantConfigOverrideInput },
    UpdateTenantConfigResult
  >(functions, 'callableConfigUpdateTenant');
  const result = await callable({ tenantId, overrides });
  return result.data;
}
