# Traceability — Initial P0 Ticket Plan

UI integration status and frontend contracts: `docs/frontend-ui-integration.md`.
Week 1 delivery tasks: `docs/plan/week-1-sprint.md`.
Dependency-ready execution tickets: `docs/tickets/p0/README.md`.

Status legend: `Done` = merged and verified; `First slice` = thin slice deployed, acceptance evidence pending; `Planned` = not started.

## Done

| REQ/NFR | Ticket identity and developer plan | Evidence |
|---|---|---|
| CON-002, CON-006, CON-007, NFR-SEC-001, NFR-CFG-001, NFR-MOD-001, NFR-REL-001 | W1-01 — Developer 1 | Firebase backend bootstrap and CI: `firebase.json`, `.firebaserc`, Functions Node 22 workspace, `firestore.rules`, `storage.rules`, `firestore.indexes.json`, `.github/workflows/ci.yml`. Emulator Rules tests are deferred by ADR 0006. |

## First slice deployed (acceptance evidence pending)

| REQ/NFR | Ticket identity and developer plan | Evidence and remaining gap |
|---|---|---|
| REQ-AUTH-001 | [P0-002A](tickets/p0/P0-002A-owner-auth.md) — Developer 1 | Email/password register and sign-in deployed: `callableAuthRegisterOwner`, `LoginPage`, `RegisterPage`, auth adapter. Gap: Rules and Emulator tests, plus email-verification evidence. |
| REQ-TEN-001 | [P0-002B](tickets/p0/P0-002B-tenant-bootstrap.md), [P0-003](tickets/p0/P0-003-tenant-boundary.md) — Developer 1 | First Tenant, membership list, active-Tenant select and switch: three Tenant callables and `TenantSwitcher`. Gap: two-Tenant Emulator matrix and cross-Tenant deny evidence. |
| REQ-AUTH-001, REQ-TEN-001, REQ-AUTH-002, REQ-ACL-001, REQ-ONB-001, REQ-ADM-001, NFR-SEC-001, NFR-PRIV-001 | W1-03 — Developer 1 | Auth/Tenant contract freeze: `FirebaseIdentity`, `Membership`, `StaffSession` in `identity.contract.ts`; `AuthorizationDecision`; `OnboardingChecklist`; `AuditEvent`; published fixtures for each; consumer contract tests (27 web tests pass). Gap: real authorization guard, Staff PIN session wiring, onboarding real progress, and two-Tenant Emulator matrix. |
| REQ-CFG-001, NFR-CFG-001, CON-006, CON-007 | W1-02 — Developer 1; [P0-001](tickets/p0/P0-001-config.md) | `ResolvedConfig` contract, shared three-layer resolver, fixtures, direct authorized read of `platform/config` and tenant `configOverrides`, and `callableConfigUpdateTenant` write path for `locale`, `timezone`, and `pinPolicy`. Gap: ADMIN platform command, `ConfigurationChanged` event, and Emulator Rules tests (ADR 0006). |
| REQ-CAT-001, REQ-CAT-002, REQ-TBL-001, NFR-SEC-002, NFR-MOD-001 | W1-04 — Developer 2 | Catalog/Table contract freeze: `PublicMenuItem`, `CatalogCommandResult`, `TableLinkContext`, `TableTokenRotation`; private/public menu and active/revoked token fixtures; contract tests reject private Cost fields and stale token versions. Gap: real projection and resolver callables, Rules sections, and Emulator tests. |

## Planned

| REQ/NFR | Ticket identity and developer plan | Status |
|---|---|---|
| REQ-AUTH-002, REQ-ACL-001 | P0-004A, P0-004B — Developer 1 | Planned |
| REQ-CAT-001, REQ-CAT-002 | P0-005 — Developer 2 | Contracts frozen (W1-04); commands planned |
| REQ-TBL-001 | P0-006 — Developer 2 | Contracts frozen (W1-04); resolver planned |
| REQ-ORD-001, REQ-ORD-004 | P0-007A, P0-007B — Developer 3 | Planned |
| REQ-INV-001, REQ-KDS-001 | P0-008A, P0-008B — Developers 4, 3 | Planned |
| REQ-CAS-001 | P0-009A, P0-009B — Developer 4 | Planned |
| REQ-WAI-001, REQ-NOT-001, REQ-ONB-001, REQ-ONB-002 | P0-010A, P0-010B — Developers 3, 1 | Planned |
| REQ-ORD-002, REQ-ORD-003 | P0-007A, P0-008B, P0-009A — Developers 3, 4 | Planned |
| NFR-SEC-001, NFR-MOD-001 | P0-001 through P0-010 — all developers | Planned verification gate |
| NFR-SEC-002 | P0-006, P0-007A — Developers 2, 3 | Contracts frozen (W1-04); App Check and rate limits planned |
| NFR-DATA-001 | P0-002B, P0-005, P0-007A, P0-008A, P0-009A | Planned |
| NFR-RT-001, NFR-UX-001 | P0-007B, P0-008B, P0-010A, P0-010B | Planned evidence |
| REQ-ADM-001 | P0-L01 — Developer 2 | Done. Claim-verified ADMIN commands and queries with a CUD audit view. Read-access audit removed by ADR 0010. Emulator and Rules evidence pass. |
| NFR-RET-001, NFR-REL-001 | P0-L02, P0-L03 — Developer 4 | Planned |
| NFR-PRIV-001 | P0-L04 — Developer 1 | Done. Server field-level Customer-phone filtering by role/permission/tenant. ADMIN access is unrestricted and is not audited (ADR 0010). Unit, emulator, and Rules evidence pass. |
| REQ-I18N-001 | P0-L05 — Developer 2 | Planned |
| NFR-PERF-001 | P0-L06 — Developer 3 | Planned |
| REQ-INV-002, REQ-CAS-002 | P0-L07 — Developer 4 | Planned |
| REQ-PAY-001 | P0-L08, P0-L09 — Developer 4 | Planned |

## P0 ticket set (SRS 1.2)

Plan: `docs/tickets/p0/README.md`.

| REQ/NFR | Ticket identity and owner | Status |
|---|---|---|
| REQ-CFG-001, NFR-CFG-001, NFR-SEC-001, NFR-MOD-001, CON-002, CON-006, CON-007 | P0-001 Config — worker and ui-designer | Done. Unit (61 web, 34 functions), type, lint, build pass. Rules `npm run test:rules` 8 tests pass. Functions Emulator `npm run test:emulator` 12 tests pass. App Check on writes, tenant-visible projection, audit `eventId`, Settings allow-list filtering. |
| REQ-AUTH-001 | P0-002A — worker | Done. Web 79, functions 87, Rules 27, Functions Emulator 47 pass. |
| REQ-TEN-001 | P0-002B — worker | Done. Emulator and Rules evidence pass. |
| REQ-TEN-001, REQ-ACL-001 | P0-003 — worker | Done. Two-Tenant matrix, listener disposal, navigation-only `activeTenantId` evidence pass. |
| REQ-AUTH-002, REQ-ACL-001 | P0-004 — worker | Done. Hashed PIN, lockout, sessionVersion, audit, server authorization matrix, and no plaintext PIN in client. Emulator evidence pass. |
| REQ-CAT-001, REQ-CAT-002 | P0-005 — worker | Done. Catalog callables, private/public projection in one command, template scoping, bounded listener. Emulator and Rules evidence pass. |
| REQ-TBL-001, NFR-SEC-002 | P0-006 — worker | Done. Table callables, opaque token, atomic revocation, minimal public resolver, QR rotation. Emulator and Rules evidence pass. |
| REQ-ORD-001..004, NFR-SEC-002, NFR-UX-001 | P0-007 — worker | Done. Server cart validation, integer VND, idempotent Pay-Later Order, public tracking, offline block. Emulator and Rules evidence pass. |
| REQ-INV-001, REQ-KDS-001, REQ-ORD-003, NFR-RT-001 | P0-008 — worker | Done. One-transaction deduction, `pending -> cooking -> ready`, Kitchen availability via Catalog, two-second update harness. Emulator and Rules evidence pass. |
| REQ-INV-005, REQ-INV-006, REQ-INV-007 | [P0-011](tickets/p0/P0-011-inventory-measurement.md) — Inventory/UI | Done. Purchase-unit Cost conversion, recipe input units, and fixed waste per line in Cost and deduction. Web 199, functions 354, and Functions Emulator 224 tests pass; typecheck and lint pass. |
| REQ-CAS-001, REQ-ORD-002, REQ-ORD-003 | P0-009 — worker | Done. VietQR instructions, idempotent cash/VietQR confirmation, immutable Payment, Pay-First Kitchen gate. Emulator and Rules evidence pass. |
| REQ-WAI-001, REQ-NOT-001, REQ-ONB-001, REQ-ONB-002 | P0-010 — worker | Done (ONB-002 usability artifact pending). Waiter served, notification dedupe and mute, onboarding checklist. Emulator evidence pass. |
| REQ-ADM-001, NFR-PRIV-001, REQ-I18N-001, NFR-PERF-001 | P0-L01, L04, L05, L06 — worker | Done, except REQ-I18N-001 PARTIAL (a few Owner strings pending). ADMIN change audit (reads not audited, ADR 0010), phone filtering, i18n contract, and performance budget evidence pass. |
| NFR-RET-001, NFR-REL-001, REQ-INV-002, REQ-CAS-002, REQ-PAY-001 | P0-L02, L03, L07, L08, L09 — worker | Done. Retention/archive, backup rehearsal, cancellation restoration, reversal, provider adapter seam, refund ledger. Emulator and Rules evidence pass. |

## Insight and growth plan (SRS 1.2)

Plan: `docs/plan/insight-growth-plan.md`. ADRs: 0008 (AI provider), 0009 (reservations deferred).

| REQ/NFR | Ticket identity and owner | Status |
|---|---|---|
| REQ-AI-004, REQ-AI-005, NFR-AI-002 | G2-01 — AI/Config | Done. Provider adapter, `aiUsage`, per-tenant budget with audit. Emulator evidence pass. |
| REQ-AI-002, NFR-AI-001 | G2-02 — AI/Reporting | Done. Scheduled weekly grounded insights, idempotent, timezone-aware. Emulator evidence pass. |
| REQ-AI-003, NFR-PRIV-002 | G2-03 — AI | Done. Open Q&A with sources, missing-data honesty, permission denial, masking. NFR-SEC-003 stays M3. |
| REQ-FDB-001 | G2-04 — Feedback | Done. Tenant-scoped verified feedback, PII minimization. Emulator and Rules evidence pass. |
| REQ-FDB-002 | G2-05 — Feedback/AI | Done. Source-cited theme grouping, masking, adversarial resistance. Emulator evidence pass. |
| REQ-AI-004, NFR-AI-002 | G2-06 — AI | Done. Feature-flagged Jev adapter and offline evaluation report; default provider unchanged (ADR 0008). |
| REQ-FDB-003 | G3-01 — Feedback | Done. Ticket state, actor, time, reason on transition. Emulator evidence pass. |
| REQ-HRM-001 | G3-02 — Workforce | Done. Shift overlap rejected server-side. Emulator evidence pass. |
| REQ-HRM-002, REQ-HRM-003 | G3-03 — Workforce | Done. Pending correction with approval history; minutes only, no payroll. Emulator and Rules evidence pass. |
| REQ-INV-003 | G3-04 — Inventory | Done. Stock count expected quantity and variance with audit. Emulator evidence pass. |
| REQ-INV-004 | G3-05 — Inventory/AI | Done. Loss findings cite count, movement, period, and state missing-count limits. Emulator evidence pass. |
| REQ-PRO-001, REQ-LOY-001, NFR-SEC-003 | G3-06 — Promotion/Loyalty | Done. Owner approval gate and measurement. Emulator evidence pass. |
| REQ-NFC-001, REQ-PRO-001, REQ-LOY-001, REQ-SUB-001, REQ-PAY-002 | M3 baseline — worker | Done, except NFC device write and loyalty code delivery and payment webhook transport (deployment tasks). Emulator and Rules evidence pass. |
| REQ-RSV-001, REQ-RSV-002, REQ-RSV-003 | ADR 0009 | Deferred, outside M1–M3 |

## Evidence gap

The M1, M2, and M3 baseline tickets have real contracts, fixtures, unit tests, Functions Emulator tests, and Security Rules tests. Evidence is green: 199 web/shared, 342 functions, 100 Rules, and 224 Functions Emulator tests.

Remaining partial evidence: the NFC physical device step, loyalty SMS/Zalo code delivery, live payment provider transport and secret, a few i18n strings, a separate timed usability study artifact, PWA service-worker offline caching, and a live AI provider secret. Reservations stay DEFERRED under ADR 0009.
