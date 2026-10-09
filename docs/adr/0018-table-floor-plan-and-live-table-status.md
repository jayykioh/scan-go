# ADR 0018 — A real floor plan, and table state derived from Orders

- Status: Decided
- Date: 2026-10-08
- Serves: REQ-TBL-001, REQ-TBL-002, REQ-TBL-003, REQ-ORD-003, NFR-SEC-001, NFR-RT-001

## Context

`/dashboard/tables` was a flat grid of identical cards. Nothing on it said where
a table physically is, how many seats it has, or whether anyone is sitting at
it, so it could not be used the way a restaurant uses a floor plan: to see the
room at a glance. Three separate problems had to be solved.

**The page did not load.** Opening it by URL or pressing F5 painted
"Chưa có bàn nào được thiết lập" while Firestore held the tables, because
`TablesPage` opened its own listener in `useEffect(…, [])` and
`subscribeTenantTables` returns an empty list while Firebase Auth is still
restoring the session. The same read through the shared tenant store worked,
because that store already waits for `onAuthStateChanged` and the resolved
`activeTenantId`. This was tracked as IMP-01 and is now fixed for this screen;
the other pages still open their own listeners.

**There was nowhere to store a layout.** A table document held a name, a token,
and an NFC flag. Areas, seat counts, and positions did not exist, so no amount
of UI work could produce a floor plan without a schema change.

**Table state lived nowhere.** Orders are the source of truth for whether a
table is busy, but `tenants/{tenantId}/orders` is server-write and
client-read-denied (`firestore.rules`), so the browser cannot derive it. The
alternatives were to widen the Order rules, to maintain a server-written
projection, or to compute the answer on demand.

The screen also carried a fake action: "In mã QR" showed a toast and printed
nothing.

## Decision

1. **The layout is three nullable fields on the table document** — `area`,
   `seats`, and `position` — written only through a new Owner callable
   `callableTableConfigure` (REQ-TBL-002). Table contract v2. `create` accepts
   the same three fields so a new table lands in its cell in one command
   instead of a create followed by a configure that could half-fail.

2. **A position is a grid cell, never a pixel.** The floor is 12 columns by 10
   rows (`TABLE_FLOOR_COLUMNS`/`TABLE_FLOOR_ROWS`), validated in the contract,
   so the same saved arrangement means the same thing on the counter tablet and
   on the Owner's laptop. The canvas scales cells to the space it has and grows
   from a minimum extent to fit the tables actually placed.

3. **Areas are labels, not containers.** A table carries one free-text area
   name; the plan colours and filters by it and the list view groups by it. Areas
   are deliberately not y-bands: constraining drag to a band makes moving a
   table between areas a two-step, easily-broken operation, and a small shop
   usually rearranges furniture without renaming rooms.

4. **Table state is computed on demand from live Orders**, by a new query
   `callableOrderListTableStatus` in the Ordering module (REQ-TBL-003). It folds
   the tenant's open Orders into one state per table. It is a snapshot the
   screen polls every ten seconds, not a projection the server has to keep in
   sync on every Order transition: a projection that misses one write path shows
   a wrong room, and there are five transition paths today. The cost is a
   bounded read every ten seconds while the plan is on screen, and polling stops
   while the tab is hidden.

5. **One state per table, with documented precedence:** `awaitingPayment`
   (a served Order with no settled payment) beats `foodReady` (a `ready` Order)
   beats `occupied` (any open Order) beats `free`. The rule is a pure function
   (`deriveTableServiceState`) so the server, the tests, and any future screen
   agree.

6. **The projection carries no money, no Customer identity, and no Order line**
   — only the table id, the state, three counts, and the oldest open timestamp.
   Any active member may read it, so a Waiter board can show the same room
   without widening what a reduced Staff role can see (NFR-SEC-001). Money stays
   behind the Cashier and Owner queries that already exist.

7. **Colour is never the only signal.** Every tile prints its state as text, the
   state is part of the tile's accessible name, and the summary strip repeats
   the full labels. Tiles use short forms ("Chờ thu", "Sẵn sàng") because a cell
   is about 90px wide; the full labels stay everywhere else.

8. **Dragging is not the only way to move a table.** The tile is a button;
   arrow keys move it one cell, clamped to the grid, and the detail panel can
   save a cell that the plan is only showing. A drag-only floor plan is
   unusable with a keyboard.

9. **The fake "In mã QR" action is removed**, not reimplemented. Real QR
   rendering and an A4 print sheet remain open under IMP-15; a button that
   claims to print and does not is worse than no button.

## Consequences

- The floor plan is presentation only. It does not change the public link, the
  token, the Order path, or any price.
- Every table written before this change reads back with an empty layout
  (`readStoredTableLayout` defaults each field to `null`), and the plan shows
  such tables in the first free cells with a dashed border and a "Lưu vị trí"
  action, rather than writing to Firestore without being asked.
- Two tables saved in the same cell cannot both be drawn there. The first keeps
  the cell, the other is re-placed and reported as unsaved; a unit test covers
  it.
- The plan needs a live callable to be useful. With Functions unreachable it
  still renders the floor and says the state could not be read.
- `callableTableConfigure` and `callableOrderListTableStatus` must be listed in
  `functions/src/index.ts` or they do not exist in a deployment. Both were
  initially missing there, which is now guarded by
  `functions/src/index.exports.test.ts`.
- Table state can lag a real transition by up to the poll interval. That is
  acceptable for a floor plan; the Kitchen board and the till keep their own
  realtime paths and are unaffected.
