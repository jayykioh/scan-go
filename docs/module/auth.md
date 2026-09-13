# Auth Module

- Serves: REQ-AUTH-001, REQ-AUTH-002, NFR-SEC-001
- Owns: Owner authentication, Staff session creation, logout, PIN lock state
- Does not own: Tenant membership permissions or user profile settings

## Commands
- Start and verify Owner phone OTP.
- Verify a tenant-scoped Staff PIN through a server command.
- End or revoke a Staff session.

## Queries
- Current Firebase identity.
- Current Staff session status.

## Rules
- Never store plaintext PIN values.
- Use configurable PIN length, attempts, and lock time.
- Bind Staff sessions to tenant, device, and `sessionVersion` for eight hours.
- Owner can revoke sessions by increasing `sessionVersion`.
- Emit authentication and lockout audit events.

## Contracts
- Emits `OwnerAuthenticated`, `StaffSessionStarted`, `StaffPinLocked`, and `SessionEnded`.
- Calls Tenant to verify active membership.
- Uses Config for policy values.
