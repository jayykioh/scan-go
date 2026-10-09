# ADR 0014 — Use weighted-average ingredient Cost with per-lot purchase price

- Status: Decided
- Date: 2026-10-02
- Serves: REQ-INV-010, REQ-INV-011, REQ-RPT-001

## Context

An ingredient can be bought in several lots at different prices. The current
Inventory model stores one `unitCostVnd` per ingredient, and `stockMovements`
records only a quantity change, a reason, and a time. It does not record the
price of the lot that arrived, and `unitCostVnd` is overwritten on an ingredient
edit. As a result the system cannot show how the purchase price moved over time,
and AI cannot warn the Owner about a price increase.

## Decision

1. Record the purchase price on each `stock_in` movement as an integer VND price
   per base unit, plus the signed quantity for that lot.
2. Recompute the ingredient `unitCostVnd` as the weighted average of the
   quantity on hand and the new lot:
   `(onHandQuantity * currentCost + lotQuantity * lotCost) / (onHandQuantity + lotQuantity)`,
   rounded to an integer VND per base unit.
3. Keep integer VND and integer base units everywhere. When on-hand quantity is
   zero or negative, the new lot price becomes the Cost.
4. Add a deterministic warning when a stock-in lot price is more than ten
   percent above the previous Cost per base unit. The warning states the old
   price, the new price, the delta, and the percentage. The threshold is a fixed
   constant in code, not an AI guess.
5. An ingredient edit that changes the purchase price does not change stock or
   Cost. Only a recorded stock-in lot changes the weighted-average Cost.

## Consequences

- `stockMovementSchema` gains an optional lot-price field so existing movements
  and fixtures stay valid.
- The AI module can compute a low-cost, deterministic price-increase warning
  from recorded movement prices. No AI provider call is needed for the number.
- Reporting can reconcile Cost from recorded lot prices and weighted averages.
- FIFO and per-lot cost layers stay out of scope until a separate approved
  amendment.
- SRS §4.3 adds REQ-INV-010 and REQ-INV-011.
