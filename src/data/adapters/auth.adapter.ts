import {
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signOut,
  type ConfirmationResult,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '../../services/firebase/client';

let pendingConfirmation: ConfirmationResult | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

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

export async function startPhoneSignIn(
  phoneNumber: string,
  container: HTMLElement,
): Promise<void> {
  const auth = requireAuth();
  if (import.meta.env.DEV) {
    auth.settings.appVerificationDisabledForTesting = true;
  }
  recaptchaVerifier?.clear();
  recaptchaVerifier = new RecaptchaVerifier(auth, container, {
    size: 'invisible',
  });
  pendingConfirmation = await signInWithPhoneNumber(
    auth,
    phoneNumber,
    recaptchaVerifier,
  );
}

export async function confirmPhoneCode(code: string): Promise<User> {
  if (!pendingConfirmation) {
    throw new Error('Chưa có yêu cầu OTP. Hãy gửi lại mã.');
  }
  const credential = await pendingConfirmation.confirm(code);
  pendingConfirmation = null;
  return credential.user;
}

export async function signOutCurrentUser(): Promise<void> {
  const auth = requireAuth();
  await signOut(auth);
}
