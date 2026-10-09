# ScanGo Agent Guide

## Source of truth
1. `docs/SRS.md` defines approved product requirements and acceptance.
2. `docs/TECH_STACK.md` defines binding technology choices.
3. `docs/RULES.md` is always active.
4. `docs/RULES_FIREBASE.md` is active because Firestore is selected.
5. `docs/adr/` preserves decision rationale.
6. `docs/glossary.md` defines product terms.

## Documentation index
- [SRS](docs/SRS.md)
- [Product objectives and proposed direction](docs/PRODUCT_OBJECTIVES.md)
- [TECH_STACK](docs/TECH_STACK.md)
- [Common rules](docs/RULES.md)
- [Firebase rules](docs/RULES_FIREBASE.md)
- [Glossary](docs/glossary.md)
- [Firestore data model](docs/data-model.md)
- [Module index](docs/module/README.md)
- [Frontend UI integration map](docs/frontend-ui-integration.md)
- [Demo runbook](docs/demo-runbook.md)
- [Market price survey](docs/market-price-survey.md)
- [Bộ tổng hợp cần cải thiện: 40 việc IMP-01…IMP-40](docs/feedback/improvement-backlog-2026-10.md)
- [Playwright review and competitor comparison](docs/feedback/comparative-review-2026-10.md)
- [Feature audit: catalog, inventory, staff, config, subscription, simulator](docs/feedback/feature-audit-2026-10/README.md)
- [Competitor survey 2026-10](docs/feedback/competitor-report-2026-10.md)
- [Promotion feature verification harness](docs/feedback/harness/run-promotion-verification.mjs)
- [Table floor plan verification harness](docs/feedback/harness/verify-tables-page.mjs)
- [Initial P0 ticket plan](docs/plan/initial-p0-ticket-plan.md)
- [Week 1 sprint plan](docs/plan/week-1-sprint.md)
- [P0 parallel skeleton](docs/plan/p0-parallel-skeleton.md)
- [Four-developer P0 UI and backend assignment](docs/plan/p0-five-person-assignment.md)
- [Developer 1 P0 plan: Config, Auth, Tenant](docs/plan/p0-developer-1.md)
- [Developer 2 P0 plan: Catalog, Table Access, ADMIN](docs/plan/p0-developer-2.md)
- [Developer 3 P0 plan: Ordering, Fulfilment, i18n](docs/plan/p0-developer-3.md)
- [Developer 4 P0 plan: Inventory, Payment, durable work](docs/plan/p0-developer-4.md)
- [Insight and growth plan: M2/M3 AI, feedback, workforce, inventory count](docs/plan/insight-growth-plan.md)
- [Ticket traceability](docs/traceability.md)
- [Dependency-ready P0 tickets](docs/tickets/p0/README.md)
- [ADR 0001: Firestore and Cloud Functions](docs/adr/0001-use-firestore-and-cloud-functions.md)
- [ADR 0002: Independent modules](docs/adr/0002-use-independent-product-modules.md)
- [ADR 0003: Layered configuration](docs/adr/0003-use-layered-configuration.md)
- [ADR 0004: Payment and order history](docs/adr/0004-protect-payment-and-order-history.md)
- [ADR 0005: Rebuildable daily stats](docs/adr/0005-use-rebuildable-daily-stats.md)
- [ADR 0006: Real Firestore and deferred Emulator tests](docs/adr/0006-use-real-firestore-and-defer-emulator-tests.md)
- [ADR 0007: Email/password Owner auth](docs/adr/0007-switch-owner-auth-to-email-password.md)
- [ADR 0008: AI provider adapter and Jev evaluation](docs/adr/0008-ai-provider-adapter-and-jev-evaluation.md)
- [ADR 0009: Defer reservations and separate payment state](docs/adr/0009-defer-reservations-and-separate-payment-state.md)
- [ADR 0010: Do not audit read access](docs/adr/0010-do-not-audit-read-access.md)
- [ADR 0011: Deploy Cloud Functions in asia-southeast1](docs/adr/0011-deploy-cloud-functions-in-asia-southeast1.md)
- [ADR 0012: Owner-managed Staff accounts](docs/adr/0012-owner-managed-staff-accounts.md)
- [ADR 0013: Kitchen manages inventory with a change report](docs/adr/0013-kitchen-manages-inventory-with-report.md)
- [ADR 0014: Weighted-average ingredient cost](docs/adr/0014-weighted-average-ingredient-cost.md)
- [ADR 0015: Direct Firestore reads](docs/adr/0015-direct-firestore-reads.md)
- [ADR 0016: Promotion engine and Order snapshot](docs/adr/0016-promotion-engine-and-order-snapshot.md)
- [ADR 0017: Temporarily disable App Check enforcement](docs/adr/0017-temporarily-disable-app-check-enforcement.md)
- [ADR 0018: Table floor plan and live table status](docs/adr/0018-table-floor-plan-and-live-table-status.md)
- [Firestore research](research/firestore-foundation.md)

## Agent constraints
- Do not implement code without an approved REQ ID.
- Keep requirement IDs stable.
- Update SRS traceability with each implementation.
- Do not create direct client writes to business collections.
- Do not add PostgreSQL rules while Firestore remains selected.
- Treat P3 and listed non-goals as out of scope until an approved amendment.
