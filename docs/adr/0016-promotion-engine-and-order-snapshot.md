# ADR 0016 — One Promotion engine, and a Promotion snapshot on the Order

- Status: Decided
- Date: 2026-10-08
- Serves: REQ-PRO-001, REQ-PRO-002, REQ-PRO-003, REQ-PRO-004, REQ-PRO-005, REQ-PRO-006, REQ-ORD-001, REQ-SUB-001, NFR-DATA-001

## Context

Promotion contract v1 could only take a whole-percent or flat-VND amount off a
cart subtotal. Two problems followed.

First, the engine was unreachable. `callablePromotionEvaluate` existed and had
tests, but no screen called it, and `orderSnapshotSchema` had no field for a
discount. A Customer therefore saw one total and the Order recorded another. A
second, client-only discount lived in `tenantConfig.discountCode` /
`discountAmount`: `CustomerView` subtracted it from the displayed total while
`callableOrderSubmit` never saw it, so the discount was displayed but never
charged. `docs/data-model.md` already documented `promotionSnapshot` and
`loyaltyMemberId` on the Order, but neither field existed in the contract.

Second, a discount on the cart total is not the shape shop owners asked for.
They want item-level rewards — buy one get one, a free dish, a combo price — and
Loyalty point redemption, plus the conditions that make a promotion useful in
Vietnam: a happy-hour window, a weekday, a code the Customer types, and a
customer segment.

Item-level rewards also need somewhere to put the reward. A free dish is not a
discount on the subtotal; it is a line the Kitchen must cook and Reporting must
cost.

## Decision

1. **One deterministic engine.** `evaluatePromotionForCart` in the Promotion
   module is the only place a cart is priced against promotions. The public
   `callablePromotionEvaluate` and Order creation both call it, so the Client and
   the server cannot drift (REQ-PRO-001).
2. **Bump the contract to v2** and add four benefit types next to the two basic
   ones: `buyXGetY`, `freeItem`, `bundlePrice`, and `pointsRedemption`. The
   eligibility gains `minQuantity`, `timeWindow`, `daysOfWeek`, `code`, and
   `customerSegment`. A v1 document still reads through `mapPromotionV1ToV2`.
3. **The order records what was applied.** `orderSnapshotSchema` gains
   `discountVnd`, `promotionSnapshot`, `loyaltyMemberId`, and `pointsRedeemed`;
   each line gains `lineDiscountVnd` and `isGift`. `totalVnd` becomes
   `subtotalVnd - discountVnd`, which is the amount the Customer was shown.
4. **A gift is a zero-value line, not a discount.** A rewarded item becomes an
   Order line with `lineTotalVnd = 0`, `isGift = true`, and its real Cost. The
   subtotal is unchanged, so the Customer never pays the menu price of a gift;
   Reporting sees zero revenue and a real Cost, and gross profit drops by what
   the promotion gave away.
5. **Cash discount and gift value stay separate.** The evaluation returns
   `discountVnd` (cash off the paid subtotal) and `giftValueVnd` (menu value of
   the gifts). Selection ranks promotions by `discountVnd + giftValueVnd`, so a
   generous gift can beat a small cash discount, but only the cash part reduces
   the payable total.
6. **No stacking, still.** One Promotion applies per Order. Equal value resolves
   by higher `priority`, then by the stable promotion id.
7. **A discount never makes an Order free.** `discountVnd` is clamped to
   `subtotalVnd - 1` when the subtotal is positive, so the existing payment path
   always has at least one VND to settle. A fully free Order is out of scope.
8. **Point redemption is atomic with the Order.** The redeemed points are
   deducted in the same transaction that creates the Order, against a member
   re-read inside that transaction, and the ledger entry id is deterministic.
   Cancelling an unpaid Order restores them through
   `loyalty_redeem_reverse_<orderId>`, a different id from the entry that
   reverses earned points, so one Order can carry both corrections.
9. **Plan limits live in trusted code.** `planEntitlementsSchema` gains
   `maxActivePromotions`, and `promotionAdvanced` becomes a feature. Free holds
   one basic active Promotion; Lite and Pro are unlimited and may use the
   advanced benefits and conditions. Free gains the `promotions` feature it
   previously lacked, which had left the plan with no features at all.
10. **The Settings quick discount becomes a reserved Promotion.** The id
    `quick-discount` with `source: 'quick'` is owned by the Settings page and is
    written through `callablePromotionUpsert`, so the fast editor and the full
    page share one engine. The Promotion page refuses to edit or re-source that
    record.

## Consequences

- The Order contract is version 2. `mapStoredOrder` normalizes an Order written
  before the Promotion snapshot existed to zero discount and no gift line.
- Reporting item revenue becomes `lineTotalVnd - lineDiscountVnd`, so per-item
  figures add up to the discounted Order total; table revenue already came from
  the payment amount.
- `promotionEvaluateInputSchema` gains `selectedOptionIds`, and both Ordering and
  Promotion price modifiers through `sumModifierDeltaVnd` in the Catalog
  contract, so the discount base equals the Order subtotal when modifiers are
  chosen.
- `promotionCartLineSchema` gained a field, so the line schema is no longer the
  minimal shape a caller might assume.
- Promotion evaluation happens before the Order transaction and is frozen into
  the snapshot. A promotion that expires between evaluation and commit still
  applies to that Order; the stored snapshot is what the Order was charged.
- The promotion list read sorts by priority in the browser instead of in
  Firestore, so it needs no composite index.
- The client-only `tenantConfig.discount*` fields no longer affect any total.
  `CustomerView` renders the server result; the Settings page keeps the fast
  editor and writes it to the server.
- A Free tenant cannot activate a second Promotion. The server rejects it with a
  message that names the limit, and the page explains how to free the slot.
