# P0 Dependency-Ready Ticket Set

Source: SRS 1.2, TECH_STACK 1.2, Firebase rules, the initial P0 plan, and current implementation review.

## Execution order

All M1 tickets below are Done with unit, Functions Emulator, and Rules evidence.

1. [P0-001 — Config completion](P0-001-config.md) — Done
2. [P0-002A — Owner registration completion](P0-002A-owner-auth.md) — Done
3. [P0-002B — First Tenant creation completion](P0-002B-tenant-bootstrap.md) — Done
4. [P0-003 — Tenant selection and read boundary](P0-003-tenant-boundary.md) — Done
5. [P0-004 — Staff PIN and ACL](P0-004-staff-pin-acl.md) — Done
6. [P0-005 — Catalog](P0-005-catalog.md) and [P0-006 — Table Access](P0-006-table-access.md) — Done
7. [P0-007 — Ordering](P0-007-ordering.md) — Done
8. [P0-008 — Inventory and Kitchen](P0-008-inventory-kitchen.md) and [P0-009 — Payment](P0-009-payment.md) — Done
9. [P0-010 — Waiter, notification, and onboarding](P0-010-waiter-notification-onboarding.md) — Done
10. [P0-later — Remaining M1 sub-tickets](P0-later-m1-remainder.md) — L01 through L09 Done, except the NFC device step and live payment provider transport.

M2/P1 and the M3/P2 baseline are implemented from `docs/plan/insight-growth-plan.md` and the M2/M3 module docs. Current verification: 199 web/shared, 342 functions, 100 Rules, and 224 Functions Emulator tests pass.

## Test harness

- `npm run test:rules` runs Security Rules tests against the Firestore emulator.
- `npm run test:emulator` builds functions and runs callable tests against the Auth, Firestore, and Functions emulators.
- Java is required for the Firestore emulator.
- Rules and emulator tests run per ticket; keep the include lists in `functions/vitest.rules.config.mts` and `functions/vitest.emulator.config.mts` current.

## Scope boundary

This set contains the dependency-ready M1 wave. P0-L01 through P0-L09 remain separate sub-tickets in the remainder file.

## Traceability map

| REQ/NFR | Ticket |
|---|---|
| REQ-CFG-001, NFR-CFG-001, NFR-SEC-001, NFR-MOD-001, CON-002, CON-006, CON-007 | P0-001 |
| REQ-AUTH-001, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001, CON-001, CON-002 | P0-002A |
| REQ-TEN-001, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001, CON-001, CON-002 | P0-002B, P0-003 |
| REQ-ACL-001, NFR-SEC-001, NFR-MOD-001 | P0-003 |
| REQ-AUTH-002, REQ-ACL-001, NFR-SEC-001, NFR-PRIV-001, NFR-MOD-001 | P0-004 |
| REQ-CAT-001, REQ-CAT-002, CON-002, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001 | P0-005 |
| REQ-TBL-001, NFR-SEC-002, CON-002, NFR-SEC-001, NFR-MOD-001 | P0-006 |
| REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001, NFR-UX-001, NFR-MOD-001 | P0-007 |
| REQ-INV-001, REQ-KDS-001, REQ-ORD-003, CON-002, CON-004, NFR-RT-001, NFR-MOD-001 | P0-008 |
| REQ-CAS-001, REQ-ORD-002, REQ-ORD-003, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001 | P0-009 |
| REQ-WAI-001, REQ-NOT-001, REQ-ONB-001, REQ-ONB-002, REQ-ORD-003, NFR-RT-001, NFR-UX-001, NFR-MOD-001 | P0-010 |
| REQ-ADM-001 | P0-L01 |
| NFR-RET-001, NFR-REL-001 | P0-L02 |
| NFR-REL-001 | P0-L03 |
| NFR-PRIV-001 | P0-L04 |
| REQ-I18N-001 | P0-L05 |
| NFR-PERF-001 | P0-L06 |
| REQ-INV-002, REQ-CAS-002 | P0-L07 |
| REQ-PAY-001 | P0-L08, P0-L09 |

## Gaps

- Rules tests were stubs; each ticket replaced its real test files. The remaining placeholder names under `functions/test/rules/` are not included by the vitest configs.
- Deferred integrations: NFC physical device write, loyalty SMS/Zalo code delivery, live payment provider transport and secret, a separate timed usability artifact, PWA service-worker caching, and a live AI provider secret.
- SRS Q-4 (TypeSafe Jev terms and Vietnamese quality) and Q-5 (minimum data per shop type) remain open. They affect provider defaults and M2/M3 quality, not the implemented flows.
