# Payment Module

- Serves: REQ-CAS-001, REQ-CAS-002, REQ-PAY-001, REQ-PAY-002
- Owns: Payment, VietQR payload, settlement, reversal, refund, provider idempotency
- Does not own: Order item prices, Loyalty rules, or report presentation

## Commands
- Generate dynamic VietQR instructions.
- Confirm cash or VietQR manually.
- Verify and apply an automatic provider event.
- Create a linked reversal or refund.

## Rules
- Confirmed Payment records are immutable.
- ADMIN and Owner can reverse or refund by default.
- Cashier cannot reverse or refund unless Owner grants the approved permission.
- Provider events need valid signatures and unique external event IDs.
- Compose Payment, Ordering, Loyalty, and Reporting mutation plans before one atomic commit.
- Only each owning module prepares mutations for its documents.

## Contracts
- Emits `PaymentConfirmed`, `PaymentReversed`, and `PaymentRefunded`.
