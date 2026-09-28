import type { PreparedFulfilmentTransition } from '../../../shared/contracts/fulfilment.contract'
import type { NotificationEvent } from '../../../shared/contracts/notification.contract'
import type { OrderSnapshot, OrderStatus, OrderStatusMutationRequest } from '../../../shared/contracts/order.contract'

const allowedTransitions: Readonly<Record<string, ReadonlyArray<OrderStatus>>> = {
  Kitchen: ['cooking', 'ready'],
  Waiter: ['served'],
}

export const kitchenQueue = (orders: ReadonlyArray<OrderSnapshot>) => ({
  orders: [...orders]
    .filter(order => order.visibleToKitchen && (order.status === 'pending' || order.status === 'cooking'))
    .sort((left, right) => left.createdAtUtc.localeCompare(right.createdAtUtc)),
})

export const waiterQueue = (orders: ReadonlyArray<OrderSnapshot>) => ({
  orders: [...orders]
    .filter(order => order.status === 'ready')
    .sort((left, right) => left.updatedAtUtc.localeCompare(right.updatedAtUtc)),
})

export function prepareFulfilmentTransition(request: OrderStatusMutationRequest): PreparedFulfilmentTransition {
  if (!allowedTransitions[request.actorRole]?.includes(request.nextStatus)) {
    throw new Error(`${request.actorRole} cannot transition an order to ${request.nextStatus}`)
  }
  const expectedNext: Partial<Record<OrderStatus, OrderStatus>> = {
    pending: 'cooking',
    cooking: 'ready',
    ready: 'served',
  }
  if (expectedNext[request.expectedStatus] !== request.nextStatus) {
    throw new Error(`Invalid transition ${request.expectedStatus} -> ${request.nextStatus}`)
  }
  if (request.nextStatus === 'cooking' && !request.inventoryPlan) {
    throw new Error('Starting cooking requires an InventoryMutationPlan')
  }
  if (request.inventoryPlan && (request.inventoryPlan.tenantId !== request.tenantId || request.inventoryPlan.orderId !== request.orderId)) {
    throw new Error('InventoryMutationPlan must target the same tenant and order')
  }

  let notification: NotificationEvent | undefined
  if (request.nextStatus === 'ready') {
    notification = {
      eventId: `notification:${request.idempotencyKey}`,
      tenantId: request.tenantId,
      orderId: request.orderId,
      audience: 'Waiter',
      kind: 'ORDER_READY',
      title: 'Đơn đã sẵn sàng',
      body: `Đơn ${request.orderId} đang chờ phục vụ.`,
      occurredAtUtc: new Date().toISOString(),
      dedupeKey: `${request.orderId}:ready`,
    }
  }
  return { orderMutation: request, notification }
}
