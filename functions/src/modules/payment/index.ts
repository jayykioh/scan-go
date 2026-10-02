import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import {
  PAYMENT_AUTO_CONFIRM_FLAG_KEY,
  PAYMENT_CONTRACT_VERSION,
  PAYMENT_PROVIDER_FLAG_KEY,
  correctionPaymentIdFor,
  paymentAutoConfirmInputSchema,
  paymentAutoConfirmResultSchema,
  paymentConfirmationResultSchema,
  paymentIdFor,
  paymentInstructionResultSchema,
  paymentProviderEvidenceSchema,
  paymentProviderSettleResultSchema,
  providerEvidenceIdFor,
  type PaymentArchivePlan,
  type PaymentAutoConfirmInput,
  type PaymentAutoConfirmResult,
  type PaymentConfirmationResult,
  type PaymentProviderSettleResult,
  type VietQrInstruction,
} from '../../../../shared/contracts/payment.contract.js';
import {
  paymentCorrectionResultSchema,
  type PaymentCorrectionResult,
} from '../../../../shared/contracts/correction.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import {
  applyOrderCorrectionMutationPlan,
  applyOrderPaymentMutationPlan,
  buildOrderCorrectionMutationPlan,
  buildOrderPaymentMutationPlan,
} from '../ordering/index.js';
import {
  assertNoSecretMaterial,
  resolvePaymentProviderAdapter,
  PAYMENT_PROVIDER_SIGNATURE_INVALID_MESSAGE,
  PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
} from './provider.js';
import {
  buildLoyaltyEarnPlan,
  buildLoyaltyRequestHash,
  loyaltyMemberPath,
  loyaltyTransactionPath,
  mapStoredLoyaltyMember,
  resolveLoyaltyConfig,
} from '../loyalty/service.js';
import {
  computeEarnedPoints,
  loyaltyEarnTransactionId,
} from '../../../../shared/contracts/loyalty.contract.js';

// Module public API: Config's scheduled retention job composes the archive plan
// through Payment (NFR-RET-001).
export { buildPaymentArchivePlan } from './service.js';
import {
  assertCashierOrOwnerMember,
  assertCorrectionAmount,
  assertCorrectionEligibleOrder,
  assertCorrectionIdempotencyMatch,
  assertOriginalPaymentConfirmed,
  assertPaymentAmount,
  assertPaymentCorrectionAuthorized,
  assertPaymentIdempotencyMatch,
  buildCompensatingPayment,
  buildPaymentConfirmRequestHash,
  buildPaymentCorrectionRequestHash,
  buildPaymentRecord,
  buildVietQrInstruction,
  mapPaymentOrder,
  mapStoredPayment,
  nowIso,
  parsePaymentConfirmInput,
  parsePaymentCorrectionInput,
  parsePaymentInstructionInput,
  parsePaymentProviderSettleInput,
  parseVietQrMerchantConfig,
  requireUid,
  PAYMENT_ALREADY_SETTLED_MESSAGE,
  PAYMENT_INVALID_MESSAGE,
  PAYMENT_MERCHANT_MISSING_MESSAGE,
  PAYMENT_ORDER_NOT_FOUND_MESSAGE,
  type PaymentCorrectionIdempotencyRecord,
  type PaymentIdempotencyRecord,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

function paymentCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/payments`;
}

/**
 * Apply the retention archive plan. Only Payment code writes Payment records, so
 * the scheduled job calls this inside the shared transaction. The archive copy
 * and the source `archivedAt` marker commit together, and a retry is a no-op
 * because already-archived Payments are excluded from the plan
 * (NFR-RET-001, docs/data-model.md §10).
 */
export function applyPaymentArchivePlan(
  transaction: Transaction,
  db: Firestore,
  plan: PaymentArchivePlan,
  sourceDataByPaymentId: Map<string, DocumentData>,
): void {
  for (const line of plan.lines) {
    const source = sourceDataByPaymentId.get(line.paymentId);
    if (!source) {
      continue;
    }
    transaction.set(db.doc(line.archivePath), {
      ...source,
      archiveMetadata: {
        retentionYears: plan.retentionYears,
        cutoffAt: plan.cutoffAt,
        archivedAt: plan.createdAt,
      },
    });
    transaction.set(
      db.doc(
        `${paymentCollectionPath(plan.tenantId)}/${line.paymentId}`,
      ),
      { archivedAt: plan.createdAt, updatedAt: plan.createdAt },
      { merge: true },
    );
  }
}

/**
 * Award Loyalty points for a paid Order inside the same payment transaction.
 * Only a verified member referenced by the Order earns; the deterministic
 * ledger id keeps a retry from posting twice (REQ-LOY-001, docs/data-model.md §9).
 */
export async function awardLoyaltyInOrderTransaction(
  transaction: Transaction,
  db: Firestore,
  params: {
    tenantId: string;
    orderId: string;
    orderData: DocumentData;
    amountVnd: number;
    actorUid: string;
    now: string;
    config: Awaited<ReturnType<typeof resolveLoyaltyConfig>>;
  },
): Promise<void> {
  const memberId = params.orderData.loyaltyMemberId;
  if (typeof memberId !== 'string' || memberId.length === 0) {
    return;
  }
  const memberRef = db.doc(loyaltyMemberPath(params.tenantId, memberId));
  const memberSnap = await transaction.get(memberRef);
  if (!memberSnap.exists) {
    return;
  }
  const transactionId = loyaltyEarnTransactionId(params.orderId);
  const transactionRef = db.doc(
    loyaltyTransactionPath(params.tenantId, transactionId),
  );
  const existingSnap = await transaction.get(transactionRef);
  if (existingSnap.exists) {
    return;
  }
  const member = mapStoredLoyaltyMember(
    memberId,
    params.tenantId,
    memberSnap.data() ?? {},
  );
  const plan = buildLoyaltyEarnPlan({
    tenantId: params.tenantId,
    member,
    orderId: params.orderId,
    amountVnd: params.amountVnd,
    rate: params.config,
    idempotencyKey: `payment:${params.orderId}`,
    requestHash: buildLoyaltyRequestHash({
      tenantId: params.tenantId,
      memberId: member.memberId,
      action: 'earn',
      points: computeEarnedPoints(params.amountVnd, params.config),
      amountVnd: params.amountVnd,
    }),
    actorUid: params.actorUid,
    now: params.now,
  });
  transaction.set(transactionRef, plan.transaction);
  transaction.set(memberRef, plan.nextMember);
}

/**
 * Cashier settlement. Payment owns the immutable Payment record and the
 * dynamic VietQR snapshot; Ordering owns the Order mutation. One shared
 * transaction writes the Payment, marks the Order paid or paidAt, records the
 * idempotency key, and appends the audit event (REQ-CAS-001, REQ-ORD-002,
 * docs/data-model.md §9).
 */
export const callablePaymentConfirm = onCall(
  CALL_OPTIONS,
  async (request): Promise<PaymentConfirmationResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parsePaymentConfirmInput(request.data);
    const db = getDb();

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const orderRef = db.doc(
      `tenants/${input.tenantId}/orders/${input.orderId}`,
    );
    const paymentRef = db.doc(
      `${paymentCollectionPath(input.tenantId)}/${paymentIdFor(input.orderId)}`,
    );
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );

    // The tenant VietQR merchant map is static configuration, so it is read
    // before the settlement transaction.
    const tenantSnap = await db
      .doc(`tenants/${input.tenantId}`)
      .get();
    const merchant = parseVietQrMerchantConfig(tenantSnap.get('vietQr'));
    const requestHash = buildPaymentConfirmRequestHash(input);
    const loyaltyConfig = await resolveLoyaltyConfig(db, input.tenantId);

    const outcome = await db.runTransaction<{
      replayed: boolean;
      payment: ReturnType<typeof mapStoredPayment>;
      orderStatus: PaymentConfirmationResult['orderStatus'];
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const orderSnap = await transaction.get(orderRef);
      const existingPaymentSnap = await transaction.get(paymentRef);

      const memberData = memberSnap.data();
      assertCashierOrOwnerMember(memberData);
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', PAYMENT_ORDER_NOT_FOUND_MESSAGE);
      }
      const order = mapPaymentOrder(input.orderId, orderSnap.data() ?? {});

      // Same idempotency key and request hash replays the first result.
      const existingIdempotency = idempotencySnap.data() as
        | PaymentIdempotencyRecord
        | undefined;
      if (existingIdempotency) {
        assertPaymentIdempotencyMatch(existingIdempotency, requestHash);
        if (!existingPaymentSnap.exists) {
          throw new HttpsError('internal', PAYMENT_ALREADY_SETTLED_MESSAGE);
        }
        return {
          replayed: true,
          payment: mapStoredPayment(
            existingPaymentSnap.id,
            existingPaymentSnap.data() ?? {},
          ),
          orderStatus: order.status,
        };
      }

      // A confirmed Payment is immutable: a second settlement for the same
      // Order is rejected without writing a new record (REQ-CAS-001).
      if (existingPaymentSnap.exists || orderSnap.get('paidAt') != null) {
        throw new HttpsError('already-exists', PAYMENT_ALREADY_SETTLED_MESSAGE);
      }

      assertPaymentAmount(input.amountVnd, order.totalVnd);

      let instruction: VietQrInstruction | null = null;
      if (input.method === 'vietQr') {
        if (!merchant) {
          throw new HttpsError(
            'failed-precondition',
            PAYMENT_MERCHANT_MISSING_MESSAGE,
          );
        }
        instruction = buildVietQrInstruction({
          merchant,
          orderId: input.orderId,
          amountVnd: order.totalVnd,
        });
      }

      const now = nowIso();
      await awardLoyaltyInOrderTransaction(transaction, db, {
        tenantId: input.tenantId,
        orderId: input.orderId,
        orderData: orderSnap.data() ?? {},
        amountVnd: order.totalVnd,
        actorUid: uid,
        now,
        config: loyaltyConfig,
      });
      const payment = buildPaymentRecord({
        paymentId: paymentRef.id,
        tenantId: input.tenantId,
        orderId: input.orderId,
        amountVnd: order.totalVnd,
        method: input.method,
        vietQrInstruction: instruction,
        actorUid: uid,
        idempotencyKey: input.idempotencyKey,
        now,
      });
      const plan = buildOrderPaymentMutationPlan({
        tenantId: input.tenantId,
        orderId: input.orderId,
        order,
        paymentMethod: input.method,
        actorUid: uid,
        now,
      });

      applyOrderPaymentMutationPlan(transaction, db, plan);
      transaction.set(paymentRef, payment);
      transaction.set(idempotencyRef, {
        command: 'confirmPayment',
        requestHash,
        tenantId: input.tenantId,
        orderId: input.orderId,
        paymentId: payment.paymentId,
        status: 'applied',
        createdAt: now,
      } satisfies PaymentIdempotencyRecord);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: memberData?.membershipType === 'owner' ? 'owner' : 'staff',
        role: memberData?.membershipType === 'owner' ? 'owner' : 'cashier',
        action: 'PaymentConfirmed',
        targetType: 'order',
        targetId: input.orderId,
        requestId: input.idempotencyKey,
        detail: {
          paymentId: payment.paymentId,
          method: payment.method,
          amountVnd: payment.amountVnd,
        },
      });

      return { replayed: false, payment, orderStatus: plan.nextStatus };
    });

    return paymentConfirmationResultSchema.parse({
      schemaVersion: PAYMENT_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'confirmed',
      payment: outcome.payment,
      orderStatus: outcome.orderStatus,
    });
  },
);

/**
 * Cashier query: build the dynamic VietQR instruction for one unpaid Order
 * without writing any record. Payment owns the VietQR payload (REQ-CAS-001).
 */
export const callablePaymentGetVietQrInstruction = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parsePaymentInstructionInput(request.data);
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertCashierOrOwnerMember(memberSnap.data());

    const orderSnap = await db
      .doc(`tenants/${input.tenantId}/orders/${input.orderId}`)
      .get();
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', PAYMENT_ORDER_NOT_FOUND_MESSAGE);
    }
    const order = mapPaymentOrder(input.orderId, orderSnap.data() ?? {});

    const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
    const merchant = parseVietQrMerchantConfig(tenantSnap.get('vietQr'));
    if (!merchant) {
      throw new HttpsError(
        'failed-precondition',
        PAYMENT_MERCHANT_MISSING_MESSAGE,
      );
    }

    return paymentInstructionResultSchema.parse({
      schemaVersion: PAYMENT_CONTRACT_VERSION,
      instruction: buildVietQrInstruction({
        merchant,
        orderId: input.orderId,
        amountVnd: order.totalVnd,
      }),
    });
  },
);

const PAYMENT_PROVIDER_DISABLED_MESSAGE =
  'Tính năng nhà cung cấp thanh toán đang tắt.';
const PAYMENT_PROVIDER_TENANT_MISMATCH_MESSAGE =
  'Dữ liệu nhà cung cấp không thuộc cửa hàng này.';
const PAYMENT_ADAPTER_COLLECTION = 'paymentAdapterEvidence';

/**
 * Adapter boundary for a replaceable settlement provider (P0-L08, REQ-PAY-001).
 *
 * The callable validates the tenant-scoped caller, applies the feature flag,
 * maps the strict provider payload through the registered adapter, rejects any
 * secret material, and persists only normalized evidence. It never writes a
 * Payment or an Order, so an adapter failure cannot change business records.
 */
export const callablePaymentProviderSettle = onCall(
  CALL_OPTIONS,
  async (request): Promise<PaymentProviderSettleResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parsePaymentProviderSettleInput(request.data);
    if (input.payload.tenantId !== input.tenantId) {
      throw new HttpsError(
        'invalid-argument',
        PAYMENT_PROVIDER_TENANT_MISMATCH_MESSAGE,
      );
    }

    const db = getDb();
    const platformSnap = await db.doc('platform/config').get();
    const enabled =
      platformSnap.get('values')?.[PAYMENT_PROVIDER_FLAG_KEY] === true;
    if (!enabled) {
      throw new HttpsError(
        'failed-precondition',
        PAYMENT_PROVIDER_DISABLED_MESSAGE,
      );
    }

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const orderRef = db.doc(
      `tenants/${input.tenantId}/orders/${input.payload.orderId}`,
    );
    const evidenceId = providerEvidenceIdFor(
      input.payload.orderId,
      input.payload.providerEventId,
    );
    const evidenceRef = db.doc(
      `tenants/${input.tenantId}/${PAYMENT_ADAPTER_COLLECTION}/${evidenceId}`,
    );

    const outcome = await db.runTransaction<{
      replayed: boolean;
      evidence: ReturnType<typeof paymentProviderEvidenceSchema.parse>;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const orderSnap = await transaction.get(orderRef);
      const evidenceSnap = await transaction.get(evidenceRef);

      assertCashierOrOwnerMember(memberSnap.data());
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', PAYMENT_ORDER_NOT_FOUND_MESSAGE);
      }
      if (evidenceSnap.exists) {
        return {
          replayed: true,
          evidence: paymentProviderEvidenceSchema.parse({
            ...evidenceSnap.data(),
            evidenceId,
          }),
        };
      }

      const now = nowIso();
      const adapter = resolvePaymentProviderAdapter(input.providerId);
      const settlement = adapter.mapPayload({
        providerId: input.providerId,
        payload: input.payload,
        now,
      });
      assertNoSecretMaterial(settlement);

      const evidence = paymentProviderEvidenceSchema.parse({
        schemaVersion: PAYMENT_CONTRACT_VERSION,
        evidenceId,
        settlement,
        recordedAt: now,
      });
      transaction.set(evidenceRef, evidence);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          memberSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role: memberSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'PaymentProviderMapped',
        targetType: 'order',
        targetId: input.payload.orderId,
        requestId: input.payload.providerEventId,
        detail: {
          providerId: settlement.providerId,
          outcome: settlement.outcome,
          amountVnd: settlement.amountVnd,
        },
      });

      return { replayed: false, evidence };
    });

    return paymentProviderSettleResultSchema.parse({
      schemaVersion: PAYMENT_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'mapped',
      evidence: outcome.evidence,
    });
  },
);

/**
 * Authorized paid-order correction (P0-L09, REQ-PAY-001).
 *
 * Payment writes the linked compensating record; Ordering writes the linked
 * Order correction instant. The original Payment is never modified. The
 * deterministic compensating id and the idempotency record make a retry a
 * replay, and the audit event records actor, reason, target, and server UTC
 * time.
 */
export const callablePaymentCorrect = onCall(
  CALL_OPTIONS,
  async (request): Promise<PaymentCorrectionResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parsePaymentCorrectionInput(request.data);
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const orderRef = db.doc(
      `tenants/${input.tenantId}/orders/${input.orderId}`,
    );
    const originalPaymentRef = db.doc(
      `${paymentCollectionPath(input.tenantId)}/${paymentIdFor(input.orderId)}`,
    );
    const compensatingRef = db.doc(
      `${paymentCollectionPath(input.tenantId)}/${correctionPaymentIdFor(
        input.orderId,
        input.kind,
      )}`,
    );
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );
    const requestHash = buildPaymentCorrectionRequestHash(input);

    const outcome = await db.runTransaction<{
      replayed: boolean;
      originalPayment: ReturnType<typeof mapStoredPayment>;
      compensatingPayment: ReturnType<typeof mapStoredPayment>;
      orderStatus: PaymentCorrectionResult['orderStatus'];
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const orderSnap = await transaction.get(orderRef);
      const originalSnap = await transaction.get(originalPaymentRef);
      const compensatingSnap = await transaction.get(compensatingRef);

      assertPaymentCorrectionAuthorized(memberSnap.data(), isAdmin);
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', PAYMENT_ORDER_NOT_FOUND_MESSAGE);
      }
      const order = mapPaymentOrder(input.orderId, orderSnap.data() ?? {});
      assertCorrectionEligibleOrder(order);
      if (!originalSnap.exists) {
        throw new HttpsError(
          'not-found',
          PAYMENT_ORDER_NOT_FOUND_MESSAGE,
        );
      }
      const originalPayment = mapStoredPayment(
        originalSnap.id,
        originalSnap.data() ?? {},
      );
      assertOriginalPaymentConfirmed(originalPayment);

      const existingIdempotency = idempotencySnap.data() as
        | PaymentCorrectionIdempotencyRecord
        | undefined;
      if (existingIdempotency) {
        assertCorrectionIdempotencyMatch(existingIdempotency, requestHash);
        if (!compensatingSnap.exists) {
          throw new HttpsError('internal', PAYMENT_ALREADY_SETTLED_MESSAGE);
        }
        return {
          replayed: true,
          originalPayment,
          compensatingPayment: mapStoredPayment(
            compensatingSnap.id,
            compensatingSnap.data() ?? {},
          ),
          orderStatus: order.status,
        };
      }

      // A second correction of the same kind reuses the deterministic record
      // instead of creating a second compensating Payment (REQ-PAY-001).
      if (compensatingSnap.exists) {
        const compensatingPayment = mapStoredPayment(
          compensatingSnap.id,
          compensatingSnap.data() ?? {},
        );
        transaction.set(idempotencyRef, {
          command: 'correctPayment',
          requestHash,
          tenantId: input.tenantId,
          orderId: input.orderId,
          kind: input.kind,
          compensatingPaymentId: compensatingPayment.paymentId,
          status: 'applied',
          createdAt: nowIso(),
        } satisfies PaymentCorrectionIdempotencyRecord);
        return {
          replayed: true,
          originalPayment,
          compensatingPayment,
          orderStatus: order.status,
        };
      }

      const amountVnd = assertCorrectionAmount(
        input.amountVnd,
        originalPayment.amountVnd,
      );
      const now = nowIso();
      const compensatingPayment = buildCompensatingPayment({
        tenantId: input.tenantId,
        orderId: input.orderId,
        originalPayment,
        kind: input.kind,
        amountVnd,
        reason: input.reason,
        actorUid: uid,
        idempotencyKey: input.idempotencyKey,
        now,
      });
      const plan = buildOrderCorrectionMutationPlan({
        tenantId: input.tenantId,
        orderId: input.orderId,
        kind: input.kind,
        now,
      });

      applyOrderCorrectionMutationPlan(transaction, db, plan);
      transaction.set(compensatingRef, compensatingPayment);
      transaction.set(idempotencyRef, {
        command: 'correctPayment',
        requestHash,
        tenantId: input.tenantId,
        orderId: input.orderId,
        kind: input.kind,
        compensatingPaymentId: compensatingPayment.paymentId,
        status: 'applied',
        createdAt: now,
      } satisfies PaymentCorrectionIdempotencyRecord);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: isAdmin
          ? 'admin'
          : memberSnap.get('membershipType') === 'owner'
            ? 'owner'
            : 'staff',
        role: isAdmin
          ? 'admin'
          : memberSnap.get('membershipType') === 'owner'
            ? 'owner'
            : 'cashier',
        action: input.kind === 'reversal' ? 'PaymentReversed' : 'PaymentRefunded',
        targetType: 'payment',
        targetId: originalPayment.paymentId,
        requestId: input.idempotencyKey,
        reason: input.reason,
        detail: {
          kind: input.kind,
          compensatingPaymentId: compensatingPayment.paymentId,
          amountVnd,
        },
      });

      return {
        replayed: false,
        originalPayment,
        compensatingPayment,
        orderStatus: order.status,
      };
    });

    return paymentCorrectionResultSchema.parse({
      schemaVersion: PAYMENT_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'corrected',
      kind: input.kind,
      originalPayment: outcome.originalPayment,
      compensatingPayment: outcome.compensatingPayment,
      orderStatus: outcome.orderStatus,
    });
  },
);

/**
 * Automatic transfer confirmation (REQ-PAY-002, P0-L08 extension).
 *
 * A signed provider event is verified by the replaceable adapter, then the
 * matching Payment is posted inside one transaction together with the Order
 * mutation, provider evidence, idempotency record, and audit event. The
 * deterministic Payment id and event evidence id make a retry a replay, so the
 * Payment posts exactly once. It stays behind two flags and never changes the
 * default manual provider.
 */
export async function processAutomaticProviderEvent(
  db: Firestore,
  input: PaymentAutoConfirmInput,
): Promise<PaymentAutoConfirmResult> {
  if (input.payload.tenantId !== input.tenantId) {
    throw new HttpsError(
      'invalid-argument',
      PAYMENT_PROVIDER_TENANT_MISMATCH_MESSAGE,
    );
  }

  const platformSnap = await db.doc('platform/config').get();
    const values = platformSnap.get('values') as
      | Record<string, unknown>
      | undefined;
    if (
      values?.[PAYMENT_PROVIDER_FLAG_KEY] !== true ||
      values?.[PAYMENT_AUTO_CONFIRM_FLAG_KEY] !== true
    ) {
      throw new HttpsError(
        'failed-precondition',
        PAYMENT_PROVIDER_DISABLED_MESSAGE,
      );
    }

    const adapter = resolvePaymentProviderAdapter(input.providerId);
    if (
      !adapter.verifySignature ||
      !adapter.verifySignature({
        payload: input.payload,
        signature: input.signature,
      })
    ) {
      throw new HttpsError(
        'permission-denied',
        PAYMENT_PROVIDER_SIGNATURE_INVALID_MESSAGE,
      );
    }
    if (input.payload.outcome !== 'settled') {
      throw new HttpsError(
        'failed-precondition',
        PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
      );
    }

    const nowForEvidence = nowIso();
    const settlement = adapter.mapPayload({
      providerId: input.providerId,
      payload: input.payload,
      now: nowForEvidence,
    });
    assertNoSecretMaterial(settlement);
    const evidenceId = providerEvidenceIdFor(
      input.payload.orderId,
      input.payload.providerEventId,
    );

    const orderRef = db.doc(
      `tenants/${input.tenantId}/orders/${input.payload.orderId}`,
    );
    const paymentRef = db.doc(
      `${paymentCollectionPath(input.tenantId)}/${paymentIdFor(
        input.payload.orderId,
      )}`,
    );
    const evidenceRef = db.doc(
      `tenants/${input.tenantId}/${PAYMENT_ADAPTER_COLLECTION}/${evidenceId}`,
    );
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/auto_${input.payload.providerEventId}`,
    );
    const requestHash = buildPaymentConfirmRequestHash({
      tenantId: input.tenantId,
      orderId: input.payload.orderId,
      method: 'vietQr',
      amountVnd: input.payload.amountVnd,
    });
    const loyaltyConfig = await resolveLoyaltyConfig(db, input.tenantId);
    const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
    const merchant = parseVietQrMerchantConfig(tenantSnap.get('vietQr'));

    const outcome = await db.runTransaction<{
      replayed: boolean;
      payment: ReturnType<typeof mapStoredPayment>;
      orderStatus: PaymentConfirmationResult['orderStatus'];
      evidence: ReturnType<typeof paymentProviderEvidenceSchema.parse>;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const orderSnap = await transaction.get(orderRef);
      const paymentSnap = await transaction.get(paymentRef);
      const evidenceSnap = await transaction.get(evidenceRef);
      const idempotencySnap = await transaction.get(idempotencyRef);

      if (!orderSnap.exists) {
        throw new HttpsError('not-found', PAYMENT_ORDER_NOT_FOUND_MESSAGE);
      }
      const order = mapPaymentOrder(input.payload.orderId, orderSnap.data() ?? {});

      const existingIdempotency = idempotencySnap.data() as
        | PaymentIdempotencyRecord
        | undefined;
      if (existingIdempotency) {
        assertPaymentIdempotencyMatch(existingIdempotency, requestHash);
      }

      const existingEvidence = evidenceSnap.exists
        ? paymentProviderEvidenceSchema.parse({
            ...evidenceSnap.data(),
            evidenceId,
          })
        : null;
      if (existingEvidence) {
        if (!paymentSnap.exists) {
          throw new HttpsError('internal', PAYMENT_ALREADY_SETTLED_MESSAGE);
        }
        return {
          replayed: true,
          payment: mapStoredPayment(paymentSnap.id, paymentSnap.data() ?? {}),
          orderStatus: order.status,
          evidence: existingEvidence,
        };
      }

      if (paymentSnap.exists || orderSnap.get('paidAt') != null) {
        const existingPayment = mapStoredPayment(
          paymentSnap.id,
          paymentSnap.data() ?? {},
        );
        const evidence = paymentProviderEvidenceSchema.parse({
          schemaVersion: PAYMENT_CONTRACT_VERSION,
          evidenceId,
          settlement,
          recordedAt: nowForEvidence,
        });
        return {
          replayed: true,
          payment: existingPayment,
          orderStatus: order.status,
          evidence,
        };
      }

      assertPaymentAmount(input.payload.amountVnd, order.totalVnd);

      const instruction = merchant
        ? buildVietQrInstruction({
            merchant,
            orderId: input.payload.orderId,
            amountVnd: order.totalVnd,
          })
        : null;

      const now = nowIso();
      await awardLoyaltyInOrderTransaction(transaction, db, {
        tenantId: input.tenantId,
        orderId: input.payload.orderId,
        orderData: orderSnap.data() ?? {},
        amountVnd: order.totalVnd,
        actorUid: 'provider',
        now,
        config: loyaltyConfig,
      });

      const payment = buildPaymentRecord({
        paymentId: paymentRef.id,
        tenantId: input.tenantId,
        orderId: input.payload.orderId,
        amountVnd: order.totalVnd,
        method: 'vietQr',
        vietQrInstruction: instruction,
        actorUid: 'provider',
        idempotencyKey: `auto_${input.payload.providerEventId}`,
        now,
      });
      const providerPayment = {
        ...payment,
        providerId: settlement.providerId,
        providerRef: settlement.providerEventId,
      };
      const plan = buildOrderPaymentMutationPlan({
        tenantId: input.tenantId,
        orderId: input.payload.orderId,
        order,
        paymentMethod: 'vietQr',
        actorUid: 'provider',
        now,
      });
      const evidence = paymentProviderEvidenceSchema.parse({
        schemaVersion: PAYMENT_CONTRACT_VERSION,
        evidenceId,
        settlement,
        recordedAt: now,
      });

      applyOrderPaymentMutationPlan(transaction, db, plan);
      transaction.set(paymentRef, providerPayment);
      transaction.set(evidenceRef, evidence);
      transaction.set(idempotencyRef, {
        command: 'confirmPayment',
        requestHash,
        tenantId: input.tenantId,
        orderId: input.payload.orderId,
        paymentId: providerPayment.paymentId,
        status: 'applied',
        createdAt: now,
      } satisfies PaymentIdempotencyRecord);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: null,
        actorType: 'system',
        role: input.providerId,
        action: 'PaymentConfirmed',
        targetType: 'payment',
        targetId: providerPayment.paymentId,
        requestId: input.payload.providerEventId,
        detail: {
          providerId: settlement.providerId,
          providerEventId: settlement.providerEventId,
          amountVnd: providerPayment.amountVnd,
          automatic: true,
        },
      });

      return {
        replayed: false,
        payment: providerPayment,
        orderStatus: plan.nextStatus,
        evidence,
      };
    });

    return paymentAutoConfirmResultSchema.parse({
      schemaVersion: PAYMENT_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'confirmed',
      payment: outcome.payment,
      orderStatus: outcome.orderStatus,
      evidence: outcome.evidence,
    });
}

/**
 * Callable signed-event seam kept for existing clients. App Check plus the
 * adapter signature gate the call, then it reuses the same idempotent
 * settlement path as the HTTP webhook (REQ-PAY-002).
 */
export const callablePaymentAutoConfirm = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const parsed = paymentAutoConfirmInputSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', PAYMENT_INVALID_MESSAGE);
    }
    return processAutomaticProviderEvent(getDb(), parsed.data);
  },
);

/**
 * Versioned signed HTTP webhook for provider events (REQ-PAY-002). The stack
 * requires HTTP for signed provider events, so this endpoint verifies the HMAC
 * signature and reuses the same idempotent settlement path as the callable.
 */
export const paymentWebhookV1 = onRequest(
  { region: 'us-central1' },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'method-not-allowed' });
      return;
    }
    let body: unknown;
    try {
      body =
        typeof request.body === 'string'
          ? JSON.parse(request.body)
          : request.body;
    } catch {
      response.status(400).json({ error: 'invalid-payload' });
      return;
    }
    // The signature may travel in the body or in the versioned header.
    const candidate =
      body && typeof body === 'object' && !('signature' in body)
        ? {
            ...(body as Record<string, unknown>),
            signature: request.get('x-scango-signature') ?? '',
          }
        : body;
    const parsed = paymentAutoConfirmInputSchema.safeParse(candidate);
    if (!parsed.success) {
      response.status(400).json({ error: 'invalid-payload' });
      return;
    }
    try {
      const result = await processAutomaticProviderEvent(getDb(), parsed.data);
      response.status(200).json(result);
    } catch (error) {
      const code = error instanceof HttpsError ? error.code : 'internal';
      const status =
        code === 'permission-denied'
          ? 401
          : code === 'invalid-argument'
            ? 400
            : code === 'not-found'
              ? 404
              : code === 'failed-precondition' || code === 'already-exists'
                ? 409
                : code === 'resource-exhausted'
                  ? 429
                  : 500;
      response.status(status).json({ error: code });
    }
  },
);
