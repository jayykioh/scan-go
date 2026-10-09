import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

/**
 * Staff account contract (REQ-AUTH-003).
 *
 * The Owner provisions one Firebase Auth account per Staff member and assigns
 * tenant-scoped roles. The plaintext PIN is never part of this contract; only
 * the stored hash exists on the membership document (REQ-AUTH-002).
 */
export const STAFF_CONTRACT_VERSION = 1;

/** The named operational roles a Staff member may carry (docs/glossary.md). */
export const staffRoleSchema = z.enum(['kitchen', 'waiter', 'cashier']);
export type StaffRole = z.infer<typeof staffRoleSchema>;

export const staffAccountSchema = z.strictObject({
  schemaVersion: z.literal(STAFF_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  email: z.string().min(1).nullable(),
  displayName: z.string().min(1).nullable(),
  roles: z.array(staffRoleSchema).min(1),
  permissions: z.array(z.string().min(1)),
  isActive: z.boolean(),
  /** True when a PIN hash exists; the hash itself never leaves the server. */
  hasPin: z.boolean(),
  lastLoginAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type StaffAccount = z.infer<typeof staffAccountSchema>;

export const staffListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type StaffListInput = z.infer<typeof staffListInputSchema>;

export const staffListResultSchema = z.strictObject({
  schemaVersion: z.literal(STAFF_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  staff: z.array(staffAccountSchema),
});

export type StaffListResult = z.infer<typeof staffListResultSchema>;

export const staffCreateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  email: z.string().trim().email().max(200),
  password: z.string().min(6).max(72),
  displayName: z.string().trim().min(1).max(80),
  roles: z.array(staffRoleSchema).min(1),
  permissions: z.array(z.string().min(1).max(80)).default([]),
  pin: z.string().regex(/^\d{4,10}$/),
});

export type StaffCreateInput = z.infer<typeof staffCreateInputSchema>;

export const staffUpdateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  displayName: z.string().trim().min(1).max(80),
  roles: z.array(staffRoleSchema).min(1),
  permissions: z.array(z.string().min(1).max(80)).default([]),
});

export type StaffUpdateInput = z.infer<typeof staffUpdateInputSchema>;

export const staffSetActiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  isActive: z.boolean(),
});

export type StaffSetActiveInput = z.infer<typeof staffSetActiveInputSchema>;

export const staffResetPinInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  pin: z.string().regex(/^\d{4,10}$/),
});

export type StaffResetPinInput = z.infer<typeof staffResetPinInputSchema>;

export const staffCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(STAFF_CONTRACT_VERSION),
  status: z.literal('applied'),
  staff: staffAccountSchema,
});

export type StaffCommandResult = z.infer<typeof staffCommandResultSchema>;
