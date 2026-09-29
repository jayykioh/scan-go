# Gate transaction report

Date: 2026-09-29  
Requirements: REQ-INV-001, REQ-KDS-001, REQ-INV-002, REQ-CAS-002, REQ-ORD-001, REQ-ORD-002, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001

## Cooking read/write set

Reads, before all writes: Kitchen membership, pending Order, tenant idempotency document, every Ingredient in the `InventoryMutationPlan`, and the planned stock-movement IDs.

Writes, atomically: Order `pending -> cooking`, status event, each Ingredient deduction, one immutable deduction ledger row per ingredient, and the idempotency result.

## Cancellation read/write set

Reads, before all writes: Cashier/Owner membership, unpaid Order, idempotency document, each Ingredient, every original deduction ledger row, and each derived restoration ID.

Writes, atomically: cancelled Order and reason, status event, exact ingredient restoration, one immutable restoration ledger row per original deduction, audit event, and idempotency result.

## Automated evidence

`npm run test:integration` in `functions/` executes three tests:

- cooking writes one deduction ledger record and a retry returns the existing result;
- cancellation creates one restoration and audit record, then a retry has no duplicate restoration;
- Pay-Later order creation snapshots public menu prices, creates one tracking projection, and deduplicates the same key.

The Functions implementation uses Firestore `runTransaction`, so a Firestore conflict reruns the callback and only its final attempt commits. The idempotency document makes a later client retry return the same result instead of writing a second effect.

## Remaining environment evidence

The repository has no Firebase Emulator configuration or deployed Firebase project credentials. A real two-second Firestore listener sample and browser-offline E2E recording therefore require the configured project/emulator in the integration environment; the callable and listener boundary are ready for that wiring.
