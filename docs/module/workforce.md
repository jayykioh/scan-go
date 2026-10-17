# Workforce Module

- Serves: REQ-HRM-001, REQ-HRM-002, REQ-HRM-003, REQ-HRM-004, REQ-HRM-005
- Owns: Shifts and attendance records
- Does not own: Membership, permissions, orders, or payroll

## Queries
- List Shifts for a tenant-local day range: the Owner reads the whole schedule, a
  Staff member reads only their own Shifts (Rules require `staffUid == uid`).
- List attendance records for a UTC window, joined to Shifts by `shiftId`.
- Attendance summary for one Staff member (minutes and counts only).

## Commands
- Plan one Shift interval for one or more Staff members in one transaction;
  refuse the whole save if any of them overlaps (Owner only).
- Cancel a planned Shift that has no attendance (Owner only).
- Clock in against the Shift the Staff member was assigned; the server stamps the
  time and the record is keyed to that Shift.
- Clock out; the server stamps the time and records who acted.
- Request a correction; an authorized user approves it.

## Rules
- Reject two overlapping Shifts for the same Staff member, including inside one
  batch, and reject the same Staff member named twice in one request.
- A Shift belongs to the Staff member it was planned for; nobody else can start
  its clock, and a cancelled Shift cannot be clocked in.
- At most one open attendance record per Staff member, so minutes never overlap.
- Clock in and clock out times are server stamps; a copied client instant is not
  an input.
- A Staff member can never create, edit, choose, or cancel a Shift.
- A correction stays `pending` until an authorized user approves it, and history remains.
- Never derive or export payroll, salary, or wage values.
- Staff can view and request correction only for their own records.
