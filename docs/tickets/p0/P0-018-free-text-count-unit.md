# P0-018 — Free-text count unit

## Requirement links

REQ-INV-012, REQ-INV-006, NFR-DATA-001, NFR-MOD-001.

## Owning module

Inventory owns ingredients and units. The Owner and an active Kitchen member enter the unit name.

## Allowed file paths

- `shared/contracts/inventory.contract.ts`
- `shared/fixtures/inventory.fixture.ts`
- `functions/src/modules/inventory/**`
- `functions/src/scripts/seed.ts`
- `functions/src/scripts/seed-data.ts`
- `functions/test/inventory/**`
- `src/data/adapters/inventory.adapter.ts`
- `src/components/InventoryPanel.tsx`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change Order, Payment, or direct client writes.

## Dependencies

P0-008, P0-011.

## Atomic acceptance checklist

- Given a count ingredient, when Owner enters a unit name such as "trái", then the server stores `countUnitLabel` and the inventory screen shows it in place of "đơn vị" (REQ-INV-012).
- Given a count ingredient without a name, when the command runs, then the server rejects it.
- Given a mass or volume ingredient, when the command runs, then `countUnitLabel` is null even if a name is sent.
- Given a legacy ingredient without a label, when it is read, then it maps to a null label and shows "đơn vị".
- Given the edit form, when the unit is count, then the name field shows the stored label.

## Test plan

- Unit: create/update builders, `resolveCountUnitLabel`, and the input refinement.
- Functions Emulator: reject a count unit without a name, accept a name, and read it back.
- Component: the Kho screen shows the name field only for a count unit.

## Required evidence

- Passing unit, Functions Emulator, typecheck, and lint results.

## Out of scope

Unit conversion between count names and per-unit Cost.
