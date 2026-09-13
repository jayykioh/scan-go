# Reporting Module

- Serves: REQ-RPT-001, REQ-RPT-002
- Owns: Rebuildable daily stats and reconciliation
- Does not own: Orders, Payments, Inventory, or source financial truth

## Write model
- Use `dailyStats/{yyyymmdd}` in the tenant timezone.
- Increment `createdOrderCount` when an Order is created.
- Increment `cancelledOrderCount` when an unpaid Order is cancelled.
- Add paid revenue, Cost, and gross profit only after confirmed Payment.
- Apply separate reversal and refund effects.
- Keep item and table stats in daily subcollections.
- Expose mutation plans for an initiating Order or Payment transaction.

## Queries
- Return day, week, and month totals.
- Return popular items and table stats.
- Reconcile one period against source Orders and Payments.

## Rules
- Every source effect is idempotent.
- Stats are derived and can be rebuilt by day.
- Source records always win after disagreement.
- Only Reporting prepares writes to daily stats documents.
