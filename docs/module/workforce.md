# Workforce Module

- Serves: REQ-HRM-001, REQ-HRM-002, REQ-HRM-003
- Owns: Shifts and attendance records
- Does not own: Membership, permissions, orders, or payroll

## Queries
- List Shifts by Staff member and date range.
- List attendance records with correction state.

## Commands
- Schedule a Shift for one Staff member on one date.
- Clock in and clock out.
- Request a correction; an authorized user approves it.

## Rules
- Reject two overlapping Shifts for the same Staff member.
- A correction stays `pending` until an authorized user approves it, and history remains.
- Never derive or export payroll, salary, or wage values.
- Staff can view and request correction only for their own records.
