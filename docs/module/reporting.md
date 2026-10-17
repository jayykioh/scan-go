# Reporting Module

- Serves: REQ-RPT-001, REQ-RPT-002, REQ-RPT-003, REQ-RPT-004
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
- Compare a period against the immediately preceding period of equal length,
  returning each figure's previous value, its delta, and how many days carry data
  in each period (REQ-RPT-003). A previous period without data states the gap and
  shows no percentage; a previous value of zero shows no percentage.
- Report the Cost coverage behind every Cost or profit figure: how many sold items
  carry a Cost and how many do not, with the figure labelled partial when any item
  does not (REQ-RPT-004). An item sold only as a Promotion gift is excluded from
  the margin sample and counted separately.

## Derived metrics and the extra reads they need
The comparison and coverage figures are **derived on the client**, in
`src/data/adapters/reporting.adapter.ts` and `src/data/adapters/data-health.adapter.ts`.
The server reporting module and the `dailyStats` documents are unchanged, and no
new Rules block is needed: the reads below are already permitted.

- Catalog `menuItems` and `recipes`, and Inventory `ingredients`, for Cost
  coverage (REQ-RPT-004). A missing Cost is `null` and never zero.
- Config supplies the thresholds that turn a raw figure into a judgement; goal and
  opening-hour settings are a later wave.

## Rules
- Every source effect is idempotent.
- Stats are derived and can be rebuilt by day.
- Source records always win after disagreement.
- Only Reporting prepares writes to daily stats documents.
- A figure computed from an incomplete sample is labelled partial, never presented
  as complete (REQ-RPT-004, NFR-DATA-002).
