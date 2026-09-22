# Developer 4 — P0 Inventory, Payment, durable correction

**Owner:** Developer 4. **Effort:** 21 points. **Review partner:** Developer 3. **Founder:** final acceptance reviewer only.

## Ownership and contract-first start
- **Modules and paths:** Inventory and Payment; `ingredients`, `recipes`, `stockMovements`, `payments`, and Payment archive state. Own backup/retention deployment and Payment-durable-work slices.
- **UI status:** PARTIAL 2, MISSING 4. Extend OwnerView Inventory and CashierView. Build archive/backup status, cancellation, reversal, and refund controls.
- **Rules/tests owned:** `firestore.rules` Inventory/Payment private-read and no-client-write sections; Emulator tests for Cost/stock isolation, Cashier authority, immutable Payment, correction idempotency, archive recovery, and direct-write denial.
- Freeze `RecipeCost`, `InventoryMutationPlan`, `StockMovement`, `VietQrInstruction`, `PaymentResult`, `CancellationResult`, `CompensatingPayment`, and `ArchiveStatus`. Publish Inventory/Payment fixtures; mock Ordering mutation and authorization contracts.

## Assigned items
| ID and effort | UI and backend deliverables | IDs and acceptance | Tests, handoff, evidence |
|---|---|---|---|
| P0-008A (5) | **UI: PARTIAL — extend** OwnerView Inventory/recipe forms. **BE:** ingredient/recipe commands, base units, deterministic Cost, stock movements, deduction plan. | REQ-INV-001, CON-002/004, NFR-DATA-001. Given recipe and cooking fact, when plan builds, then one transaction-ready deduction exists. | Cost, quantity, retry Emulator tests. Output `InventoryMutationPlan` to Developer 3. Evidence: ledger fixture. |
| P0-009A/B (6) | **UI: PARTIAL — extend** CashierView payment flow. **BE:** dynamic VietQR, cash/VietQR confirmation, immutable Payment, Pay-First result contract. | REQ-CAS-001, REQ-ORD-002/003, NFR-SEC-001, NFR-DATA-001. Given verified payment, when Cashier confirms, then paid state occurs once and Payment is immutable. | idempotency, immutability, role, Pay-First E2E. Output `PaymentResult` to Developer 3. Evidence: cash/VietQR fixture. |
| P0-L02/L03 (4) | **UI: MISSING — build UI + BE** archive and backup status evidence. **BE:** retention/archive contribution, daily 30-day backup deployment configuration, isolated restore proof. | NFR-RET-001, NFR-REL-001, CON-003/007. Given expired eligible record, when job runs, then protected history remains recoverable; restore works isolated. | archive/recovery, deployment, restore drill tests. Evidence: drill record. |
| P0-L07 (3) | **UI: MISSING — build UI + BE** cancellation reason/confirmation. **BE:** unpaid cancellation restoration plan and audit-reason result. | REQ-INV-002, REQ-CAS-002. Given deducted unpaid Order, when cancelled, then each stock movement restores once. | transaction/idempotency/E2E. Output `CancellationResult` to Developer 3. Evidence: restoration fixture. |
| P0-L08/L09 (3) | **UI: MISSING — build UI + BE** reversal/refund controls. **BE:** linked compensating Payment records. | REQ-PAY-001, CON-003. Given paid Order correction, when authorized action runs, then original remains and linked record exists. | compensating-record/retry tests. Output `CompensatingPayment` to Developer 3. Evidence: immutable-ledger fixture. |

## Integration and merge
Start immediately with `OrderSnapshot` from Developer 3 plus mocked `ResolvedConfig` and `AuthorizationDecision` from Developer 1.

Final gates: compose the cooking transaction with the Developer 3 Order mutation; compose Payment confirmation with the Developer 3 paid mutation and the Pay-First gate; compose cancellation, reversal, and refund with their owner-module plans. Publish `InventoryMutationPlan`, `PaymentResult`, `CancellationResult`, and `CompensatingPayment` to Developer 3.

Do not write Order, Catalog, Table, or Tenant paths. Merge only owned Inventory and Payment modules plus their Rules sections after Developer 3 review. Every correction keeps the original record immutable. Founder accepts the listed evidence. No direct client business write is allowed.
