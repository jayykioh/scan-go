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

## Commands and queries
- ADMIN updates product defaults.
- Owner updates allowed tenant settings.
- Modules read validated resolved configuration and its source.
- ADMIN uses this module's command instead of writing `platform/config` directly.

## Rules
- Reject unknown keys, invalid values, and forbidden tenant overrides.
- Version every change and emit `ConfigurationChanged`.
