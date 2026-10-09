# P0-015 — Category availability command

## Requirement links

REQ-CAT-003, REQ-CAT-001, REQ-KDS-001, REQ-ACL-001, NFR-SEC-002, NFR-DATA-001.

## Owning module

Catalog owns menu availability and the public projection. Kitchen calls the Catalog command.

## Allowed file paths

- `shared/contracts/catalog.contract.ts`
- `shared/fixtures/catalog.fixture.ts`
- `functions/src/modules/catalog/**`
- `functions/test/catalog/**`
- `functions/test/rules/catalog.rules.test.ts`
- `src/data/adapters/catalog.adapter.ts`
- `src/data/adapters/fulfilment.adapter.ts`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change Order, Payment, or direct client writes.

## Dependencies

P0-005, P0-008.

## Atomic acceptance checklist

- Given a category, when the caller sets it unavailable, then every active item in that category becomes unavailable and the public projection hides them (REQ-CAT-003).
- Given an empty category, when the command runs, then it reports zero affected items and writes no audit event.
- Given an inactive Staff, a Waiter, another Tenant, or a missing category, when the command runs, then it is denied or rejected.
- Given a retried command, when it repeats, then the result is stable and no duplicate audit event exists.
- Given the committed command, when the transaction ends, then one audit event records each changed item and the actor.

## Test plan

- Unit: category input parsing, item selection, and projection visibility.
- Functions Emulator: set a category as Owner and Kitchen, deny Waiter and another Tenant, empty category, idempotent retry.
- Rules: direct Catalog writes remain denied.
- Add test paths to the Functions Emulator Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.

## Out of scope

Scheduled availability, per-item stock counts, and category deletion.
