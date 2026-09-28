# Ordering / Fulfilment contract consumer report

Date: 2026-09-28  
Scope: REQ-ORD-001–004, REQ-KDS-001, REQ-WAI-001, REQ-NOT-001, NFR-SEC-002, NFR-DATA-001, NFR-MOD-001

## Published handoff for Developer 4

- `OrderSnapshot`, `StatusEvent`, and `OrderStatusMutationRequest`: `shared/contracts/order.contract.ts`
- `NotificationEvent`: `shared/contracts/notification.contract.ts`
- Pay-First, Pay-Later, public tracking, and status-transition fixtures: `shared/fixtures/order.fixture.ts`
- Inventory plan consumer double: `shared/fixtures/inventory.fixture.ts`
- Kitchen and Waiter queue doubles: `shared/fixtures/fulfilment.fixture.ts`

`OrderStatusMutationRequest.inventoryPlan` consumes the Dev 4 `InventoryMutationPlan` shape. Fulfilment returns the plan unchanged to the transaction composer. It has no Inventory repository or write port, so Ordering/Fulfilment cannot write an Inventory document.

## Consumer verification

Run `npm test`, `npm run typecheck`, and `npm run build` from the repository root.

The contract suite verifies:

- Ordering compiles against mock Catalog and Table query ports only.
- Cart totals are recalculated from current public Catalog prices and remain safe integer VND.
- Offline submission returns a connection problem before the command port is invoked.
- Pay-First remains outside the Kitchen queue until payment confirmation; Pay-Later is visible immediately.
- Kitchen and Waiter transitions follow `pending -> cooking -> ready -> served`.
- Starting cooking carries, but does not execute, the Inventory mutation plan.
- Ready emits one notification identity suitable for deduplication.
- Public Firestore projections are readable and client Order writes are denied.

## Browser evidence procedure

Open `/menu/1`, add an item, then enable Offline in browser DevTools and press **Gửi đơn**. The cart remains open, a connection-error panel appears, and no local Order is appended. The automated command-spy test proves the command call count remains zero.
