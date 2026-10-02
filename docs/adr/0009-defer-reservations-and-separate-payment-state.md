# ADR 0009 — Defer reservations and separate payment state from preparation state

- Status: Decided
- Date: 2026-09-30
- Serves: REQ-RSV-001, REQ-RSV-002, REQ-PAY-001

## Context

`PRODUCT_OBJECTIVES.md` §9 proposes table reservations and pre-ordered food. The current SRS Order lifecycle is `pending → cooking → ready → served → paid`. That single lifecycle mixes payment state with preparation state, so a paid reservation could enter the Kitchen before its arrival time.

The Founder decisions on 2026-09-30:
- "Cọc full" means the Customer paid the full value of the ordered items, not only a shop deposit.
- Reservations are deferred to a later, separately approved amendment.
- The first pilot segments are coffee shops and kitchen shops.

## Decision

1. Defer reservations and pre-ordering. Do not change the v1 Order lifecycle until a reservation amendment is approved with stable REQ IDs.
2. Record the meaning of "cọc full" now: the full value of the ordered items is paid.
3. In any future reservation design, keep three independent states: reservation state, payment state, and preparation state. Paying does not start preparation when the arrival time is still far.
4. Require an approved refund and late-arrival policy before reservation code exists.

## Consequences

- SRS §4.11 lists reservation requirements as DEFERRED, outside M1–M3.
- The v1 Ordering and Payment modules stay unchanged.
- Kitchen release for a reservation needs both shop confirmation and fulfilled payment, plus an arrival-time rule, in the future amendment.
- SRS §1.2, §4.11, and §14 are amended by this decision.
