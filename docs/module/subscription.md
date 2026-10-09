# Subscription Module

- Serves: REQ-SUB-001, REQ-PRO-006
- Owns: Free, Lite, and Pro plan state and entitlement evaluation
- Does not own: External subscription billing in v1

## Commands
- ADMIN or authorized Owner changes an allowed tenant plan.

## Queries
- Return current plan.
- Evaluate a feature entitlement using resolved Config.

## Entitlements

| Plan | `maxActivePromotions` | Promotion features |
|---|---|---|
| Free | 1 | `promotions` (basic benefits and cart-shape conditions only) |
| Lite | unlimited | `promotions`, `promotionAdvanced`, `loyalty` |
| Pro | unlimited | all of Lite plus `nfc`, `kds`, `ai`, `automaticPayment` |

## Rules
- `maxActivePromotions` is enforced when a Promotion becomes `active`, so a Free
  tenant can still keep drafts.
- `promotionAdvanced` is enforced at Promotion upsert and covers the
  `buyXGetY`, `freeItem`, `bundlePrice`, and `pointsRedemption` benefits and the
  happy-hour, weekday, code, and customer-segment conditions (REQ-PRO-006).
- Server enforcement is authoritative.
- Frontend visibility must match the server result.
- `Enterprise` is outside v1.
- Automatic subscription billing is outside v1.
- Plan changes create audit events.

## Contracts
- Emits `SubscriptionChanged` and `EntitlementChanged`.
