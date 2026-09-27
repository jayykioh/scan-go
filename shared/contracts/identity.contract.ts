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
