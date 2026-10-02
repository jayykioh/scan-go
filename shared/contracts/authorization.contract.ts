import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

export const AUTHORIZATION_CONTRACT_VERSION = 1;

/**
 * The named permission that gates Customer phone visibility (NFR-PRIV-001).
 * ADMIN bypasses the tenant permission set but stays automatically audited.
 */
export const CUSTOMER_PHONE_PERMISSION = 'customer.phone.read';

/** Bounded Customer-phone projection query (NFR-PRIV-001). */
export const CUSTOMER_PHONE_QUERY_LIMIT = 100;

export const authorizationReasonSchema = z.enum([
  'allowed',
  'admin_bypass',
  'unauthenticated',
  'no_membership',
  'inactive_membership',
  'disabled_membership',
  'session_revoked',
  'missing_permission',
]);

export type AuthorizationReason = z.infer<typeof authorizationReasonSchema>;

/**
 * Every command states the Tenant it acts on explicitly. `users/{uid}.activeTenantId`
 * is navigation state only and never authorizes access. The server must verify
 * the caller's active membership for the requested `tenantId` before it runs a
 * command, regardless of the navigation value. The strict request therefore
 * requires `tenantId` and rejects any payload that substitutes `activeTenantId`.
 */
export const authorizationRequestSchema = z.strictObject({
  tenantId: z.string().min(1),
  permission: z.string().min(1),
});

export type AuthorizationRequest = z.infer<typeof authorizationRequestSchema>;

/**
 * A Staff operation additionally presents the session version that the server
 * issued at PIN verification. The server compares it with the membership
 * `sessionVersion` so an Owner can revoke every prior session by increasing the
 * membership value (REQ-AUTH-002, REQ-ACL-001).
 */
export const staffAuthorizationRequestSchema = authorizationRequestSchema.extend({
  sessionVersion: z.number().int().nonnegative(),
});

export type StaffAuthorizationRequest = z.infer<
  typeof staffAuthorizationRequestSchema
>;

/** Owner command input to revoke every Staff session of one membership. */
export const staffSessionRevokeInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  uid: z.string().min(1),
});

export type StaffSessionRevokeInput = z.infer<
  typeof staffSessionRevokeInputSchema
>;

export const sessionRevokeResultSchema = z.strictObject({
  schemaVersion: z.literal(AUTHORIZATION_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  sessionVersion: z.number().int().positive(),
  revokedAt: isoUtcTimestampSchema,
});

export type SessionRevokeResult = z.infer<typeof sessionRevokeResultSchema>;

export const authorizationDecisionSchema = z
  .strictObject({
    schemaVersion: z.literal(AUTHORIZATION_CONTRACT_VERSION),
    allowed: z.boolean(),
    reason: authorizationReasonSchema,
    uid: z.string().min(1),
    tenantId: z.string().min(1).nullable(),
    role: z.string().min(1).nullable(),
    permission: z.string().min(1).nullable(),
    grantedPermissions: z.array(z.string().min(1)),
    isAdmin: z.boolean(),
    isAdminBypass: z.boolean(),
    isAudited: z.boolean(),
    decidedAt: isoUtcTimestampSchema,
  })
  .refine(
    (decision) =>
      decision.isAdminBypass
        ? decision.allowed && decision.isAudited
        : true,
    { message: 'ADMIN bypass must be allowed and audited' },
  )
  .refine(
    (decision) =>
      decision.allowed
        ? decision.reason === 'allowed' || decision.reason === 'admin_bypass'
        : decision.reason !== 'allowed' && decision.reason !== 'admin_bypass',
    { message: 'allowed and reason must agree' },
  );

export type AuthorizationDecision = z.infer<
  typeof authorizationDecisionSchema
>;

/**
 * One Customer phone projection row. `phone` is present only when the server
 * authorization decision grants `customer.phone.read`; otherwise the server
 * omits the value and reports `phoneVisible: false` (NFR-PRIV-001).
 */
export const customerPhoneRecordSchema = z.strictObject({
  memberId: z.string().min(1),
  displayName: z.string().nullable(),
  phone: z.string().min(1).nullable(),
  phoneVisible: z.boolean(),
});

export type CustomerPhoneRecord = z.infer<typeof customerPhoneRecordSchema>;

export const customerPhoneQueryInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  limit: z
    .number()
    .int()
    .positive()
    .max(CUSTOMER_PHONE_QUERY_LIMIT)
    .optional(),
});

export type CustomerPhoneQueryInput = z.infer<
  typeof customerPhoneQueryInputSchema
>;

export const customerPhoneQueryResultSchema = z.strictObject({
  schemaVersion: z.literal(AUTHORIZATION_CONTRACT_VERSION),
  decision: authorizationDecisionSchema,
  records: z.array(customerPhoneRecordSchema),
});

export type CustomerPhoneQueryResult = z.infer<
  typeof customerPhoneQueryResultSchema
>;
