import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  STAFF_CONTRACT_VERSION,
  staffAccountSchema,
  staffDirectoryEntrySchema,
  staffCreateInputSchema,
  staffResetPinInputSchema,
  staffSetActiveInputSchema,
  staffUpdateInputSchema,
  type StaffAccount,
  type StaffDirectoryEntry,
  type StaffCreateInput,
  type StaffResetPinInput,
  type StaffSetActiveInput,
  type StaffUpdateInput,
} from '../../../../shared/contracts/staff.contract.js';

export const STAFF_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được nhân viên.';
export const STAFF_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
export const STAFF_INVALID_MESSAGE = 'Dữ liệu nhân viên không hợp lệ.';
export const STAFF_NOT_FOUND_MESSAGE = 'Không tìm thấy nhân viên.';
export const STAFF_EMAIL_IN_USE_MESSAGE =
  'Email này đã được dùng cho tài khoản khác.';

export function staffPinPolicyMessage(policyLength: number): string {
  return `PIN phải gồm đúng ${policyLength} chữ số theo chính sách của cửa hàng.`;
}

/**
 * The stored PIN must match the resolved `pinPolicy.length` (REQ-AUTH-004).
 * Verification compares the stored hash, so a PIN of any other length could
 * never verify: the mismatch has to be rejected where the PIN is *set*, never
 * where it is checked. Enforced before any Auth account or hash is created.
 */
export function assertPinMatchesPolicy(
  pin: string,
  policyLength: number,
): void {
  if (pin.length !== policyLength) {
    throw new HttpsError(
      'invalid-argument',
      staffPinPolicyMessage(policyLength),
    );
  }
}
export const STAFF_ALREADY_MEMBER_MESSAGE =
  'Tài khoản này đã là thành viên của cửa hàng.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', STAFF_MEMBER_DENIED_MESSAGE);
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', STAFF_OWNER_DENIED_MESSAGE);
  }
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', STAFF_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseStaffCreateInput(data: unknown): StaffCreateInput {
  return parseOrInvalid<StaffCreateInput>(staffCreateInputSchema, data);
}

export function parseStaffUpdateInput(data: unknown): StaffUpdateInput {
  return parseOrInvalid<StaffUpdateInput>(staffUpdateInputSchema, data);
}

export function parseStaffSetActiveInput(data: unknown): StaffSetActiveInput {
  return parseOrInvalid<StaffSetActiveInput>(staffSetActiveInputSchema, data);
}

export function parseStaffResetPinInput(data: unknown): StaffResetPinInput {
  return parseOrInvalid<StaffResetPinInput>(staffResetPinInputSchema, data);
}

export function memberCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/members`;
}

/** Next monotonic session version; a change revokes every prior session. */
export function computeNextSessionVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0
    ? current + 1
    : 1;
}

/**
 * Build the Staff membership document. It carries the Owner-assigned roles,
 * the reduced permission set, and the scrypt PIN hash. The plaintext PIN never
 * enters this document (REQ-AUTH-002, REQ-AUTH-003).
 */
export function buildStaffMembershipDocument(input: {
  uid: string;
  email: string;
  displayName: string;
  roles: readonly string[];
  permissions: readonly string[];
  pinHash: string;
  now: string;
}): Record<string, unknown> {
  return {
    uid: input.uid,
    email: input.email,
    displayName: input.displayName,
    membershipType: 'staff',
    roles: [...input.roles],
    permissions: [...input.permissions],
    isActive: true,
    staffPinHash: input.pinHash,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    sessionVersion: 1,
    lastLoginAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

const KNOWN_ROLES = new Set(['kitchen', 'waiter', 'cashier']);

/** Rebuild the frozen Staff contract from a stored membership document. */
export function toStaffAccount(
  tenantId: string,
  uid: string,
  data: DocumentData,
): StaffAccount {
  const roles = Array.isArray(data.roles)
    ? data.roles.map(String).filter((role) => KNOWN_ROLES.has(role))
    : [];
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.map(String)
    : [];
  const pinHash = data.staffPinHash;
  return staffAccountSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    tenantId,
    uid,
    email: typeof data.email === 'string' ? data.email : null,
    displayName: typeof data.displayName === 'string' ? data.displayName : null,
    roles: roles.length > 0 ? roles : ['cashier'],
    permissions,
    isActive: data.isActive !== false,
    hasPin: typeof pinHash === 'string' && pinHash.length > 0,
    lastLoginAt:
      typeof data.lastLoginAt === 'string' ? data.lastLoginAt : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : nowIso(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso(),
  });
}

/** Build the least-privilege Owner directory row, excluding PIN/permission data. */
export function toStaffDirectoryEntry(
  tenantId: string,
  uid: string,
  data: DocumentData,
): StaffDirectoryEntry {
  const account = toStaffAccount(tenantId, uid, data);
  return staffDirectoryEntrySchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    tenantId,
    uid,
    email: account.email,
    displayName: account.displayName,
    roles: account.roles,
    isActive: account.isActive,
    hasPin: account.hasPin,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  });
}
