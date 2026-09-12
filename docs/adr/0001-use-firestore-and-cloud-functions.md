# ADR 0001 — Use Firestore and Cloud Functions

- Status: Decided
- Date: 2026-09-12
- Serves: REQ-TEN-001, REQ-ORD-003, NFR-RT-001, NFR-SEC-001

## Context
ScanGo needs tenant isolation and real-time order updates. The Founder selected Firebase Firestore instead of PostgreSQL.

## Decision
Use Firestore Native mode as the primary database. Use bounded client listeners for authorized reads. Route every business write through Cloud Functions 2nd gen. Enforce tenant access with memberships and deny-by-default Security Rules.

## Consequences
- The product gains managed real-time listeners and Firebase integration.
- Data modeling must follow query paths rather than relational joins.
- Transactions, idempotency, listener cost, and Security Rules require dedicated tests.
- Changing the primary database requires a new ADR and SRS amendment.
