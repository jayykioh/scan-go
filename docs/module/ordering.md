# Ordering Module

- Serves: REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ORD-004, REQ-PRO-001, REQ-PRO-003, REQ-TBL-003
- Owns: Cart validation, Order creation, Order source record, Customer tracking projection, table service state derived from Orders
- Does not own: Payment records, stock quantities, or Loyalty balance

## Commands
- Validate a cart against current public menu data.
- Create Pay-First or Pay-Later Orders.
- Cancel an unpaid Order through the coordinated cancellation transaction.

## Queries
- Customer tracking by an Order-specific `trackingToken`.
- Authorized Kitchen, Waiter, Cashier, Owner, and Solo Order views.
- Table service state for the floor plan: `callableOrderListTableStatus` folds the tenant's open
  Orders into one state per table. Ordering owns this read because Orders are the source of truth,
  and Table Access only draws it. The projection is deliberately narrow — `tableId`, `state`, three
  counts, `oldestActiveOrderAt` — so any active member may read it without exposing money or
  Customer data (REQ-TBL-003, ADR 0018).

## Rules
- Statuses are `pending`, `cooking`, `ready`, `served`, `paid`, and `cancelled`.
- Store immutable item name, modifier, price, quantity, line total, and Cost snapshots.
- Evaluate the Promotion before the Order transaction and freeze the result into
  the snapshot. The reads happen outside the transaction so the transaction
  stays a pure write (RULES_FIREBASE §4).
- `subtotalVnd` sums the paid lines (a gift line contributes zero);
  `totalVnd = subtotalVnd - discountVnd`, which is the amount the Customer was
  shown.
- Record `discountVnd`, `promotionSnapshot`, `loyaltyMemberId`,
  `pointsRedeemed`, and each line's `lineDiscountVnd` and `isGift`.
- A gift line stores `lineTotalVnd = 0` and its real `lineCostVnd`, so Reporting
  shows zero revenue and a real Cost for what the Promotion gave away.
- Deduct redeemed Loyalty points in the same transaction, and restore them when
  an unpaid Order is cancelled.
- The submission request hash includes the Promotion code and the Loyalty
  member, so the same idempotency key with a different code is a conflict.
- Do not store raw Customer phone values on Orders.
- Block offline submission.
- Pay-First remains hidden from Kitchen before confirmed Payment.

## Contracts
- Emits `OrderCreated`, `OrderStatusChanged`, and `OrderCancelled`.
- Owns every Order document mutation requested by Fulfilment or Payment.
- Exposes validated mutation plans for cross-module atomic commits.
