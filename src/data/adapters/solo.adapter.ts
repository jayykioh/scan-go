import type { CatalogCommandResult } from '@contracts/catalog.contract';
import type {
  FulfilmentCommandResult,
} from '@contracts/fulfilment.contract';
import type {
  OrderCancelInput,
  OrderCancellationResult,
  OrderStatus,
} from '@contracts/order.contract';
import type {
  PaymentConfirmationResult,
  PaymentMethod,
} from '@contracts/payment.contract';
import type { PaymentCorrectionResult } from '@contracts/correction.contract';
import {
  markReady as markReadyCommand,
  startCooking as startCookingCommand,
} from './fulfilment.adapter';
import { cancelUnpaidOrder as cancelUnpaidOrderCommand } from './ordering.adapter';
import {
  confirmPayment as confirmPaymentCommand,
  correctPayment as correctPaymentCommand,
} from './payment.adapter';
import { setMenuAvailability } from './catalog.adapter';
import { createIdempotencyKey } from './idempotency';
import { getActiveTenantId } from './tenant.adapter';

/**
 * Solo one-operator seam (REQ-SOLO-001).
 *
 * Solo combines authorized Owner, Cashier, and Kitchen actions in one view. It
 * owns no business state: every action is dispatched to the same shared module
 * callables that the dedicated views use (Fulfilment, Payment, Ordering,
 * Catalog, Table Access). The server re-verifies the membership, role, and
 * transition on every call, so the Solo view never weakens a module rule.
 */

/** The one-operator order lifecycle step for a current Order status. */
export const SOLO_ORDER_COMMANDS = [
  'startCooking',
  'markReady',
  'confirmPayment',
] as const;

export type SoloOrderCommand = (typeof SOLO_ORDER_COMMANDS)[number];

/**
 * Map the current Order status to the next Solo command. Solo follows the same
 * `pending → cooking → ready → paid` lifecycle as Kitchen and Cashier
 * (REQ-KDS-001, REQ-CAS-001). Any other status has no Solo action.
 */
export function resolveSoloOrderCommand(
  status: OrderStatus | string,
): SoloOrderCommand | null {
  switch (status) {
    case 'pending':
      return 'startCooking';
    case 'cooking':
      return 'markReady';
    case 'ready':
      return 'confirmPayment';
    default:
      return null;
  }
}

/** Retry-safe key for one Solo command; the server still owns idempotency. */
export function createSoloIdempotencyKey(prefix: string): string {
  return createIdempotencyKey(`solo-${prefix}`);
}

export interface SoloConfirmPaymentInput {
  orderId: string;
  amountVnd: number;
  method: PaymentMethod;
}

export interface SoloCancelOrderInput {
  orderId: string;
  reason: string;
}

export interface SoloRevertOrderInput {
  orderId: string;
  reason: string;
}

/** Replaceable command ports so the dispatch logic stays unit-testable. */
export interface SoloOrderPorts {
  startCooking(orderId: string): Promise<FulfilmentCommandResult>;
  markReady(orderId: string): Promise<FulfilmentCommandResult>;
  confirmPayment(
    input: SoloConfirmPaymentInput,
  ): Promise<PaymentConfirmationResult>;
  cancelUnpaidOrder(input: SoloCancelOrderInput): Promise<OrderCancellationResult>;
  revertPaidOrder(input: SoloRevertOrderInput): Promise<PaymentCorrectionResult>;
  setAvailability(
    menuItemId: string,
    isAvailable: boolean,
  ): Promise<CatalogCommandResult>;
}

async function activeTenantOrThrow(): Promise<string> {
  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return tenantId;
}

/**
 * Production ports. Each one calls the existing module adapter, which calls the
 * published `<module>-<action>` Cloud Function (docs/RULES_FIREBASE.md §2).
 */
export const soloOrderPorts: SoloOrderPorts = {
  startCooking: (orderId) => startCookingCommand(orderId),
  markReady: (orderId) => markReadyCommand(orderId),
  async confirmPayment(input) {
    const tenantId = await activeTenantOrThrow();
    return confirmPaymentCommand({
      tenantId,
      orderId: input.orderId,
      method: input.method,
      amountVnd: input.amountVnd,
      idempotencyKey: createSoloIdempotencyKey('pay'),
    });
  },
  async cancelUnpaidOrder(input) {
    const tenantId = await activeTenantOrThrow();
    const request: OrderCancelInput = {
      tenantId,
      orderId: input.orderId,
      reason: input.reason,
      idempotencyKey: createSoloIdempotencyKey('cancel'),
    };
    return cancelUnpaidOrderCommand(request);
  },
  async revertPaidOrder(input) {
    const tenantId = await activeTenantOrThrow();
    return correctPaymentCommand({
      tenantId,
      orderId: input.orderId,
      kind: 'reversal',
      reason: input.reason,
      idempotencyKey: createSoloIdempotencyKey('revert'),
    });
  },
  setAvailability: (menuItemId, isAvailable) =>
    setMenuAvailability(menuItemId, isAvailable),
};

export interface SoloOrderActionInput {
  orderId: string;
  status: OrderStatus | string;
  amountVnd: number;
  method?: PaymentMethod;
}

export interface SoloOrderActionOutcome {
  command: SoloOrderCommand;
  orderStatus: OrderStatus;
}

/**
 * Dispatch one Solo lifecycle action to the matching module command. The
 * outcome carries the server-authoritative Order status; the view never sets a
 * status itself. Returns null when the status has no Solo action.
 */
export async function runSoloOrderAction(
  ports: SoloOrderPorts,
  input: SoloOrderActionInput,
): Promise<SoloOrderActionOutcome | null> {
  const command = resolveSoloOrderCommand(input.status);
  if (!command) {
    return null;
  }

  if (command === 'startCooking') {
    const result = await ports.startCooking(input.orderId);
    return { command, orderStatus: result.order.status };
  }
  if (command === 'markReady') {
    const result = await ports.markReady(input.orderId);
    return { command, orderStatus: result.order.status };
  }

  const result = await ports.confirmPayment({
    orderId: input.orderId,
    amountVnd: input.amountVnd,
    method: input.method ?? 'cash',
  });
  return { command, orderStatus: result.orderStatus };
}

/** Cancel one unpaid Order through Ordering (REQ-CAS-002). */
export async function runSoloOrderCancel(
  ports: SoloOrderPorts,
  orderId: string,
  reason: string,
): Promise<OrderCancellationResult> {
  return ports.cancelUnpaidOrder({ orderId, reason });
}

/**
 * Revert one paid Order through the shared compensating Payment correction
 * (REQ-PAY-001). The original Payment stays immutable; the server writes a
 * linked `reversal` record.
 */
export async function runSoloOrderRevert(
  ports: SoloOrderPorts,
  orderId: string,
  reason: string,
): Promise<PaymentCorrectionResult> {
  return ports.revertPaidOrder({ orderId, reason });
}

/** Toggle item availability through Catalog (REQ-CAT-001, REQ-KDS-001). */
export async function runSoloAvailability(
  ports: SoloOrderPorts,
  menuItemId: string,
  isAvailable: boolean,
): Promise<CatalogCommandResult> {
  return ports.setAvailability(menuItemId, isAvailable);
}
