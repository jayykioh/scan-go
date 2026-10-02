# P0-002A — Owner email/password registration completion

## Requirement links

REQ-AUTH-001, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001, CON-001, CON-002.

## Owning module

Auth. Tenant provisioning uses the published Tenant service contract.

## Allowed file paths

- `functions/src/modules/auth/**`
- `functions/src/modules/tenant/service.ts`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/identity.contract.ts`
- `shared/contracts/identity.contract.test.ts`
- `shared/fixtures/identity.fixture.ts`
- `src/data/adapters/auth.adapter.ts`
- `src/hooks/useAuthSession.ts`
- `src/pages/LoginPage.tsx`
- `src/pages/RegisterPage.tsx`
- `firestore.rules`
- `functions/test/rules/auth.rules.test.ts`
- `functions/test/auth/**`

Do not change Tenant callable handlers, Config, Catalog, Table Access, or simulator views.

## Dependencies

P0-001. The existing registration callable and screens are baseline only.

## Atomic acceptance checklist

- Given a new email and valid password, when an Owner registers, then Firebase Auth creates the account and the UI starts an authenticated session.
- Given authenticated email/password registration data, when `callableAuthRegisterOwner` runs, then it validates the contract and returns the Owner identity and first membership.
- Given invalid registration data, missing authenticated email, or a malformed callable request, when registration runs, then it rejects without a partial business record.
- Given an existing Owner credentials pair, when the Owner signs in, then the UI restores the authenticated session and does not create another first Tenant.
- Given another authenticated user, when it reads or writes the Owner profile or membership through Firestore, then Rules deny it.
- Given Owner registration succeeds, when evidence is inspected, then created timestamps are UTC and the identity contract contains no plaintext Staff PIN.

## Test plan

- Unit: adapter error mapping, registration input validation, identity mapping, and duplicate-registration behavior.
- Functions Emulator: authenticated registration success; missing email, invalid input, and repeat registration paths.
- Rules: Owner profile self-read allow; cross-user profile and membership read/write deny.

## Required evidence

- Firebase Auth Emulator register and sign-in result.
- Firestore fixture for `users/{uid}` and the Owner membership.
- Passing unit, Functions Emulator, and Rules results.
- Traceability update for every linked ID.

## Out of scope

Staff PIN sessions, role enforcement, tenant switching, email verification policy, ADMIN access, and onboarding progress.
