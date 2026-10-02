# P0-004 — Staff PIN, lockout, and server ACL

## Requirement links

REQ-AUTH-002, REQ-ACL-001, NFR-SEC-001, NFR-PRIV-001, NFR-MOD-001.

## Owning module

Auth owns Staff sessions and PIN lock state. Tenant owns memberships and authorization decisions. Config supplies PIN policy.

## Allowed file paths

- `functions/src/modules/auth/**`
- `functions/src/modules/tenant/service.ts`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/identity.contract.ts`
- `shared/contracts/authorization.contract.ts`
- `shared/contracts/identity.contract.test.ts`
- `shared/contracts/authorization.contract.test.ts`
- `shared/fixtures/identity.fixture.ts`
- `shared/fixtures/authorization.fixture.ts`
- `src/data/adapters/auth.adapter.ts`
- `src/components/StaffView.tsx`
- `firestore.rules`
- `functions/test/rules/auth.rules.test.ts`
- `functions/test/auth/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not change Catalog, Table Access, Ordering, Fulfilment, Payment, or direct client business writes.

## Dependencies

P0-001 and P0-003. P0-002A and P0-002B must be complete through P0-003.

## Atomic acceptance checklist

- Given the default policy, when Staff enters five invalid PINs, then the server locks access for 15 minutes and writes one audit event.
- Given a valid active Staff membership and PIN, when verification succeeds, then the server creates a tenant-bound session with the current session version.
- Given a locked, inactive, cross-tenant, or malformed request, when PIN verification runs, then it rejects without starting a session.
- Given a missing role or reduced permission, when Staff calls an operation, then server authorization denies it despite UI state.
- Given a role requests Customer phone data, when authorization evaluates it, then the result follows configured permissions.
- Given stored membership data, when inspected, then no plaintext Staff PIN exists.

## Test plan

- Unit: PIN hash comparison, policy resolution, lockout, session-version checks, and authorization decisions.
- Functions Emulator: valid session, five failures, lockout, inactive membership, cross-tenant request, reduced permission, and audit evidence.
- Rules: membership privacy, cross-tenant denial, and no direct membership or audit writes.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Lockout and successful-session fixtures.
- Authorization matrix and audit fixture.
- Plaintext PIN scan result.

## Out of scope

Membership administration, ADMIN access, Customer ordering, and later privacy filtering.
