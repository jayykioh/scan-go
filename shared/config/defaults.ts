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
  // Gemini is the intended default provider (ADR 0008, TECH_STACK §2). The
  // server falls back to the deterministic adapter when no provider secret is
  // bound, so an unconfigured tenant stays safe and cost-free.
  ai: {
    provider: 'gemini',
    monthlyBudgetVnd: 500000,
    // Deterministic warning thresholds (REQ-AI-007, REQ-AI-008).
    revenueDropPercent: 20,
    lowMarginPercent: 20,
  },
} as const;

export type ConfigDefaults = typeof CONFIG_DEFAULTS;
