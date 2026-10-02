import { z } from 'zod';

export const IDENTITY_CONTRACT_VERSION = 1;

export const isoUtcTimestampSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    'Expected an ISO-8601 UTC timestamp',
  );

export const localeSchema = z.enum(['vi', 'en']);
export const membershipTypeSchema = z.enum(['owner', 'staff']);

export const firebaseIdentitySchema = z.object({
  schemaVersion: z.literal(IDENTITY_CONTRACT_VERSION),
  uid: z.string().min(1),
  email: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  displayName: z.string().nullable(),
  locale: localeSchema,
  activeTenantId: z.string().nullable(),
  isAdmin: z.boolean(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type FirebaseIdentity = z.infer<typeof firebaseIdentitySchema>;

export const membershipSchema = z.object({
  schemaVersion: z.literal(IDENTITY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  membershipType: membershipTypeSchema,
  roles: z.array(z.string().min(1)),
  permissions: z.array(z.string().min(1)),
  isActive: z.boolean(),
  sessionVersion: z.number().int().nonnegative(),
  lastLoginAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type Membership = z.infer<typeof membershipSchema>;

export const tenantSummarySchema = z.object({
  tenantId: z.string().min(1),
  shopName: z.string(),
  membershipType: membershipTypeSchema,
  roles: z.array(z.string()),
  isActive: z.boolean(),
  isActiveTenant: z.boolean(),
});

export type TenantSummary = z.infer<typeof tenantSummarySchema>;

export const bootstrapTenantResultSchema = z.object({
  identity: firebaseIdentitySchema,
  membership: membershipSchema,
});

export type BootstrapTenantResult = z.infer<typeof bootstrapTenantResultSchema>;

export const ownerRegistrationInputSchema = z.object({
  shopName: z.string().trim().min(1).max(120),
  displayName: z.string().trim().min(1).max(80).nullable().optional(),
});

export type OwnerRegistrationInput = z.infer<
  typeof ownerRegistrationInputSchema
>;

export const tenantCreateInputSchema = z.strictObject({
  shopName: z.string().trim().min(1).max(120),
});

export type TenantCreateInput = z.infer<typeof tenantCreateInputSchema>;

/**
 * Tenant bootstrap takes no business input. A strict empty object rejects any
 * client-supplied field before the server provisions or reuses a Tenant.
 */
export const tenantBootstrapInputSchema = z.strictObject({});

export type TenantBootstrapInput = z.infer<typeof tenantBootstrapInputSchema>;

/**
 * Tenant membership list takes no business input. A strict empty object rejects
 * any client-supplied field before the bounded read runs.
 */
export const tenantListMembershipsInputSchema = z.strictObject({});

export type TenantListMembershipsInput = z.infer<
  typeof tenantListMembershipsInputSchema
>;

/**
 * Active-Tenant selection states only the Tenant id. `activeTenantId` is
 * navigation state; the server verifies an active membership before it writes.
 */
export const tenantSelectActiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type TenantSelectActiveInput = z.infer<
  typeof tenantSelectActiveInputSchema
>;

export const listMembershipsResultSchema = z.object({
  identity: firebaseIdentitySchema,
  tenants: z.array(tenantSummarySchema),
});

export type ListMembershipsResult = z.infer<typeof listMembershipsResultSchema>;

export const selectActiveTenantResultSchema = z.object({
  identity: firebaseIdentitySchema,
  activeTenantId: z.string().min(1),
});

export type SelectActiveTenantResult = z.infer<
  typeof selectActiveTenantResultSchema
>;

export const staffSessionStatusSchema = z.enum([
  'active',
  'ended',
  'revoked',
  'locked',
]);

export type StaffSessionStatus = z.infer<typeof staffSessionStatusSchema>;

export const staffPinPolicySnapshotSchema = z.strictObject({
  length: z.number().int().positive(),
  maxFailedAttempts: z.number().int().positive(),
  lockMinutes: z.number().int().positive(),
  sessionHours: z.number().int().positive(),
});

export type StaffPinPolicySnapshot = z.infer<
  typeof staffPinPolicySnapshotSchema
>;

export const staffSessionSchema = z.object({
  schemaVersion: z.literal(IDENTITY_CONTRACT_VERSION),
  sessionId: z.string().min(1),
  tenantId: z.string().min(1),
  uid: z.string().min(1),
  deviceId: z.string().min(1),
  roles: z.array(z.string().min(1)),
  permissions: z.array(z.string().min(1)),
  status: staffSessionStatusSchema,
  sessionVersion: z.number().int().nonnegative(),
  issuedAt: isoUtcTimestampSchema,
  expiresAt: isoUtcTimestampSchema,
  lastSeenAt: isoUtcTimestampSchema,
  endedAt: isoUtcTimestampSchema.nullable(),
  pinFailedAttempts: z.number().int().nonnegative(),
  pinLockedUntil: isoUtcTimestampSchema.nullable(),
  pinPolicy: staffPinPolicySnapshotSchema,
});

export type StaffSession = z.infer<typeof staffSessionSchema>;

export const staffPinVerifyInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  deviceId: z.string().min(1),
  pin: z.string().min(4).max(10),
});

export type StaffPinVerifyInput = z.infer<typeof staffPinVerifyInputSchema>;

export const staffPinVerifyResultSchema = z.object({
  session: staffSessionSchema,
  remainingAttempts: z.number().int().nonnegative().nullable(),
});

export type StaffPinVerifyResult = z.infer<typeof staffPinVerifyResultSchema>;

export const staffPinDenialReasonSchema = z.enum([
  'invalid_pin',
  'locked',
  'inactive',
  'cross_tenant',
  'malformed',
]);

export type StaffPinDenialReason = z.infer<typeof staffPinDenialReasonSchema>;

/**
 * Server rejection mapped to a UI denied state. The server remains the
 * authority; the client only renders this result (REQ-AUTH-002).
 */
export const staffPinDeniedStateSchema = z.strictObject({
  reason: staffPinDenialReasonSchema,
  message: z.string().min(1),
  remainingAttempts: z.number().int().nonnegative().nullable(),
  lockedUntil: isoUtcTimestampSchema.nullable(),
});

export type StaffPinDeniedState = z.infer<typeof staffPinDeniedStateSchema>;
