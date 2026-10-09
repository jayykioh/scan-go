# ADR 0015 — Read tenant data directly when the rules allow it

- Status: Decided
- Date: 2026-10-02
- Serves: REQ-RPT-001, REQ-PRO-001, REQ-LOY-001, NFR-SEC-001

## Context

The client read every tenant list through a Cloud Function callable, even when
the security rules already allow an active tenant member to read the
collection. Each read paid for a cold start, a membership lookup, and a network
round-trip that added nothing to security.

The rules and the server callables enforce the same membership check. The data
for Reporting daily stats, Promotion definitions, and Loyalty configuration
carries no permission-filtered field, so the server added no protection.

## Decision

1. Add one client module, `src/data/firestoreRead.ts`, for the direct Firestore
   reads. It is the single place that holds these queries.
2. Use a direct read only when an active tenant member may read the whole
   collection by the rules and the result carries no permission-filtered field.
3. Keep the callable for reads that join or filter sensitive data, or that read
   a collection the rules deny to clients. Examples: Loyalty members (phone
   field), Staff accounts, ADMIN lists, Inventory audit report, Orders, and the
   resolved Config.
4. Keep every write on the server callables. This decision changes reads only.

The first direct reads are the Reporting summary over the `dailyStats` tree,
the Promotion list over `promotions`, and the Loyalty configuration over
`loyaltyConfig`.

## Consequences

- The Reporting, Promotion, and Loyalty read adapters now call
  `firestoreRead`; their public function signatures stay the same.
- The server callables `callableReportingGetSummary`, `callablePromotionList`,
  and `callableLoyaltyGetConfig` remain, but the client no longer uses them for
  these reads. They are not removed in this change.
- Reporting aggregates the daily stats on the client. The client resolves the
  tenant timezone to find the current day key.
- Tests cover the direct read mapping and aggregation.
- A future read moves to `firestoreRead` only when rules allow it and no field
  needs permission filtering.
