# Ordering Module

- Serves: REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ORD-004
- Owns: Cart validation, Order creation, Order source record, Customer tracking projection
- Does not own: Payment records, stock quantities, or Loyalty balance

## Commands
- Validate a cart against current public menu data.
- Create Pay-First or Pay-Later Orders.
- Cancel an unpaid Order through the coordinated cancellation transaction.

## Queries
- Customer tracking by an Order-specific `trackingToken`.
- Authorized Kitchen, Waiter, Cashier, Owner, and Solo Order views.

## Rules
- Statuses are `pending`, `cooking`, `ready`, `served`, `paid`, and `cancelled`.
- Store immutable item name, modifier, price, quantity, line total, and Cost snapshots.
- Do not store raw Customer phone values on Orders.
- Block offline submission.
- Pay-First remains hidden from Kitchen before confirmed Payment.

## Contracts
- Emits `OrderCreated`, `OrderStatusChanged`, and `OrderCancelled`.
- Owns every Order document mutation requested by Fulfilment or Payment.
- Exposes validated mutation plans for cross-module atomic commits.
