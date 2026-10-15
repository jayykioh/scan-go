# Payment Module

- Serves: REQ-CAS-001, REQ-CAS-002, REQ-PAY-001, REQ-PAY-002, REQ-PAY-003, REQ-PAY-004
- Owns: Payment, VietQR payload, settlement, reversal, refund, provider idempotency, PayOS payment links
- Does not own: Order item prices, Loyalty rules, or report presentation

## Commands
- Generate dynamic VietQR instructions.
- Confirm cash or VietQR manually.
- Verify and apply an automatic provider event.
- Create a linked reversal or refund.
- Open, or reopen, one PayOS payment link for an unpaid Order.

## Rules
- Confirmed Payment records are immutable.
- ADMIN and Owner can reverse or refund by default.
- Cashier cannot reverse or refund unless Owner grants the approved permission.
- Provider events need valid signatures and unique external event IDs.
- Compose Payment, Ordering, Loyalty, and Reporting mutation plans before one atomic commit.
- Only each owning module prepares mutations for its documents.

## PayOS
PayOS is the live automatic provider (REQ-PAY-003, REQ-PAY-004). It is available exactly when `PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, and `PAYOS_CHECKSUM_KEY` are bound from Secret Manager; the Functions emulator always uses a fixed test credential set so the signed-webhook evidence stays hermetic.

- `callablePaymentCreatePayosLink` is a Cashier/Owner command. It refuses an Order that is already paid or cancelled, returns the stored link when one is still pending, and otherwise allocates a unique `orderCode` from the server-only `platform/payosCounter` in the same transaction that writes `payosPaymentLinks/{orderId}`. The link is written before PayOS is called, so a link the provider created can never be orphaned by a failed write.
- `payosWebhookV1` is a public HTTP endpoint. It verifies the HMAC-SHA256 checksum over the signed `data` object **before any read**, then resolves the Tenant and Order through the signed `orderCode`. The request body cannot name the Tenant or the Order.
- The signature string is every non-null key sorted alphabetically as `key=value`, joined with `&` — one function builds it for both the outbound request and the inbound webhook. A null-valued field is omitted, which is what PayOS sends.
- Settlement reuses the shared idempotent core with `method: 'payos'` and `providerId: 'payos'`. The deterministic Payment id and the evidence id keyed on the PayOS `reference` make a replayed webhook a replay, and the link is marked `paid` only after the settlement commits.
- The `payos` adapter deliberately has no `verifySignature`: PayOS signs its own body, not the normalized payload, so the generic signed-event seam can never post as `payos`.
- A non-settled or unreadable event is acknowledged with `ignored` rather than refused, so PayOS stops retrying a notification this server will never act on. A forged signature (401), an unknown `orderCode` (404), and an amount that does not match the Order (400) are refused instead.
- The webhook needs the collection-group index on `payosPaymentLinks.orderCode`; deploy it with `npm run deploy:indexes` before the first live payment.

## Contracts
- Emits `PaymentConfirmed`, `PaymentReversed`, and `PaymentRefunded`.
