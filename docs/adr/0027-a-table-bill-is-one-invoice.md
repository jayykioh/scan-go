# ADR 0027 — A table's open bill is one invoice, settled per Order

- Status: Decided
- Date: 2026-11-05
- Serves: REQ-CAS-003, REQ-CAS-004, REQ-WAI-002, REQ-CAS-001, REQ-CAS-002
- Related: ADR 0004 (protect payment and order history), ADR 0022 (settlement uses the shop's bank account)

## Context

A dine-in table orders more than once: a round of drinks, then dishes, then a
refill. Ordering stores each round as its own Order, and the till listed them as
separate bills — one card per unpaid Order, each with its own Cash and VietQR
actions. A table of three rounds therefore had to be collected three times, and
the Customer was shown three bills for one meal.

The data model cannot merge them at the server. `callablePaymentConfirm` prices
one Order (`assertPaymentAmount(input.amountVnd, order.totalVnd)`), keys the
Payment by that Order (`paymentIdFor(orderId)`), awards Loyalty points per Order,
and marks one Order paid in its transaction (ADR 0004 keeps the original Payment
immutable). A merged Payment record would need a new priced entity, a new
contract, an invoice id on every Order, and a rewrite of the Loyalty and
reporting paths that read `payments`.

## Decision

The bill is **derived in the browser** from the unpaid snapshot, and settlement
stays **one Payment per Order**:

- `src/components/cashierBill.ts` groups the unpaid Orders into one `TableBill`
  per open table (`groupUnpaidBills`): dishes fold into one line by menu id,
  unit price, and modifier set; `totalVnd` is the sum of the Orders' own totals,
  so a per-Order Promotion stays applied, and the difference between the line
  total and that sum prints as a discount.
- A takeaway Order is its own bill, because it shares no table with anyone.
- The bill prints the returning customer's name when exactly one Loyalty member
  appears among its Orders, so a later round ordered without the member keeps
  the name while two Customers at one table are never given one name.
- One press collects the bill: `settleTableBill` calls the existing
  `callablePaymentConfirm` for each Order, oldest first, with the Order's own
  idempotency key. A failure stops the run; the Orders already settled stay
  settled and the remaining bill stays payable.
- Per-Order actions (PayOS link, cancel with a reason) stay per Order, behind one
  detail control, because each belongs to exactly one Order.
- The settled history keeps one row per Order.

No Firestore collection, contract, index, or Rules change is added.

## Consequences

- A table pays once from the Cashier's view without changing what the server
  records, so reporting, Loyalty accrual, and audit keep their per-Order
  behaviour.
- A partial failure is visible: the till says how many Orders settled and which
  one failed, and the remaining bill is retried with the same idempotency keys,
  so no Order can be charged twice.
- The bill exists only on screen. One receipt per table visit needs a server-side
  invoice id, which this ADR deliberately leaves out; the code records that as a
  `shortcut:` in `cashierBill.ts`.
- The VietQR instruction stays per Order (its `addInfo` carries the Order id), so
  a table that transfers the merged total is still confirmed per Order by the
  Cashier. A single QR for the merged total is a separate decision.
