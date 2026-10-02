# P0-003 — Tenant selection and bounded read boundary

## Requirement links

REQ-TEN-001, REQ-ACL-001, NFR-SEC-001, NFR-MOD-001, CON-001, CON-002.

## Owning module

Tenant. Other modules consume the active Tenant context but must independently authorize each command.

## Allowed file paths

- `functions/src/modules/tenant/**`
- `functions/src/index.ts`
- `shared/contracts/identity.contract.ts`
- `shared/contracts/authorization.contract.ts`
- `shared/contracts/identity.contract.test.ts`
- `shared/contracts/authorization.contract.test.ts`
- `shared/fixtures/identity.fixture.ts`
- `shared/fixtures/authorization.fixture.ts`
- `src/data/adapters/tenant.adapter.ts`
- `src/components/TenantSwitcher.tsx`
- `src/layouts/SimulatorLayout.tsx`
- `src/layouts/DashboardLayout.tsx`
- `firestore.rules`
- `functions/test/rules/auth.rules.test.ts`
- `functions/test/tenant/**`

Do not change Auth, Config, Catalog, Table Access, Ordering, or any business module.

## Dependencies

P0-002A and P0-002B. Existing membership-list and active-selection callables are baseline only.

## Atomic acceptance checklist

- Given one Owner belongs to two active Tenants, when the Owner selects either Tenant, then the server verifies membership and updates only that Owner's `activeTenantId`.
- Given an Owner selects a Tenant without an active membership, when the callable runs, then it rejects and retains the prior `activeTenantId`.
- Given Tenant memberships load in the UI, when the Owner switches Tenant, then the UI replaces its active Tenant context and disposes the prior bounded listener.
- Given a user from another Tenant, when it reads Tenant data, memberships, or attempts active-Tenant selection, then Rules and Cloud Functions deny it.
- Given `activeTenantId` names a Tenant, when a later module command executes, then the ticket contract states that this value is navigation state only and cannot authorize access.

## Test plan

- Unit: Tenant adapter, active-context replacement, listener cleanup, and authorization-contract fixtures.
- Functions Emulator: two-Tenant selection success; inactive membership and cross-tenant selection denial.
- Rules: two-Tenant matrix for Tenant, membership, user-profile, and direct-write boundaries.

## Required evidence

- Recorded two-Tenant switch with context replacement.
- Passing unit, Functions Emulator, and Rules matrix results.
- Listener cleanup assertion.
- Traceability update for every linked ID.

## Out of scope

Staff PIN and role checks, cross-module business queries, onboarding, ADMIN, and all later P0 module commands.
