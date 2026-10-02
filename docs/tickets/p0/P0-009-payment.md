# P0-009 — Cashier settlement, dynamic VietQR, and Pay-First gate

## Requirement links

REQ-CAS-001, REQ-ORD-002, REQ-ORD-003, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001.

## Owning module

Payment owns dynamic VietQR payloads and immutable manual settlement records. Ordering owns Order state mutations.

## Allowed file paths

- `functions/src/modules/payment/**`
- `functions/src/modules/ordering/index.ts`
- `functions/src/shared/audit.ts`
- `functions/src/shared/idempotency.ts`
- `functions/src/index.ts`
- `shared/contracts/payment.contract.ts`
- `shared/contracts/order.contract.ts`
- `shared/fixtures/payment.fixture.ts`
- `src/data/adapters/payment.adapter.ts`
- `src/components/CashierView.tsx`
- `src/components/CustomerView.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/payment.rules.test.ts`
- `functions/test/payment/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not implement unpaid cancellation, reversal, refund, Loyalty, or automatic provider events.

## Dependencies

P0-004 and P0-007.

## Atomic acceptance checklist

- Given an unpaid Order, when Cashier loads the queue, then it sees only authorized tenant Orders.
- Given a valid cash or dynamic VietQR confirmation, when Cashier confirms once, then one immutable Payment exists and Ordering marks the Order `paid` atomically.
- Given a duplicate confirmation, when the same idempotency key retries, then it returns the first result and creates no second Payment.
- Given a Pay-First Order without confirmed payment, when Kitchen loads its queue, then the Order is absent.
- Given an unauthorized role, cross-tenant request, invalid amount, or malformed request, when settlement runs, then it rejects without a Payment or Order state change.
- Given settlement data, when stored, then amounts are integer VND and timestamps are server UTC.

## Test plan

- Unit: VietQR payload mapping, integer VND validation, immutable record guard, and settlement mapping.
- Functions Emulator: cash and VietQR confirmation, idempotency, immutable record, role matrix, and Pay-First Kitchen gate.
- Rules: payment and Order reads stay tenant-scoped and all direct writes are denied.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Cash and VietQR settlement fixtures.
- Immutability and duplicate-confirmation assertions.
- Pay-First queue evidence.

## Out of scope

Cancellation, inventory restoration, reversals, refunds, automatic adapter events, Loyalty, and reporting.
