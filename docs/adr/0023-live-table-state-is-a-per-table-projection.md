# ADR 0023 — Live table state is a per-table projection, not a bounded Order window

- Status: Decided
- Date: 2026-10-15
- Amends: the bounded-queue reading of `docs/RULES_FIREBASE.md` §6 and §7
- Serves: REQ-TBL-003, REQ-TBL-008, REQ-ORD-006, REQ-UX-003, NFR-RT-001

## Context

`callableOrderListTableStatus` (`functions/src/modules/ordering/index.ts`) reads
at most `ORDER_LIST_LIMIT = 50` Orders, newest first, and derives every table's
service state from whatever lands inside that window. It never says it was
bounded.

At 5–15 tables the window is wider than the floor, so it worked. At 50 tables a
busy service has more than 50 open Orders, and a table whose Order falls outside
the window renders `free`. The board then invites a waiter to seat a guest at an
occupied table, and the failure gets worse exactly when the shop is busiest. That
is the opposite of when the floor plan is needed.

The same constant bounds the Kitchen queue (`callableOrderListKitchen`)
newest-first, so it keeps the newest tickets and drops the oldest. Its own
`shortcut:` comment records this. For a kitchen that is the worst end to drop:
the oldest ticket is the dish that has been waiting longest.

The board is fed by `useTableServiceStatus`, which calls that command every
`TABLE_STATUS_POLL_MS = 10_000` per open screen. Each call costs one membership
read plus up to 50 Order reads. Three screens left open for a 12-hour shift is
roughly 13,000 calls and 660,000 document reads a day for one shop, and it scales
with tables times screens.

The projection it should have used already exists as a type.
`TableServiceFacts` in `shared/contracts/tableStatus.contract.ts` names exactly
what the board draws: `activeOrderCount`, `readyOrderCount`,
`unsettledOrderCount`, `oldestActiveOrderAt`. And `tenants/{tenantId}/tables/{tableId}`
is already readable by every active member and already listened to by the shared
tenant store, so the projection needs no new read path, no new Rules block, and
no new listener.

## Decision

1. Ordering and Payment maintain the four `TableServiceFacts` counters on
   `tenants/{tenantId}/tables/{tableId}`, inside the transactions that already
   write the Order or the Payment. The immutable Order and Payment records stay
   the source of truth; the counters are a rebuildable projection, the same shape
   as ADR 0005.
2. The floor plan reads the counters from the `tables` store slice it already
   holds. `useTableServiceStatus` and `callableOrderListTableStatus` are removed.
3. A bounded queue keeps the **oldest** entries, not the newest.
   `callableOrderListKitchen` and the Waiter ready queue query
   `(status ASC, createdAt ASC)` with a matching composite index, so a queue
   deeper than its bound holds the longest-waiting tickets. If a queue can still
   exceed its bound, the screen states that it is showing the oldest page instead
   of silently dropping entries.
4. The counters are server-written. Rules keep `write: if false` on `tables`, so
   no client can set a table's state.
5. Drift between the counters and the Order records is repaired by the reporting
   rebuild pattern: one Owner/ADMIN command recomputes the counters for a tenant
   from immutable records, idempotently.

## Consequences

- Table state is correct at any table count, and correct precisely when the shop
  is busiest.
- The board stops making a read of its own: no callable, no 10-second poll, no
  per-table Order query. The roughly 660,000 reads a day for three open screens
  go to zero.
- Kitchen and Waiter queues stop dropping the longest-waiting ticket.
- Every Order and Payment transition that changes one of the four counters writes
  one extra document in a transaction it already runs. The Ordering and Payment
  transaction tests extend to assert the counter, including the reversal and
  refund paths.
- `ORDER_LIST_LIMIT` stops being a correctness bound for table state. It remains
  a page bound for the lists that genuinely are lists.
- `shared/contracts/tableStatus.contract.ts` keeps its facts shape, so the client
  mapper and the board change minimally.
