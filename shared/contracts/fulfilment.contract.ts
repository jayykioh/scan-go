import type { NotificationEvent } from './notification.contract'
import type { OrderSnapshot, OrderStatusMutationRequest } from './order.contract'

export interface KitchenQueue {
  orders: ReadonlyArray<OrderSnapshot>
}

export interface WaiterQueue {
  orders: ReadonlyArray<OrderSnapshot>
}

export interface PreparedFulfilmentTransition {
  orderMutation: OrderStatusMutationRequest
  notification?: NotificationEvent
}

export interface FulfilmentComposer {
  kitchenQueue(orders: ReadonlyArray<OrderSnapshot>): KitchenQueue
  waiterQueue(orders: ReadonlyArray<OrderSnapshot>): WaiterQueue
  prepareTransition(request: OrderStatusMutationRequest): PreparedFulfilmentTransition
}
