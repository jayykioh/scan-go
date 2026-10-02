import { useEffect, useState } from 'react';
import { getActiveTenantId } from '../data/adapters/tenant.adapter';
import { getFirebaseAuth } from '../services/firebase/client';

/**
 * Resolve the active Tenant id for the signed-in identity. Components use this
 * to open bounded realtime listeners. The value is navigation state only; the
 * server re-verifies membership on every command (REQ-TEN-001).
 */
export function useActiveTenantId(): string | null {
  const [tenantId, setTenantId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const auth = getFirebaseAuth();
    if (!auth) {
      setTenantId(null);
      return;
    }

    const sync = () => {
      void getActiveTenantId()
        .then((value) => {
          if (!cancelled) {
            setTenantId(value);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setTenantId(null);
          }
        });
    };

    sync();
    const unsubscribe = auth.onAuthStateChanged(sync);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return tenantId;
}
