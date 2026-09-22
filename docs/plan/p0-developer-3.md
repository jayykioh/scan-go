# Developer 3 — P0 Ordering and Fulfilment

**Owner:** Developer 3. **Effort:** 20 points. **Review partner:** Developer 4. **Founder:** final acceptance reviewer only.

## Ownership and contract-first start
- **Modules and paths:** Ordering and Fulfilment; `orders`, `orders/statusEvents`, `idempotency`, `publicOrderTracking`, and local notification preference.
- **UI status:** PARTIAL 4, MISSING 1. Extend PublicMenuPage, CustomerView, KitchenView, and StaffView. Build notification/mute UI.
- **Rules/tests owned:** `firestore.rules` authorized Order, public tracking, and no client Order-write sections; Emulator tests for tracking isolation, bounded queues, role transitions, App Check/rate-limit rejection, and client-write denial.
- Freeze `TableLinkContext`, `PublicMenuItem`, `CartValidation`, `OrderSnapshot`, `StatusEvent`, `InventoryMutationPlan`, `PaymentResult`, and `NotificationEvent`. Publish Order fixtures and mocks for Config, authorization, Catalog, Table Access, Inventory, and Payment.

## Assigned items
| ID and effort | UI and backend deliverables | IDs and acceptance | Tests, handoff, evidence |
|---|---|---|---|
| P0-007A/B (8) | **UI: PARTIAL — extend** PublicMenuPage/CustomerView cart, tracking, and offline state. **BE:** cart validation, Table revalidation, public Order callable, App Check/rate/idempotency, Pay-Later `pending`, tracking projection. | REQ-ORD-001–004, NFR-SEC-002, NFR-DATA-001, NFR-UX-001. Given valid Table link, when Pay-Later submits, then immutable `pending` Order/tracking exists. Given offline, when submit, then no Order creates. | Emulator token/rate/idempotency, browser offline, E2E. Input Table/Menu mocks; output `OrderSnapshot` to Developer 4. Evidence: flow recording. |
| P0-008B (4) | **UI: PARTIAL — extend** KitchenView. **BE:** Kitchen queue and `pending → cooking → ready` Ordering mutation request. | REQ-KDS-001, REQ-INV-001, REQ-ORD-003, NFR-RT-001. Given authorized Kitchen, when cooking starts, then authorized views update within two seconds. | transition/role/retry/E2E. Input `InventoryMutationPlan`; output status mutation for atomic gate. Evidence: timing record. |
| P0-010A (4) | **UI: PARTIAL — extend** StaffView Waiter area; **UI: MISSING — build UI + BE** notification/mute. **BE:** ready queue, served command, bounded event input, dedupe. | REQ-WAI-001, REQ-NOT-001, REQ-ORD-003. Given ready Order, when Waiter serves, then status changes and Payment/menu access remains denied. | role, mute/dedupe, real-time tests. Output `NotificationEvent`. Evidence: muted/unmuted recording. |
| P0-L06 (4) | **UI: PARTIAL — extend** CustomerView connection state. **BE:** p95 menu/real-time/offline measurement harness. | NFR-PERF-001, NFR-RT-001, REQ-ORD-004. Given 100 loads, when measured, then p95 meets SRS; offline creates no Order. | p95 and browser proof. Evidence: reports. |

## Integration and merge
Start immediately with `PublicMenuItem` and `TableLinkContext` from Developer 2, `AuthorizationDecision` from Developer 1, and mocked `InventoryMutationPlan` and `PaymentResult` from Developer 4.

Final gates: compose one cooking transaction from the Order status mutation and the Developer 4 Inventory plan; compose one Payment transaction from the Order paid mutation and the Developer 4 Payment result; enforce the Pay-First gate so Ordering keeps the Order out of the Kitchen queue until Payment confirms. Publish `OrderSnapshot` and status mutation plans to Developer 4.

Do not write Catalog, Table, Inventory, or Payment paths. Merge only owned Ordering and Fulfilment modules plus their Rules sections after Developer 4 review. Founder accepts the listed evidence. No direct client business write is allowed.
