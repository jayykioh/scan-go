# Reservation Module — DEFERRED

- Serves: REQ-RSV-001, REQ-RSV-002, REQ-RSV-003
- Status: DEFERRED by ADR 0009. Outside M1–M3.
- Owns: Nothing yet. No collection, command, or UI may exist until an approved amendment.

## Deferred direction
- Customer requests an arrival time, party size, and pre-ordered items.
- Shop confirms capacity and ingredient availability before accepting.
- Reservation state, payment state, and preparation state stay separate.
- "Cọc full" means the Customer paid the full value of the ordered items.
- Payment alone never starts preparation when the arrival time is still far.

## Gate before implementation
- SRS amendment with stable REQ IDs and acceptance criteria.
- Approved capacity, late-arrival, cancellation, no-show, and refund policy.
- ADR for the chosen state model and Kitchen release rule.
