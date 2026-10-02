# P0-006 — Table Access, QR links, and revocation

## Requirement links

REQ-TBL-001, NFR-SEC-002, CON-002, NFR-SEC-001, NFR-MOD-001.

## Owning module

Table Access owns tables, opaque QR links, and token issue and revocation.

## Allowed file paths

- `functions/src/modules/table-access/**`
- `functions/src/shared/appCheck.ts`
- `functions/src/shared/rateLimit.ts`
- `functions/src/index.ts`
- `shared/contracts/table.contract.ts`
- `shared/contracts/table.contract.test.ts`
- `shared/fixtures/table.fixture.ts`
- `src/data/adapters/table.adapter.ts`
- `src/pages/dashboard/TablesPage.tsx`
- `src/pages/PublicMenuPage.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/table.rules.test.ts`
- `functions/test/table-access/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not change Catalog data or create Orders.

## Dependencies

P0-001, P0-003, and P0-004.

## Atomic acceptance checklist

- Given an authorized Owner, when a table is created, renamed, archived, or regenerated, then a callable validates membership and records tenant-scoped state.
- Given a regenerated link, when the command commits, then it creates a new opaque token and revokes the old public link atomically.
- Given an old, invalid, or inactive token, when Customer resolves it, then access fails without tenant private data.
- Given a new active token, when Customer resolves it, then it returns only its table context.
- Given a public request without valid App Check or within a configured rate-limit rejection, when the resolver runs, then it rejects safely.
- Given another Tenant, when it reads or commands table data, then Rules and Cloud Functions deny it.

## Test plan

- Unit: token generation, context mapping, and Config rate-limit contract use.
- Functions Emulator: table commands, atomic rotation, invalid token, App Check, rate limit, and Tenant isolation.
- Rules: public link-only read, private table read boundary, and all direct writes denied.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Old and new token fixtures from one rotation.
- QR payload capture with public-safe context.
- Rate-limit and App Check rejection evidence.

## Out of scope

NFC tag programming, Customer cart behavior, menu projection, and Order submission.
