# Config Module

- Serves: REQ-CFG-001, NFR-CFG-001
- Owns: Typed defaults, ADMIN overrides, tenant overrides, resolved configuration
- Does not own: Cloud Functions memory, timeout, region, concurrency, or secrets

## Resolution order
1. Versioned `config.ts` defaults.
2. ADMIN product settings in `platform/config`.
3. Allowed tenant settings.

## Initial defaults
- PIN length: six digits.
- Failed PIN attempts: five.
- PIN lock: 15 minutes.
- Staff session: eight hours.
- Product-data retention: five years.
- Backup: daily with 30-day retention.
- Loyalty welcome points: zero.
- Tenant timezone: `Asia/Ho_Chi_Minh`.
- Warning thresholds: a revenue drop of 20 percent against the previous day with data, and a menu-item margin below 20 percent.
- Report-topic surge warning: three reports of one topic inside 24 hours; zero disables it.

## Commands and queries
- ADMIN updates product defaults.
- Owner updates allowed tenant settings.
- Modules read validated resolved configuration and its source.
- ADMIN uses this module's command instead of writing `platform/config` directly.

## Rules
- Reject unknown keys, invalid values, and forbidden tenant overrides.
- Tenant overrides are limited to `locale`, `timezone`, `pinPolicy`, and `ai`.
- Version every change and emit `ConfigurationChanged`.
- The Tenant's receiving bank account (`tenants/{tenantId}.vietQr`) is **deliberately not a Config key**, and ADMIN deliberately has no write path to it. The platform layer exists so ADMIN can set product defaults, and a bank account is not a default: putting it here would let ADMIN choose where a shop's money goes. Payment owns that map and writes it through its own Owner-only command (ADR 0022, REQ-PAY-005). Do not add it to `configValuesSchema`, `tenantOverridableConfigKeySchema`, `platformConfigOverrideInputSchema`, or `TENANT_VISIBLE_VALUE_KEYS`.
