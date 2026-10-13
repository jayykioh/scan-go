# ADR 0009 — Defer reservations and separate payment state from preparation state

- Status: Superseded in part by SRS amendment 2026-10-13 (staff-entered table bookings only)
- Date: 2026-09-30; amendment: 2026-10-13
- Serves: REQ-RSV-001, REQ-RSV-002, REQ-PAY-001, REQ-TBL-004, REQ-TBL-005, REQ-TBL-006, REQ-TBL-007

## Context

`PRODUCT_OBJECTIVES.md` §9 proposes table reservations and pre-ordered food. The current SRS Order lifecycle is `pending → cooking → ready → served → paid`. That single lifecycle mixes payment state with preparation state, so a paid reservation could enter the Kitchen before its arrival time.

The Founder decisions on 2026-09-30:
- "Cọc full" means the Customer paid the full value of the ordered items, not only a shop deposit.
- Reservations are deferred to a later, separately approved amendment.
- The first pilot segments are coffee shops and kitchen shops.

## Decision

### Original decision (2026-09-30)

1. Defer customer-requested reservations and pre-ordering. Do not change the v1 Order lifecycle until a reservation amendment is approved with stable REQ IDs.
2. Record the meaning of "cọc full": the full value of the ordered items is paid.
3. In any future reservation design, keep reservation, payment, and preparation as independent states. Paying does not start preparation when arrival time is still far.
4. Require an approved refund and late-arrival policy before code for customer deposits or customer-requested reservations exists.

### Narrow amendment (2026-10-13)

The Founder approved a smaller staff-entered table-booking slice under SRS REQ-TBL-004 through REQ-TBL-007. This partially supersedes the deferral above; it does not approve Customer self-service, pre-ordering, deposits/payments, table combinations, or automated seating. Bookings are one-table records entered by authorized shop Staff, separate from Orders. They carry a tenant-local interval, party size, and explicit lifecycle (`booked`, `arrived`, `cancelled`, `completed`, `no_show`); no automatic grace period/no-show inference is allowed. `booked` intervals may not overlap on one table. No booking creates an Order, Payment, or Inventory movement or starts Kitchen preparation. Contact name/phone are optional and private to Owner/authorized Staff, not part of general table-status or Waiter projections. A future `booked` record shows `Đã đặt`; `arrived` or an open Order shows occupied/current Order state, with `foodReady` and `awaitingPayment` retaining higher urgency. Terminal states release the table. The Owner may assign multiple active Waiter UIDs to an area; assignment does not change Staff authorization.

## Consequences

- SRS §4.11 approves only staff-entered bookings under REQ-TBL-005..007; the legacy `REQ-RSV-001..003` remain deferred for customer requests, capacity/ingredient confirmation, and pre-ordering.
- Ordering, Payment, and Inventory lifecycle contracts stay unchanged; reservation state is separate.
- Booking commands require server validation and atomic same-table overlap protection; all business writes remain callable-only.
- Future Customer reservation, deposit, pre-order, or late-arrival policy work still requires a separate approved amendment.
