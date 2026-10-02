# P0-007 — Customer ordering, tracking, and offline block

## Requirement links

REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001, NFR-UX-001, NFR-MOD-001.

## Owning module

Ordering owns cart validation, Orders, idempotency, and Customer tracking projections.

## Allowed file paths

- `functions/src/modules/ordering/**`
- `functions/src/shared/appCheck.ts`
- `functions/src/shared/idempotency.ts`
- `functions/src/shared/rateLimit.ts`
- `functions/src/index.ts`
- `shared/contracts/order.contract.ts`
- `shared/fixtures/order.fixture.ts`
- `src/data/adapters/ordering.adapter.ts`
- `src/components/CustomerView.tsx`
- `src/pages/PublicMenuPage.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/ordering.rules.test.ts`
- `functions/test/ordering/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not change Payment records, Inventory quantities, or Table Access token state.

## Dependencies

P0-001, P0-005, and P0-006.

## Atomic acceptance checklist

- Given a valid table link, when Customer browses, searches, filters, selects modifiers, or changes cart quantities, then totals use current public menu prices and integer VND.
- Given Pay-Later, when Customer submits a valid online request, then one `pending` Order, status event, idempotency record, and public tracking projection exist.
- Given Pay-First without confirmed payment, when Customer submits, then the Order does not reach Kitchen.
- Given a reused idempotency key with the same request, when submission retries, then it returns the prior result without another Order.
- Given an invalid token, invalid App Check, exceeded limit, malformed cart, or reused key with a changed request, when submission runs, then it rejects without an Order.
- Given no connection, when Customer submits, then the UI creates no Order and shows a connection problem while cached menu viewing remains available.

## Test plan

- Unit: cart totals, modifier validation, VND snapshots, offline-submit guard, and tracking mapping.
- Functions Emulator: valid token, Pay-Later, Pay-First gate, App Check, rate limit, idempotency, and cross-tenant rejection.
- Rules: public tracking-only reads, no tenant Order reads by Customer, and direct business-write denial.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Order, status-event, idempotency, and tracking fixtures.
- Offline browser test result.
- Timed Customer order scenario evidence.

## Out of scope

Kitchen transitions, inventory deductions, Cashier settlement, cancellation, reversal, and refund.
