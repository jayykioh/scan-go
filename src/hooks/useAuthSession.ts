import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { getFirebaseAuth } from '../services/firebase/client';
import { subscribeToIdentity } from '../data/adapters/auth.adapter';

export interface AuthSessionState {
  configured: boolean;
  loading: boolean;
  user: User | null;
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
