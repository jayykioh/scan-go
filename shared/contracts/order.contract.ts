import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';
import { paymentMethodSchema } from './payment.contract.js';

export const ORDER_CONTRACT_VERSION = 1;

/** Server-authoritative Order lifecycle statuses (docs/module/ordering.md). */
export const orderStatusSchema = z.enum([
  'pending',
  'cooking',
  'ready',
  'served',
  'paid',
  'cancelled',
]);

export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Owner-configured payment modes are stored in lower camel case. */
export const orderPaymentModeSchema = z.enum(['payFirst', 'payLater']);

export type OrderPaymentMode = z.infer<typeof orderPaymentModeSchema>;

/** One selected modifier option snapshotted on an Order line. */
export const orderLineModifierSchema = z.strictObject({
  optionId: z.string().min(1),
  name: z.string().min(1),
  priceDeltaVnd: nonNegativeIntSchema,
});

export type OrderLineModifier = z.infer<typeof orderLineModifierSchema>;

/**
 * Immutable item snapshot. The server rewrites name, unit price, and cost from
 * the current public menu item so the client can never set money values
 * (REQ-ORD-001, NFR-DATA-001).
 */
export const orderLineSnapshotSchema = z.strictObject({
  lineId: z.string().min(1),
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  modifiers: z.array(orderLineModifierSchema),
  unitPriceVnd: vndSchema,
  quantity: positiveIntSchema,
  lineTotalVnd: vndSchema,
  unitCostVnd: vndSchema,
  lineCostVnd: vndSchema,
});

export type OrderLineSnapshot = z.infer<typeof orderLineSnapshotSchema>;

/**
 * Requested cart line from the Customer. No price, name, or cost is accepted;
 * the server resolves them from the current public menu projection.
 */
export const orderCartLineInputSchema = z.strictObject({
  menuItemId: z.string().min(1),
  quantity: positiveIntSchema,
  selectedOptionIds: z.array(z.string().min(1)),
});

export type OrderCartLineInput = z.infer<typeof orderCartLineInputSchema>;

export const orderSubmitInputSchema = z.strictObject({
  token: z.string().min(1).max(256),
  paymentMode: orderPaymentModeSchema,
  idempotencyKey: z.string().min(8).max(128),
  lines: z.array(orderCartLineInputSchema).min(1).max(100),
});

export type OrderSubmitInput = z.infer<typeof orderSubmitInputSchema>;

export const orderSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  orderId: z.string().min(1),
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  tableNameSnapshot: z.string().min(1),
  status: orderStatusSchema,
  paymentMode: orderPaymentModeSchema,
  items: z.array(orderLineSnapshotSchema).min(1),
  subtotalVnd: vndSchema,
  totalVnd: vndSchema,
  trackingToken: z.string().min(1),
  idempotencyKey: z.string().min(1),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type OrderSnapshot = z.infer<typeof orderSnapshotSchema>;

/** One append-only status history entry. */
export const orderStatusEventSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  eventId: z.string().min(1),
  previousStatus: orderStatusSchema.nullable(),
  newStatus: orderStatusSchema,
  actorType: z.enum(['customer', 'staff', 'system']),
  actorUid: z.string().min(1).nullable(),
  reason: z.string().min(1).nullable(),
  createdAt: isoUtcTimestampSchema,
});

export type OrderStatusEvent = z.infer<typeof orderStatusEventSchema>;

/**
 * Public tracking projection. It carries only public-safe fields and never
 * raw Customer phone values (docs/data-model.md, NFR-PRIV-001).
 */
export const publicOrderTrackingSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  trackingToken: z.string().min(1),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  tableName: z.string().min(1),
  itemSummary: z.string().min(1),
  totalVnd: vndSchema,
  status: orderStatusSchema,
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type PublicOrderTracking = z.infer<typeof publicOrderTrackingSchema>;

export const orderSubmitResultSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  status: z.literal('created'),
  order: orderSnapshotSchema,
  tracking: publicOrderTrackingSchema,
  /** True when an existing idempotency record returned the prior result. */
  replayed: z.boolean(),
});

export type OrderSubmitResult = z.infer<typeof orderSubmitResultSchema>;

/**
 * Validated Order mutation plan. Ordering owns every Order document mutation
 * requested by Fulfilment or Payment, so the coordinator composes this plan and
 * applies it inside one shared transaction (docs/module/ordering.md).
 */
export const orderStatusMutationPlanSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  previousStatus: orderStatusSchema,
  nextStatus: orderStatusSchema,
  statusEvent: orderStatusEventSchema,
  items: z.array(orderLineSnapshotSchema).min(1),
  /**
   * Public tracking projection the same command commits so Customer views see
   * the status change within the realtime bound (REQ-ORD-003, NFR-RT-001).
   */
  tracking: publicOrderTrackingSchema,
  lifecycleAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type OrderStatusMutationPlan = z.infer<
  typeof orderStatusMutationPlanSchema
>;

/**
 * Validated Order mutation plan for a confirmed Payment. Payment owns the
 * Payment record; Ordering owns this Order write (docs/module/ordering.md).
 * A Pay-Later Order moves to `paid`; a Pay-First Order keeps its preparation
 * status and records `paidAt` so Kitchen releases it only after payment.
 */
export const orderPaymentMutationPlanSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  previousStatus: orderStatusSchema,
  nextStatus: orderStatusSchema,
  paymentMethod: paymentMethodSchema,
  paidAt: isoUtcTimestampSchema,
  /** Present only when the Order status actually changes. */
  statusEvent: orderStatusEventSchema.nullable(),
  tracking: publicOrderTrackingSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type OrderPaymentMutationPlan = z.infer<
  typeof orderPaymentMutationPlanSchema
>;

/**
 * Cashier cancellation input. A reason is mandatory and the server owns the
 * Order state change and the Inventory restoration (REQ-CAS-002, REQ-INV-002).
 */
export const orderCancelInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().min(8).max(128),
});

export type OrderCancelInput = z.infer<typeof orderCancelInputSchema>;

export const orderCancellationResultSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  status: z.enum(['cancelled', 'replayed']),
  order: orderSnapshotSchema,
  /** Deterministic stock-movement ids restored by the same transaction. */
  restoredMovementIds: z.array(z.string().min(1)),
});

export type OrderCancellationResult = z.infer<
  typeof orderCancellationResultSchema
>;

export const orderTenantListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type OrderTenantListInput = z.infer<typeof orderTenantListInputSchema>;

export const orderListResultSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  orders: z.array(orderSnapshotSchema),
});

export type OrderListResult = z.infer<typeof orderListResultSchema>;

export const orderTrackingInputSchema = z.strictObject({
  trackingToken: z.string().min(1).max(256),
});

export type OrderTrackingInput = z.infer<typeof orderTrackingInputSchema>;

export const orderTrackingResultSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  tracking: publicOrderTrackingSchema.nullable(),
});

export type OrderTrackingResult = z.infer<typeof orderTrackingResultSchema>;

/**
 * One paid Order selected for the retention archive. The copy keeps the record
 * recoverable while the source document stays in place with `archivedAt`
 * (NFR-RET-001, docs/data-model.md §10).
 */
export const orderArchiveLineSchema = z.strictObject({
  orderId: z.string().min(1),
  paidAt: isoUtcTimestampSchema,
  archivePath: z.string().min(1),
});

export type OrderArchiveLine = z.infer<typeof orderArchiveLineSchema>;

/**
 * Immutable archive plan composed by Ordering from paid Orders older than the
 * configured retention window. Applying the plan copies each Order to the
 * archive collection and marks the source archived, so a retry never duplicates
 * or deletes a protected record (NFR-RET-001, NFR-REL-001).
 */
export const orderArchivePlanSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  cutoffAt: isoUtcTimestampSchema,
  retentionYears: z.number().int().positive(),
  lines: z.array(orderArchiveLineSchema),
  createdAt: isoUtcTimestampSchema,
});

export type OrderArchivePlan = z.infer<typeof orderArchivePlanSchema>;

/**
 * Validated Order mutation for a paid-order reversal or refund. Ordering owns
 * the Order write; Payment owns the compensating Payment record
 * (REQ-PAY-001, docs/module/ordering.md).
 */
export const orderCorrectionMutationPlanSchema = z.strictObject({
  schemaVersion: z.literal(ORDER_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  kind: z.enum(['reversal', 'refund']),
  correctedAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type OrderCorrectionMutationPlan = z.infer<
  typeof orderCorrectionMutationPlanSchema
>;
