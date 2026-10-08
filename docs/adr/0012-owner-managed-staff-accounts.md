# ADR 0012 — Owner-managed Staff accounts and a Staff sign-in entry

- Status: Decided
- Date: 2026-10-02
- Serves: REQ-AUTH-002, REQ-AUTH-003, REQ-ACL-001

## Context

REQ-AUTH-002 defines a tenant-scoped Staff PIN. The PIN callable reads the
membership of the signed-in Firebase Auth user (`tenants/{tenantId}/members/{uid}`),
so a Staff PIN can only succeed when the caller is authenticated as that Staff
member. The codebase had no command to create a Staff account, the Staff page
was an offline placeholder, and no sign-in route resolved a Staff Tenant. This
left Staff unable to start a shift.

## Decision

The Owner provisions one Firebase Auth account per Staff member. The new Staff
module exposes Owner-only callables:

- `callableStaffCreate` creates the Firebase Auth user and writes the Staff
  membership with the Owner-assigned roles, the reduced permission set, and a
  scrypt PIN hash.
- `callableStaffList` returns a bounded Staff list for one Tenant, because a
  membership stays private to its user in Security Rules.
- `callableStaffUpdate`, `callableStaffSetActive`, and `callableStaffResetPin`
  manage roles, name, active state, and the PIN.
- Disabling a Staff member or resetting the PIN increments `sessionVersion`, so
  every issued session is revoked.

A Staff member signs in at `/staff` with the Auth account, resolves the Tenant
from their own memberships, selects it as `activeTenantId`, then verifies the
PIN. Staff never use the Owner bootstrap, so no Tenant is provisioned for them.

## Consequences

- The Staff membership document gains `email` and `displayName` fields for the
  Owner list. The private membership stays server-only; the client never reads
  the collection directly.
- Every write validates the caller as an active Owner of the stated Tenant, and
  every change records an audit event.
- `REQ-AUTH-003` and `docs/data-model.md` §3 are amended by this decision.
- An emulator test for the Staff callables is still pending.
