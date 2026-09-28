import { z } from 'zod';

export const CONFIG_CONTRACT_VERSION = 1;

export const configSourceSchema = z.enum(['default', 'admin', 'tenant']);
export type ConfigSource = z.infer<typeof configSourceSchema>;

export const tenantOverridableConfigKeys: readonly string[] = [
  'locale',
  'timezone',
  'pinPolicy',
];

export const configLocaleSchema = z.enum(['vi', 'en']);

export const pinPolicySchema = z.strictObject({
  length: z.number().int().min(4).max(10),
  maxFailedAttempts: z.number().int().positive(),
  lockMinutes: z.number().int().positive(),
  sessionHours: z.number().int().positive(),
});

export const retentionSchema = z.strictObject({
  years: z.number().int().positive(),
});

export const backupSchema = z.strictObject({
  schedule: z.enum(['daily']),
  retentionDays: z.number().int().positive(),
});

export const rateLimitSchema = z.strictObject({
  publicOrderPerMinute: z.number().int().positive(),
});

export const configValuesSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  locale: configLocaleSchema,
  timezone: z.string().min(1).max(64),
  currency: z.literal('VND'),
  pinPolicy: pinPolicySchema,
  retention: retentionSchema,
  backup: backupSchema,
  rateLimit: rateLimitSchema,
});

export type ConfigValues = z.infer<typeof configValuesSchema>;

export const resolvedConfigSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  values: configValuesSchema,
  sources: z.record(z.string(), configSourceSchema),
  allowedTenantOverrideKeys: z.array(z.string()),
});

export type ResolvedConfig = z.infer<typeof resolvedConfigSchema>;

export const pinPolicyOverrideInputSchema = z.strictObject({
  length: z.number().int().min(4).max(10).optional(),
  maxFailedAttempts: z.number().int().positive().optional(),
  lockMinutes: z.number().int().positive().optional(),
  sessionHours: z.number().int().positive().optional(),
});

export const tenantConfigOverrideInputSchema = z
  .strictObject({
    locale: configLocaleSchema.optional(),
    timezone: z.string().min(1).max(64).optional(),
    pinPolicy: pinPolicyOverrideInputSchema.optional(),
  });

export type TenantConfigOverrideInput = z.infer<
  typeof tenantConfigOverrideInputSchema
>;

export const updateTenantConfigResultSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  configVersion: z.number().int().nonnegative(),
  resolvedConfig: resolvedConfigSchema,
});

export type UpdateTenantConfigResult = z.infer<
  typeof updateTenantConfigResultSchema
>;
