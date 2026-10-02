import { z } from 'zod';
import { isoUtcTimestampSchema, positiveIntSchema } from '../validation.js';

export const TABLE_CONTRACT_VERSION = 1;

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

export const tableResolveInputSchema = z.strictObject({
  token: z.string().min(1).max(256),
  tenantId: z.string().min(1).nullable(),
});

export type TableResolveInput = z.infer<typeof tableResolveInputSchema>;
