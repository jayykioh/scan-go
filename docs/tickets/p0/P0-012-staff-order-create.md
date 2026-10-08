# P0-012 — Staff order entry (dine-in)

## Requirement links

REQ-ORD-005, REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ACL-001, NFR-DATA-001.

## Owning module

Ordering owns Order creation and server pricing. The staff screen calls the Ordering server command.

## Allowed file paths

- `shared/contracts/order.contract.ts`
- `shared/fixtures/order.fixture.ts`
- `functions/src/modules/ordering/**`
- `functions/test/ordering/**`
- `functions/test/rules/order.rules.test.ts`
- `src/data/adapters/ordering.adapter.ts`
- `src/data/adapters/view-mappers.ts`
- `src/components/StaffView.tsx`
- `src/types.ts`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change Payment, menu price rules, or direct client writes.

## Dependencies

P0-005, P0-007, P0-009, P0-010.

## Atomic acceptance checklist

- Given Owner or Cashier input, when the server creates an Order, then the server resolves every name, price, and total from the current menu (REQ-ORD-005).
- Given a table that is missing or inactive, when the command runs, then it is rejected.
- Given a Waiter, Kitchen, inactive Staff, or another Tenant, when it calls the command, then it is denied.
- Given a Pay-Later staff Order, when it commits, then Kitchen receives one notification like a Customer Order.
- Given a retried command, when it repeats, then it creates no duplicate Order.
- Given the committed Order, when the transaction ends, then an audit event records the staff actor.

## Test plan

- Unit: staff input parsing, server pricing, request hash.
- Functions Emulator: create as Owner and Cashier, deny Kitchen/Waiter/other Tenant, inactive table, idempotent retry, Pay-Later notification.
- Rules: direct Order writes remain denied.
- Add test paths to the Functions Emulator Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.

## Out of scope

Takeaway Orders (P0-013), discounts, and manual price override.
