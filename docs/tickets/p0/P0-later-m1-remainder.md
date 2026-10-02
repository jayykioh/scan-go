# P0-later — Remaining M1 dependency-ready sub-tickets

Each sub-ticket is one session-sized vertical slice. Implementers must update the stated Functions Vitest include lists.

## P0-L01 — ADMIN access and audit

### Requirement links
REQ-ADM-001.

### Owning module
ADMIN. Delegated commands remain owned by their source module.

### Allowed file paths
- `functions/src/modules/admin/**`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/admin.contract.ts`
- `shared/contracts/audit.contract.ts`
- `shared/fixtures/audit.fixture.ts`
- `src/data/adapters/admin.adapter.ts`
- `src/pages/dashboard/ManagementPage.tsx`
- `firestore.rules`
- `functions/test/rules/admin.rules.test.ts`
- `functions/test/admin/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-003 and P0-004.

### Atomic acceptance checklist
- Given a server-verified ADMIN claim, when ADMIN opens or changes any Tenant through a delegated command, then it succeeds without an approval prompt.
- Given every ADMIN action, when it succeeds or fails after authorization, then an automatic audit event records the action.
- Given a non-ADMIN, when it uses an ADMIN query or command, then Rules and Cloud Functions deny it.

### Test plan
- Unit: claim and delegated-command authorization plus audit mapping.
- Functions Emulator: ADMIN cross-Tenant allow and non-ADMIN denial with audit assertion.
- Rules: ADMIN read boundary, non-ADMIN denial, and direct business writes denied.
- Add `test/rules/admin.rules.test.ts` and `test/admin/**` to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; ADMIN audit fixture; cross-Tenant command result.

### Out of scope
Platform Config changes, retention, Customer privacy filtering, and feature work outside ADMIN access.

## P0-L02 — Retention and archive

### Requirement links
NFR-RET-001, NFR-REL-001.

### Owning module
Config supplies policy. Ordering and Payment retain ownership of protected records.

### Allowed file paths
- `functions/src/modules/config/**`
- `functions/src/modules/ordering/index.ts`
- `functions/src/modules/payment/index.ts`
- `functions/src/index.ts`
- `shared/config/**`
- `shared/contracts/order.contract.ts`
- `shared/contracts/payment.contract.ts`
- `firestore.rules`
- `functions/test/rules/ordering.rules.test.ts`
- `functions/test/retention/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-001, P0-007, and P0-009.

### Atomic acceptance checklist
- Given eligible data exceeds the configured five-year default, when retention runs, then it applies once using configured policy.
- Given paid Orders or Payments, when retention runs, then it archives them and leaves them recoverable.
- Given a retry, when the same retention work runs again, then it does not duplicate or delete protected records.

### Test plan
- Unit: eligibility, archive plan, protected-record guard, and idempotency.
- Functions Emulator: scheduled retention fixture, retry, archive recovery, and Tenant isolation.
- Rules: archived protected data remains server-write-only and Tenant-scoped.
- Add this ticket's Rules and `test/retention/**` paths to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; archive and recovery fixture; retention retry assertion.

### Out of scope
Backup infrastructure, deletion workflows, and legal-policy changes.

## P0-L03 — Backup and restore drill

### Requirement links
NFR-REL-001.

### Owning module
Deployment configuration.

### Allowed file paths
- `firebase.json`
- `functions/src/index.ts`
- `functions/src/modules/config/**`
- `shared/config/**`
- `functions/test/backup/**`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-001 and P0-L02.

### Atomic acceptance checklist
- Given deployment configuration, when the daily backup schedule runs, then it retains backups for 30 days.
- Given an isolated restore environment, when a restore drill runs, then tenant records restore there without changing the source environment.

### Test plan
- Unit: backup schedule and retention configuration validation.
- Functions Emulator: backup-job configuration boundary and isolated drill fixture.
- Rules: not applicable because backup access uses server deployment credentials; document this result in evidence.
- Add `test/backup/**` to the Functions Emulator Vitest include list.

### Required evidence
Passing unit and Functions Emulator results; deployment configuration capture; isolated restore-drill record; Rules applicability note.

### Out of scope
Production deployment, data deletion, and application record changes.

## P0-L04 — Customer phone privacy filtering

### Requirement links
NFR-PRIV-001.

### Owning module
Tenant authorization. ADMIN orchestrates unrestricted audited access.

### Allowed file paths
- `functions/src/modules/tenant/**`
- `functions/src/modules/admin/**`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/authorization.contract.ts`
- `shared/contracts/admin.contract.ts`
- `shared/fixtures/authorization.fixture.ts`
- `src/data/adapters/admin.adapter.ts`
- `firestore.rules`
- `functions/test/rules/auth.rules.test.ts`
- `functions/test/privacy/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-004 and P0-L01.

### Atomic acceptance checklist
- Given each role and configured permission, when it requests Customer phone data, then server results include or omit the field correctly.
- Given ADMIN reads Customer phone data, when the request succeeds, then the server records an automatic audit event.
- Given a direct client read or unauthorized request, when it runs, then it returns no Customer phone data.

### Test plan
- Unit: field-filter decision matrix.
- Functions Emulator: all role outcomes, ADMIN audit, and cross-Tenant denial.
- Rules: no direct phone-data access outside approved paths.
- Add this ticket's Rules and `test/privacy/**` paths to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; permission matrix; ADMIN audit fixture.

### Out of scope
Loyalty enrollment, feedback privacy, and AI input masking.

## P0-L05 — Interface i18n

### Requirement links
REQ-I18N-001.

### Owning module
i18n.

### Allowed file paths
- `functions/src/modules/i18n/**`
- `functions/src/index.ts`
- `shared/contracts/i18n.contract.ts`
- `src/data/adapters/i18n.adapter.ts`
- `src/hooks/usePersistentState.ts`
- `src/components/CustomerView.tsx`
- `src/components/OwnerView.tsx`
- `src/pages/PublicMenuPage.tsx`
- `src/pages/dashboard/SettingsPage.tsx`
- `functions/test/i18n/**`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-002A and P0-003.

### Atomic acceptance checklist
- Given a saved user locale or Customer browser locale, when the interface opens, then supported labels use `vi` or `en`.
- Given a language switch, when Customer or authenticated user changes it, then it persists and remains available.
- Given Owner menu content, when the interface locale changes, then the menu content remains exactly as entered.

### Test plan
- Unit: locale resolution, catalog lookup, persistence, and content preservation.
- Functions Emulator: authenticated locale persistence boundary.
- Rules: not applicable because no direct business-data access changes; document this result in evidence.
- Add `test/i18n/**` to the Functions Emulator Vitest include list.

### Required evidence
Passing unit and Functions Emulator results; `vi` and `en` captures; Owner menu-content preservation fixture; Rules applicability note.

### Out of scope
Translation of Owner menu content, more locales, and native applications.

## P0-L06 — Customer menu performance evidence

### Requirement links
NFR-PERF-001.

### Owning module
Catalog public projection and Table Access public resolution.

### Allowed file paths
- `functions/src/modules/catalog/**`
- `functions/src/modules/table-access/**`
- `src/data/adapters/catalog.adapter.ts`
- `src/data/adapters/table.adapter.ts`
- `src/pages/PublicMenuPage.tsx`
- `functions/test/performance/**`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-005 and P0-006.

### Atomic acceptance checklist
- Given the representative 4G profile and production-like menu fixture, when 100 Customer menu loads run, then p95 is at most two seconds.
- Given a measured regression, when it fails the threshold, then the ticket does not claim completion.

### Test plan
- Unit: bounded public-menu query and measurement aggregation.
- Functions Emulator: production-like public projection fixture and resolver timing boundary.
- Rules: public token and projection access remains covered by P0-005 and P0-006 Rules suites; run both and record results.
- Add `test/performance/**` to the Functions Emulator Vitest include list.

### Required evidence
100-load report with p95; fixture description; passing related Rules results.

### Out of scope
General frontend redesign, server-cache introduction, and non-menu performance targets.

## P0-L07 — Unpaid cancellation and inventory restoration

### Requirement links
REQ-INV-002, REQ-CAS-002.

### Owning module
Ordering owns cancellation state. Inventory owns restoration. Payment remains read-only for unpaid-state validation.

### Allowed file paths
- `functions/src/modules/ordering/**`
- `functions/src/modules/inventory/**`
- `functions/src/modules/payment/index.ts`
- `functions/src/shared/audit.ts`
- `functions/src/shared/idempotency.ts`
- `functions/src/index.ts`
- `shared/contracts/correction.contract.ts`
- `shared/contracts/inventory.contract.ts`
- `shared/contracts/order.contract.ts`
- `shared/fixtures/inventory.fixture.ts`
- `src/data/adapters/ordering.adapter.ts`
- `src/components/CashierView.tsx`
- `firestore.rules`
- `functions/test/rules/inventory.rules.test.ts`
- `functions/test/cancellation/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-008 and P0-009.

### Atomic acceptance checklist
- Given an unpaid deducted Order and Cashier reason, when cancellation succeeds, then it stops fulfilment, changes state once, and writes an audit event.
- Given eligible deductions, when cancellation commits, then one transaction restores each ingredient exactly once with stock movements.
- Given a paid Order, duplicate request, unauthorized role, or missing reason, when cancellation runs, then it rejects without restoration.

### Test plan
- Unit: unpaid eligibility, restoration mutation plan, reason validation, and idempotency.
- Functions Emulator: cancellation transaction, retry, paid rejection, role matrix, and audit.
- Rules: direct cancellation, Order, and stock-movement writes denied.
- Add this ticket's Rules and `test/cancellation/**` paths to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; cancelled Order, audit, and restored-ledger fixture; retry assertion.

### Out of scope
Paid-order reversal, refund, automatic payment events, Stock counts, waste, and manual adjustment.

## P0-L08 — Payment adapter boundary

### Requirement links
REQ-PAY-001.

### Owning module
Payment.

### Allowed file paths
- `functions/src/modules/payment/**`
- `functions/src/shared/idempotency.ts`
- `functions/src/index.ts`
- `shared/contracts/payment.contract.ts`
- `shared/fixtures/payment.fixture.ts`
- `src/data/adapters/payment.adapter.ts`
- `functions/test/rules/payment.rules.test.ts`
- `functions/test/payment-adapter/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-009.

### Atomic acceptance checklist
- Given the Payment module needs a settlement implementation, when it uses the adapter contract, then it can replace provider mapping without changing Ordering records.
- Given an adapter failure or malformed provider payload, when it is handled, then no Payment or Order correction occurs.
- Given an adapter result, when it is persisted as evidence, then it contains no secret material.

### Test plan
- Unit: adapter contract replacement, payload validation, and secret exclusion.
- Functions Emulator: adapter boundary failure and Tenant-scoped settlement mapping.
- Rules: payment direct writes remain denied.
- Add this ticket's Rules and `test/payment-adapter/**` paths to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; fake-adapter contract fixture; failure-path assertion.

### Out of scope
Automatic provider confirmation, signed external callbacks, cancellation, reversal, and refund.

## P0-L09 — Paid-order reversal and refund

### Requirement links
REQ-PAY-001.

### Owning module
Payment owns compensating Payment records. Ordering owns linked Order mutations.

### Allowed file paths
- `functions/src/modules/payment/**`
- `functions/src/modules/ordering/index.ts`
- `functions/src/shared/audit.ts`
- `functions/src/shared/idempotency.ts`
- `functions/src/index.ts`
- `shared/contracts/correction.contract.ts`
- `shared/contracts/payment.contract.ts`
- `shared/fixtures/payment.fixture.ts`
- `src/data/adapters/payment.adapter.ts`
- `src/components/CashierView.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/payment.rules.test.ts`
- `functions/test/refund/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

### Dependencies
P0-009 and P0-L08.

### Atomic acceptance checklist
- Given a paid Order and authorized correction request, when reversal or refund succeeds, then the original Payment remains immutable and a linked compensating record exists.
- Given a duplicate correction request, when it retries, then it creates no second compensating record.
- Given an unauthorized Cashier, unpaid Order, or malformed request, when correction runs, then it rejects without changing records.
- Given a successful correction, when audit is inspected, then it records actor, reason, target, and server UTC time.

### Test plan
- Unit: correction eligibility, compensating record mapping, idempotency, and VND validation.
- Functions Emulator: reversal, refund, retry, authorization matrix, immutability, and audit.
- Rules: payment and Order direct writes denied and tenant reads remain scoped.
- Add this ticket's Rules and `test/refund/**` paths to the Functions Vitest include lists.

### Required evidence
Passing unit, Functions Emulator, and Rules results; original and compensating Payment fixtures; audit and retry assertions.

### Out of scope
Unpaid cancellation and inventory restoration, automatic provider events, Loyalty, and reporting.
