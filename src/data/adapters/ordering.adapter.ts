import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  orderCancellationResultSchema,
  orderSnapshotSchema,
  orderSubmitResultSchema,
  orderTrackingResultSchema,
  publicOrderTrackingSchema,
  type OrderCancelInput,
  type OrderCancellationResult,
  type OrderCartLineInput,
  type OrderPaymentMode,
  type OrderSnapshot,
  type OrderSubmitResult,
  type OrderTrackingResult,
  type PublicOrderTracking,
} from '@contracts/order.contract';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';
import type { OrderItem } from '../../types';
import { createIdempotencyKey } from './idempotency';

/** Customer tracking listeners are always bounded to one token document. */
export const ORDER_TRACKING_LISTENER_LIMIT = 1;

/**
 * Retry-safe key for one Customer Order submit. The key is generated once per
 * Table link and reused across retries so the server deduplicates (REQ-ORD-004).
 */
export function createOrderIdempotencyKey(): string {
  return createIdempotencyKey('ord');
}

export interface OfflineDecision {
  online: boolean;
  blocked: boolean;
  message: string | null;
}

export const OFFLINE_SUBMIT_MESSAGE =
  'Không có kết nối mạng. Đơn chưa được gửi. Bạn vẫn xem được thực đơn đã lưu.';

/**
 * Customer submission is blocked when the browser reports no connection
 * (REQ-ORD-004). Cached menu viewing stays available because it is read-only.
 */
export function evaluateOfflineSubmission(isOnline: boolean): OfflineDecision {
  return {
    online: isOnline,
    blocked: !isOnline,
    message: isOnline ? null : OFFLINE_SUBMIT_MESSAGE,
  };
}

/** Browser connectivity reader; falls back to online when undefined. */
export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true;
  }
  return navigator.onLine;
}

export interface SubmitOrderRequest {
  token: string;
  paymentMode: OrderPaymentMode;
  idempotencyKey: string;
  lines: OrderCartLineInput[];
}

/** Preserve the option IDs selected in the cart for server-side price validation. */
export function toOrderCartLines(cart: ReadonlyArray<OrderItem>): OrderCartLineInput[] {
  return cart.map((item) => ({
    menuItemId: item.menuId,
    quantity: item.quantity,
    selectedOptionIds: item.selectedOptionIds ?? [],
  }));
}

/**
 * Create one Order through the server callable. The client never writes a
 * business collection directly (docs/RULES_FIREBASE.md §1).
 */
export async function submitOrder(
  request: SubmitOrderRequest,
): Promise<OrderSubmitResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<SubmitOrderRequest, OrderSubmitResult>(
    functions,
    'callableOrderSubmit',
  );
  const result = await callable(request);
  return orderSubmitResultSchema.parse(result.data);
}

/**
 * Cancel one unpaid Order through the server callable. The server stops
 * fulfilment, restores Inventory, and writes the audit event (REQ-CAS-002).
 */
export async function cancelUnpaidOrder(
  request: OrderCancelInput,
): Promise<OrderCancellationResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<OrderCancelInput, OrderCancellationResult>(
    functions,
    'callableOrderCancelUnpaid',
  );
  const result = await callable(request);
  return orderCancellationResultSchema.parse(result.data);
}

/** Read one tracking projection by its opaque token. */
export async function getOrderTracking(
  trackingToken: string,
): Promise<PublicOrderTracking | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { trackingToken: string },
    OrderTrackingResult
  >(functions, 'callableOrderGetTracking');
  const result = orderTrackingResultSchema.parse(
    (await callable({ trackingToken })).data,
  );
  return result.tracking;
}

/** Map a stored public tracking document to the frozen contract. */
export function mapStoredTracking(
  trackingToken: string,
  data: Record<string, unknown>,
): PublicOrderTracking {
  return publicOrderTrackingSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    trackingToken,
    tenantId: data.tenantId,
    orderId: data.orderId,
    tableName: data.tableName,
    itemSummary: data.itemSummary,
    totalVnd: data.totalVnd,
    status: data.status,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/** Map a stored Orders request into the frozen Order snapshot contract. */
export function mapStoredOrder(
  orderId: string,
  data: Record<string, unknown>,
): OrderSnapshot {
  return orderSnapshotSchema.parse({ ...data, orderId });
}

/** Bounded listener for one Customer tracking document; unsubscribe on exit. */
export function subscribeOrderTracking(
  trackingToken: string,
  onChange: (tracking: PublicOrderTracking | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(db, 'publicOrderTracking', trackingToken),
    (snap) => {
      onChange(
        snap.exists()
          ? mapStoredTracking(trackingToken, snap.data())
          : null,
      );
    },
    (error) => onError?.(error),
  );
}
