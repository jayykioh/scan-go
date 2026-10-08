# P0-013 — Takeaway Orders

## Requirement links

REQ-ORD-005, REQ-ORD-001, REQ-ORD-003, NFR-DATA-001.

## Owning module

Ordering owns the Order type. Fulfilment, Reporting, and the public tracking projection consume it.

## Allowed file paths

- `shared/contracts/order.contract.ts`
- `shared/fixtures/order.fixture.ts`
- `functions/src/modules/ordering/**`
- `functions/src/modules/fulfilment/**`
- `functions/src/modules/reporting/**`
- `functions/test/ordering/**`
- `functions/test/fulfilment/**`
- `functions/test/reporting/**`
- `src/data/adapters/ordering.adapter.ts`
- `src/data/adapters/view-mappers.ts`
- `src/components/StaffView.tsx`
- `src/components/KitchenView.tsx`
- `src/types.ts`
- `docs/data-model.md`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change the Order lifecycle statuses or direct client writes.

## Dependencies

P0-012.

## Atomic acceptance checklist

- Given a takeaway Order, when it is created, then `orderType` is `takeaway`, and the Order carries the reserved takeaway label instead of a real table.
- Given an existing Order without `orderType`, when it is read, then it is treated as `dineIn`.
- Given a takeaway Order, when Kitchen and public tracking read it, then they show the reserved takeaway label.
- Given a takeaway Order, when reporting groups by table, then it uses the reserved takeaway bucket.
- Given a dine-in Order, when it is created, then `orderType` is `dineIn` and its real table is unchanged.

## Test plan

- Unit: order snapshot and tracking with `orderType`, legacy default.
- Functions Emulator: staff takeaway create, Kitchen list, tracking, reporting bucket.
- Rules: unchanged direct-write denial.

## Required evidence

- Passing unit and Functions Emulator results.

## Out of scope

Delivery, pickup time promises, and packaging fees.
