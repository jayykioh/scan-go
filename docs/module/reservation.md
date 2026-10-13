# Reservation Module — staff bookings approved, customer flow deferred

- Serves: REQ-TBL-005, REQ-TBL-006, REQ-TBL-007; deferred REQ-RSV-001..003
- Status: Staff-entered one-table booking scope approved by the 2026-10-13 SRS amendment and ADR 0009; implementation pending.
- Owns: Tenant-scoped reservation records and reservation lifecycle commands. No code exists yet.

## Approved slice
- Authorized shop Staff book one specific table for a tenant-local interval and party size.
- Booking states: `booked`, `arrived`, `cancelled`, `completed`, `no_show`; no implicit no-show/grace period.
- Same-table active `booked` intervals cannot overlap; business writes are callable-only.
- Reservation state is separate from Order, Payment, and preparation. No booking creates an Order or starts Kitchen work.
- Optional contact fields are private to Owner/authorized Staff and excluded from floor-status/Waiter projections.
- Future Customer self-service, pre-ordering, deposits, capacity approval, and refund policy remain deferred.

See [ADR 0009](../adr/0009-defer-reservations-and-separate-payment-state.md), [SRS §4.11](../SRS.md), and [data model](../data-model.md).
