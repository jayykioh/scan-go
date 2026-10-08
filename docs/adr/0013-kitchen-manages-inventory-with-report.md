# ADR 0013 — Kitchen manages inventory with a change report

- Status: Decided
- Date: 2026-10-02
- Serves: REQ-INV-008, REQ-ACL-001, REQ-INV-003

## Context

The Inventory callables (ingredients, recipes, stock) were Owner-only. A Kitchen
Staff member could change menu availability but could not touch stock, even
though the Kitchen owns ingredient reality during a shift. The Kitchen also had
no way to review what changed, so an add, edit, or archive left no visible trail
for the operator.

## Decision

Widen the Inventory management gate to the Owner and an active Kitchen member.
`assertInventoryManagerMember` accepts an Owner membership or a membership whose
`roles` include `kitchen`. The same callables keep their validation, idempotency,
and audit behaviour.

Record the acting role in every inventory audit event. `describeInventoryActor`
derives `actorType` and `role` from the membership, so the existing audit entries
now distinguish Owner from Kitchen actions.

Add `callableInventoryChangeReport`. It reads the append-only inventory audit
entries (`IngredientChanged`, `RecipeChanged`, `StockAdjusted`,
`StockCountRecorded`), enriches each with its target name, and returns them
newest-first. The Kho screen shows this report next to the ingredient list.

## Consequences

- The Owner retains full control; the Kitchen gains ingredient, recipe, and
  stock changes for its Tenant only.
- Every inventory write stays audited with actor, role, action, target, and time.
- `REQ-INV-008` is added to the SRS, and the Inventory management gate in
  `docs/module/inventory.md` is amended.
- A future refinement can restrict specific stock reasons (for example waste) to
  the Owner if operations require it.
- An emulator test for the Kitchen inventory path and the change report is still
  pending.
