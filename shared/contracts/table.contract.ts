import { z } from 'zod';
import { isoUtcTimestampSchema, positiveIntSchema } from '../validation.js';

export const TABLE_CONTRACT_VERSION = 2;

/**
 * Floor plan bounds (REQ-TBL-002). The Owner arranges tables on a fixed grid so
 * a saved position always means the same place on every screen and every
 * viewport; the client scales grid cells to the canvas, it never stores pixels.
 */
export const TABLE_FLOOR_COLUMNS = 12;
export const TABLE_FLOOR_ROWS = 10;
export const TABLE_MAX_SEATS = 50;
export const TABLE_AREA_MAX_LENGTH = 60;
/** Area shown when the Owner never named one. */
export const DEFAULT_TABLE_AREA = 'Khu chính';

export const tablePositionSchema = z.strictObject({
  x: z.number().int().min(0).max(TABLE_FLOOR_COLUMNS - 1),
  y: z.number().int().min(0).max(TABLE_FLOOR_ROWS - 1),
});

export type TablePosition = z.infer<typeof tablePositionSchema>;

/** Stored presentation of one table; every field is nullable for old rows. */
export const tableLayoutSchema = z.strictObject({
  area: z.string().min(1).max(TABLE_AREA_MAX_LENGTH).nullable(),
  seats: z.number().int().min(1).max(TABLE_MAX_SEATS).nullable(),
  position: tablePositionSchema.nullable(),
});

export type TableLayout = z.infer<typeof tableLayoutSchema>;

export const EMPTY_TABLE_LAYOUT: TableLayout = {
  area: null,
  seats: null,
  position: null,
};

/**
 * Read the layout off a stored table document. Rows written before the floor
 * plan existed simply have no fields, so every value falls back to `null`
 * instead of failing the read.
 */
export function readStoredTableLayout(data: unknown): TableLayout {
  const source = (data ?? {}) as Record<string, unknown>;
  const parsed = tableLayoutSchema.safeParse({
    area: typeof source.area === 'string' && source.area.length > 0 ? source.area : null,
    seats: typeof source.seats === 'number' ? source.seats : null,
    position:
      source.position && typeof source.position === 'object'
        ? source.position
        : null,
  });
  return parsed.success ? parsed.data : { ...EMPTY_TABLE_LAYOUT };
}

export const tableLinkStatusSchema = z.enum([
  'active',
  'revoked',
  'expired',
  'unknown',
]);

export type TableLinkStatus = z.infer<typeof tableLinkStatusSchema>;

export const tableLinkContextSchema = z
  .strictObject({
    schemaVersion: z.literal(TABLE_CONTRACT_VERSION),
    token: z.string().min(1),
    tenantId: z.string().min(1),
    tableId: z.string().min(1),
    tableName: z.string().min(1),
    tokenVersion: positiveIntSchema,
    status: tableLinkStatusSchema,
    isActive: z.boolean(),
    createdAt: isoUtcTimestampSchema,
    revokedAt: isoUtcTimestampSchema.nullable(),
  })
  .refine((context) => context.isActive === (context.status === 'active'), {
    message: 'isActive must match an active token status',
  });

export type TableLinkContext = z.infer<typeof tableLinkContextSchema>;

export const tableTokenRotationSchema = z
  .strictObject({
    schemaVersion: z.literal(TABLE_CONTRACT_VERSION),
    tenantId: z.string().min(1),
    tableId: z.string().min(1),
    tableName: z.string().min(1),
    previousToken: z.string().min(1).nullable(),
    previousTokenVersion: positiveIntSchema.nullable(),
    newToken: z.string().min(1),
    newTokenVersion: positiveIntSchema,
    rotatedAt: isoUtcTimestampSchema,
  })
  .refine(
    (rotation) =>
      rotation.previousTokenVersion === null
        ? rotation.newTokenVersion === 1
        : rotation.newTokenVersion === rotation.previousTokenVersion + 1,
    { message: 'newTokenVersion must follow the previous version' },
  );

export type TableTokenRotation = z.infer<typeof tableTokenRotationSchema>;

export const tableCommandSchema = z.enum([
  'create',
  'rename',
  'archive',
  'regenerate',
  'configure',
]);

export type TableCommand = z.infer<typeof tableCommandSchema>;

export const tableCommandStatusSchema = z.enum(['applied', 'rejected', 'noop']);

export type TableCommandStatus = z.infer<typeof tableCommandStatusSchema>;

export const tableCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(TABLE_CONTRACT_VERSION),
  command: tableCommandSchema,
  status: tableCommandStatusSchema,
  tableId: z.string().min(1).nullable(),
  context: tableLinkContextSchema.nullable(),
  rotation: tableTokenRotationSchema.nullable(),
  version: positiveIntSchema,
  reason: z.string().min(1).nullable(),
  appliedAt: isoUtcTimestampSchema,
});

export type TableCommandResult = z.infer<typeof tableCommandResultSchema>;

export const tableCreateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(100),
  /**
   * Optional starting layout (REQ-TBL-002). Sent with the create so a new table
   * lands in its cell in one command instead of a create followed by a
   * configure that could half-fail.
   */
  area: z.string().min(1).max(TABLE_AREA_MAX_LENGTH).nullable().default(null),
  seats: z.number().int().min(1).max(TABLE_MAX_SEATS).nullable().default(null),
  position: tablePositionSchema.nullable().default(null),
});

export type TableCreateInput = z.infer<typeof tableCreateInputSchema>;

export const tableRenameInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  name: z.string().min(1).max(100),
});

export type TableRenameInput = z.infer<typeof tableRenameInputSchema>;

export const tableArchiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  reason: z.string().max(500).nullable(),
});

export type TableArchiveInput = z.infer<typeof tableArchiveInputSchema>;

export const tableRegenerateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
});

export type TableRegenerateInput = z.infer<
  typeof tableRegenerateInputSchema
>;

/**
 * Owner command: replace one table's floor-plan layout (REQ-TBL-002). All three
 * fields are sent together so a save is a full, predictable replace: `null`
 * clears a value instead of leaving a stale one behind.
 */
export const tableConfigureInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  area: z.string().min(1).max(TABLE_AREA_MAX_LENGTH).nullable(),
  seats: z.number().int().min(1).max(TABLE_MAX_SEATS).nullable(),
  position: tablePositionSchema.nullable(),
});

export type TableConfigureInput = z.infer<typeof tableConfigureInputSchema>;

export const tableResolveInputSchema = z.strictObject({
  token: z.string().min(1).max(256),
  tenantId: z.string().min(1).nullable(),
});

export type TableResolveInput = z.infer<typeof tableResolveInputSchema>;
