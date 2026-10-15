import { useEffect, useState } from 'react';
import { getActiveTenantId } from '../data/adapters/tenant.adapter';
import { getFirebaseAuth } from '../services/firebase/client';

export interface ActiveTenantIdState {
  tenantId: string | null;
  /** False until the first read settles, so a screen can wait instead of guessing. */
  resolved: boolean;
}

/**
 * Resolve the active Tenant id for the signed-in identity. Components use this
 * to open bounded realtime listeners. The value is navigation state only; the
 * server re-verifies membership on every command (REQ-TEN-001).
 */
export function useActiveTenantIdState(): ActiveTenantIdState {
  const [state, setState] = useState<ActiveTenantIdState>({
    tenantId: null,
    resolved: false,
  });

  useEffect(() => {
    let cancelled = false;
    const settle = (tenantId: string | null) => {
      if (!cancelled) {
        setState({ tenantId, resolved: true });
      }
    };

    const auth = getFirebaseAuth();
    if (!auth) {
      settle(null);
      return;
    }

    const sync = () => {
      void getActiveTenantId()
        .then((value) => settle(value))
        .catch(() => settle(null));
    };

    sync();
    const unsubscribe = auth.onAuthStateChanged(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return state;
}

export function useActiveTenantId(): string | null {
  return useActiveTenantIdState().tenantId;
}
