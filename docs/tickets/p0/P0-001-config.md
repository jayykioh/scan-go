# P0-001 — Config: precedence, ADMIN change, and inspection

Status: Done. Unit (61 web, 34 functions), type, lint, and build pass. Rules evidence pass (`npm run test:rules`, 8 tests). Functions Emulator callable evidence pass (`npm run test:emulator`, 12 tests).

## Requirement links

REQ-CFG-001, NFR-CFG-001, NFR-SEC-001, NFR-MOD-001, CON-002, CON-006, CON-007.

## Owning module

Config. ADMIN requests Config commands. ADMIN must not write `platform/config` directly.

## Allowed file paths

- `functions/src/modules/config/**`
- `functions/src/modules/admin/**`
- `functions/src/shared/audit.ts`
- `functions/src/shared/appCheck.ts`
- `functions/src/index.ts`
- `shared/config/**`
- `shared/contracts/config.contract.ts`
- `shared/contracts/config.contract.test.ts`
- `shared/fixtures/config.fixture.ts`
- `src/data/adapters/config.adapter.ts`
- `src/pages/dashboard/SettingsPage.tsx`
- `firestore.rules`
- `functions/test/rules/config.rules.test.ts`
- `functions/test/config/**`
- `functions/vitest.emulator.config.mts`
- `functions/src/modules/config/service.test.ts`

Do not change Auth, Tenant, or any other module. Do not add runtime options, secrets, or client business writes.

## Dependencies

None. Existing Config resolver and tenant-update callable are baseline only.

## Atomic acceptance checklist

- Given typed defaults, ADMIN values, and allowed Tenant values, when Config resolves a key, then Tenant wins and every leaf source is inspectable.
- Given a Tenant Owner submits an allowed override, when `callableConfigUpdateTenant` succeeds, then Config validates it, increments the version, records `ConfigurationChanged`, and returns the resolved result.
- Given a forbidden key, invalid value, inactive membership, or non-Owner request, when the Tenant update callable runs, then it rejects without a Config write.
- Given a verified ADMIN, when ADMIN changes product defaults through a Config callable, then the server validates the input, writes `platform/config`, and records an audit event.
- Given a non-ADMIN, when it requests ADMIN Config data or changes product defaults, then Rules and Cloud Functions deny it.
- Given an authorized Owner opens Settings, when resolved Config loads, then the UI shows each displayed value and its source.

## Test plan

- Unit: three-layer precedence, source map, allowed-key filtering, validation, and versioning.
- Functions Emulator: Tenant Owner allow; Staff, inactive member, cross-tenant user, and non-ADMIN deny; ADMIN audit assertion.
- Rules: deny all direct Config writes; test approved Config read visibility and cross-tenant Tenant read denial.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Config fixture with default, ADMIN, and Tenant source results.
- Audit fixture for Tenant and ADMIN changes.
- Settings capture that shows resolved sources.
- Traceability update for every linked ID.

## Verification follow-up (2026-09-30)

Tester findings to fix before completion:

1. HIGH — Implement App Check validation in `functions/src/shared/appCheck.ts` and call it in the Config write callables. Skip only when `FUNCTIONS_EMULATOR === 'true'` or `ENFORCE_APP_CHECK === 'false'`.
2. HIGH — Do not return platform-only values (`retention`, `backup`, `rateLimit`) or their sources to a tenant member. Add a tenant-visible projection and use it in `callableConfigGetResolved`.
3. HIGH — Tenant save must submit only keys in `allowedTenantOverrideKeys` and must not convert ADMIN values into tenant overrides (UI owner).
4. MEDIUM — Audit data must include `eventId` matching the document id so it parses against `auditEventSchema`.

## Out of scope

Staff PIN enforcement, i18n delivery, retention jobs, backups, plan entitlements, AI budgets, and any M2 or M3 Config work.
