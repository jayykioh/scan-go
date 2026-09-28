export interface NotificationEvent {
  eventId: string
  tenantId: string
  orderId: string
  audience: 'Kitchen' | 'Waiter'
  kind: 'NEW_KITCHEN_ORDER' | 'ORDER_READY'
  title: string
  body: string
  occurredAtUtc: string
  dedupeKey: string
}
