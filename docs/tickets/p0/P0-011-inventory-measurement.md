# P0-011 — Ingredient purchase units and recipe waste

## Requirement links

REQ-INV-005, REQ-INV-006, REQ-INV-007, REQ-INV-001.

## Owning module

Inventory owns ingredient Cost, recipe measurement, and stock movements. UI forms call the Inventory server commands.

## Allowed file paths

- `shared/contracts/inventory.contract.ts`
- `shared/fixtures/inventory.fixture.ts`
- `functions/src/modules/inventory/**`
- `functions/test/inventory/**`
- `functions/test/fulfilment/**`
- `src/data/adapters/inventory.adapter.ts`
- `src/data/adapters/view-mappers.ts`
- `src/types.ts`
- `src/components/OwnerView.tsx`
- `src/components/SoloOperatorView.tsx`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change menu price, Order state, or direct client writes.

## Dependencies

P0-005, P0-007, P0-008, P0-011 uses the frozen Inventory contract.

## Atomic acceptance checklist

- Given a purchase unit and a purchase price, when Owner saves an ingredient, then the server stores the integer VND Cost per base unit (REQ-INV-005).
- Given a recipe line in a chosen unit, when Owner saves it, then the server converts it to integer base units and rejects a unit that does not match the ingredient base unit (REQ-INV-006).
- Given a waste quantity on a recipe line, when Kitchen starts cooking, then one transaction deducts quantity plus waste, and the recipe Cost includes the waste (REQ-INV-007).
- Given a retried cooking command, when it repeats, then it creates no duplicate deduction or stock movement.
- Given a non-Owner member, when it calls an ingredient or recipe command, then it is denied.

## Test plan

- Unit: unit Cost conversion, base-unit conversion, recipe Cost with waste, deduction plan with waste.
- Functions Emulator: ingredient command with purchase unit, recipe command with waste, cooking deduction, authorization.
- Run web, functions, and Emulator Vitest suites.

## Required evidence

- Passing unit and Functions Emulator results.
- Recipe line fixture with waste.

## Out of scope

Purchase orders, supplier records, and per-line percentage loss.
