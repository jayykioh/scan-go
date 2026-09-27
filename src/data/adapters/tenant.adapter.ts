import { httpsCallable } from 'firebase/functions';
import type {
  BootstrapTenantResult,
  ListMembershipsResult,
  SelectActiveTenantResult,
} from '@contracts/identity.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

async function call<T>(
  name: string,
  data?: Record<string, unknown>,
): Promise<T> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  const callable = httpsCallable<Record<string, unknown> | undefined, T>(
    functions,
    name,
  );
  const result = await callable(data);
  return result.data;
}

export function bootstrapTenant(): Promise<BootstrapTenantResult> {
  return call<BootstrapTenantResult>('callableTenantBootstrap');
}

export function createTenant(
  shopName: string,
): Promise<BootstrapTenantResult> {
  return call<BootstrapTenantResult>('callableTenantCreate', { shopName });
}

export function listMemberships(): Promise<ListMembershipsResult> {
  return call<ListMembershipsResult>('callableTenantListMemberships');
}

export function selectActiveTenant(
  tenantId: string,
): Promise<SelectActiveTenantResult> {
  return call<SelectActiveTenantResult>('callableTenantSelectActive', {
    tenantId,
  });
}
