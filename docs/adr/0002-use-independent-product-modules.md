# ADR 0002 — Use Independent Product Modules

- Status: Decided
- Date: 2026-09-12
- Serves: CON-005, NFR-MOD-001

## Context
The Founder requires each function area to remain independently implementable and testable.

## Decision
Separate Auth, Tenant, Config, Catalog, Inventory, Table Access, Ordering, Fulfilment, Payment, Loyalty, Reporting, AI, Subscription, and ADMIN modules. Each module owns its data mutations and exposes explicit contracts. Views may compose modules but cannot bypass their rules.

## Consequences
- Teams can implement vertical slices without sharing internal state.
- Cross-module operations need explicit commands and transaction boundaries.
- Duplicate business rules across views are prohibited.
