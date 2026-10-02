# P0-008 — Inventory transaction and Kitchen workflow

## Requirement links

REQ-INV-001, REQ-KDS-001, REQ-ORD-003, CON-002, CON-004, NFR-RT-001, NFR-MOD-001.

## Owning module

Inventory owns ingredients, recipes, and stock movements. Fulfilment coordinates Kitchen actions. Ordering owns Order mutations.

## Allowed file paths

- `functions/src/modules/inventory/**`
- `functions/src/modules/fulfilment/**`
- `functions/src/modules/ordering/index.ts`
- `functions/src/modules/catalog/index.ts`
- `functions/src/shared/idempotency.ts`
- `functions/src/index.ts`
- `shared/contracts/inventory.contract.ts`
- `shared/contracts/fulfilment.contract.ts`
- `shared/contracts/order.contract.ts`
- `shared/fixtures/inventory.fixture.ts`
- `shared/fixtures/fulfilment.fixture.ts`
- `src/data/adapters/inventory.adapter.ts`
- `src/data/adapters/fulfilment.adapter.ts`
- `src/components/OwnerView.tsx`
- `src/components/KitchenView.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/inventory.rules.test.ts`
- `functions/test/inventory/**`
- `functions/test/fulfilment/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not add cancellation restoration, payment work, or direct writes to another module's data.

## Dependencies

P0-004, P0-005, and P0-007.

## Atomic acceptance checklist

- Given authorized Owner input, when ingredients, stock, recipes, or recipe quantities change, then the server validates integer base units and integer VND Cost.
- Given a pending Order with a recipe, when Kitchen starts cooking, then one transaction changes Order state through Ordering and deducts each configured ingredient once.
- Given a retried cooking command, when it repeats, then it creates no duplicate deduction or stock movement.
- Given an authorized Kitchen session, when Kitchen marks an Order ready or requests item unavailability, then the server enforces its transition and Catalog contract boundaries.
- Given a valid Kitchen change, when the transaction commits, then authorized Customer and Staff views receive the update within two seconds at p95 evidence scope.
- Given Cashier, Waiter, inactive Staff, or another Tenant, when it attempts the command, then it is denied.

## Test plan

- Unit: base-unit conversion, recipe Cost, mutation plans, and idempotency.
- Functions Emulator: ingredient and recipe commands, cooking deduction, transaction retry, Kitchen authorization, and Catalog request boundary.
- Rules: Tenant read boundary and direct Inventory, Order, and stock-movement writes denied.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Recipe, Order, and stock-movement ledger fixture.
- Transaction retry assertion.
- Real-time timing sample.

## Out of scope

Unpaid cancellation restoration, Stock counts, waste, manual adjustments, payment, and refunds.
