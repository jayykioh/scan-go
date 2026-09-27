import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import type { BootstrapTenantResult } from '@contracts/identity.contract';
import {
  getFirebaseAuth,
  getFirebaseFunctions,
} from '../../services/firebase/client';

function requireAuth() {
  const auth = getFirebaseAuth();
  if (!auth) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  return auth;
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseAuth() !== null;
}

export function subscribeToIdentity(
  listener: (user: User | null) => void,
): () => void {
  const auth = requireAuth();
  return onAuthStateChanged(auth, listener);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<User> {
  const auth = requireAuth();
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    password,
  );
  const name = displayName.trim();
  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }
  return credential.user;
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const auth = requireAuth();
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function registerOwner(
  shopName: string,
  displayName: string | null,
): Promise<BootstrapTenantResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  const callable = httpsCallable<
    { shopName: string; displayName: string | null },
    BootstrapTenantResult
  >(functions, 'callableAuthRegisterOwner');
  const result = await callable({ shopName, displayName });
  return result.data;
}

export async function signOutCurrentUser(): Promise<void> {
  const auth = requireAuth();
  await signOut(auth);
}
