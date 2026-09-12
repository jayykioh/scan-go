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
- [TECH_STACK](docs/TECH_STACK.md)
- [Common rules](docs/RULES.md)
- [Firebase rules](docs/RULES_FIREBASE.md)
- [Glossary](docs/glossary.md)
- [ADR 0001: Firestore and Cloud Functions](docs/adr/0001-use-firestore-and-cloud-functions.md)
- [ADR 0002: Independent modules](docs/adr/0002-use-independent-product-modules.md)
- [ADR 0003: Layered configuration](docs/adr/0003-use-layered-configuration.md)
- [ADR 0004: Payment and order history](docs/adr/0004-protect-payment-and-order-history.md)
- [Firestore research](research/firestore-foundation.md)

## Agent constraints
- Do not implement code without an approved REQ ID.
- Keep requirement IDs stable.
- Update SRS traceability with each implementation.
- Do not create direct client writes to business collections.
- Do not add PostgreSQL rules while Firestore remains selected.
- Treat P3 and listed non-goals as out of scope until an approved amendment.
