# Inventory Module

- Serves: REQ-INV-001, REQ-INV-002, REQ-RPT-001
- Owns: Ingredients, recipes, Cost calculation, stock movements
- Does not own: Menu price, Order status, or Payment state

## Commands
- Create, update, and archive ingredients and recipes.
- Adjust stock with an auditable reason.
- Deduct an Order recipe when cooking starts.
- Restore an eligible deduction when an unpaid Order is cancelled.

## Units
- Store mass in grams.
- Store volume in millilitres.
- Store count as units.
- Convert kilogram and litre inputs before persistence.

## Rules
- Use integer base-unit quantities and integer VND Cost.
- Write one stock movement for each effect.
- Use Order and effect idempotency keys.
- Store unit and line Cost snapshots on Order items when cooking starts.

## Contracts
- Emits `InventoryDeducted`, `InventoryRestored`, and `IngredientStockChanged`.
