# Payment Module

- Serves: REQ-CAS-001, REQ-CAS-002, REQ-PAY-001, REQ-PAY-002, REQ-PAY-005, REQ-PAY-006
- Owns: Payment, VietQR payload, settlement, reversal, refund, provider idempotency
- Does not own: Order item prices, Loyalty rules, or report presentation

## Commands
- Generate dynamic VietQR instructions from the bank account the Owner stores on the Tenant.
- Let the Owner store the shop's receiving bank account.
- Confirm cash or VietQR manually.
- Verify and apply an automatic provider event (seam only; no live provider, ADR 0022).
- Create a linked reversal or refund.

## Rules
- Confirmed Payment records are immutable.
- ADMIN and Owner can reverse or refund by default.
- Cashier cannot reverse or refund unless Owner grants the approved permission.
- Provider events need valid signatures and unique external event IDs.
- Compose Payment, Ordering, Loyalty, and Reporting mutation plans before one atomic commit.
- Only each owning module prepares mutations for its documents.
- Settlement money reaches the shop's own bank account, never a platform account (ADR 0022).
- The Tenant's `vietQr` map is written only by one audited server command that requires an **active Owner membership**. No client writes it, and **ADMIN has no write path to it** — no `isAdmin` bypass, unlike the read paths that carry one. A money destination is the shop's decision alone.
- The receiving account is **not** a Config key, on purpose. `platform/config` is ADMIN-writable, so a bank account there would let ADMIN choose where a shop's money goes. See `docs/module/config.md`.

## VietQR and the shop's account (ADR 0022)
VietQR is the only online settlement method. The Owner stores the shop's own receiving account — `bankBin`, `accountNo`, `accountName`, `template` — through a server-only audited command that writes the Tenant's `vietQr` map. `buildVietQrInstruction` then builds the `img.vietqr.io` instruction from those values plus the server-authoritative integer VND amount and a `SCANGO {orderId}` note. The Cashier shows it and confirms the transfer manually, which posts one immutable Payment with `method: 'vietQr'`.

- The bank account is not a Config layer key; it stays on the Tenant document, so ADR 0003 layering and the approved tenant override keys are untouched.
- Only two stored fields route money: `bankBin` and `accountNo`.
  - `bankBin` is chosen from the checked-in VietQR bank list, never typed. VietQR accepts a BANK_ID as the BIN, the common name, or the NAPAS code; the BIN is the stable one to store.
  - `accountNo` has no free API check: VietQR's account-lookup service is discontinued and its replacement is a registered integration. The settings screen therefore renders the real QR for the entered account and the Owner confirms by scanning it with their own banking app before saving.
    `shortcut: the account number is confirmed by the Owner's own banking app, not by API; add API lookup when a supported bankHub integration exists.`
- `template` is a closed enum of VietQR's five themes: `compact`, `compact2`, `qr_only`, `print`, `loax`. A free string would let a typo produce a broken QR image with no error.
- `accountName` is a caption rendered on the QR image. VietQR states it "is not part of the VietQR standard", so it never routes money, it is optional, and it must never be treated as verification.
- `addInfo` is `SCANGO {orderId}` — under VietQR's 50-character limit and without special characters, because the Order id is alphanumeric.
- An Order created before the shop stored an account has no instruction; the Cashier is told the shop has not set one rather than shown a QR for an unknown account.

## The automatic adapter seam
`functions/src/modules/payment/provider.ts` keeps the replaceable signed-event adapter interface (REQ-PAY-002). **No live provider implements it.** The PayOS provider that used to implement it is withdrawn: `payos.ts`, `callablePaymentCreatePayosLink`, the public `payosWebhookV1` endpoint, the `payosPaymentLinks` collection, the `platform/payosCounter` allocator, the collection-group index on `payosPaymentLinks.orderCode`, and the three `PAYOS_*` secrets are all removed. Picking a provider later needs its own ADR.

## Contracts
- Emits `PaymentConfirmed`, `PaymentReversed`, and `PaymentRefunded`.
