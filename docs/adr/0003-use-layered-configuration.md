# ADR 0003 — Use Layered Configuration

- Status: Decided
- Date: 2026-09-12
- Serves: REQ-CFG-001, NFR-CFG-001, REQ-ADM-001

## Context
The Founder wants editable defaults for retention, schedules, retry behavior, PIN policy, and future settings.

## Decision
Use a typed, versioned `config.ts` for product defaults. ADMIN settings in Firestore override those defaults. Allowed tenant settings override ADMIN product values. Keep memory, timeout, region, and concurrency in deployment configuration.

Initial defaults are six PIN digits, five failed attempts, 15-minute lockout, five-year retention, daily backup, and 30-day backup retention.

## Consequences
- Modules share validated values and precedence.
- Runtime product settings can change without changing deployment resources.
- Infrastructure changes remain reviewed deployment actions.
