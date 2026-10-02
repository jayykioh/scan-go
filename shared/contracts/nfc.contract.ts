import { z } from 'zod';
import { isoUtcTimestampSchema, positiveIntSchema } from '../validation.js';
import { tableLinkContextSchema } from './table.contract.js';

export const NFC_CONTRACT_VERSION = 1;

/**
 * One opaque NFC tag session. A provisioned tag encodes only this random
 * token, never a Tenant, table id, or QR token (REQ-NFC-001, NFR-SEC-002).
 *
 * DEVICE STEP (TODO): writing the NDEF record on a physical tag and reading it
 * with a supported device is outside the Functions runtime. The server seam
 * below provisions, verifies, and revokes the token that the device step uses.
 */
export const nfcSessionSchema = z.strictObject({
  schemaVersion: z.literal(NFC_CONTRACT_VERSION),
  nfcToken: z.string().min(1),
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
  tableName: z.string().min(1),
  tokenVersion: positiveIntSchema,
  isActive: z.boolean(),
  createdAt: isoUtcTimestampSchema,
  revokedAt: isoUtcTimestampSchema.nullable(),
});
export type NfcSession = z.infer<typeof nfcSessionSchema>;

export const nfcProvisionInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
});
export type NfcProvisionInput = z.infer<typeof nfcProvisionInputSchema>;

export const nfcProvisionResultSchema = z.strictObject({
  schemaVersion: z.literal(NFC_CONTRACT_VERSION),
  status: z.enum(['provisioned', 'replayed']),
  session: nfcSessionSchema,
});
export type NfcProvisionResult = z.infer<typeof nfcProvisionResultSchema>;

export const nfcRevokeInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  tableId: z.string().min(1),
});
export type NfcRevokeInput = z.infer<typeof nfcRevokeInputSchema>;

export const nfcRevokeResultSchema = z.strictObject({
  schemaVersion: z.literal(NFC_CONTRACT_VERSION),
  status: z.enum(['revoked', 'noop']),
  session: nfcSessionSchema.nullable(),
  revokedAt: isoUtcTimestampSchema.nullable(),
});
export type NfcRevokeResult = z.infer<typeof nfcRevokeResultSchema>;

/** Verification step: the device resolves the tag token back to table context. */
export const nfcResolveInputSchema = z.strictObject({
  token: z.string().min(1).max(256),
});
export type NfcResolveInput = z.infer<typeof nfcResolveInputSchema>;

export const nfcResolveResultSchema = z.strictObject({
  schemaVersion: z.literal(NFC_CONTRACT_VERSION),
  session: nfcSessionSchema,
  context: tableLinkContextSchema,
});
export type NfcResolveResult = z.infer<typeof nfcResolveResultSchema>;
