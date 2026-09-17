# Week 1 sprint — Firebase foundation and contract-first slices

## Goal and capacity

Create the Firebase delivery base that the repository lacks. Freeze module contracts and deliver one thin UI+BE slice per Developer.

- **Capacity:** four Developers × five delivery days. Founder reviews acceptance evidence only.
- **Verified starting state:** no Firebase configuration, Functions workspace, Rules, indexes, Storage Rules, Emulator Suite, or GitHub Actions workflow exists.
- **Definition of done:** task acceptance passes; required tests run in Emulator where applicable; no direct client business write exists; REQ/NFR traceability and handoff evidence exist; peer review completes; Founder accepts evidence.

## Tasks

### W1-01 — Bootstrap Firebase backend and CI
- **Jira issue type:** Task. **Assignee:** Developer 1. **Story points:** 3. **Priority:** Highest. **Epic:** W1-EPIC-PLATFORM. **Dependencies:** none. **Labels:** `week-1`, `firebase`, `bootstrap`, `ci`, `rules`.
- **Description:** Add `firebase.json`, `.firebaserc`, Functions TypeScript Node 22 workspace, deny-by-default `firestore.rules`, `firestore.indexes.json`, `storage.rules`, Emulator Suite, Zod base, shared typed Config skeleton, Emulator test runner, and GitHub Actions lint/typecheck/rules-tests workflow.
- **REQ/NFR:** CON-002, CON-006, CON-007, NFR-SEC-001, NFR-CFG-001, NFR-MOD-001, NFR-REL-001.
- **Acceptance:** Given a clean checkout, when the documented test command runs, then Functions build, lint, typecheck, Rules tests, and Emulator test runner start without secrets.
- **Evidence:** checked-in configuration list; CI workflow run; Emulator runner log.

### W1-02 — Config vertical slice and fixture
- **Jira issue type:** Story. **Assignee:** Developer 1. **Story points:** 2. **Priority:** High. **Epic:** W1-EPIC-ACCESS. **Dependencies:** W1-01. **Labels:** `week-1`, `config`, `p0-001`, `ui-partial`.
- **Description:** Freeze `ResolvedConfig`; add Config fixture/test double; expose default resolved Config through a thin callable/query contract; extend SettingsPage only with a source placeholder bound to the contract.
- **REQ/NFR:** REQ-CFG-001, NFR-CFG-001, CON-006, CON-007.
- **Acceptance:** Given default Config fixture, when Settings loads, then it displays resolved value and source; invalid override test is denied.
- **Evidence:** Config contract test; Emulator denial test; Settings screenshot.

### W1-03 — Auth/Tenant contract freeze
- **Jira issue type:** Task. **Assignee:** Developer 1. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-ACCESS. **Dependencies:** W1-01. **Labels:** `week-1`, `auth`, `tenant`, `contract`.
- **Description:** Freeze FirebaseIdentity, Membership, AuthorizationDecision, StaffSession, and AuditEvent schemas; add two-Tenant and Staff lockout fixtures plus test doubles.
- **REQ/NFR:** REQ-AUTH-001, REQ-TEN-001, REQ-AUTH-002, REQ-ACL-001, NFR-SEC-001, NFR-MOD-001.
- **Acceptance:** Given the fixture set, when another module consumes the double, then it can test allowed and denied membership paths without Auth implementation.
- **Evidence:** versioned schema fixture and consumer contract test.

### W1-04 — Catalog/Table contract freeze
- **Jira issue type:** Task. **Assignee:** Developer 2. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-CATALOG-TABLE. **Dependencies:** none. **Labels:** `week-1`, `catalog`, `table-access`, `contract`.
- **Description:** Freeze PublicMenuItem, CatalogCommandResult, TableLinkContext, and TableTokenRotation; add public/private menu and active/revoked token fixtures.
- **REQ/NFR:** REQ-CAT-001, REQ-CAT-002, REQ-TBL-001, NFR-SEC-002, NFR-MOD-001.
- **Acceptance:** Given fixtures, when Ordering uses their doubles, then it can validate an active token and public-safe menu without Firestore.
- **Evidence:** contract test and fixture review record.

### W1-05 — Catalog/Table thin vertical slice
- **Jira issue type:** Story. **Assignee:** Developer 2. **Story points:** 3. **Priority:** High. **Epic:** W1-EPIC-CATALOG-TABLE. **Dependencies:** W1-01, W1-03, W1-04. **Labels:** `week-1`, `catalog`, `table-access`, `p0-005`, `p0-006`, `ui-partial`.
- **Description:** Add one Owner menu command/query and public-safe projection fixture, one Table resolver contract, MenuPage/TablesPage adapters, and Catalog/Table Rules sections. Do not add direct client writes.
- **REQ/NFR:** REQ-CAT-001, REQ-TBL-001, CON-002, NFR-SEC-001, NFR-SEC-002.
- **Acceptance:** Given Owner fixture, when menu/Table contract runs, then Customer fixture receives only public menu/Table context; private Cost and old token are denied.
- **Evidence:** Emulator Rules report; MenuPage/TablesPage adapter recording; PublicMenuItem/TableLinkContext handoff.

### W1-06 — Catalog/Table Rules and Storage tests
- **Jira issue type:** Task. **Assignee:** Developer 2. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-CATALOG-TABLE. **Dependencies:** W1-01, W1-05. **Labels:** `week-1`, `rules`, `storage`, `emulator`.
- **Description:** Extend `firestore.rules` and `storage.rules` with Catalog/Table paths; add Emulator tests for cross-Tenant reads, public projection privacy, revoked token, and denied client writes.
- **REQ/NFR:** NFR-SEC-001, NFR-SEC-002, REQ-CAT-001, REQ-TBL-001.
- **Acceptance:** Given unauthorized or revoked access, when client reads or writes, then Rules deny it.
- **Evidence:** Rules Emulator report in CI.

### W1-07 — Ordering/Fulfilment contract freeze
- **Jira issue type:** Task. **Assignee:** Developer 3. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-ORDERING. **Dependencies:** none. **Labels:** `week-1`, `ordering`, `fulfilment`, `contract`.
- **Description:** Freeze CartValidation, OrderSnapshot, StatusEvent, NotificationEvent, and public tracking shapes; add Pay-First/Pay-Later, offline, and transition fixtures.
- **REQ/NFR:** REQ-ORD-001 through REQ-ORD-004, REQ-KDS-001, REQ-WAI-001, NFR-RT-001, NFR-MOD-001.
- **Acceptance:** Given mock Catalog/Table contracts, when tests run, then Ordering and Fulfilment compile without another module state.
- **Evidence:** contract fixtures and test-double consumer report.

### W1-08 — Customer Order thin vertical slice
- **Jira issue type:** Story. **Assignee:** Developer 3. **Story points:** 3. **Priority:** High. **Epic:** W1-EPIC-ORDERING. **Dependencies:** W1-01, W1-04, W1-07. **Labels:** `week-1`, `ordering`, `p0-007`, `customer`, `ui-partial`.
- **Description:** Add mocked public Table/menu query adapter, cart validation callable boundary, public tracking fixture, and CustomerView/PublicMenuPage adapter. Submission remains server-only.
- **REQ/NFR:** REQ-ORD-001, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001, NFR-UX-001.
- **Acceptance:** Given active token and public menu fixture, when Customer changes cart, then integer VND total renders; given offline state, when submit, then UI blocks and no command runs.
- **Evidence:** browser offline test, cart unit test, and public-read Rules test.

### W1-09 — Fulfilment composition interface
- **Jira issue type:** Task. **Assignee:** Developer 3. **Story points:** 1. **Priority:** Medium. **Epic:** W1-EPIC-ORDERING. **Dependencies:** W1-07. **Labels:** `week-1`, `fulfilment`, `atomic-contract`.
- **Description:** Define the Order status mutation request that consumes InventoryMutationPlan; add Kitchen/Waiter queue doubles and transition tests.
- **REQ/NFR:** REQ-KDS-001, REQ-WAI-001, REQ-INV-001, NFR-RT-001.
- **Acceptance:** Given InventoryMutationPlan double, when Kitchen transition prepares, then no Inventory document is written by Ordering/Fulfilment.
- **Evidence:** mutation-plan contract test and ownership review.

### W1-10 — Inventory/Payment contract freeze
- **Jira issue type:** Task. **Assignee:** Developer 4. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-INVENTORY-PAYMENT. **Dependencies:** none. **Labels:** `week-1`, `inventory`, `payment`, `contract`.
- **Description:** Freeze RecipeCost, InventoryMutationPlan, StockMovement, VietQrInstruction, and PaymentResult; add recipe, Payment, and retry fixtures.
- **REQ/NFR:** REQ-INV-001, REQ-CAS-001, REQ-ORD-002, CON-004, NFR-MOD-001.
- **Acceptance:** Given fixture doubles, when another module consumes plans/results, then it needs no Inventory or Payment internal state.
- **Evidence:** contract fixture and consumer test.

### W1-11 — Inventory/Payment thin vertical slice
- **Jira issue type:** Story. **Assignee:** Developer 4. **Story points:** 3. **Priority:** High. **Epic:** W1-EPIC-INVENTORY-PAYMENT. **Dependencies:** W1-01, W1-03, W1-10. **Labels:** `week-1`, `inventory`, `payment`, `p0-008a`, `p0-009a`, `ui-partial`.
- **Description:** Add ingredient/recipe query and Cost plan boundary, VietQR instruction/Payment result boundary, OwnerView/CashierView adapters, Inventory/Payment Rules sections, and Emulator tests. Do not compose with Orders yet.
- **REQ/NFR:** REQ-INV-001, REQ-CAS-001, REQ-ORD-002, CON-002, CON-004, NFR-SEC-001, NFR-DATA-001.
- **Acceptance:** Given authorized fixture, when Owner reads recipe or Cashier reads payment instruction, then tenant-scoped data returns; client write is denied.
- **Evidence:** Rules report, UI adapter recording, InventoryMutationPlan/PaymentResult handoff.

### W1-12 — Founder Week 1 acceptance review setup
- **Jira issue type:** Task. **Assignee:** Founder Reviewer. **Story points:** 1. **Priority:** High. **Epic:** W1-EPIC-PLATFORM. **Dependencies:** W1-01 through W1-11. **Labels:** `week-1`, `review`, `acceptance`.
- **Description:** Review contract registry, CI results, Emulator evidence, and no-direct-client-write checklist. This is review only.
- **REQ/NFR:** NFR-SEC-001, NFR-MOD-001; SRS §12 verification.
- **Acceptance:** Given all task evidence, when Founder reviews, then each accepted contract has owner, test result, and next integration gate.
- **Evidence:** signed Sprint review checklist; no code deliverable.

## Handoffs

- Developer 1 publishes `ResolvedConfig`, `Membership`, and `AuthorizationDecision`.
- Developer 2 publishes `PublicMenuItem` and `TableLinkContext`.
- Developer 3 publishes `OrderSnapshot` and Order status mutation request.
- Developer 4 publishes `InventoryMutationPlan` and `PaymentResult`.
- Cooking and Payment remain Week 2 atomic integration gates.
