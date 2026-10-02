# ADR 0010 — Do not audit data read access

- Status: Decided
- Date: 2026-10-02
- Serves: REQ-ADM-001, NFR-PRIV-001

## Context

The first M1/M3 implementation recorded ADMIN data reads as audit events:
`AdminTenantsListed`, `AdminTenantOpened`, `AdminAuditRead`, and
`AdminCustomerPhoneRead`, plus `CustomerPhoneAccessed` in Loyalty. Those events
filled the audit collection with high-volume, low-value rows and mixed read
noise into the change history.

The Founder decision on 2026-10-02: the audit log records changes only. Reading
data does not create an audit event, even for ADMIN.

## Decision

1. Audit stores create, update, delete, and security events only.
2. Remove the read-access audit events: `AdminTenantsListed`,
   `AdminTenantOpened`, `AdminAuditRead`, `AdminCustomerPhoneRead`, and
   `CustomerPhoneAccessed`.
3. Keep security and change events: `StaffSessionStarted`, `StaffPinLocked`,
   `SessionEnded`, `AdminAuthorizationBypass`, and every module create, update,
   and delete event.
4. ADMIN stays unrestricted by role permission and is not audited on read.
   Removing the read audit does not widen access.

## Consequences

- SRS REQ-ADM-001 and NFR-PRIV-001 are amended. SRS §8 and §15 are updated.
- The ADMIN contract version is 2. Read results no longer return `auditEventId`;
  the change-tenant result still does.
- The audit collection contains only changes and security events.
- Phone field filtering by role, permission, and tenant is unchanged.
