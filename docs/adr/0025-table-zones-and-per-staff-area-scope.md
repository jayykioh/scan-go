# ADR 0025 — Table zones and per-Staff area scope

- Status: Decided
- Date: 2026-10-16
- Serves: REQ-TBL-002, REQ-TBL-004, REQ-TBL-009, REQ-TBL-010, NFR-SEC-001
- Depends on: ADR 0015 (direct Firestore reads), ADR 0018 (floor plan), ADR 0019
  (Waiter takes orders at the table), ADR 0023 (per-table projection)

## Context

REQ-TBL-002 already stores an `area` label on every table, and the plan and the
list show it. REQ-TBL-004, approved with the 2026-10-13 amendment, requires the
Owner to assign zero or more active Waiters to each area — and the Founder asked
for three things beyond that label: a zone is created by *choosing* tables, the
plan draws each area as a bounded region with its table count, and one save
writes a whole zone (including several new tables) at once. The Founder also
asked that an assigned Waiter see **only** their own area.

Two facts shaped the design:

1. An area is a label, not a record. Nothing today tells the two apart: "Sân
   vườn" exists because a table carries that string. `docs/data-model.md` already
   described assignments as tenant-owned and keyed by the normalized area label,
   so the record did not need inventing — only building.
2. A read restriction that only the client applies is not a restriction. The
   operating board is fed by a direct `tables` listener (REQ-CACHE-001), and an
   Order queued for another area is one `tableId` away. Enforcing the scope
   therefore has to happen where the data is read, not where it is drawn.

## Decision

1. **A zone is an area label plus one assignment document.**
   `tenants/{tenantId}/tableAreas/{areaId}` stores `label`, `waiterUids`,
   `updatedAt`, and `updatedBy`. There is no geometry and no new grid: a zone is
   still whichever tables carry its label. A zone whose `waiterUids` becomes
   empty loses its document instead of leaving a ghost. Lookups are by
   `label` (an equality query) rather than by a document id derived from the
   label, so no normalization function has to exist twice — once in TypeScript
   and once in Security Rules.

2. **The assignment is projected onto the table and onto the member, and the
   projection is what a read is authorized against.**
   - `tables/{tableId}.areaWaiterUids: string[]` — server-written, always
     present, `[]` for an unassigned area.
   - `members/{uid}.assignedAreas: string[]` — server-written, `[]` for a
     member with no scope.

   Rules read the member projection and the table projection, so authorizing one
   document needs no lookup, no join, and no callable. `callableTableAreaAssign`
   writes the area document, re-projects every table of that area, and refreshes
   `assignedAreas` for the members whose coverage changed, all in one
   transaction. `callableTableCreate` and `callableTableConfigure` copy the
   projection of the area a table lands in, so a table added to an assigned area
   inherits its coverage immediately.

3. **The scope is a query, not a filter.** An assigned Waiter's `tables`
   listener is `where('areaWaiterUids', 'array-contains', uid)`; the composite
   index behind it is `(areaWaiterUids CONTAINS, archivedAt ASC, name ASC)`. A
   listener without that constraint is *denied* for an assigned member, so the
   other areas' tables never reach the device. A member with no assignment keeps
   the tenant-wide listener, which is what every shop has today: turning this on
   never blinds a Waiter who has not been given an area, and every row written
   before `areaWaiterUids` existed stays readable.

4. **The scope is enforced again on the server for the two writes and reads the
   board cannot cover.** `callableOrderStaffCreate` rejects a dine-in Order for a
   table outside the caller's areas, and `callableFulfilmentListReady` returns
   only the ready dishes of those areas. Client-side filtering is a display
   convenience everywhere, never the boundary.

5. **The scope follows the membership document, so it follows the person.** The
   shared tenant store folds `assignedAreas` into its membership access key:
   changing an assignment resets the cached slices and re-subscribes the table
   listener with the new scope. Every screen that Waiter can open (Bếp, Kho, Lên
   món, Phục vụ, Thu ngân) therefore shows the same floor, which is the simplest
   rule to reason about and to test.

6. **One zone save is a sequence of the existing per-table commands**, not a new
   batch callable: create the authored tables, move tables in or out, release a
   renamed area's old assignment, then assign the Waiters last so that final
   command re-projects the whole zone. Each command is validated on its own, and
   the screen reports a partial save honestly instead of pretending it was
   atomic.

## Consequences

- Zones are labels: renaming one is a re-label of its tables plus a new
  assignment, and two owners who both type "Sân vườn" mean the same area. Labels
  are compared exactly after trimming, so "Tầng 1" and "tầng 1" are two areas —
  the same rule the list grouping has always used.
- A zone's box on the plan is the bounding box of its tables' cells. When a shop
  interleaves two areas the boxes overlap; the screen says so and asks the Owner
  to group the tables, instead of silently rearranging a floor plan they
  arranged themselves.
- The per-table save in one zone is not atomic (`shortcut:` comment in
  `zoneEditor.ts`). A failed command leaves the earlier ones applied; the dialog
  stays open, the lists refresh from the listener, and the error names what
  happened. Upgrade to a batch callable if a zone ever means creating dozens of
  tables in one action.
- Two documents now carry a projection of the assignment. They are rebuilt by
  the same command that changes it, and the assignment document remains the
  source of truth; a repair command can recompute both from it.
- Not every table-scoped callable is scoped by this ADR. The table-invoice list,
  the unpaid list, the table-status projection, and reservation commands still
  accept any table of the tenant. They expose no Customer, money, or Cost data
  beyond what the caller's role already allows, so this is a deliberate,
  recorded gap rather than an oversight; close it when a screen lets an assigned
  Waiter reach those commands for a foreign table.
- A member's `assignedAreas` is written only by the assignment command, so a
  deactivated or role-changed member keeps a stale list. Rules already require an
  active membership, so the stale list cannot be used to read anything.
