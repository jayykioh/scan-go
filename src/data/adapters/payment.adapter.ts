import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  paymentConfirmationResultSchema,
  paymentInstructionResultSchema,
  paymentRecordSchema,
  type PaymentConfirmationResult,
  type PaymentMethod,
  type PaymentRecord,
  type VietQrInstruction,
} from '@contracts/payment.contract';
import {
  paymentCorrectionResultSchema,
  type PaymentCorrectionInput,
  type PaymentCorrectionResult,
} from '@contracts/correction.contract';
import {
  orderListResultSchema,
  type OrderSnapshot,
} from '@contracts/order.contract';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

/** A Cashier observes at most one Payment record per Order. */
export const PAYMENT_LISTENER_LIMIT = 1;

export interface ConfirmPaymentRequest {
  tenantId: string;
  orderId: string;
  method: PaymentMethod;
  amountVnd: number;
  idempotencyKey: string;
}

/**
 * Cashier settlement through the server callable. The client never writes a
 * business collection directly (docs/RULES_FIREBASE.md §1).
 */
export async function confirmPayment(
  request: ConfirmPaymentRequest,
): Promise<PaymentConfirmationResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<ConfirmPaymentRequest, PaymentConfirmationResult>(
    functions,
    'callablePaymentConfirm',
  );
  const result = await callable(request);
  return paymentConfirmationResultSchema.parse(result.data);
}

/**
 * Cashier correction through the server callable (REQ-PAY-001). The original
 * Payment stays immutable; the server writes a linked compensating record.
 */
export async function correctPayment(
  request: PaymentCorrectionInput,
): Promise<PaymentCorrectionResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<PaymentCorrectionInput, PaymentCorrectionResult>(
    functions,
    'callablePaymentCorrect',
  );
  const result = await callable(request);
  return paymentCorrectionResultSchema.parse(result.data);
}

/** Read the dynamic VietQR instruction for one unpaid Order. */
export async function getVietQrInstruction(
  tenantId: string,
  orderId: string,
): Promise<VietQrInstruction> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string; orderId: string },
    { instruction: VietQrInstruction }
  >(functions, 'callablePaymentGetVietQrInstruction');
  const result = paymentInstructionResultSchema.parse((await callable({ tenantId, orderId })).data);
  return result.instruction;
}

/**
 * Cashier unpaid queue. Ordering owns the Order read; Payment owns the
 * Cashier settlement flow, so the queue is exposed beside settlement.
 */
export async function listUnpaidOrders(
  tenantId: string,
): Promise<OrderSnapshot[]> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string },
    { orders: OrderSnapshot[] }
  >(functions, 'callableOrderListUnpaid');
  const result = orderListResultSchema.parse((await callable({ tenantId })).data);
  return result.orders;
}

/** Map a stored Payment document to the frozen contract. */
export function mapStoredPayment(
  paymentId: string,
  data: DocumentData,
): PaymentRecord {
  return paymentRecordSchema.parse({ ...data, paymentId });
}

/** Bounded listener for one Order payment; unsubscribe on view disposal. */
export function subscribeOrderPayment(
  tenantId: string,
  orderId: string,
  onChange: (payment: PaymentRecord | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange(null);
    return () => undefined;
  }

  const paymentQuery = query(
    collection(db, 'tenants', tenantId, 'payments'),
    where('orderId', '==', orderId),
    orderBy('createdAt', 'desc'),
    limit(PAYMENT_LISTENER_LIMIT),
  );

  return onSnapshot(
    paymentQuery,
    (snap) => {
      const first = snap.docs[0];
      onChange(first ? mapStoredPayment(first.id, first.data()) : null);
    },
    (error) => onError?.(error),
  );
}
