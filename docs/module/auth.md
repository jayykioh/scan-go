# Auth Module

- Serves: REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, REQ-AUTH-005, REQ-AUTH-006, NFR-SEC-001
- Owns: Owner authentication, Staff session creation, logout, PIN lock state, which console a membership may open
- Does not own: Tenant membership permissions or user profile settings

## Commands
- Register an Owner with email and password.
- Sign in an Owner with email and password.
- Verify a tenant-scoped Staff PIN through a server command.
- End or revoke a Staff session.

## Queries
- Current Firebase identity.
- Current Staff session status.

## Rules
- Owner uses Firebase Auth email/password. Staff uses a tenant-scoped PIN.
- An Owner membership verifies no PIN: `useActiveMembership` reads the caller's own membership of the active Tenant and the operating pages start the Owner in every role, while a Staff membership keeps the PIN gate (REQ-AUTH-005, ADR 0021).
- The Owner console belongs to a membership that owns the active Tenant; a Staff membership is sent to `/staff`. The Rules and callables remain the boundary, so this only decides what is drawn (REQ-AUTH-006, ADR 0021).
- Never store plaintext PIN values.
- Use configurable PIN length, attempts, and lock time.
- The PIN length policy is enforced where the PIN is **set**, never where it is checked (REQ-AUTH-004). Verification compares the stored hash, so a legacy PIN whose length differs from the current policy still signs in; `callableStaffCreate` and `callableStaffResetPin` are what refuse a new PIN of the wrong length, before any Auth account exists.
- Bind Staff sessions to tenant, device, and `sessionVersion` for eight hours.
- Owner can revoke sessions by increasing `sessionVersion`.
- Emit authentication and lockout audit events.

## Contracts
- Emits `OwnerRegistered`, `StaffSessionStarted`, `StaffPinLocked`, and `SessionEnded`.
- Calls Tenant to create the first membership and verify active membership.
- Uses Config for policy values.
