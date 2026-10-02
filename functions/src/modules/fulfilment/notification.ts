import type { Firestore, Transaction } from 'firebase-admin/firestore';
import {
  NOTIFICATION_CONTRACT_VERSION,
  buildNotificationEventId,
  notificationChannelForKind,
  notificationEventSchema,
  type NotificationEvent,
  type NotificationEventKind,
} from '../../../../shared/contracts/notification.contract.js';
import type { OrderSnapshot } from '../../../../shared/contracts/order.contract.js';

/**
 * Notification effects are tenant-scoped projections below the Tenant root.
 * Fulfilment owns the effect; Ordering still owns the Order mutation
 * (docs/module/fulfilment.md, docs/RULES_FIREBASE.md §5).
 */
export function notificationCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/notifications`;
}

export interface BuildOrderNotificationInput {
  tenantId: string;
  kind: NotificationEventKind;
  order: OrderSnapshot;
  now: string;
}

/**
 * Build one deduplicated notification effect. The deterministic `eventId`
 * means a transaction retry overwrites the same document and never produces a
 * second effect (REQ-NOT-001).
 */
export function buildOrderNotificationEvent(
  input: BuildOrderNotificationInput,
): NotificationEvent {
  const channel = notificationChannelForKind(input.kind);
  return notificationEventSchema.parse({
    schemaVersion: NOTIFICATION_CONTRACT_VERSION,
    eventId: buildNotificationEventId({
      channel,
      kind: input.kind,
      orderId: input.order.orderId,
    }),
    tenantId: input.tenantId,
    channel,
    kind: input.kind,
    orderId: input.order.orderId,
    tableName: input.order.tableNameSnapshot,
    createdAt: input.now,
  });
}

/** Apply one notification effect inside the coordinator's transaction. */
export function applyOrderNotificationPlan(
  transaction: Transaction,
  db: Firestore,
  event: NotificationEvent,
): void {
  transaction.set(
    db.doc(`${notificationCollectionPath(event.tenantId)}/${event.eventId}`),
    event,
  );
}
