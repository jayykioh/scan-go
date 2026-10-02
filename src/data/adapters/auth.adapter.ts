import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import type {
  BootstrapTenantResult,
  StaffPinDeniedState,
  StaffPinDenialReason,
  StaffPinVerifyInput,
  StaffPinVerifyResult,
  StaffSession,
  StaffSessionStatus,
} from '@contracts/identity.contract';
import type { SessionRevokeResult } from '@contracts/authorization.contract';
import type { StaffAccount } from '../../types';
import {
  getFirebaseAuth,
  getFirebaseFunctions,
} from '../../services/firebase/client';
import { bootstrapTenant } from './tenant.adapter';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'Email này đã được đăng ký.',
  'auth/invalid-email': 'Email không hợp lệ.',
  'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự.',
  'auth/user-not-found': 'Email hoặc mật khẩu không đúng.',
  'auth/wrong-password': 'Email hoặc mật khẩu không đúng.',
  'auth/invalid-credential': 'Email hoặc mật khẩu không đúng.',
  'auth/too-many-requests':
    'Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.',
  'auth/network-request-failed': 'Lỗi kết nối. Kiểm tra mạng của bạn.',
  'auth/operation-not-allowed':
    'Đăng nhập bằng email và mật khẩu chưa được bật.',
};

const GENERIC_AUTH_ERROR_MESSAGE = 'Đã xảy ra lỗi. Vui lòng thử lại.';

/**
 * Map a Firebase Auth or callable error to a stable, user-facing message. The
 * server message wins for callable errors so Owner registration guidance from
 * the backend survives.
 */
export function mapAuthError(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      const known = AUTH_ERROR_MESSAGES[code];
      if (known) {
        return known;
      }
    }
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return GENERIC_AUTH_ERROR_MESSAGE;
}

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

export interface OwnerSignInSession {
  user: User;
  tenant: BootstrapTenantResult;
}

/**
 * Sign in an existing Owner and restore the Tenant session. The callable Tenant
 * bootstrap is idempotent, so a returning Owner keeps the existing first Tenant
 * and never creates another one (REQ-AUTH-001, REQ-TEN-001).
 */
export async function signInOwnerAndRestoreTenant(
  email: string,
  password: string,
): Promise<OwnerSignInSession> {
  const user = await signInWithEmail(email, password);
  const tenant = await bootstrapTenant();
  return { user, tenant };
}

/**
 * A Staff session in the shape the UI renders. The view model derives role
 * booleans from the server-issued `StaffSession.roles` list. The plaintext PIN
 * is never part of this model and never enters client storage (REQ-AUTH-002).
 */
export interface StaffSessionView {
  sessionId: string;
  tenantId: string;
  uid: string;
  deviceId: string;
  name: string;
  roles: {
    isKitchen: boolean;
    isWaiter: boolean;
    isCashier: boolean;
  };
  permissions: string[];
  sessionVersion: number;
  status: StaffSessionStatus;
}

export function toStaffSessionView(
  session: StaffSession,
  displayName?: string | null,
): StaffSessionView {
  const roleSet = new Set(session.roles);
  const name = displayName?.trim();
  return {
    sessionId: session.sessionId,
    tenantId: session.tenantId,
    uid: session.uid,
    deviceId: session.deviceId,
    name: name && name.length > 0 ? name : session.uid,
    roles: {
      isKitchen: roleSet.has('kitchen'),
      isWaiter: roleSet.has('waiter'),
      isCashier: roleSet.has('cashier'),
    },
    permissions: [...session.permissions],
    sessionVersion: session.sessionVersion,
    status: session.status,
  };
}

const STAFF_PIN_VERIFY_CALLABLE = 'callableAuthStaffPinVerify';
const STAFF_REVOKE_CALLABLE = 'callableAuthRevokeStaffSessions';

function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  return functions;
}

/**
 * Send the plaintext PIN to the server over the callable and return only the
 * server-issued Staff session. The browser never stores the PIN and never
 * decides the result; the server verifies the hashed membership PIN, the
 * lockout state, and the tenant scope (REQ-AUTH-002, NFR-SEC-001).
 */
export async function verifyStaffPin(
  input: StaffPinVerifyInput,
): Promise<StaffSession> {
  const callable = httpsCallable<StaffPinVerifyInput, StaffPinVerifyResult>(
    requireFunctions(),
    STAFF_PIN_VERIFY_CALLABLE,
  );
  const result = await callable(input);
  return result.data.session;
}

/**
 * Owner command that revokes every Staff session for one membership by
 * increasing `sessionVersion` (REQ-AUTH-002).
 */
export async function revokeStaffSessions(
  tenantId: string,
  uid: string,
): Promise<SessionRevokeResult> {
  const callable = httpsCallable<
    { tenantId: string; uid: string },
    SessionRevokeResult
  >(requireFunctions(), STAFF_REVOKE_CALLABLE);
  const result = await callable({ tenantId, uid });
  return result.data;
}

/**
 * Map a rejected PIN verification to the frozen `StaffPinDeniedState`. The
 * server message is authoritative; the client only derives a coarse reason and
 * renders the denied state (REQ-AUTH-002).
 */
export function toStaffPinDeniedState(error: unknown): StaffPinDeniedState {
  const code =
    typeof error === 'object' && error !== null
      ? String((error as { code?: unknown }).code ?? '')
      : '';
  const serverMessage =
    typeof error === 'object' && error !== null
      ? String((error as { message?: unknown }).message ?? '')
      : '';
  const details =
    typeof error === 'object' && error !== null
      ? ((error as { details?: unknown }).details as
          | Record<string, unknown>
          | undefined)
      : undefined;

  const remainingAttempts =
    typeof details?.remainingAttempts === 'number'
      ? details.remainingAttempts
      : null;
  const lockedUntil =
    typeof details?.lockedUntil === 'string' ? details.lockedUntil : null;

  // The server collapses inactive and cross-tenant denials into one message so
  // the client cannot enumerate tenants. Only malformed and locked states are
  // distinguishable; everything else is a generic invalid-PIN denial.
  let reason: StaffPinDenialReason = 'invalid_pin';
  if (code.includes('invalid-argument')) {
    reason = 'malformed';
  } else if (code.includes('unauthenticated')) {
    reason = 'inactive';
  } else if (lockedUntil !== null) {
    reason = 'locked';
  } else if (serverMessage.includes('không thuộc cửa hàng')) {
    reason = 'cross_tenant';
  }

  const message =
    serverMessage.trim().length > 0
      ? serverMessage
      : 'Mã PIN không đúng.';

  const denied: StaffPinDeniedState = {
    reason,
    message,
    remainingAttempts,
    lockedUntil,
  };
  return denied;
}

/**
 * The only Staff account data the browser may persist. The plaintext PIN is
 * stripped before `localStorage` (NFR-PRIV-001, RULES_FIREBASE anti-patterns).
 */
export function toPersistedStaffAccounts(
  accounts: readonly StaffAccount[],
): Array<Omit<StaffAccount, 'pin'>> {
  return accounts.map(({ pin: _pin, ...account }) => account);
}

/**
 * Rehydrate persisted Staff accounts. Any legacy plaintext PIN on disk is
 * discarded instead of loaded into memory.
 */
export function fromPersistedStaffAccounts(value: string): StaffAccount[] {
  const parsed = JSON.parse(value) as unknown[];
  const migrated = parsed
    .map((entry: any): StaffAccount | null => {
      if (entry?.roles) {
        return {
          id: String(entry.id),
          name: String(entry.name || 'Nhân viên'),
          pin: '',
          roles: {
            isKitchen: Boolean(entry.roles.isKitchen),
            isWaiter: Boolean(entry.roles.isWaiter),
            isCashier: Boolean(entry.roles.isCashier),
          },
          isActive: entry.isActive !== false,
        };
      }

      if (entry?.role) {
        const role = String(entry.role).toLowerCase();
        return {
          id: String(entry.id || `staff_${Date.now()}`),
          name: String(entry.name || 'Nhân viên'),
          pin: '',
          roles: {
            isKitchen: role.includes('bếp') || role.includes('đầu'),
            isWaiter: role.includes('phục'),
            isCashier: role.includes('thu') || role.includes('quản'),
          },
          isActive: entry.status !== 'Nghỉ phép',
        };
      }

      return null;
    })
    .filter((entry): entry is StaffAccount => entry !== null);

  return migrated;
}
