# Promotion Module

- Serves: REQ-PRO-001, REQ-PRO-002, REQ-PRO-003, REQ-PRO-004, REQ-PRO-005, REQ-PRO-006
- Owns: Promotion definitions, eligibility, selection, and immutable Order snapshots
- Does not own: Cart storage, menu price, Payment, or Loyalty balance

## Commands
- Create, update, activate, deactivate, and archive a Promotion
  (`callablePromotionUpsert`, `callablePromotionSetStatus`). Owner only.
- Suggest, approve, and measure a campaign
  (`callablePromotionSuggestCampaign`, `callablePromotionApproveCampaign`,
  `callablePromotionMeasureCampaign`). AI suggests; only Owner approval applies.

## Queries
- List non-archived tenant Promotions (`callablePromotionList`, and the direct
  read in `src/data/firestoreRead.ts`).
- Evaluate one cart (`callablePromotionEvaluate`) for the Customer cart.

## Screens
- `/dashboard/promotions` (`src/pages/dashboard/PromotionsPage.tsx`) is the
  Owner screen: status strip, list with activate/pause/archive, the type-aware
  create form, and the AI campaign section.
- `SettingsPage` owns the single reserved `quick-discount` record
  (`source: 'quick'`), which the Promotion page shows read-only.

## Benefit types

| Type | Reward | Notes |
|---|---|---|
| `percentOff` | `floor(subtotal × percent / 100)`, capped, clamped | Basic |
| `fixedAmount` | Flat integer VND, clamped | Basic |
| `buyXGetY` | The cheapest reward units lose their price (or part of it) | Mua 1 tặng 1 is `buyQuantity 1`, `getQuantity 1`, same item |
| `freeItem` | One gift line per rewarded item at 0 VND | The cheapest available candidate wins |
| `bundlePrice` | Every complete group of N units is charged at one price | The group takes the most expensive units |
| `pointsRedemption` | Spends `pointsCost` for a `percentOff`, `fixedAmount`, or `freeItem` reward | Requires a verified member with enough points |

## Eligibility conditions
- `minSubtotalVnd`, `minQuantity`, `menuItemIds` — cart shape. Basic.
- `timeWindow` — tenant-local happy hour; `from > to` spans midnight.
- `daysOfWeek` — tenant-local weekdays, 0 = Sunday.
- `code` — the Customer must type it.
- `customerSegment` — `newCustomer`, `visitCountAtLeast`, or
  `loyaltyTierAtLeast`, each needing a verified member.

Basic (`percentOff`, `fixedAmount` with cart-shape conditions only) is available
on every plan; everything else needs `promotionAdvanced`, which is Lite and Pro.

## Rules
- Evaluate Promotions on the server with integer VND.
- Select one best eligible Promotion for each Order. Never stack.
- Rank by `discountVnd + giftValueVnd`; resolve equal value by explicit
  `priority`, then stable Promotion ID.
- A cash discount never reaches the whole subtotal: it is clamped to
  `subtotalVnd - 1` so the Order keeps a payable amount.
- Store the applied rule and result snapshot on the Order.
- A gift is a zero-value Order line with a real Cost, never a subtotal discount.
- Deduct redeemed points in the Order transaction; restore them when an unpaid
  Order is cancelled.
- Plan limits are enforced in trusted code: `maxActivePromotions` at the moment a
  Promotion becomes active, and `promotionAdvanced` at upsert.

## Contracts
- Ordering requests an evaluation with validated cart facts.
- `evaluatePromotionForCart` returns `lines`, `giftLines`, `pointsRedeemed`,
  `codeRequired`, and one `ineligibilityReasons` entry per considered Promotion,
  so the UI can say why nothing applied.
- Emits `PromotionChanged` and returns a deterministic calculation result.

## Out of scope
- Stacking several Promotions on one Order.
- A Promotion that makes the Order total zero.
- Per-customer coupon issuance and single-use codes.
