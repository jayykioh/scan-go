# ADR 0026 — Owner-planned Shifts and server-time attendance

- Status: Decided
- Date: 2026-10-17
- Serves: REQ-HRM-001, REQ-HRM-002, REQ-HRM-003, REQ-HRM-004, REQ-HRM-005,
  NFR-SEC-001, NFR-PRIV-001
- Depends on: ADR 0012 (Owner-managed Staff accounts), ADR 0015 (direct
  Firestore reads), ADR 0021 (the Owner operates without a Staff PIN)

## Context

The workforce module has existed since the M3 wave: `shifts` and `attendance`
collections, five callables, emulator and Rules evidence, and `REQ-HRM-001/002/003`
marked Done in the SRS. Nothing in `src/` referenced any of it
(`docs/feedback/feature-audit-2026-10/reachability.md`): the Owner could not
schedule a Shift and a Staff member could not clock in. The Founder asked for the
missing surface with three constraints: the Owner divides the work into Shifts and
assigns them, **a Staff member never chooses their own Shift**, and working time is
counted from the moment the Staff member accepts the Shift.

Reading the module against that request exposed three defects that a UI alone
would have shipped as product behaviour:

1. `attendanceIdFor` keys a record by Staff and **UTC day**, so one Staff member
   could hold at most one Shift per day — a morning and an evening Shift silently
   collapsed into one record.
2. `clockInAt` and `clockOutAt` came from the client. In a timekeeping ledger that
   is forgeable minutes, and because the record id was derived from the supplied
   instant, a caller could even mint several records for one day by varying it.
3. `shiftId` on a clock in was never checked against the Shift, so any Staff
   member could start the clock on a colleague's Shift, or on a Shift that had
   already been cancelled.

## Decision

1. **One interval, several Staff members, one transaction.** `scheduleShiftInputSchema`
   takes `staffUids: string[]` (1..50, no duplicates) instead of a single
   `staffUid`, and `callableWorkforceScheduleShift` checks every chosen Staff
   member's existing Shifts inside one transaction. The whole batch is rejected on
   the first overlap, so a save never half-lands. A duplicate Staff member in one
   request is refused by the schema: two Shifts for one person in the same batch
   would break the per-Staff invariant the batch is checked against.

2. **Planning is the Owner's command, and only the server writes.** `shifts` Rules
   change from "any active member" to Owner-or-own-shift, so a Staff member's
   listener must carry `staffUid == request.auth.uid` and an unconstrained
   listener is *denied*. Writes stay `if false`. `callableWorkforceCancelShift`
   (new) deletes a planned Shift and preserves one that already carries
   attendance, so a worked record never loses the Shift it was counted against.

3. **The Shift is the attendance identity.** A clock in against a Shift writes
   `attendance_{staffUid}_{shiftId}`, which makes one record per accepted Shift
   instead of one per day. A repeated "Nhận ca" is therefore a replay of the same
   record, and two Shifts in one local day are two records. The old day-keyed id
   survives only for the Shift-less path.

4. **The server stamps the time.** `clockInAt`/`clockOutAt` are removed from the
   command inputs; the callable uses its own instant. A wrong time is fixed the
   way the SRS always intended — a correction request the Owner approves — which
   keeps an audit trail and one accountable approver. Worked minutes are integer
   arithmetic over those stamps, and no payroll value exists anywhere in the
   module (REQ-HRM-003).

5. **A Shift must belong to the caller before the clock starts.** When `shiftId`
   is present the callable reads the Shift in the same transaction and requires
   `shift.staffUid === caller`, so an assignment cannot be borrowed. A missing or
   cancelled Shift is `not-found`.

6. **At most one open record per Staff member.** A clock in is refused while an
   earlier record has no clock out, so the two Shifts cannot accrue overlapping
   minutes. The check reads the newest record through the existing
   `(staffUid ASC, clockInAt DESC)` index: while a record is open every later
   clock in is refused, so an open record can only be the newest one. No new
   composite index is needed.

7. **The panel is a parameterised read, not a store slice.** The shared tenant
   store loads each slice once per identity/tenant/authorization context; a week
   window is a parameter that changes as the Owner navigates. The HR panel and the
   Staff clock bar therefore subscribe to `shifts` and `attendance` directly
   through `workforce.adapter.ts`, the way `OverviewPage` reads its reporting
   window, and join attendance to Shifts by `shiftId` in memory.

## Consequences

- Planning is one round trip and all-or-nothing. The dialog reports the server's
  overlap message and stays open, so the Owner drops the clashing person without
  retyping the interval.
- Attendance documents written before this ADR (if any) are keyed by day and carry
  no `clockInAt`-by-Shift tie. They still list, and they simply do not join to a
  Shift row in the new panel.
- The window query pads the day range by one day on each side and joins in
  memory, so a clock in near a local midnight is never missed without doing
  timezone arithmetic in a Firestore query.
- The Owner's device local day produces the Shift's `date` key. A shop whose
  `tenants/{tenantId}.timezone` differs from the Owner's device can therefore file
  a Shift under the wrong day column. Deriving `date` server-side from the tenant
  timezone is the upgrade path; it is deliberately not taken here because the
  panel, the Staff bar, and the Owner's clock all read that same local day today.
- `shortcut:` comments record two limits: a clock in is not gated to the Shift
  window (no early/late rule), and the correction request/approval commands still
  have no screen — the data is reachable, the Owner just cannot act on it yet.
- Authorisation stays Owner-only. There is no manager role in this codebase
  (`membershipType: owner | staff`), so "quản lí" means the Owner console until a
  role amendment exists. `assertSelfOrOwner` still lets the Owner clock a Staff
  member in or out, but no screen exposes it; the Staff member's own "Nhận ca" is
  the intended path.
- The `(staffUid ASC, date ASC)` Shift index and both attendance indexes already
  existed, so this change adds no index to deploy.
