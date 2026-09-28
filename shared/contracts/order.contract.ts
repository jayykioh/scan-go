import type { InventoryMutationPlan } from './inventory.contract'

export type PaymentMode = 'Pay-First' | 'Pay-Later'
export type OrderStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'paid' | 'cancelled'

export interface CartLineInput {
  menuItemId: string
  quantity: number
  modifierIds: ReadonlyArray<string>
}

export interface CartValidationRequest {
  tableToken: string
  paymentMode: PaymentMode
  lines: ReadonlyArray<CartLineInput>
}

export type CartValidationErrorCode =
  | 'EMPTY_CART'
  | 'INVALID_TABLE_TOKEN'
  | 'ITEM_UNAVAILABLE'
  | 'INVALID_QUANTITY'
  | 'INVALID_VND_AMOUNT'
  | 'RATE_LIMITED'

export interface ValidatedOrderLine {
  menuItemId: string
  name: string
  quantity: number
  unitPriceVnd: number
  modifierNames: ReadonlyArray<string>
  modifierTotalVnd: number
  lineTotalVnd: number
}

export type CartValidation =
  | {
      valid: true
      tenantId: string
      tableId: string
      paymentMode: PaymentMode
      lines: ReadonlyArray<ValidatedOrderLine>
      totalVnd: number
    }
  | {
      valid: false
      code: CartValidationErrorCode
      message: string
    }

export interface OrderSnapshot {
  orderId: string
  tenantId: string
  tableId: string
  tableName: string
  paymentMode: PaymentMode
  paymentConfirmed: boolean
  visibleToKitchen: boolean
  status: OrderStatus
  lines: ReadonlyArray<ValidatedOrderLine>
  totalVnd: number
  trackingToken: string
  createdAtUtc: string
  updatedAtUtc: string
}

export interface PublicOrderTracking {
  trackingToken: string
  orderId: string
  tableName: string
  status: Exclude<OrderStatus, 'cancelled'> | 'cancelled'
  totalVnd: number
  updatedAtUtc: string
}

export interface StatusEvent {
  eventId: string
  tenantId: string
  orderId: string
  from: OrderStatus
  to: OrderStatus
  actorRole: 'Kitchen' | 'Waiter' | 'Cashier' | 'System'
  occurredAtUtc: string
  idempotencyKey: string
}

/** Ordering owns the eventual Order write; Fulfilment only prepares this request. */
export interface OrderStatusMutationRequest {
  tenantId: string
  orderId: string
  expectedStatus: OrderStatus
  nextStatus: OrderStatus
  actorRole: StatusEvent['actorRole']
  idempotencyKey: string
  inventoryPlan?: InventoryMutationPlan
}

export interface SubmitOrderRequest {
  idempotencyKey: string
  cart: CartValidationRequest
}

export type SubmitOrderResult =
  | { accepted: true; order: OrderSnapshot }
  | { accepted: false; reason: 'OFFLINE' | CartValidationErrorCode; message: string }
