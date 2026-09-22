# ADMIN Module

- Serves: REQ-ADM-001, REQ-CFG-001, NFR-PRIV-001
- Owns: ADMIN access workflow and ADMIN audit orchestration
- Does not own: Business records inside other modules

## Commands
- List, open, change, archive, or restore any tenant.
- Request platform product changes through Config.
- Request tenant state changes through Tenant and Subscription.
- Invoke authorized commands from another module with ADMIN authority.

## Queries
- Read every tenant and platform setting through owning module queries.
- Read Customer phone, Orders, Payments, and audit records.

## Rules
- ADMIN receives unrestricted application access without approval prompts.
- Every ADMIN application action creates an automatic audit event.
- ADMIN identity uses a server-verified platform claim.
- Runtime infrastructure settings remain deployment configuration.
- Secrets never appear in ADMIN product settings.
- ADMIN never writes another module's collection directly.

## Contracts
- Emits `AdminActionAudited` and module-specific events for delegated commands.
