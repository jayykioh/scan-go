# ADR 0004 — Protect Payment and Order History

- Status: Decided
- Date: 2026-09-12
- Serves: REQ-CAS-001, REQ-CAS-002, REQ-PAY-001, NFR-RET-001

## Context
Cashier must correct mistakes without hiding paid activity or causing repeated inventory and Loyalty changes.

## Decision
Keep paid orders and payment records immutable. Correct them with linked reversal or refund records. Cancel unpaid orders with a reason. Use transactions and idempotency for payment, inventory, and Loyalty effects.

## Consequences
- Reports can reconcile to original and compensating records.
- Storage can archive protected records after the configured retention period.
- UI actions must distinguish cancellation, reversal, and refund.
