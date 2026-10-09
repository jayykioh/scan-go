# P0-016 — Stock deduction note

## Requirement links

REQ-INV-009, REQ-INV-003, REQ-INV-008, NFR-DATA-001, NFR-MOD-001.

## Owning module

Inventory owns stock movements and the change report. Owner and Kitchen record the deduction.

## Allowed file paths

- `shared/contracts/inventory.contract.ts`
- `shared/fixtures/inventory.fixture.ts`
- `functions/src/modules/inventory/**`
- `functions/test/inventory/**`
- `src/data/adapters/inventory.adapter.ts`
- `src/components/InventoryPanel.tsx`
- `docs/SRS.md`
- `docs/traceability.md`

Do not change Order deduction, Payment, or direct client writes.

## Dependencies

P0-008, P0-011.

## Atomic acceptance checklist

- Given a `waste` or `manual_adjustment` deduction, when the caller omits the note, then the server rejects it (REQ-INV-009).
- Given a note, when the deduction commits, then the stock movement and the audit event record the reason and the note.
- Given an `order_deduction` or `order_restore` movement, when it commits, then no note is required.
- Given the change report, when it lists the movement, then the note appears.
- Given a legacy movement without a note, when it is read, then it maps to a null note.

## Test plan

- Unit: input refinement for the required note and the movement mapper.
- Functions Emulator: reject a missing note, accept a note, and record it in the change report.
- Component: the Kho screen requires the note for waste and manual adjustment.
- Add test paths to the Functions Emulator Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and component results.

## Out of scope

Photo attachments, expiry dates, and automatic spoilage detection.
