import { z } from 'zod';
import { auditEventSchema } from './audit.contract.js';
import { customerPhoneRecordSchema } from './authorization.contract.js';
import { isoUtcTimestampSchema } from '../validation.js';

export const ADMIN_CONTRACT_VERSION = 2;

/** Bounded ADMIN reads so a list can never become an unbounded scan. */
export const ADMIN_TENANT_LIST_LIMIT = 50;
export const ADMIN_AUDIT_LIST_LIMIT = 100;
export const ADMIN_CUSTOMER_PHONE_LIST_LIMIT = 100;

export const adminTenantStateSchema = z.enum(['active', 'archived']);
export type AdminTenantState = z.infer<typeof adminTenantStateSchema>;

/**
 * The ADMIN-facing Tenant summary. ADMIN reads every Tenant through owning
 * module queries; this projection is derived server-side and never proves a
 * tenant membership (REQ-ADM-001).
 */
export const adminTenantSummarySchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  shopName: z.string(),
  industry: z.string().min(1),
  pricingTier: z.enum(['free', 'lite', 'pro']),
  paymentMode: z.enum(['payFirst', 'payLater']),
  state: adminTenantStateSchema,
  memberCount: z.number().int().nonnegative(),
  archivedAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type AdminTenantSummary = z.infer<typeof adminTenantSummarySchema>;

export const adminListTenantsInputSchema = z.strictObject({
  limit: z.number().int().positive().max(ADMIN_TENANT_LIST_LIMIT).optional(),
});

export type AdminListTenantsInput = z.infer<typeof adminListTenantsInputSchema>;

export const adminTenantListResultSchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  tenants: z.array(adminTenantSummarySchema),
});

export type AdminTenantListResult = z.infer<typeof adminTenantListResultSchema>;

export const adminOpenTenantInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type AdminOpenTenantInput = z.infer<typeof adminOpenTenantInputSchema>;

export const adminOpenTenantResultSchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  tenant: adminTenantSummarySchema,
});

export type AdminOpenTenantResult = z.infer<typeof adminOpenTenantResultSchema>;

/** Delegated Tenant state commands are owned by the Tenant module. */
export const adminTenantChangeActionSchema = z.enum(['archive', 'restore']);
export type AdminTenantChangeAction = z.infer<
  typeof adminTenantChangeActionSchema
>;

export const adminChangeTenantInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  action: adminTenantChangeActionSchema,
  reason: z.string().trim().min(1).max(200),
});

export type AdminChangeTenantInput = z.infer<
  typeof adminChangeTenantInputSchema
>;

export const adminChangeTenantResultSchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  tenant: adminTenantSummarySchema,
  auditEventId: z.string().min(1),
});

export type AdminChangeTenantResult = z.infer<
  typeof adminChangeTenantResultSchema
>;

export const adminListAuditInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z.number().int().positive().max(ADMIN_AUDIT_LIST_LIMIT).optional(),
});

export type AdminListAuditInput = z.infer<typeof adminListAuditInputSchema>;

export const adminAuditListResultSchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  events: z.array(auditEventSchema),
});

export type AdminAuditListResult = z.infer<typeof adminAuditListResultSchema>;

export const adminCustomerPhoneQueryInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z
    .number()
    .int()
    .positive()
    .max(ADMIN_CUSTOMER_PHONE_LIST_LIMIT)
    .optional(),
});

export type AdminCustomerPhoneQueryInput = z.infer<
  typeof adminCustomerPhoneQueryInputSchema
>;

export const adminCustomerPhoneListResultSchema = z.strictObject({
  schemaVersion: z.literal(ADMIN_CONTRACT_VERSION),
  records: z.array(customerPhoneRecordSchema),
});

export type AdminCustomerPhoneListResult = z.infer<
  typeof adminCustomerPhoneListResultSchema
>;
