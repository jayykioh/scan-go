# Promotion Module

- Serves: REQ-PRO-001
- Owns: Promotion definitions, eligibility, selection, and immutable Order snapshots
- Does not own: Cart storage, menu price, Payment, or Loyalty balance

## Commands
- Create, update, activate, deactivate, and archive a Promotion.

## Queries
- List active tenant Promotions for a server calculation.
- Explain the selected Promotion result.

## Rules
- Evaluate Promotions on the server with integer VND.
- Select one best eligible Promotion for each Order.
- Never stack Promotions in v1.
- Resolve equal benefits by explicit priority, then stable Promotion ID.
- Store the applied rule and result snapshot on the Order.

## Contracts
- Ordering requests an evaluation with validated cart facts.
- Emits `PromotionChanged` and returns a deterministic calculation result.
