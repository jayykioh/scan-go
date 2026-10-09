import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

export const TABLE_STATUS_CONTRACT_VERSION = 1;

/**
 * Service state of one table on the floor plan (REQ-TBL-003).
 *
 * The state is derived from live Orders by the server so the floor plan, the
 * Kitchen board, and the till cannot disagree about a table. Precedence, most
 * urgent first: `awaitingPayment` (the guest is done and owes money),
 * `foodReady` (a dish is waiting to be served), `occupied` (an open Order),
 * `free`.
 */
export const tableServiceStateSchema = z.enum([
  'free',
  'occupied',
  'foodReady',
  'awaitingPayment',
]);

export type TableServiceState = z.infer<typeof tableServiceStateSchema>;

export interface TableServiceFacts {
  /** Orders that are still open: pending, cooking, ready, or served. */
  activeOrderCount: number;
  /** Open Orders whose status is `ready`. */
  readyOrderCount: number;
  /** `served` Orders with no settled payment. */
  unsettledOrderCount: number;
}

export function deriveTableServiceState({
  activeOrderCount,
  readyOrderCount,
  unsettledOrderCount,
}: TableServiceFacts): TableServiceState {
  if (activeOrderCount <= 0) {
    return 'free';
  }
  if (unsettledOrderCount > 0) {
    return 'awaitingPayment';
  }
  if (readyOrderCount > 0) {
    return 'foodReady';
  }
  return 'occupied';
}

/**
 * One table on the plan. Deliberately carries no money, no Customer identity,
 * and no Order line: the Waiter board and the floor plan may both read it
 * without widening what a reduced Staff role can see (NFR-SEC-001).
 */
export const tableServiceStatusSchema = z.strictObject({
  tableId: z.string().min(1),
  state: tableServiceStateSchema,
  activeOrderCount: z.number().int().min(0),
  readyOrderCount: z.number().int().min(0),
  unsettledOrderCount: z.number().int().min(0),
  oldestActiveOrderAt: isoUtcTimestampSchema.nullable(),
});

export type TableServiceStatus = z.infer<typeof tableServiceStatusSchema>;

export const tableStatusListResultSchema = z.strictObject({
  schemaVersion: z.literal(TABLE_STATUS_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  generatedAt: isoUtcTimestampSchema,
  tables: z.array(tableServiceStatusSchema),
});

export type TableStatusListResult = z.infer<
  typeof tableStatusListResultSchema
>;

export const tableStatusListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type TableStatusListInput = z.infer<typeof tableStatusListInputSchema>;
