# Subscription Module

- Serves: REQ-SUB-001
- Owns: Free, Lite, and Pro plan state and entitlement evaluation
- Does not own: External subscription billing in v1

## Commands
- ADMIN or authorized Owner changes an allowed tenant plan.

## Queries
- Return current plan.
- Evaluate a feature entitlement using resolved Config.

## Rules
- Server enforcement is authoritative.
- Frontend visibility must match the server result.
- `Enterprise` is outside v1.
- Automatic subscription billing is outside v1.
- Plan changes create audit events.

## Contracts
- Emits `SubscriptionChanged` and `EntitlementChanged`.
