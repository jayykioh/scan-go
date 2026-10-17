import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from '../services/firebase/client';
import { subscribeToIdentity } from '../data/adapters/auth.adapter';

export interface AuthSessionState {
  configured: boolean;
  loading: boolean;
  user: User | null;
}

/** Where a session that already exists belongs instead of an entry screen. */
export const SIGNED_IN_HOME_PATH = '/dashboard';

/**
 * The entry screens (/login, /register) are for a signed-out visitor. A session
 * that has settled goes to its home instead; the Owner console then forwards a
 * Staff membership on to `/staff` (REQ-AUTH-006, REQ-AUTH-007).
 */
export function signedInRedirect(state: AuthSessionState): string | null {
  return state.configured && !state.loading && state.user
    ? SIGNED_IN_HOME_PATH
    : null;
}

export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>(() => {
    const configured = getFirebaseAuth() !== null;
    return { configured, loading: configured, user: null };
  });

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setState({ configured: false, loading: false, user: null });
      return;
    }
    return subscribeToIdentity((user) => {
      setState({ configured: true, loading: false, user });
    });
  }, []);

  return state;
}
