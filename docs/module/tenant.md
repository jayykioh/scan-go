# Tenant Module

- Serves: REQ-TEN-001, REQ-ACL-001, NFR-SEC-001
- Owns: Tenant identity, user navigation profiles, memberships, active tenant selection
- Does not own: Authentication credentials, plan entitlements, or business records

## Commands
- Create or archive a tenant.
- Add, update, disable, or archive a membership.
- Select `activeTenantId` for one user.
- Assign roles and customize permissions within approved role limits.

## Queries
- List user memberships.
- Resolve active tenant and membership.
- Return a server authorization decision.

## Rules
- One user can belong to many tenants.
- `activeTenantId` never grants access by itself.
- Owner can reduce defaults and add only permissions marked optional for that role by ADMIN configuration.
- ADMIN bypass is server-verified and automatically audited.

## Contracts
- Emits `TenantCreated`, `TenantArchived`, `MembershipChanged`, and `ActiveTenantChanged`.
