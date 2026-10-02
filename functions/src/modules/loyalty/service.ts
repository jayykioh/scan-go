import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import { stableRequestHash } from '../../shared/idempotency.js';
import {
  LOYALTY_CONTRACT_VERSION,
  buildDefaultLoyaltyConfig,
  computeEarnedPoints,
  loyaltyConfigSchema,
  loyaltyEarnInputSchema,
  loyaltyGetConfigInputSchema,
  loyaltyListInputSchema,
  loyaltyMemberIdFor,
  loyaltyMemberSchema,
  loyaltyMemberViewSchema,
  loyaltyRedeemInputSchema,
  loyaltyRegisterInputSchema,
  loyaltyReverseInputSchema,
  loyaltyTransactionSchema,
  loyaltyUpdateConfigInputSchema,
  loyaltyVerifyInputSchema,
  normalizeLoyaltyPhone,
  type LoyaltyConfig,
  type LoyaltyEarnInput,
  type LoyaltyGetConfigInput,
  type LoyaltyListInput,
  type LoyaltyMember,
  type LoyaltyMemberView,
  type LoyaltyRedeemInput,
  type LoyaltyRegisterInput,
  type LoyaltyReverseInput,
  type LoyaltyTransaction,
  type LoyaltyUpdateConfigInput,
  type LoyaltyVerifyInput,
} from '../../../../shared/contracts/loyalty.contract.js';

export const LOYALTY_INVALID_MESSAGE = 'Yêu cầu khách hàng thân thiết không hợp lệ.';
export const LOYALTY_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const LOYALTY_STAFF_DENIED_MESSAGE =
  'Chỉ thu ngân hoặc chủ cửa hàng thực hiện được thao tác này.';
export const LOYALTY_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng đổi được cấu hình điểm.';
export const LOYALTY_PHONE_INVALID_MESSAGE = 'Số điện thoại không hợp lệ.';
export const LOYALTY_MEMBER_NOT_FOUND_MESSAGE =
  'Không tìm thấy khách hàng thân thiết.';
export const LOYALTY_NOT_VERIFIED_MESSAGE =
  'Cần xác minh số điện thoại trước khi đổi điểm.';
export const LOYALTY_CODE_INVALID_MESSAGE = 'Mã xác minh không đúng hoặc đã hết hạn.';
export const LOYALTY_INSUFFICIENT_POINTS_MESSAGE = 'Khách hàng không đủ điểm.';
export const LOYALTY_NOTHING_TO_REVERSE_MESSAGE =
  'Không có điểm nào để hoàn tác cho đơn này.';
export const LOYALTY_IDEMPOTENCY_CONFLICT_MESSAGE =
  'Yêu cầu đã được gửi trước đó. Vui lòng thử lại.';

export const LOYALTY_MEMBER_COLLECTION = 'loyaltyMembers';
export const LOYALTY_TRANSACTION_COLLECTION = 'loyaltyTransactions';
export const LOYALTY_CONFIG_PATH = 'loyaltyConfig/current';
export const LOYALTY_VERIFICATION_TTL_MINUTES = 10;

export function nowIso(): string {
  return new Date().toISOString();
}

/** ADMIN is a server-verified platform claim on the auth token. */
export function isAdminToken(token: unknown): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    (token as Record<string, unknown>).admin === true
  );
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

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', LOYALTY_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseLoyaltyRegisterInput(data: unknown): LoyaltyRegisterInput {
  return parseOrInvalid<LoyaltyRegisterInput>(
    loyaltyRegisterInputSchema,
    data,
  );
}

export function parseLoyaltyVerifyInput(data: unknown): LoyaltyVerifyInput {
  return parseOrInvalid<LoyaltyVerifyInput>(loyaltyVerifyInputSchema, data);
}

export function parseLoyaltyEarnInput(data: unknown): LoyaltyEarnInput {
  return parseOrInvalid<LoyaltyEarnInput>(loyaltyEarnInputSchema, data);
}

export function parseLoyaltyRedeemInput(data: unknown): LoyaltyRedeemInput {
  return parseOrInvalid<LoyaltyRedeemInput>(loyaltyRedeemInputSchema, data);
}

export function parseLoyaltyReverseInput(data: unknown): LoyaltyReverseInput {
  return parseOrInvalid<LoyaltyReverseInput>(loyaltyReverseInputSchema, data);
}

export function parseLoyaltyListInput(data: unknown): LoyaltyListInput {
  return parseOrInvalid<LoyaltyListInput>(loyaltyListInputSchema, data);
}

export function parseLoyaltyGetConfigInput(
  data: unknown,
): LoyaltyGetConfigInput {
  return parseOrInvalid<LoyaltyGetConfigInput>(
    loyaltyGetConfigInputSchema,
    data,
  );
}

export function parseLoyaltyUpdateConfigInput(
  data: unknown,
): LoyaltyUpdateConfigInput {
  return parseOrInvalid<LoyaltyUpdateConfigInput>(
    loyaltyUpdateConfigInputSchema,
    data,
  );
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      LOYALTY_MEMBER_DENIED_MESSAGE,
    );
  }
}

export function assertCashierOrOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  const roles: unknown[] = Array.isArray(memberData?.roles)
    ? memberData.roles
    : [];
  if (memberData?.membershipType !== 'owner' && !roles.includes('cashier')) {
    throw new HttpsError('permission-denied', LOYALTY_STAFF_DENIED_MESSAGE);
  }
}

export function assertOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', LOYALTY_OWNER_DENIED_MESSAGE);
  }
}

/** Hash a six-digit verification code so it never persists in plaintext. */
export function hashLoyaltyVerificationCode(code: string): string {
  return createHash('sha256').update(`scango-loyalty:${code}`).digest('hex');
}

export function generateLoyaltyVerificationCode(): string {
  const value = Math.floor(Math.random() * 1_000_000);
  return value.toString().padStart(6, '0');
}

export function loyaltyMemberPath(tenantId: string, memberId: string): string {
  return `tenants/${tenantId}/${LOYALTY_MEMBER_COLLECTION}/${memberId}`;
}

export function loyaltyTransactionPath(
  tenantId: string,
  transactionId: string,
): string {
  return `tenants/${tenantId}/${LOYALTY_TRANSACTION_COLLECTION}/${transactionId}`;
}

/**
 * Canonical request hash that binds an idempotency key to one Loyalty command.
 * The same key with a different member, points, amount, or action is a
 * conflict, so a retry can never replay an unrelated request (REQ-LOY-001).
 */
export function buildLoyaltyRequestHash(input: {
  tenantId: string;
  memberId: string;
  action: LoyaltyTransaction['kind'];
  points: number;
  amountVnd: number;
}): string {
  return stableRequestHash({
    command: 'loyalty',
    tenantId: input.tenantId,
    memberId: input.memberId,
    action: input.action,
    points: input.points,
    amountVnd: input.amountVnd,
  });
}

export function mapStoredLoyaltyMember(
  memberId: string,
  tenantId: string,
  data: DocumentData,
): LoyaltyMember {
  return loyaltyMemberSchema.parse({ ...data, memberId, tenantId });
}

export function toLoyaltyMemberView(
  member: LoyaltyMember,
  phoneVisible: boolean,
): LoyaltyMemberView {
  return loyaltyMemberViewSchema.parse({
    schemaVersion: LOYALTY_CONTRACT_VERSION,
    memberId: member.memberId,
    displayName: member.displayName,
    phone: phoneVisible ? member.phone : null,
    phoneVisible: phoneVisible && member.phone.length > 0,
    isVerified: member.isVerified,
    pointBalance: member.pointBalance,
    paidTotalVnd: member.paidTotalVnd,
    visitCount: member.visitCount,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  });
}

export interface BuildLoyaltyMemberInput {
  tenantId: string;
  phone: string;
  displayName: string | null;
  now: string;
  verificationCodeHash: string;
  verificationExpiresAt: string;
}

export function buildLoyaltyMemberDocument(
  input: BuildLoyaltyMemberInput,
): LoyaltyMember {
  const normalized = normalizeLoyaltyPhone(input.phone);
  if (!normalized) {
    throw new HttpsError('invalid-argument', LOYALTY_PHONE_INVALID_MESSAGE);
  }
  return loyaltyMemberSchema.parse({
    schemaVersion: LOYALTY_CONTRACT_VERSION,
    memberId: loyaltyMemberIdFor(normalized),
    tenantId: input.tenantId,
    phone: normalized,
    displayName: input.displayName,
    isVerified: false,
    pointBalance: 0,
    paidTotalVnd: 0,
    visitCount: 0,
    verificationCodeHash: input.verificationCodeHash,
    verificationExpiresAt: input.verificationExpiresAt,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function normalizeLoyaltyPhoneOrThrow(phone: string): string {
  const normalized = normalizeLoyaltyPhone(phone);
  if (!normalized) {
    throw new HttpsError('invalid-argument', LOYALTY_PHONE_INVALID_MESSAGE);
  }
  return normalized;
}

export async function resolveLoyaltyConfig(
  db: Firestore,
  tenantId: string,
): Promise<LoyaltyConfig> {
  const snap = await db.doc(`tenants/${tenantId}/${LOYALTY_CONFIG_PATH}`).get();
  if (!snap.exists) {
    return buildDefaultLoyaltyConfig(tenantId, nowIso());
  }
  const parsed = loyaltyConfigSchema.safeParse({
    ...snap.data(),
    tenantId,
  });
  return parsed.success
    ? parsed.data
    : buildDefaultLoyaltyConfig(tenantId, nowIso());
}

/** Parse a stored config document, or null when it is missing or malformed. */
export function parseStoredLoyaltyConfig(
  tenantId: string,
  data: DocumentData,
): LoyaltyConfig | null {
  const parsed = loyaltyConfigSchema.safeParse({ ...data, tenantId });
  return parsed.success ? parsed.data : null;
}

export function buildLoyaltyConfigDocument(
  tenantId: string,
  current: LoyaltyConfig,
  input: LoyaltyUpdateConfigInput,
  now: string,
): LoyaltyConfig {  return loyaltyConfigSchema.parse({
    schemaVersion: LOYALTY_CONTRACT_VERSION,
    tenantId,
    earnRateVnd: input.earnRateVnd ?? current.earnRateVnd,
    pointsPerEarnRate:
      input.pointsPerEarnRate ?? current.pointsPerEarnRate,
    welcomePoints: input.welcomePoints ?? current.welcomePoints,
    updatedAt: now,
  });
}

export interface LoyaltyPointPlan {
  memberId: string;
  transaction: LoyaltyTransaction;
  nextMember: LoyaltyMember;
}

function buildTransaction(input: {
  transactionId: string;
  tenantId: string;
  memberId: string;
  kind: LoyaltyTransaction['kind'];
  points: number;
  balanceAfter: number;
  orderId: string | null;
  reason: string | null;
  idempotencyKey: string;
  requestHash: string;
  actorUid: string | null;
  now: string;
}): LoyaltyTransaction {
  return loyaltyTransactionSchema.parse({
    schemaVersion: LOYALTY_CONTRACT_VERSION,
    transactionId: input.transactionId,
    tenantId: input.tenantId,
    memberId: input.memberId,
    kind: input.kind,
    points: input.points,
    balanceAfter: input.balanceAfter,
    orderId: input.orderId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    actorUid: input.actorUid,
    createdAt: input.now,
  });
}

/** Award points for one confirmed Order. Deterministic and integer VND. */
export function buildLoyaltyEarnPlan(input: {
  tenantId: string;
  member: LoyaltyMember;
  orderId: string;
  amountVnd: number;
  rate: Pick<LoyaltyConfig, 'earnRateVnd' | 'pointsPerEarnRate'>;
  idempotencyKey: string;
  requestHash: string;
  actorUid: string | null;
  now: string;
}): LoyaltyPointPlan {
  const points = computeEarnedPoints(input.amountVnd, input.rate);
  const nextBalance = input.member.pointBalance + points;
  const transaction = buildTransaction({
    transactionId: `loyalty_earn_${input.orderId}`,
    tenantId: input.tenantId,
    memberId: input.member.memberId,
    kind: 'earn',
    points,
    balanceAfter: nextBalance,
    orderId: input.orderId,
    reason: null,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    actorUid: input.actorUid,
    now: input.now,
  });
  return {
    memberId: input.member.memberId,
    transaction,
    nextMember: {
      ...input.member,
      pointBalance: nextBalance,
      paidTotalVnd: input.member.paidTotalVnd + input.amountVnd,
      visitCount: input.member.visitCount + 1,
      updatedAt: input.now,
    },
  };
}

export function buildLoyaltyReversePlan(input: {
  tenantId: string;
  member: LoyaltyMember;
  earnTransaction: LoyaltyTransaction;
  reason: string | null;
  idempotencyKey: string;
  requestHash: string;
  actorUid: string | null;
  now: string;
}): LoyaltyPointPlan {
  const requested = Math.abs(input.earnTransaction.points);
  const reversed = Math.min(requested, input.member.pointBalance);
  const nextBalance = input.member.pointBalance - reversed;
  const transaction = buildTransaction({
    transactionId: `loyalty_reverse_${input.earnTransaction.orderId ?? input.earnTransaction.transactionId}`,
    tenantId: input.tenantId,
    memberId: input.member.memberId,
    kind: 'reverse',
    points: -reversed,
    balanceAfter: nextBalance,
    orderId: input.earnTransaction.orderId,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    actorUid: input.actorUid,
    now: input.now,
  });
  return {
    memberId: input.member.memberId,
    transaction,
    nextMember: {
      ...input.member,
      pointBalance: nextBalance,
      updatedAt: input.now,
    },
  };
}

export function buildLoyaltyRedeemPlan(input: {
  tenantId: string;
  member: LoyaltyMember;
  points: number;
  orderId: string | null;
  idempotencyKey: string;
  requestHash: string;
  actorUid: string | null;
  now: string;
}): LoyaltyPointPlan {
  if (!input.member.isVerified) {
    throw new HttpsError('failed-precondition', LOYALTY_NOT_VERIFIED_MESSAGE);
  }
  if (input.points > input.member.pointBalance) {
    throw new HttpsError(
      'failed-precondition',
      LOYALTY_INSUFFICIENT_POINTS_MESSAGE,
    );
  }
  const nextBalance = input.member.pointBalance - input.points;
  const transaction = buildTransaction({
    transactionId: `loyalty_redeem_${input.idempotencyKey}`,
    tenantId: input.tenantId,
    memberId: input.member.memberId,
    kind: 'redeem',
    points: -input.points,
    balanceAfter: nextBalance,
    orderId: input.orderId,
    reason: null,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    actorUid: input.actorUid,
    now: input.now,
  });
  return {
    memberId: input.member.memberId,
    transaction,
    nextMember: {
      ...input.member,
      pointBalance: nextBalance,
      updatedAt: input.now,
    },
  };
}
