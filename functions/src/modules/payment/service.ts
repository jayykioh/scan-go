import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  PAYMENT_CONTRACT_VERSION,
  correctionPaymentIdFor,
  paymentArchivePlanSchema,
  paymentConfirmInputSchema,
  paymentInstructionInputSchema,
  paymentProviderSettleInputSchema,
  paymentRecordSchema,
  vietQrInstructionSchema,
  vietQrMerchantConfigSchema,
  type PaymentArchivePlan,
  type PaymentConfirmInput,
  type PaymentInstructionInput,
  type PaymentMethod,
  type PaymentProviderSettleInput,
  type PaymentRecord,
  type VietQrInstruction,
  type VietQrMerchantConfig,
} from '../../../../shared/contracts/payment.contract.js';
import {
  paymentCorrectionInputSchema,
  type PaymentCorrectionInput,
  type PaymentCorrectionKind,
} from '../../../../shared/contracts/correction.contract.js';
import {
  computeRetentionCutoff,
  isRetentionEligible,
} from '../../../../shared/config/retention.js';
import {
  orderSnapshotSchema,
  type OrderSnapshot,
} from '../../../../shared/contracts/order.contract.js';
import { stableRequestHash } from '../../shared/idempotency.js';

export const PAYMENT_INVALID_MESSAGE = 'Yêu cầu thanh toán không hợp lệ.';
export const PAYMENT_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const PAYMENT_CASHIER_DENIED_MESSAGE =
  'Chỉ thu ngân hoặc chủ cửa hàng thực hiện được thao tác này.';
export const PAYMENT_ORDER_NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng.';
export const PAYMENT_ALREADY_SETTLED_MESSAGE =
  'Đơn hàng đã được thanh toán.';
export const PAYMENT_AMOUNT_MISMATCH_MESSAGE =
  'Số tiền thanh toán không khớp với đơn hàng.';
export const PAYMENT_MERCHANT_MISSING_MESSAGE =
  'Cửa hàng chưa cấu hình tài khoản VietQR.';
export const PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE =
  'Yêu cầu đã được gửi trước đó. Vui lòng thử lại.';

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

export function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PAYMENT_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parsePaymentConfirmInput(data: unknown): PaymentConfirmInput {
  return parseOrInvalid<PaymentConfirmInput>(paymentConfirmInputSchema, data);
}

export function parsePaymentInstructionInput(
  data: unknown,
): PaymentInstructionInput {
  return parseOrInvalid<PaymentInstructionInput>(
    paymentInstructionInputSchema,
    data,
  );
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', PAYMENT_MEMBER_DENIED_MESSAGE);
  }
}

/**
 * Cashier authorization. Owner is allowed; a Staff membership must carry the
 * `cashier` role. Kitchen, Waiter, inactive Staff, and another Tenant fail
 * (REQ-CAS-001, REQ-ACL-001).
 */
export function assertCashierOrOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  const isOwner = memberData?.membershipType === 'owner';
  const roles: unknown[] = Array.isArray(memberData?.roles)
    ? memberData.roles
    : [];
  if (!isOwner && !roles.includes('cashier')) {
    throw new HttpsError(
      'permission-denied',
      PAYMENT_CASHIER_DENIED_MESSAGE,
    );
  }
}

/** Parse the optional tenant `vietQr` map, or null when absent or invalid. */
export function parseVietQrMerchantConfig(
  value: unknown,
): VietQrMerchantConfig | null {
  const parsed = vietQrMerchantConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export interface BuildVietQrInstructionInput {
  merchant: VietQrMerchantConfig;
  orderId: string;
  amountVnd: number;
}

/**
 * Build the dynamic VietQR instruction for one Order. The amount is the
 * server-authoritative integer VND total; the bank fields are tenant-static
 * (REQ-CAS-001, NFR-DATA-001, glossary: VietQR).
 */
export function buildVietQrInstruction(
  input: BuildVietQrInstructionInput,
): VietQrInstruction {
  if (!Number.isInteger(input.amountVnd) || input.amountVnd < 0) {
    throw new HttpsError('invalid-argument', PAYMENT_INVALID_MESSAGE);
  }
  const addInfo = `SCANGO ${input.orderId}`;
  const qrPayload =
    `https://img.vietqr.io/image/${input.merchant.bankBin}-` +
    `${input.merchant.accountNo}-${input.merchant.template}.png` +
    `?amount=${input.amountVnd}` +
    `&addInfo=${encodeURIComponent(addInfo)}` +
    `&accountName=${encodeURIComponent(input.merchant.accountName)}`;

  return vietQrInstructionSchema.parse({
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    method: 'vietQr',
    bankBin: input.merchant.bankBin,
    accountNo: input.merchant.accountNo,
    accountName: input.merchant.accountName,
    template: input.merchant.template,
    amountVnd: input.amountVnd,
    addInfo,
    qrPayload,
  });
}

/** Rebuild the frozen Order contract from a stored document. */
export function mapPaymentOrder(
  orderId: string,
  data: DocumentData,
): OrderSnapshot {
  return orderSnapshotSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    orderId,
    tenantId: data.tenantId,
    orderType: data.orderType ?? 'dineIn',
    tableId: data.tableId,
    tableNameSnapshot: data.tableNameSnapshot,
    status: data.status,
    paymentMode: data.paymentMode,
    items: data.items ?? [],
    subtotalVnd: data.subtotalVnd,
    totalVnd: data.totalVnd,
    trackingToken: data.trackingToken,
    idempotencyKey: data.idempotencyKey,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/** The request hash binds one idempotency key to one settlement request. */
export function buildPaymentConfirmRequestHash(
  input: Pick<
    PaymentConfirmInput,
    'tenantId' | 'orderId' | 'method' | 'amountVnd'
  >,
): string {
  return stableRequestHash({
    command: 'confirmPayment',
    tenantId: input.tenantId,
    orderId: input.orderId,
    method: input.method,
    amountVnd: input.amountVnd,
  });
}

/** The Cashier amount must equal the server-owned Order total exactly. */
export function assertPaymentAmount(
  amountVnd: number,
  orderTotalVnd: number,
): void {
  if (amountVnd !== orderTotalVnd) {
    throw new HttpsError(
      'invalid-argument',
      PAYMENT_AMOUNT_MISMATCH_MESSAGE,
    );
  }
}

export interface BuildPaymentRecordInput {
  paymentId: string;
  tenantId: string;
  orderId: string;
  amountVnd: number;
  method: PaymentMethod;
  vietQrInstruction: VietQrInstruction | null;
  actorUid: string;
  idempotencyKey: string;
  now: string;
}

export function buildPaymentRecord(
  input: BuildPaymentRecordInput,
): PaymentRecord {
  return paymentRecordSchema.parse({
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    paymentId: input.paymentId,
    tenantId: input.tenantId,
    orderId: input.orderId,
    amountVnd: input.amountVnd,
    method: input.method,
    status: 'confirmed',
    vietQrInstruction: input.vietQrInstruction,
    actorUid: input.actorUid,
    idempotencyKey: input.idempotencyKey,
    confirmedAt: input.now,
    createdAt: input.now,
  });
}

export function mapStoredPayment(
  paymentId: string,
  data: DocumentData,
): PaymentRecord {
  return paymentRecordSchema.parse({ ...data, paymentId });
}

/**
 * A confirmed Payment is immutable. When the same Order already holds a
 * different confirmed settlement, reject instead of writing a second record
 * (REQ-CAS-001, docs/module/payment.md).
 */
export function assertPaymentImmutable(
  existing: PaymentRecord,
  incoming: Pick<PaymentRecord, 'orderId' | 'amountVnd' | 'method' | 'status'>,
): void {
  if (
    existing.orderId !== incoming.orderId ||
    existing.amountVnd !== incoming.amountVnd ||
    existing.method !== incoming.method ||
    existing.status !== incoming.status
  ) {
    throw new HttpsError('already-exists', PAYMENT_ALREADY_SETTLED_MESSAGE);
  }
}

export interface PaymentIdempotencyRecord {
  command: 'confirmPayment';
  requestHash: string;
  tenantId: string;
  orderId: string;
  paymentId: string;
  status: 'applied';
  createdAt: string;
}

/**
 * Compare a stored Payment idempotency record with the incoming request hash.
 * The same key with the same hash replays; a different hash fails.
 */
export function assertPaymentIdempotencyMatch(
  record: PaymentIdempotencyRecord,
  requestHash: string,
): void {
  if (record.requestHash !== requestHash) {
    throw new HttpsError(
      'already-exists',
      PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
  }
}

export const PAYMENT_CORRECTION_DENIED_MESSAGE =
  'Bạn không có quyền hoàn tiền hoặc đảo giao dịch.';
export const PAYMENT_NOT_PAID_MESSAGE =
  'Chỉ đơn hàng đã thanh toán mới được hoàn tiền hoặc đảo giao dịch.';
export const PAYMENT_ORIGINAL_NOT_CONFIRMED_MESSAGE =
  'Không tìm thấy giao dịch gốc đã xác nhận.';
export const PAYMENT_CORRECTION_AMOUNT_MESSAGE =
  'Số tiền hoàn trả không hợp lệ.';

/** Cashiers need an explicit Owner-granted permission to correct a Payment. */
export const PAYMENT_CORRECTION_PERMISSION = 'payment.correct';

export function parsePaymentCorrectionInput(
  data: unknown,
): PaymentCorrectionInput {
  return parseOrInvalid<PaymentCorrectionInput>(
    paymentCorrectionInputSchema,
    data,
  );
}

export function parsePaymentProviderSettleInput(
  data: unknown,
): PaymentProviderSettleInput {
  return parseOrInvalid<PaymentProviderSettleInput>(
    paymentProviderSettleInputSchema,
    data,
  );
}

export function assertCorrectionIdempotencyMatch(
  record: Pick<PaymentCorrectionIdempotencyRecord, 'requestHash'>,
  requestHash: string,
): void {
  if (record.requestHash !== requestHash) {
    throw new HttpsError(
      'already-exists',
      PAYMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
  }
}

/**
 * Correction authorization. Owner and ADMIN are allowed by default; a Staff
 * Cashier is allowed only when the membership carries the approved permission
 * (REQ-PAY-001, docs/module/payment.md).
 */
export function assertPaymentCorrectionAuthorized(
  memberData: DocumentData | undefined,
  isAdmin: boolean,
): void {
  if (isAdmin) {
    return;
  }
  assertActiveMember(memberData);
  if (memberData?.membershipType === 'owner') {
    return;
  }
  const roles: unknown[] = Array.isArray(memberData?.roles)
    ? memberData.roles
    : [];
  const permissions: unknown[] = Array.isArray(memberData?.permissions)
    ? memberData.permissions
    : [];
  if (
    !roles.includes('cashier') ||
    !permissions.includes(PAYMENT_CORRECTION_PERMISSION)
  ) {
    throw new HttpsError(
      'permission-denied',
      PAYMENT_CORRECTION_DENIED_MESSAGE,
    );
  }
}

/** Only a paid Order is correctable; an unpaid or cancelled Order is rejected. */
export function assertCorrectionEligibleOrder(order: OrderSnapshot): void {
  if (order.status !== 'paid') {
    throw new HttpsError('failed-precondition', PAYMENT_NOT_PAID_MESSAGE);
  }
}

/** Only a confirmed original Payment can be corrected. */
export function assertOriginalPaymentConfirmed(payment: PaymentRecord): void {
  if (payment.status !== 'confirmed') {
    throw new HttpsError(
      'failed-precondition',
      PAYMENT_ORIGINAL_NOT_CONFIRMED_MESSAGE,
    );
  }
}

/** A correction amount is a positive integer VND no greater than the original. */
export function assertCorrectionAmount(
  amountVnd: number | undefined,
  originalAmountVnd: number,
): number {
  const amount = amountVnd ?? originalAmountVnd;
  if (
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > originalAmountVnd
  ) {
    throw new HttpsError(
      'invalid-argument',
      PAYMENT_CORRECTION_AMOUNT_MESSAGE,
    );
  }
  return amount;
}

export function buildPaymentCorrectionRequestHash(
  input: Pick<
    PaymentCorrectionInput,
    'tenantId' | 'orderId' | 'kind' | 'amountVnd' | 'reason'
  >,
): string {
  return stableRequestHash({
    command: 'correctPayment',
    tenantId: input.tenantId,
    orderId: input.orderId,
    kind: input.kind,
    amountVnd: input.amountVnd ?? null,
    reason: input.reason,
  });
}

export interface BuildCompensatingPaymentInput {
  tenantId: string;
  orderId: string;
  originalPayment: PaymentRecord;
  kind: PaymentCorrectionKind;
  amountVnd: number;
  reason: string;
  actorUid: string;
  idempotencyKey: string;
  now: string;
}

/**
 * Build the linked compensating Payment. It references the immutable original
 * record and carries `reversed` or `refunded` status, so the ledger stays
 * append-only (REQ-PAY-001, docs/data-model.md §6).
 */
export function buildCompensatingPayment(
  input: BuildCompensatingPaymentInput,
): PaymentRecord {
  return paymentRecordSchema.parse({
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    paymentId: correctionPaymentIdFor(input.orderId, input.kind),
    tenantId: input.tenantId,
    orderId: input.orderId,
    amountVnd: input.amountVnd,
    method: input.originalPayment.method,
    status: input.kind === 'reversal' ? 'reversed' : 'refunded',
    vietQrInstruction: null,
    actorUid: input.actorUid,
    idempotencyKey: input.idempotencyKey,
    linkedPaymentId: input.originalPayment.paymentId,
    correctionKind: input.kind,
    reason: input.reason,
    providerId: null,
    providerRef: null,
    confirmedAt: input.now,
    createdAt: input.now,
  });
}

export type PaymentCorrectionIdempotencyRecord = {
  command: 'correctPayment';
  requestHash: string;
  tenantId: string;
  orderId: string;
  kind: PaymentCorrectionKind;
  compensatingPaymentId: string;
  status: 'applied';
  createdAt: string;
};

export const PAYMENT_ARCHIVE_COLLECTION = 'archivedPayments';

export function paymentArchivePath(
  tenantId: string,
  paymentId: string,
): string {
  return `tenants/${tenantId}/${PAYMENT_ARCHIVE_COLLECTION}/${paymentId}`;
}

export interface PaymentArchiveCandidate {
  paymentId: string;
  status: PaymentRecord['status'];
  confirmedAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface BuildPaymentArchivePlanInput {
  tenantId: string;
  candidates: PaymentArchiveCandidate[];
  now: string;
  retentionYears: number;
}

/**
 * Compose the immutable archive plan for confirmed Payments older than the
 * retention window. Compensating and already-archived records are protected and
 * never appear in the plan (NFR-RET-001).
 */
export function buildPaymentArchivePlan(
  input: BuildPaymentArchivePlanInput,
): PaymentArchivePlan {
  const cutoffAt = computeRetentionCutoff(input.now, input.retentionYears);
  const lines = input.candidates
    .filter(
      (candidate) =>
        candidate.status === 'confirmed' &&
        candidate.archivedAt === null &&
        isRetentionEligible(candidate.createdAt, cutoffAt),
    )
    .map((candidate) => ({
      paymentId: candidate.paymentId,
      confirmedAt: candidate.confirmedAt ?? candidate.createdAt,
      archivePath: paymentArchivePath(input.tenantId, candidate.paymentId),
    }));

  return paymentArchivePlanSchema.parse({
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    tenantId: input.tenantId,
    cutoffAt,
    retentionYears: input.retentionYears,
    lines,
    createdAt: input.now,
  });
}
