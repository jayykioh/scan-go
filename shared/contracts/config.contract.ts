import { z } from 'zod';

export const CONFIG_CONTRACT_VERSION = 1;

export const configSourceSchema = z.enum(['default', 'admin', 'tenant']);
export type ConfigSource = z.infer<typeof configSourceSchema>;

/**
 * The only tenant-overridable configuration keys approved by CON-006 and
 * `docs/module/config.md`. Any other key is forbidden in a tenant override.
 */
export const tenantOverridableConfigKeySchema = z.enum([
  'locale',
  'timezone',
  'pinPolicy',
  'ai',
]);
export type TenantOverridableConfigKey = z.infer<
  typeof tenantOverridableConfigKeySchema
>;
export const tenantOverridableConfigKeys: readonly TenantOverridableConfigKey[] =
  tenantOverridableConfigKeySchema.options;

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

/**
 * AI provider selection and per-tenant spend cap (REQ-AI-004, REQ-AI-005,
 * NFR-AI-002). The provider is replaceable; the budget is integer VND. `jev`
 * stays behind a feature flag and is never the default (ADR 0008).
 */
export const aiProviderSchema = z.enum(['rule-based', 'gemini', 'jev']);
export type AiProviderName = z.infer<typeof aiProviderSchema>;

export const aiConfigSchema = z.strictObject({
  provider: aiProviderSchema,
  monthlyBudgetVnd: z.number().int().nonnegative(),
});

export type AiConfig = z.infer<typeof aiConfigSchema>;

export const configValuesSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  locale: configLocaleSchema,
  timezone: z.string().min(1).max(64),
  currency: z.literal('VND'),
  pinPolicy: pinPolicySchema,
  retention: retentionSchema,
  backup: backupSchema,
  rateLimit: rateLimitSchema,
  ai: aiConfigSchema,
});

export type ConfigValues = z.infer<typeof configValuesSchema>;

export const resolvedConfigSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  values: configValuesSchema,
  sources: z.record(z.string(), configSourceSchema),
  allowedTenantOverrideKeys: z.array(tenantOverridableConfigKeySchema),
});

export type ResolvedConfig = z.infer<typeof resolvedConfigSchema>;

/**
 * Leaves a tenant member may see. Platform-only keys (`retention`, `backup`,
 * `rateLimit`) and `schemaVersion` inside values are excluded.
 */
export const tenantVisibleConfigValuesSchema = z.strictObject({
  locale: configLocaleSchema,
  timezone: z.string().min(1).max(64),
  currency: z.literal('VND'),
  pinPolicy: pinPolicySchema,
  ai: aiConfigSchema,
});

export type TenantVisibleConfigValues = z.infer<
  typeof tenantVisibleConfigValuesSchema
>;

const tenantVisibleSourceKeyPattern =
  /^(locale|timezone|currency|pinPolicy\.\w+|ai\.\w+)$/;

const tenantVisibleSourcesSchema = z
  .record(z.string(), configSourceSchema)
  .refine(
    (sources) =>
      Object.keys(sources).every((key) =>
        tenantVisibleSourceKeyPattern.test(key),
      ),
    'sources may only contain tenant-visible leaves',
  );

export const tenantVisibleConfigSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  values: tenantVisibleConfigValuesSchema,
  sources: tenantVisibleSourcesSchema,
  allowedTenantOverrideKeys: z.array(tenantOverridableConfigKeySchema),
});

export type TenantVisibleResolvedConfig = z.infer<
  typeof tenantVisibleConfigSchema
>;

export const configVersionSchema = z.number().int().nonnegative();

export const pinPolicyOverrideInputSchema = z.strictObject({
  length: z.number().int().min(4).max(10).optional(),
  maxFailedAttempts: z.number().int().positive().optional(),
  lockMinutes: z.number().int().positive().optional(),
  sessionHours: z.number().int().positive().optional(),
});

export const retentionOverrideInputSchema = z.strictObject({
  years: z.number().int().positive().optional(),
});

export const backupOverrideInputSchema = z.strictObject({
  schedule: z.enum(['daily']).optional(),
  retentionDays: z.number().int().positive().optional(),
});

export const rateLimitOverrideInputSchema = z.strictObject({
  publicOrderPerMinute: z.number().int().positive().optional(),
});

export const aiOverrideInputSchema = z.strictObject({
  provider: aiProviderSchema.optional(),
  monthlyBudgetVnd: z.number().int().nonnegative().optional(),
});

/** Tenant Owner input. Only the approved keys are accepted. */
export const tenantConfigOverrideInputSchema = z.strictObject({
  locale: configLocaleSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  pinPolicy: pinPolicyOverrideInputSchema.optional(),
  ai: aiOverrideInputSchema.optional(),
});

export type TenantConfigOverrideInput = z.infer<
  typeof tenantConfigOverrideInputSchema
>;

/**
 * ADMIN product-default input for `platform/config`. `schemaVersion` and
 * `currency` are fixed by CON-004 and CON-006, so ADMIN cannot change them.
 * The tenant allow-list is fixed by `docs/module/config.md`, not by ADMIN.
 */
export const platformConfigOverrideInputSchema = z.strictObject({
  locale: configLocaleSchema.optional(),
  timezone: z.string().min(1).max(64).optional(),
  pinPolicy: pinPolicyOverrideInputSchema.optional(),
  retention: retentionOverrideInputSchema.optional(),
  backup: backupOverrideInputSchema.optional(),
  rateLimit: rateLimitOverrideInputSchema.optional(),
  ai: aiOverrideInputSchema.optional(),
});

export type PlatformConfigOverrideInput = z.infer<
  typeof platformConfigOverrideInputSchema
>;

export const updateTenantConfigResultSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  configVersion: configVersionSchema,
  resolvedConfig: tenantVisibleConfigSchema,
});

export type UpdateTenantConfigResult = z.infer<
  typeof updateTenantConfigResultSchema
>;

export const updatePlatformConfigResultSchema = z.strictObject({
  schemaVersion: z.literal(CONFIG_CONTRACT_VERSION),
  configVersion: configVersionSchema,
  resolvedConfig: resolvedConfigSchema,
});

export type UpdatePlatformConfigResult = z.infer<
  typeof updatePlatformConfigResultSchema
>;
