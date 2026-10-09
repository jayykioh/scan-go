# P0-017 — Responsive role frame

## Requirement links

REQ-UX-002, NFR-UX-001.

## Owning module

The simulator shell owns the device frame. Role views keep their own layout.

## Allowed file paths

- `src/components/PhoneSimulator.tsx`
- `src/pages/SimulatorRole.tsx`
- `src/pages/StaffLoginPage.tsx`
- `src/components/KitchenView.tsx`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change role business rules, callables, or direct client writes.

## Dependencies

P0-014.

## Atomic acceptance checklist

- Given a small viewport, when a role view opens, then it stays inside the phone or tablet frame (REQ-UX-002).
- Given a large viewport, when a role view opens, then the bezel, status bar, and home indicator are removed and the view fills the available space.
- Given two role views on a large viewport, when both are open, then each fills half the width.
- Given the Kitchen view in a narrow container, then it keeps one column; given a wide container, then it uses two columns.
- Given two role views on a small viewport, then only one role view shows and no panel is hidden on a large viewport.
- Given the `/staff` route on a large viewport, then the Staff view and its Kitchen tab fill the width instead of a `max-w-md` column.

## Test plan

- Typecheck, lint, and the existing unit and component tests.
- Manual: open `/simulator/kitchen` and `/simulator/cashier` at a phone width and a desktop width.
- Container query: the Kitchen split keys off the container width, not the viewport, so a half-width desktop panel keeps a comfortable two-column layout.

## Required evidence

- Passing typecheck, lint, and unit results.
- Desktop and phone screenshots of the Kitchen and Cashier views.

## Out of scope

The Customer public menu route and a separate full-screen staff route.
