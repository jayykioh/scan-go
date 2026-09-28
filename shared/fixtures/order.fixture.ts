import type { OrderSnapshot, PublicOrderTracking, StatusEvent } from '../contracts/order.contract'

const baseOrder: OrderSnapshot = {
  orderId: 'order-001',
  tenantId: 'tenant-demo',
  tableId: '1',
  tableName: 'Bàn 01',
  paymentMode: 'Pay-Later',
  paymentConfirmed: false,
  visibleToKitchen: true,
  status: 'pending',
  lines: [{
    menuItemId: 'menu-pho-bo',
    name: 'Phở bò tái',
    quantity: 2,
    unitPriceVnd: 65000,
    modifierNames: [],
    modifierTotalVnd: 0,
    lineTotalVnd: 130000,
  }],
  totalVnd: 130000,
  trackingToken: 'tracking-order-001',
  createdAtUtc: '2026-09-28T03:00:00.000Z',
  updatedAtUtc: '2026-09-28T03:00:00.000Z',
}

export const payLaterOrderFixture: OrderSnapshot = baseOrder

export const payFirstAwaitingPaymentFixture: OrderSnapshot = {
  ...baseOrder,
  orderId: 'order-pay-first-001',
  paymentMode: 'Pay-First',
  visibleToKitchen: false,
  trackingToken: 'tracking-pay-first-001',
}

export const publicTrackingFixture: PublicOrderTracking = {
  trackingToken: baseOrder.trackingToken,
  orderId: baseOrder.orderId,
  tableName: baseOrder.tableName,
  status: baseOrder.status,
  totalVnd: baseOrder.totalVnd,
  updatedAtUtc: baseOrder.updatedAtUtc,
}

export const statusTransitionFixtures: ReadonlyArray<StatusEvent> = [
  ['pending', 'cooking', 'Kitchen'],
  ['cooking', 'ready', 'Kitchen'],
  ['ready', 'served', 'Waiter'],
].map(([from, to, actorRole], index) => ({
  eventId: `status-event-${index + 1}`,
  tenantId: baseOrder.tenantId,
  orderId: baseOrder.orderId,
  from,
  to,
  actorRole,
  occurredAtUtc: `2026-09-28T03:0${index + 1}:00.000Z`,
  idempotencyKey: `transition-${index + 1}`,
} as StatusEvent))
