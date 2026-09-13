# ADR 0005 — Use Rebuildable Daily Stats

- Status: Decided
- Date: 2026-09-12
- Serves: REQ-RPT-001, REQ-RPT-002

## Context
Reading hundreds of orders for each report wastes reads and slows Owner reports. The original foundation deferred a reporting store.

## Decision
Replace that decision with tenant-scoped daily materialized stats. Use `yyyymmdd` in the tenant timezone. Record created and cancelled counters from order events. Record revenue, Cost, and gross profit from paid financial events. Keep item and table details in bounded subcollections. Make all updates idempotent and rebuildable from immutable source records.

## Consequences
- Reports read a small number of daily documents.
- Payment, reversal, refund, and cancellation transactions must update the correct day exactly once.
- Reconciliation and rebuild tools remain mandatory.
- Daily stats are derived data and never replace orders or payments as sources of truth.
