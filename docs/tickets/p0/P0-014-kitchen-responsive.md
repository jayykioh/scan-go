# P0-014 — Kitchen screen responsive layout

## Requirement links

REQ-KDS-002, REQ-KDS-001, NFR-UX-001, REQ-CAT-003.

## Owning module

Fulfilment owns the Kitchen view. The view composes the Catalog availability board and never writes the Catalog projection directly.

## Allowed file paths

- `src/components/KitchenView.tsx`
- `src/components/KitchenView.test.ts`
- `src/data/adapters/fulfilment.adapter.ts`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change Order status rules, Catalog pricing, or direct client writes.

## Dependencies

P0-008, P0-015.

## Atomic acceptance checklist

- Given a phone viewport, when Kitchen opens, then the queue and the availability board stack in one column (REQ-KDS-002).
- Given a tablet viewport, when Kitchen opens, then the queue and the availability board show side by side.
- Given the availability board, when it renders, then items group by menu category.
- Given a category header, when Kitchen taps it, then the whole category toggles through the Category availability command (REQ-CAT-003).
- Given a single item, when Kitchen taps it, then only that item toggles.

## Test plan

- Component: phone and tablet class selection, category grouping, and the category toggle call.
- Manual: open `/simulator/kitchen` at a phone and a tablet width.

## Required evidence

- Passing Kitchen component test, typecheck, and lint.

## Out of scope

Cashier, Staff, and Solo layouts; a new visual design.
