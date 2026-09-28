import type { NotificationEvent } from '../contracts/notification.contract'
import { payLaterOrderFixture } from './order.fixture'

export const kitchenQueueDouble = {
  orders: [payLaterOrderFixture],
}

export const waiterQueueDouble = {
  orders: [{ ...payLaterOrderFixture, status: 'ready' as const }],
}

export const notificationEventFixture: NotificationEvent = {
  eventId: 'notification-order-ready-001',
  tenantId: 'tenant-demo',
  orderId: 'order-001',
  audience: 'Waiter',
  kind: 'ORDER_READY',
  title: 'Đơn đã sẵn sàng',
  body: 'Bàn 01 đang chờ phục vụ.',
  occurredAtUtc: '2026-09-28T03:02:00.000Z',
  dedupeKey: 'order-001:ready',
}
