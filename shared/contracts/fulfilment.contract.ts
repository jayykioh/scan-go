import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';
import {
  inventoryDeductionPlanSchema,
} from './inventory.contract.js';
import { orderSnapshotSchema } from './order.contract.js';

export const FULFILMENT_CONTRACT_VERSION = 1;

/**
 * Kitchen owns `pending → cooking → ready` only. Waiter `ready → served` and
 * cancellation belong to other tickets (docs/module/fulfilment.md, REQ-KDS-001).
 */
export const kitchenTransitionTargetSchema = z.enum(['cooking', 'ready']);

export type KitchenTransitionTarget = z.infer<
  typeof kitchenTransitionTargetSchema
>;

/** Waiter owns `ready → served` only. */
export const servedTransitionTargetSchema = z.literal('served');

export type ServedTransitionTarget = z.infer<
  typeof servedTransitionTargetSchema
>;

export const fulfilmentCommandSchema = z.enum([
  'startCooking',
  'markReady',
  'markServed',
]);

export type FulfilmentCommand = z.infer<typeof fulfilmentCommandSchema>;

const kitchenCommandFields = {
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  idempotencyKey: z.string().min(8).max(128),
} as const;

export const fulfilmentStartCookingInputSchema = z.strictObject({
  ...kitchenCommandFields,
});

export type FulfilmentStartCookingInput = z.infer<
  typeof fulfilmentStartCookingInputSchema
>;

export const fulfilmentMarkReadyInputSchema = z.strictObject({
  ...kitchenCommandFields,
});

export type FulfilmentMarkReadyInput = z.infer<
  typeof fulfilmentMarkReadyInputSchema
>;

export const fulfilmentMarkServedInputSchema = z.strictObject({
  ...kitchenCommandFields,
});

export type FulfilmentMarkServedInput = z.infer<
  typeof fulfilmentMarkServedInputSchema
>;

/**
 * Result of one Kitchen command. `replayed` is true when an existing
 * idempotency record returned the prior result without new effects.
 */
export const fulfilmentCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(FULFILMENT_CONTRACT_VERSION),
  command: fulfilmentCommandSchema,
  status: z.enum(['applied', 'replayed']),
  order: orderSnapshotSchema,
  deduction: inventoryDeductionPlanSchema.nullable(),
  movementIds: z.array(z.string().min(1)),
  appliedAt: isoUtcTimestampSchema,
});

export type FulfilmentCommandResult = z.infer<
  typeof fulfilmentCommandResultSchema
>;
