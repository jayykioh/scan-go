export const CONFIG_SCHEMA_VERSION = 1;

export const APP_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const APP_CURRENCY = 'VND';

export const CONFIG_DEFAULTS = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  locale: 'vi',
  timezone: APP_TIMEZONE,
  currency: APP_CURRENCY,
  pinPolicy: {
    length: 6,
    maxFailedAttempts: 5,
    lockMinutes: 15,
    sessionHours: 8,
  },
  retention: {
    years: 5,
  },
  backup: {
    schedule: 'daily',
    retentionDays: 30,
  },
  rateLimit: {
    publicOrderPerMinute: 30,
  },
  // Deterministic provider is the safe default until a provider secret is
  // configured; Gemini is selected through Config (ADR 0008).
  ai: {
    provider: 'rule-based',
    monthlyBudgetVnd: 500000,
  },
} as const;

export type ConfigDefaults = typeof CONFIG_DEFAULTS;
