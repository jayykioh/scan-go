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
import { invalidateReadCache } from '../readCache';

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

export async function selectActiveTenant(
  tenantId: string,
): Promise<SelectActiveTenantResult> {
  const result = await call<SelectActiveTenantResult>(
    'callableTenantSelectActive',
    { tenantId },
  );
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (uid) {
    invalidateReadCache({ userId: uid, pathPrefix: `users/${uid}` });
  }
  return result;
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

/** Observe the signed-in user's navigation-only active Tenant field. */
export function subscribeActiveTenantId(
  uid: string,
  onChange: (tenantId: string | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange(null);
    onError?.(new Error('Firebase chưa được cấu hình.'));
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'users', uid),
    (snapshot) => {
      const value = snapshot.exists() ? snapshot.get('activeTenantId') : null;
      onChange(typeof value === 'string' && value.length > 0 ? value : null);
    },
    (error) => onError?.(error),
  );
}

export interface ActiveMembershipReadContext {
  isActive: boolean;
  membershipType: string | null;
  roles: string[];
  sessionVersion: number | null;
  /**
   * Areas this member is assigned to (REQ-TBL-010). Empty means no area scope:
   * the member keeps the tenant-wide table read. Server-written projection.
   */
  assignedAreas: string[];
}

/** Observe the caller's own membership so role revocation clears cached reads. */
export function subscribeCurrentMembership(
  tenantId: string,
  uid: string,
  onChange: (membership: ActiveMembershipReadContext | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange(null);
    onError?.(new Error('Firebase chưa được cấu hình.'));
    return () => undefined;
  }
  return onSnapshot(
    doc(db, 'tenants', tenantId, 'members', uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }
      const roles = snapshot.get('roles');
      const sessionVersion = snapshot.get('sessionVersion');
      const assignedAreas = snapshot.get('assignedAreas');
      onChange({
        isActive: snapshot.get('isActive') !== false,
        membershipType:
          typeof snapshot.get('membershipType') === 'string'
            ? snapshot.get('membershipType')
            : null,
        roles: Array.isArray(roles) ? roles.map(String).sort() : [],
        sessionVersion:
          typeof sessionVersion === 'number' ? sessionVersion : null,
        assignedAreas: Array.isArray(assignedAreas)
          ? assignedAreas
              .filter((area): area is string => typeof area === 'string')
              .sort()
          : [],
      });
    },
    (error) => onError?.(error),
  );
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
