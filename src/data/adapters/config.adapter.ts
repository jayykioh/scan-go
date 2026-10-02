import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  TenantConfigOverrideInput,
  TenantVisibleResolvedConfig,
  UpdateTenantConfigResult,
} from '@contracts/config.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

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

/**
 * `platform/config` is not readable by every signed-in user, so the resolved
 * configuration with its leaf source map comes from the Config query
 * callable. The callable authorizes the caller's tenant membership.
 */
export async function getResolvedConfig(): Promise<TenantVisibleResolvedConfig | null> {
  const functions = getFirebaseFunctions();
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!functions || !db || !uid) {
    return null;
  }

  const tenantId = await readActiveTenantId(db, uid);
  if (!tenantId) {
    return null;
  }

  const callable = httpsCallable<{ tenantId: string }, TenantVisibleResolvedConfig>(
    functions,
    'callableConfigGetResolved',
  );
  const result = await callable({ tenantId });
  return result.data;
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
