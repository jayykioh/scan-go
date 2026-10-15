# ADR 0019 — A Waiter takes the order at the table, and collects there when it is also a Cashier

- Status: Decided
- Date: 2026-10-14
- Serves: REQ-WAI-002, REQ-WAI-001, REQ-ORD-005, REQ-UX-003, REQ-CAS-003, REQ-ACL-001, NFR-SEC-001

## Context

The Waiter page could only watch the `ready` queue and mark a dish `served`
(REQ-WAI-001). Taking an order meant leaving the page for the Cashier-only
"Lên món" tab, where the table was chosen from a dropdown that listed the demo
fallback rather than the Tenant's real floor. `callableOrderStaffCreate` denied
any membership without the `cashier` role, and the payment sheet was reachable
only from the till.

Three things made the table the natural unit of work instead:

- The floor plan already draws the Tenant's real tables on the Waiter page
  (REQ-UX-003, ADR 0018), so the Waiter already picks a table to act on.
- The shared tenant store already holds the tables and the public menu once per
  identity/tenant context (ADR 0015, REQ-CACHE-001), so a per-table dialog can
  be opened without a new read for either.
- A real shop has one tablet at the counter: the person who carries the dish is
  often the person who takes the next order, and sometimes the person who
  collects the money.

## Decision

1. **The `waiter` role may create an Order.** `callableOrderStaffCreate` accepts
   an active member carrying `cashier` *or* `waiter`. The Waiter branch is
   bounded to a dine-in Order: the role takes the order at a table, so a
   takeaway sale still needs a Cashier. This is the only widened permission:
   cancellation stays cashier-only (REQ-CAS-002) and payment stays cashier-only
   (REQ-CAS-001, REQ-PAY-003), so a Waiter that is not also a Cashier can take a
   table's order but cannot ring a counter sale, settle, or void.

2. **The table dialog is the Waiter's workspace**, opened by tapping a table on
   the floor plan: the dishes to carry, the order to add, and — only when the
   Waiter also carries `cashier` — the till's invoice sheet. The floor plan's
   per-table list below stays unfiltered so it still reads as the whole carry
   list, which is why REQ-UX-003 is amended for the Waiter page.

3. **The ping is a second signal, never the only one.** A table with `ready`
   dishes draws a `!` on its tile and says "cần phục vụ" in the tile's
   accessible name and title. Colour and animation alone are not a signal
   (the rule ADR 0018 already set).

4. **Payment reuses the Cashier's own sheet** through a `focusTableId` mode on
   `CashierView` rather than a second implementation. The Waiter's "Thu tiền"
   tab renders the same bills, history, settle, cancel, and PayOS controls the
   till renders, so the two cannot drift apart.

5. **Dish entry is the existing staff order entry**, not a new one: the same
   `StaffOrderEntry` with a locked table and a search box. The server still
   prices the Order, evaluates the Promotion, and audits the actor.

## Consequences

- A Waiter can create an Order for **any** active table of its Tenant, not only
  the area it serves. Area-to-Waiter assignment is REQ-TBL-004..007 and is still
  pending; until it lands, the server cannot express "this Waiter serves this
  area" and the UI does not pretend to.
- The Waiter page no longer scopes the list below the plan by the selected
  table; the selection opens the dialog instead. The Kitchen page is unchanged.
- `StaffOrderEntry` gained two optional props (`lockedTableId`, `searchable`)
  and its dish filter became a pure `filterAvailableItems`, so the search is
  unit-tested rather than only seen.
- The Functions Emulator authorization test changed shape: a Waiter creating a
  dine-in Order is now expected to succeed, a Waiter creating a takeaway Order
  is expected to fail, and Kitchen and a cross-Tenant Owner stay denied.
- The dialog opens no new read for dishes or tables. It does read the unpaid
  queue when the "Thu tiền" tab mounts `CashierView`, which is the same read the
  till already makes.
