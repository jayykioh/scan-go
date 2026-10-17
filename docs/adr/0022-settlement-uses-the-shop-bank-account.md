# ADR 0022 — Settlement uses the shop's own bank account; PayOS is withdrawn

- Status: Decided
- Date: 2026-10-15
- Supersedes: the PayOS provider scope of REQ-PAY-002, REQ-PAY-003, and REQ-PAY-004
- Serves: REQ-PAY-001, REQ-PAY-005, REQ-PAY-006, REQ-CAS-001, NFR-SEC-001

## Context

REQ-PAY-002 to REQ-PAY-004 added a replaceable automatic payment adapter and one
live implementation of it: PayOS. Its credentials are three platform-level
secrets (`PAYOS_CLIENT_ID`, `PAYOS_API_KEY`, `PAYOS_CHECKSUM_KEY`) shared by
every tenant, so settlement means the Customer's money lands in **one ScanGo
merchant account** and ScanGo owes it back to each shop.

VietQR already does the same job with no merchant account. `buildVietQrInstruction`
in `functions/src/modules/payment/service.ts` builds an `img.vietqr.io` image URL
from the tenant's own `vietQr` map on the tenant document — `bankBin`,
`accountNo`, `accountName`, `template` — plus the server-authoritative amount and
`SCANGO {orderId}` as the transfer note. The Cashier then confirms the transfer
manually. The money goes straight to the shop.

The gap was never the QR. It is that nothing writes `tenants/{tenantId}.vietQr`
except `functions/src/scripts/seed.ts`, so a real shop has no way to enter its
own bank account.

The product now targets shops of 5–50 tables. At that size the shared merchant
account stops being a detail: routing another business's revenue through
ScanGo's account makes ScanGo a payment intermediary, with the tax, legal, and
cash-flow consequences that follow. It is also unnecessary, because the money
can go directly to the shop.

Production evidence for the switch, read 2026-10-15 across 10 tenants: 238 stored
Payments, of which **0** carry `method: 'payos'` (109 `vietQr` + 129 `cash` in
`demo-nha-hang` and `first-5HkVzXe86pOa7wBcgRNF2QvartC3` alone). The automatic
path was built and deployed but never settled a real Payment. One leftover
`payosPaymentLinks` document exists.

## Decision

1. VietQR into the shop's own bank account is the only online settlement method.
   The Cashier confirms the transfer manually. This is the existing M1 flow.
2. The Owner stores the shop's bank account on the Tenant's existing `vietQr` map,
   through one server-only Owner command. The Owner manages it on the Cài đặt
   screen, next to the rest of the shop's config.
   - **It deliberately does not become a Config key.** The layered config
     (`platform/config` → `CONFIG_DEFAULTS` → `configOverrides`) has a platform
     layer, and `platformConfigOverrideInputSchema` lets ADMIN write every key in
     it. A receiving bank account on that layer would let ADMIN choose where a
     shop's money goes, including for a shop that never set its own account. A
     preference may have an ADMIN default; a money destination may not.
   - The write command requires an **active Owner membership** and does **not**
     take the ADMIN bypass that `callableReportingRebuildDailyStats`,
     `callableSubscriptionGet`, and `callableConfigGetResolved` take.
     `assertActiveOwnerMember` in `functions/src/modules/config/service.ts` already
     has exactly that behaviour — no `isAdmin` argument — so reusing it is what
     enforces this, and a future reader must not "fix" it by adding one.
   - Not being a config key means no new key, no new override allow-list entry, no
     `TENANT_VISIBLE_VALUE_KEYS` change, and no migration: `buildVietQrInstruction`
     already reads this map and 109 real `vietQr` Payments already settle through
     it.
3. Get the two fields that decide where money goes right, by construction:
   - `bankBin` is **never typed**. The Owner picks the bank from the VietQR bank
     list (`GET https://api.vietqr.io/v2/banks`, free and unauthenticated): `bin`,
     `code`, `shortName`, `name`, `logo`. VietQR accepts a BANK_ID as the BIN, the
     common name, or the NAPAS code, and the BIN is the stable one to store.
   - `accountNo` cannot be verified by API — VietQR's account-lookup service is
     discontinued and is migrating to bankHub Pay Out, and its replacement is a
     registered integration, not a free call. So the Owner **confirms by
     scanning**: the settings screen renders the real QR for the entered account,
     the Owner scans it with their own banking app (which resolves and displays
     the account holder), and only then saves. That is the bank's own
     verification, at zero cost, before the value is stored.
4. `template` becomes a closed enum of VietQR's five themes — `compact`,
   `compact2`, `qr_only`, `print`, `loax` — instead of a free string. A typo today
   yields a broken QR image with no error. `accountNo` tightens from a 32-character
   bound to VietQR's 19, and `addInfo` stays within VietQR's 50 characters with no
   special characters, which `SCANGO {orderId}` already satisfies because the Order
   id is alphanumeric.
5. `accountName` is a **caption on the rendered image only**. VietQR's own
   specification states it "is not part of the VietQR standard", so it does not
   route money. It is optional, it never blocks a save, and it may be prefilled
   from the scan in step 3. Never let it be mistaken for a verification.
   `shortcut: the account number is confirmed by the Owner's own banking app, not by API; add API lookup when a supported bankHub integration exists.`
6. Withdraw the PayOS provider:
   - `payos` leaves `paymentMethodSchema`, leaving `cash` and `vietQr`.
   - Delete `functions/src/modules/payment/payos.ts` and its test,
    `callablePaymentCreatePayosLink`, `payosWebhookV1`, the `payosPaymentLinks`
    collection and its Rules block, the `platform/payosCounter` allocator, the
    collection-group index on `payosPaymentLinks.orderCode`, the three PayOS
    secrets, and the `qrcode.react` dependency that existed only to render the
    raw EMVCo string PayOS returned.
   - Delete the leftover `payosPaymentLinks` document.
7. REQ-PAY-002 keeps the replaceable automatic-adapter seam in
   `functions/src/modules/payment/provider.ts`. No live provider implements it,
   and nothing implements it until a new ADR picks one.
8. Settlement, reversal, refund, the immutable Payment record, and settlement
   idempotency are unchanged. Only the provider transport goes away.

## Consequences

- Money no longer passes through ScanGo. The blocker for selling to larger shops
  is gone, and no reconciliation obligation remains.
- The public attack surface shrinks: `payosWebhookV1` was the only unauthenticated
  write endpoint in the system. Removing it removes the HMAC verification path,
  the signature-string builder, and its tests.
- Three secrets and one dependency are deleted. `firebase functions:secrets:set`
  no longer needs PayOS values before a deploy.
- The Owner needs a bank-account screen, which the system does not have today.
  Without it the QR flow is unreachable for a real shop, so REQ-PAY-005 is the
  part that makes the rest usable.
- The risk moves out of `accountName` and onto the two fields that actually route
  money: `bankBin` and `accountNo`. Choosing the bank from a list removes the
  first entirely. The second is confirmed by the Owner's own banking app at save
  time, which is a real check but depends on the Owner completing it.
- The bank list is checked into the repository rather than fetched at runtime, so
  the settings screen cannot fail because a third party is unreachable, and no
  cache or callable is needed. It can go stale when banks merge or rename; the
  Owner can still enter a bank's short name directly because VietQR accepts it,
  and a refresh script keeps the file current — the same shape as the existing
  `functions/src/scripts/market-prices/` collector.
- `accountName` stays in the stored shape for backward compatibility and for the
  image caption, but nothing validates it and nothing depends on it.
- Dropping `payos` from `paymentMethodSchema` would break a read of a stored
  Payment that carries `method: 'payos'`. Production holds none, so no migration
  is required. A future reader should still treat this as verified once, not as
  a permanent invariant.
- `docs/module/payment.md`, `docs/data-model.md`, `TECH_STACK.md` §2, the SRS
  data-model table and traceability, and `firestore.rules` are amended by this
  decision.
