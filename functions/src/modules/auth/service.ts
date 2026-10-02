import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  IDENTITY_CONTRACT_VERSION,
  ownerRegistrationInputSchema,
  staffPinVerifyInputSchema,
  type OwnerRegistrationInput,
  type StaffPinPolicySnapshot,
  type StaffPinVerifyInput,
  type StaffSession,
} from '../../../../shared/contracts/identity.contract.js';
import {
  staffAuthorizationRequestSchema,
  staffSessionRevokeInputSchema,
  type StaffAuthorizationRequest,
  type StaffSessionRevokeInput,
} from '../../../../shared/contracts/authorization.contract.js';

export const REGISTRATION_INVALID_MESSAGE = 'Thông tin đăng ký không hợp lệ.';
export const REGISTRATION_EMAIL_REQUIRED_MESSAGE =
  'Tài khoản Owner phải dùng email và mật khẩu.';

export const STAFF_PIN_INVALID_REQUEST_MESSAGE =
  'Yêu cầu xác minh PIN không hợp lệ.';
export const STAFF_PIN_LENGTH_MESSAGE = 'Mã PIN không đúng định dạng.';
export const STAFF_ACCESS_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này hoặc không phải nhân viên.';
export const STAFF_PIN_INCORRECT_MESSAGE = 'Mã PIN không đúng.';
export const STAFF_PIN_LOCKED_MESSAGE =
  'Mã PIN đã bị khoá do sai quá số lần. Vui lòng thử lại sau.';
export const STAFF_AUTHORIZATION_INVALID_MESSAGE =
  'Yêu cầu kiểm tra quyền không hợp lệ.';
export const STAFF_REVOKE_INVALID_MESSAGE =
  'Yêu cầu thu hồi phiên không hợp lệ.';
export const STAFF_REVOKE_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng thu hồi được phiên nhân viên.';
export const STAFF_REVOKE_NOT_FOUND_MESSAGE = 'Không tìm thấy thành viên.';

const PIN_HASH_SCHEME = 'scrypt';
const PIN_HASH_KEY_LENGTH = 32;
const PIN_HASH_SALT_BYTES = 16;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, (error, derived) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derived);
    });
  });
}

/**
 * Hash a Staff PIN with a per-PIN salt. The stored value is
 * `scrypt$<saltHex>$<hashHex>`; the plaintext PIN never enters storage
 * (REQ-AUTH-002, NFR-PRIV-001).
 */
export async function hashPin(pin: string, saltHex?: string): Promise<string> {
  const salt = saltHex
    ? Buffer.from(saltHex, 'hex')
    : randomBytes(PIN_HASH_SALT_BYTES);
  const derived = await scryptAsync(pin, salt, PIN_HASH_KEY_LENGTH);
  return `${PIN_HASH_SCHEME}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/**
 * Constant-time comparison of a candidate PIN against a stored scrypt hash. A
 * missing, malformed, or mismatched hash returns false; it never throws and
 * never exposes the stored value.
 */
export async function verifyPinHash(
  pin: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  if (typeof storedHash !== 'string' || storedHash.length === 0) {
    return false;
  }
  const [scheme, saltHex, hashHex] = storedHash.split('$');
  if (scheme !== PIN_HASH_SCHEME || !saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length === 0) {
    return false;
  }
  const actual = await scryptAsync(pin, Buffer.from(saltHex, 'hex'), expected.length);
  if (actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(actual, expected);
}

export interface PinPolicy {
  length: number;
  maxFailedAttempts: number;
  lockMinutes: number;
  sessionHours: number;
}

export function toPinPolicySnapshot(policy: PinPolicy): StaffPinPolicySnapshot {
  return {
    length: policy.length,
    maxFailedAttempts: policy.maxFailedAttempts,
    lockMinutes: policy.lockMinutes,
    sessionHours: policy.sessionHours,
  };
}

export function isPinLocked(
  pinLockedUntil: string | null | undefined,
  now: Date,
): boolean {
  if (typeof pinLockedUntil !== 'string') {
    return false;
  }
  const until = Date.parse(pinLockedUntil);
  return !Number.isNaN(until) && until > now.getTime();
}

export function pinRemainingAttempts(
  failedAttempts: number,
  maxFailedAttempts: number,
): number {
  return Math.max(0, maxFailedAttempts - failedAttempts);
}

export interface PinFailureState {
  failedAttempts: number;
  lockedUntil: string | null;
}

/**
 * Count one failed PIN attempt. Reaching the configured maximum sets
 * `lockedUntil` to `lockMinutes` after `now`; below the maximum the lock stays
 * clear. Lock state is owned by Auth (REQ-AUTH-002).
 */
export function computePinFailureState(
  previousAttempts: number,
  policy: PinPolicy,
  now: Date,
): PinFailureState {
  const failedAttempts =
    (Number.isFinite(previousAttempts) ? Math.max(0, previousAttempts) : 0) + 1;
  if (failedAttempts >= policy.maxFailedAttempts) {
    return {
      failedAttempts,
      lockedUntil: new Date(
        now.getTime() + policy.lockMinutes * 60_000,
      ).toISOString(),
    };
  }
  return { failedAttempts, lockedUntil: null };
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

export interface BuildStaffSessionInput {
  sessionId?: string;
  tenantId: string;
  uid: string;
  deviceId: string;
  roles: readonly string[];
  permissions: readonly string[];
  sessionVersion: number;
  policy: PinPolicy;
  issuedAt: string;
}

/**
 * Build the tenant-bound Staff session contract. The session binds tenant,
 * device, and `sessionVersion`, and expires after the configured
 * `sessionHours` (REQ-AUTH-002).
 */
export function buildStaffSession(input: BuildStaffSessionInput): StaffSession {
  const sessionId = input.sessionId ?? randomUUID();
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    sessionId,
    tenantId: input.tenantId,
    uid: input.uid,
    deviceId: input.deviceId,
    roles: input.roles.map(String),
    permissions: input.permissions.map(String),
    status: 'active',
    sessionVersion: input.sessionVersion,
    issuedAt: input.issuedAt,
    expiresAt: addHoursIso(input.issuedAt, input.policy.sessionHours),
    lastSeenAt: input.issuedAt,
    endedAt: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    pinPolicy: toPinPolicySnapshot(input.policy),
  };
}

/**
 * Validate the Owner-registration boundary before any Firestore write. A
 * malformed callable payload or invalid field maps to `invalid-argument`.
 */
export function parseOwnerRegistrationInput(
  data: unknown,
): OwnerRegistrationInput {
  const parsed = ownerRegistrationInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', REGISTRATION_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * A Firebase Auth account without an email cannot own a Tenant. Map the missing
 * identity claim to `failed-precondition` before any write.
 */
export function requireRegistrationEmail(email: string | null): string {
  if (!email) {
    throw new HttpsError(
      'failed-precondition',
      REGISTRATION_EMAIL_REQUIRED_MESSAGE,
    );
  }
  return email;
}

export function parseStaffPinVerifyInput(data: unknown): StaffPinVerifyInput {
  const parsed = staffPinVerifyInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', STAFF_PIN_INVALID_REQUEST_MESSAGE);
  }
  return parsed.data;
}

export function parseStaffAuthorizationInput(
  data: unknown,
): StaffAuthorizationRequest {
  const parsed = staffAuthorizationRequestSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      STAFF_AUTHORIZATION_INVALID_MESSAGE,
    );
  }
  return parsed.data;
}

export function parseStaffSessionRevokeInput(
  data: unknown,
): StaffSessionRevokeInput {
  const parsed = staffSessionRevokeInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', STAFF_REVOKE_INVALID_MESSAGE);
  }
  return parsed.data;
}
