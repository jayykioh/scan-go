import { HttpsError } from 'firebase-functions/v2/https';
import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import {
  IDENTITY_CONTRACT_VERSION,
  tenantBootstrapInputSchema,
  tenantCreateInputSchema,
  tenantListMembershipsInputSchema,
  tenantSelectActiveInputSchema,
  type FirebaseIdentity,
  type Membership,
  type TenantBootstrapInput,
  type TenantCreateInput,
  type TenantListMembershipsInput,
  type TenantSelectActiveInput,
} from '../../../../shared/contracts/identity.contract.js';
import {
  AUTHORIZATION_CONTRACT_VERSION,
  CUSTOMER_PHONE_PERMISSION,
  CUSTOMER_PHONE_QUERY_LIMIT,
  customerPhoneQueryInputSchema,
  type AuthorizationDecision,
  type CustomerPhoneQueryInput,
  type CustomerPhoneRecord,
} from '../../../../shared/contracts/authorization.contract.js';
import {
  buildOnboardingChecklist,
  markOnboardingStepComplete,
  onboardingCompletionSchema,
  onboardingStateInputSchema,
  onboardingUpdateInputSchema,
  type OnboardingChecklist,
  type OnboardingCompletion,
  type OnboardingStateInput,
  type OnboardingUpdateInput,
} from '../../../../shared/contracts/onboarding.contract.js';

export const DEFAULT_TENANT_NAME = 'Cửa hàng của tôi';
export const DEFAULT_INDUSTRY = 'quan_an';
export const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Explicit upper bound for one Owner's membership list. The read is bounded so
 * a Tenant-heavy account can never produce an unbounded collection-group scan.
 */
export const LIST_MEMBERSHIPS_LIMIT = 50;

export function nowIso(): string {
  return new Date().toISOString();
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

export function readEmail(
  token: Record<string, unknown> | undefined,
): string | null {
  return readString(token?.email);
}

export function readPhoneNumber(
  token: Record<string, unknown> | undefined,
): string | null {
  return readString(token?.phone_number);
}

export function mapIdentity(
  uid: string,
  data: DocumentData,
  isAdmin: boolean,
): FirebaseIdentity {
  const createdAt = readString(data.createdAt) ?? nowIso();
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    uid,
    email: readString(data.email),
    phoneNumber: readString(data.phoneNumber),
    displayName: readString(data.displayName),
    locale: data.locale === 'en' ? 'en' : 'vi',
    activeTenantId: readString(data.activeTenantId),
    isAdmin,
    createdAt,
    updatedAt: readString(data.updatedAt) ?? createdAt,
  };
}

export function mapMembership(
  tenantId: string,
  uid: string,
  data: DocumentData,
): Membership {
  const createdAt = readString(data.createdAt) ?? nowIso();
  const roles = Array.isArray(data.roles) ? data.roles.map(String) : [];
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.map(String)
    : [];
  return {
    schemaVersion: IDENTITY_CONTRACT_VERSION,
    tenantId,
    uid,
    membershipType: data.membershipType === 'staff' ? 'staff' : 'owner',
    roles,
    permissions,
    isActive: data.isActive !== false,
    sessionVersion:
      typeof data.sessionVersion === 'number' ? data.sessionVersion : 1,
    lastLoginAt: readString(data.lastLoginAt),
    createdAt,
    updatedAt: readString(data.updatedAt) ?? createdAt,
  };
}

export const TENANT_SELECT_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';

/**
 * Active-Tenant selection gate. The server verifies an active membership for
 * the selected Tenant before it writes `users/{uid}.activeTenantId`. A missing
 * or inactive membership rejects, and because the caller never writes, the
 * prior `activeTenantId` stays unchanged. `activeTenantId` is navigation state
 * only and never authorizes access (REQ-TEN-001, REQ-ACL-001).
 */
export function requireActiveMembership(membership: DocumentData | undefined): void {
  if (!membership || membership.isActive === false) {
    throw new HttpsError('permission-denied', TENANT_SELECT_DENIED_MESSAGE);
  }
}

/** The Tenant-owned membership fields that an authorization decision reads. */
export interface AuthorizationMembership {
  isActive: boolean;
  membershipType: 'owner' | 'staff';
  roles: string[];
  permissions: string[];
  sessionVersion: number;
}

export function mapAuthorizationMembership(
  data: DocumentData | undefined,
): AuthorizationMembership | undefined {
  if (!data) {
    return undefined;
  }
  return {
    isActive: data.isActive !== false,
    membershipType: data.membershipType === 'staff' ? 'staff' : 'owner',
    roles: Array.isArray(data.roles) ? data.roles.map(String) : [],
    permissions: Array.isArray(data.permissions)
      ? data.permissions.map(String)
      : [],
    sessionVersion:
      typeof data.sessionVersion === 'number' ? data.sessionVersion : 1,
  };
}

export interface DecideAuthorizationInput {
  uid: string;
  tenantId: string | null;
  permission: string | null;
  sessionVersion: number | null;
  membership: AuthorizationMembership | undefined;
  isAdmin: boolean;
  decidedAt: string;
}

/**
 * The server authorization decision matrix (REQ-ACL-001, NFR-SEC-001,
 * NFR-PRIV-001). ADMIN bypasses tenant membership but stays audited. A Staff
 * operation requires an active membership, the current session version, a
 * named role, and the requested permission in the Owner-reduced permission set.
 */
export function decideAuthorization(
  input: DecideAuthorizationInput,
): AuthorizationDecision {
  const base = {
    schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
    uid: input.uid,
    tenantId: input.tenantId,
    permission: input.permission,
    isAdmin: input.isAdmin,
    decidedAt: input.decidedAt,
  } as const;

  if (input.isAdmin) {
    return {
      ...base,
      allowed: true,
      reason: 'admin_bypass',
      role: 'admin',
      grantedPermissions: [],
      isAdminBypass: true,
      isAudited: true,
    };
  }

  const membership = input.membership;
  if (!membership) {
    return {
      ...base,
      allowed: false,
      reason: 'no_membership',
      role: null,
      grantedPermissions: [],
      isAdminBypass: false,
      isAudited: false,
    };
  }

  const role = membership.roles[0] ?? null;
  const grantedPermissions = [...membership.permissions];

  if (!membership.isActive) {
    return {
      ...base,
      allowed: false,
      reason: 'inactive_membership',
      role,
      grantedPermissions,
      isAdminBypass: false,
      isAudited: false,
    };
  }

  if (
    input.sessionVersion === null ||
    !isSessionVersionCurrent(membership.sessionVersion, input.sessionVersion)
  ) {
    return {
      ...base,
      allowed: false,
      reason: 'session_revoked',
      role,
      grantedPermissions,
      isAdminBypass: false,
      isAudited: false,
    };
  }

  if (
    !role ||
    !input.permission ||
    !grantedPermissions.includes(input.permission)
  ) {
    return {
      ...base,
      allowed: false,
      reason: 'missing_permission',
      role,
      grantedPermissions,
      isAdminBypass: false,
      isAudited: false,
    };
  }

  return {
    ...base,
    allowed: true,
    reason: 'allowed',
    role,
    grantedPermissions,
    isAdminBypass: false,
    isAudited: false,
  };
}

/**
 * Owner session revocation increments `sessionVersion` on the membership.
 * Every previously issued Staff session then fails the authorization check
 * (REQ-AUTH-002).
 */
export function computeNextSessionVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0
    ? current + 1
    : 1;
}

export function isSessionVersionCurrent(
  membershipVersion: number,
  sessionVersion: number,
): boolean {
  return membershipVersion === sessionVersion;
}

export const TENANT_CREATE_INVALID_MESSAGE = 'Tên cửa hàng không hợp lệ.';
export const TENANT_BOOTSTRAP_INVALID_MESSAGE =
  'Yêu cầu khởi tạo cửa hàng không hợp lệ.';
export const TENANT_LIST_INVALID_MESSAGE =
  'Yêu cầu tải danh sách cửa hàng không hợp lệ.';
export const TENANT_SELECT_INVALID_MESSAGE =
  'Yêu cầu chọn cửa hàng không hợp lệ.';

/**
 * Validate the Tenant-create boundary before any Firestore write. A malformed
 * payload, a missing name, or an over-long name maps to `invalid-argument`.
 */
export function parseTenantCreateInput(data: unknown): TenantCreateInput {
  const parsed = tenantCreateInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_CREATE_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * Validate the bootstrap boundary. Bootstrap takes no business input, so any
 * client-supplied field is rejected as `invalid-argument` before any write.
 */
export function parseTenantBootstrapInput(data: unknown): TenantBootstrapInput {
  const parsed = tenantBootstrapInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_BOOTSTRAP_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * Validate the membership-list boundary. The list takes no business input, so
 * unknown fields map to `invalid-argument`.
 */
export function parseTenantListMembershipsInput(
  data: unknown,
): TenantListMembershipsInput {
  const parsed = tenantListMembershipsInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_LIST_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * Validate the active-Tenant selection boundary. A missing or empty `tenantId`,
 * or any unknown field, maps to `invalid-argument` before the membership read.
 */
export function parseTenantSelectActiveInput(
  data: unknown,
): TenantSelectActiveInput {
  const parsed = tenantSelectActiveInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_SELECT_INVALID_MESSAGE);
  }
  return parsed.data;
}

export const TENANT_CUSTOMER_PHONE_INVALID_MESSAGE =
  'Yêu cầu truy vấn số điện thoại không hợp lệ.';

/**
 * Validate the Customer-phone query boundary before the membership read. The
 * `tenantId` is mandatory and unknown fields map to `invalid-argument`
 * (NFR-PRIV-001).
 */
export function parseCustomerPhoneQueryInput(
  data: unknown,
): CustomerPhoneQueryInput {
  const parsed = customerPhoneQueryInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError(
      'invalid-argument',
      TENANT_CUSTOMER_PHONE_INVALID_MESSAGE,
    );
  }
  return parsed.data;
}

export function resolveCustomerPhoneQueryLimit(
  input: CustomerPhoneQueryInput,
): number {
  return input.limit ?? CUSTOMER_PHONE_QUERY_LIMIT;
}

export function buildTenantDocument(
  now: string,
  shopName?: string | null,
): Record<string, unknown> {
  return {
    shopName: readString(shopName)?.trim() || DEFAULT_TENANT_NAME,
    industry: DEFAULT_INDUSTRY,
    timezone: DEFAULT_TIMEZONE,
    pricingTier: 'free',
    paymentMode: 'payLater',
    onboardingChecklist: {},
    configOverrides: {},
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOwnerMembershipDocument(
  uid: string,
  now: string,
): Record<string, unknown> {
  return {
    uid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    staffPinHash: null,
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    sessionVersion: 1,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildOwnerProfile(input: {
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  activeTenantId: string;
  now: string;
  isNewUser?: boolean;
}): Record<string, unknown> {
  const profile: Record<string, unknown> = {
    activeTenantId: input.activeTenantId,
    updatedAt: input.now,
  };
  if (input.email) profile.email = input.email;
  if (input.phoneNumber) profile.phoneNumber = input.phoneNumber;
  if (input.displayName) profile.displayName = input.displayName;
  if (input.isNewUser) {
    profile.locale = 'vi';
    profile.createdAt = input.now;
  }
  return profile;
}

export const TENANT_ONBOARDING_INVALID_MESSAGE =
  'Yêu cầu cập nhật tiến trình thiết lập không hợp lệ.';
export const TENANT_ONBOARDING_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng cập nhật được tiến trình thiết lập.';

/** Parse the onboarding read boundary. Unknown fields map to `invalid-argument`. */
export function parseOnboardingStateInput(data: unknown): OnboardingStateInput {
  const parsed = onboardingStateInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_ONBOARDING_INVALID_MESSAGE);
  }
  return parsed.data;
}

/** Parse the onboarding step-update boundary before any Firestore write. */
export function parseOnboardingUpdateInput(data: unknown): OnboardingUpdateInput {
  const parsed = onboardingUpdateInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', TENANT_ONBOARDING_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * Only the Owner completes onboarding steps. A Staff membership is denied even
 * when it carries an `owner`-like role string (REQ-ONB-001, REQ-ACL-001).
 */
export function assertOwnerMember(memberData: DocumentData | undefined): void {
  assertActiveTenantMembership(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', TENANT_ONBOARDING_DENIED_MESSAGE);
  }
}

function assertActiveTenantMembership(
  memberData: DocumentData | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', TENANT_SELECT_DENIED_MESSAGE);
  }
}

/**
 * Read the stored checklist completion map from a Tenant document. A missing
 * or malformed map is treated as empty, so a new Tenant starts at `shopName`
 * (REQ-ONB-001).
 */
export function readOnboardingCompletion(
  data: DocumentData | undefined,
): OnboardingCompletion {
  const parsed = onboardingCompletionSchema.safeParse(
    data?.onboardingChecklist ?? {},
  );
  return parsed.success ? parsed.data : {};
}

export interface OnboardingProgressResult {
  checklist: OnboardingChecklist;
  nextStep: OnboardingChecklist['nextIncompleteStep'];
}

/**
 * Derive the checklist view for one Tenant document (REQ-ONB-001). The next
 * incomplete step always follows the approved order and a complete checklist
 * reports no next step.
 */
export function buildTenantOnboardingChecklist(
  tenantId: string,
  tenantData: DocumentData | undefined,
  now: string,
): OnboardingChecklist {
  return buildOnboardingChecklist({
    tenantId,
    completion: readOnboardingCompletion(tenantData),
    now,
  });
}

/**
 * Merge one completed step into the stored completion map without moving the
 * first completion timestamp. The returned map is the document field value, so
 * a retry is idempotent (REQ-ONB-001).
 */
export function applyOnboardingStep(
  existing: DocumentData | undefined,
  step: OnboardingUpdateInput['step'],
  completedAt: string,
): OnboardingCompletion {
  return markOnboardingStepComplete(
    readOnboardingCompletion(existing),
    step,
    completedAt,
  );
}

export type BootstrapDecision =
  | { kind: 'provision' }
  | { kind: 'reuse'; tenantId: string; activeTenantId: string };

/**
 * Decide whether Tenant bootstrap must provision the first Tenant or reuse an
 * existing membership. Reuse is idempotent: it never creates a duplicate
 * Tenant and keeps a still-valid `activeTenantId`.
 */
export function decideBootstrap(
  existingTenantIds: readonly string[],
  currentActiveTenantId: string | null,
): BootstrapDecision {
  const tenantIds = existingTenantIds.filter(
    (id) => typeof id === 'string' && id.length > 0,
  );
  if (tenantIds.length === 0) {
    return { kind: 'provision' };
  }
  const activeTenantId =
    currentActiveTenantId && tenantIds.includes(currentActiveTenantId)
      ? currentActiveTenantId
      : tenantIds[0];
  return { kind: 'reuse', tenantId: tenantIds[0], activeTenantId };
}

export interface OwnerProvisionInput {
  uid: string;
  email: string | null;
  phoneNumber: string | null;
  displayName: string | null;
  shopName?: string | null;
  isNewUser?: boolean;
}

export async function provisionOwnerTenant(
  db: Firestore,
  input: OwnerProvisionInput,
): Promise<string> {
  const now = nowIso();
  const tenantRef = db.collection('tenants').doc();

  const batch = db.batch();
  batch.set(tenantRef, buildTenantDocument(now, input.shopName));
  batch.set(
    tenantRef.collection('members').doc(input.uid),
    buildOwnerMembershipDocument(input.uid, now),
  );
  batch.set(
    db.doc(`users/${input.uid}`),
    buildOwnerProfile({
      email: input.email,
      phoneNumber: input.phoneNumber,
      displayName: input.displayName,
      activeTenantId: tenantRef.id,
      now,
      isNewUser: input.isNewUser,
    }),
    { merge: true },
  );
  await batch.commit();

  return tenantRef.id;
}

/**
 * Deterministic document id for the first Tenant of one Owner. Two concurrent
 * first-Tenant provisions derive the same id, so a transaction can serialize
 * them; the second caller reuses the winner's Tenant instead of creating a
 * duplicate (REQ-TEN-001, NFR-DATA-001).
 */
export function firstTenantDocumentId(uid: string): string {
  return `first-${uid}`;
}

export interface FirstTenantProvisionResult {
  tenantId: string;
  created: boolean;
}

/**
 * Provision the first Tenant inside a transaction on the deterministic
 * `first-<uid>` document id. Reads finish before writes. A concurrent duplicate
 * call sees the committed membership on retry and returns `created: false`, so
 * the server never creates two first Tenants.
 */
export async function provisionFirstOwnerTenant(
  db: Firestore,
  input: OwnerProvisionInput,
): Promise<FirstTenantProvisionResult> {
  const tenantId = firstTenantDocumentId(input.uid);
  const tenantRef = db.collection('tenants').doc(tenantId);
  const memberRef = tenantRef.collection('members').doc(input.uid);
  const userRef = db.doc(`users/${input.uid}`);
  const now = nowIso();

  return db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const tenantSnap = await transaction.get(tenantRef);

    if (memberSnap.exists) {
      return { tenantId, created: false };
    }

    if (!tenantSnap.exists) {
      transaction.set(tenantRef, buildTenantDocument(now, input.shopName));
    }
    transaction.set(memberRef, buildOwnerMembershipDocument(input.uid, now));
    transaction.set(
      userRef,
      buildOwnerProfile({
        email: input.email,
        phoneNumber: input.phoneNumber,
        displayName: input.displayName,
        activeTenantId: tenantId,
        now,
        isNewUser: input.isNewUser,
      }),
      { merge: true },
    );

    return { tenantId, created: true };
  });
}

/**
 * Tenant-owned archive/restore mutation plan. ADMIN orchestrates the command,
 * but the Tenant module owns the document shape. ADMIN never writes another
 * module's collection directly; the initiating command calls this plan inside
 * its own transaction (docs/data-model.md §7, docs/module/admin.md).
 */
export interface TenantStatePlan {
  tenantId: string;
  archivedAt: string | null;
  updatedAt: string;
}

export function buildTenantStatePlan(input: {
  tenantId: string;
  archived: boolean;
  now: string;
}): TenantStatePlan {
  return {
    tenantId: input.tenantId,
    archivedAt: input.archived ? input.now : null,
    updatedAt: input.now,
  };
}

export function applyTenantStatePlan(
  transaction: Transaction,
  db: Firestore,
  plan: TenantStatePlan,
): void {
  transaction.set(
    db.doc(`tenants/${plan.tenantId}`),
    { archivedAt: plan.archivedAt, updatedAt: plan.updatedAt },
    { merge: true },
  );
}

/**
 * Decide whether a caller may see Customer phone data. The decision is driven
 * by the same `AuthorizationDecision` contract as every other permission
 * (NFR-PRIV-001). ADMIN bypasses the tenant permission set but is always
 * audited; an active member needs the named `customer.phone.read` permission.
 */
export function decideCustomerPhoneAccess(input: {
  uid: string;
  tenantId: string | null;
  permission?: string | null;
  membership: AuthorizationMembership | undefined;
  isAdmin: boolean;
  decidedAt: string;
}): AuthorizationDecision {
  const permission = input.permission ?? CUSTOMER_PHONE_PERMISSION;
  const base = {
    schemaVersion: AUTHORIZATION_CONTRACT_VERSION,
    uid: input.uid,
    tenantId: input.tenantId,
    permission,
    isAdmin: input.isAdmin,
    decidedAt: input.decidedAt,
  } as const;

  if (input.isAdmin) {
    return {
      ...base,
      allowed: true,
      reason: 'admin_bypass',
      role: 'admin',
      grantedPermissions: [],
      isAdminBypass: true,
      isAudited: true,
    };
  }

  const membership = input.membership;
  if (!membership) {
    return {
      ...base,
      allowed: false,
      reason: 'no_membership',
      role: null,
      grantedPermissions: [],
      isAdminBypass: false,
      isAudited: false,
    };
  }

  const role = membership.roles[0] ?? null;
  const grantedPermissions = [...membership.permissions];

  if (!membership.isActive) {
    return {
      ...base,
      allowed: false,
      reason: 'inactive_membership',
      role,
      grantedPermissions,
      isAdminBypass: false,
      isAudited: false,
    };
  }

  if (!role || !grantedPermissions.includes(permission)) {
    return {
      ...base,
      allowed: false,
      reason: 'missing_permission',
      role,
      grantedPermissions,
      isAdminBypass: false,
      isAudited: false,
    };
  }

  return {
    ...base,
    allowed: true,
    reason: 'allowed',
    role,
    grantedPermissions,
    isAdminBypass: false,
    isAudited: false,
  };
}

export interface CustomerPhoneSourceRecord {
  memberId: string;
  displayName: string | null;
  phone: string | null;
}

/**
 * Field-level filter. The phone value survives only when the authorization
 * decision grants `customer.phone.read`; every other outcome returns an omitted
 * phone and `phoneVisible: false` (NFR-PRIV-001).
 */
export function projectCustomerPhone(
  decision: AuthorizationDecision,
  record: CustomerPhoneSourceRecord,
): CustomerPhoneRecord {
  const visible =
    decision.allowed && decision.permission === CUSTOMER_PHONE_PERMISSION;
  return {
    memberId: record.memberId,
    displayName: record.displayName,
    phone: visible ? record.phone : null,
    phoneVisible: visible && record.phone !== null,
  };
}

export function readMembershipPermissions(data: DocumentData | undefined): string[] {
  return Array.isArray(data?.permissions)
    ? data.permissions.map(String)
    : [];
}
