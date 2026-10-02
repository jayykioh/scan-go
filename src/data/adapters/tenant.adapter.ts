import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  BootstrapTenantResult,
  ListMembershipsResult,
  SelectActiveTenantResult,
} from '@contracts/identity.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

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

export type Unsubscribe = () => void;

/**
 * Read the active Tenant id from the signed-in identity document. It is
 * navigation state only; every server command re-verifies membership
 * (REQ-TEN-001, NFR-SEC-001).
 */
export async function getActiveTenantId(): Promise<string | null> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    return null;
  }
  const userSnap = await getDoc(doc(db, 'users', uid));
  const activeTenantId = userSnap.get('activeTenantId');
  return typeof activeTenantId === 'string' && activeTenantId.length > 0
    ? activeTenantId
    : null;
}

export interface ActiveTenantContext {
  tenantId: string;
  shopName: string;
  isActive: boolean;
}

export type ActiveTenantContextListener = (
  context: ActiveTenantContext | null,
) => void;

/**
 * Read the active Tenant context from the one allowed Tenant root document.
 * The listener is bounded to a single document; callers must dispose it before
 * opening the next Tenant. `activeTenantId` only chooses this context and never
 * authorizes access (REQ-TEN-001, NFR-SEC-001).
 */
export function subscribeActiveTenantContext(
  tenantId: string,
  listener: ActiveTenantContextListener,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  return onSnapshot(
    doc(db, 'tenants', tenantId),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener(null);
        return;
      }
      const shopName = snapshot.get('shopName');
      listener({
        tenantId,
        shopName: typeof shopName === 'string' ? shopName : '',
        isActive: snapshot.get('archivedAt') == null,
      });
    },
    () => listener(null),
  );
}

export interface ActiveTenantContextHandle {
  select: (tenantId: string) => void;
  dispose: () => void;
  hasActiveListener: () => boolean;
}

/**
 * Keep exactly one bounded active-Tenant listener. `select` disposes the prior
 * listener before it opens the next one, so a Tenant switch replaces the whole
 * active context instead of stacking listeners.
 */
export function createActiveTenantContext(
  open: (
    tenantId: string,
    listener: ActiveTenantContextListener,
  ) => Unsubscribe,
  listener: ActiveTenantContextListener,
): ActiveTenantContextHandle {
  let unsubscribe: Unsubscribe | null = null;
  return {
    select(tenantId: string) {
      unsubscribe?.();
      unsubscribe = open(tenantId, listener);
    },
    dispose() {
      unsubscribe?.();
      unsubscribe = null;
    },
    hasActiveListener() {
      return unsubscribe !== null;
    },
  };
}
