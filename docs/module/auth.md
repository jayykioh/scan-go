# Auth Module

- Serves: REQ-AUTH-001, REQ-AUTH-002, REQ-AUTH-003, REQ-AUTH-004, NFR-SEC-001
- Owns: Owner authentication, Staff session creation, logout, PIN lock state
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
