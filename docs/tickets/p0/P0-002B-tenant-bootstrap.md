# P0-002B — First Tenant bootstrap completion

## Requirement links

REQ-TEN-001, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001, CON-001, CON-002.

## Owning module

Tenant. Auth consumes the Tenant provisioning service but does not own Tenant records.

## Allowed file paths

- `functions/src/modules/tenant/**`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/identity.contract.ts`
- `shared/contracts/identity.contract.test.ts`
- `shared/fixtures/identity.fixture.ts`
- `src/data/adapters/tenant.adapter.ts`
- `src/components/TenantSwitcher.tsx`
- `src/layouts/SimulatorLayout.tsx`
- `firestore.rules`
- `functions/test/rules/auth.rules.test.ts`
- `functions/test/tenant/**`

Do not change Auth handlers or screens, Config, Catalog, Table Access, or business collection schemas.

## Dependencies

P0-001. P0-002A supplies Owner authentication. Existing bootstrap and create callables are baseline only.

## Atomic acceptance checklist

- Given an authenticated Owner without a membership, when Tenant bootstrap runs, then it creates one Tenant, Owner membership, user profile, and `activeTenantId` through server code.
- Given an authenticated Owner creates another Tenant, when the Tenant command succeeds, then the new Tenant has tenant identity fields, an active Owner membership, UTC timestamps, and becomes active.
- Given a user already has a membership, when bootstrap runs again, then it returns an existing membership and creates no duplicate Tenant.
- Given an unauthenticated caller or invalid Tenant-create input, when a Tenant callable runs, then it rejects without writing Tenant data.
- Given a browser client, when it attempts a direct Tenant or membership write, then Rules deny it.

## Test plan

- Unit: Tenant provision defaults, identity and membership mapping, and idempotent bootstrap decision.
- Functions Emulator: first bootstrap, additional Tenant creation, repeated bootstrap, unauthenticated request, and invalid input.
- Rules: member Tenant read allow; direct Tenant and membership writes deny; cross-tenant read deny.

## Required evidence

- Two-Tenant Firestore fixture for one Owner.
- Passing unit, Functions Emulator, and Rules results.
- Callable result with the active Tenant identity.
- Traceability update for every linked ID.

## Out of scope

Tenant selection and bounded read adapters, Staff memberships, Staff PIN, roles, onboarding, ADMIN delegation, and other modules.
