# RULES_FIREBASE — Global Template — Active only if TECH_STACK DB = Firebase

| Field | Value |
|---|---|
| Source | `~/.config/opencode/docs-template/RULES_FIREBASE.template.md` (global) |
| Applies when | `TECH_STACK.md` §2 DB = `Firebase Firestore` |
| Companion | `SRS.md`, `TECH_STACK.md`, `architecture.md`, `AGENTS.md` |

> All AI subagents MUST follow this when Firebase is chosen. If TECH_STACK chooses Postgres, this file is inactive.

---

## 1. Read vs Write Split — NON-NEGOTIABLE

| Operation | Path |
|---|---|
| Tenant-scoped list and stream operations | Read through approved client adapters and Firestore Security Rules. |
| Create, update, archive, cancel, settle, or reverse business data | Write only through callable or HTTP Cloud Functions. |
| File upload | Firebase Storage through approved handlers and Storage Rules. |

**Agent rules:**
- Never perform direct Firestore business writes from the client.
- Never invent callable names. Search existing exports and client usage first.
- Every write validates authentication, App Check, tenant, role, permission, payload, and idempotency.
- Direct Firestore reads through approved client adapters are the default for non-ADMIN data retrieval. Do not retain a non-ADMIN callable whose only purpose is fetching and returning stored data (ADR 0015, REQ-CACHE-001).
- Never weaken Rules to enable a direct read. For permission-filtered or joined sensitive data, create a server-written, tenant-scoped, audience-safe projection and authorize that exact projection by role before the client reads it.
- Keep ADMIN reads server-side. A callable may remain for a trusted mutation, provider integration, or domain computation that must remain server-authoritative; it must not be a thin data-fetch proxy.

## 2. Callable Naming

- Use `<module>-<action>` for callable names.
- Keep names stable after publication.
- External provider HTTP endpoints use explicit versioned paths.

## 3. Security Rules — Never Weaken

- Deny access by default.
- Scope tenant reads through active-membership Rules. A Staff membership document is private to its user; Owner Staff listings read only the bounded `staffDirectory` projection, which excludes PIN hashes and permission internals.
- Keep the Tenant's receiving bank account server-written. The Tenant's `vietQr` map decides where a shop's money goes, so only an Owner/ADMIN-audited server command writes it and no client writes it at all (REQ-PAY-005, ADR 0022).
- Keep the area scope honest. `tenants/{tenantId}/tableAreas/{areaId}` is readable by the Owner and ADMIN and written only by the server; `tables.areaWaiterUids` and `members.assignedAreas` are server-written projections of it. `tables` is readable by the Owner/ADMIN in full, by an active member with no assignment in full, and by an assigned member only through `where('areaWaiterUids','array-contains',uid)` — an unconstrained listener is denied, so another area's tables never reach the device (REQ-TBL-004, REQ-TBL-010, ADR 0025). Missing projections are read with `.get(key, default)` because an absent key raises a rules evaluation error.
- Keep a table's live service counters server-written. `activeOrderCount`, `readyOrderCount`, `unsettledOrderCount`, and `oldestActiveOrderAt` on `tenants/{tenantId}/tables/{tableId}` are readable by any active member so every role's floor plan is live, and `write: if false` so no client can set a table's state (REQ-TBL-008, ADR 0023).
- Keep the schedule Owner-only and each Staff member's own. `shifts` and `attendance` are server-written (`write: if false`). The Owner and ADMIN read the tenant's records; a Staff member reads only rows whose `staffUid` is their uid, so a listener must carry `where('staffUid','==',uid)` and an unconstrained listener is denied. Only the Owner schedules or cancels a Shift, and clock in/out instants come from the server, never from the client (REQ-HRM-001, REQ-HRM-004, REQ-HRM-005, ADR 0026).
- Treat `users/{uid}.activeTenantId` as navigation state, not authorization proof.
- Permit table-link reads only at `publicTableLinks/{token}`.
- Permit Customer and cashier menu reads only from tenant `publicMenuItems` projections; private `menuItems` carrying cost/recipe/stock fields are Owner/Kitchen-only.
- Permit Customer tracking reads only at `publicOrderTracking/{trackingToken}`.
- Never add unconditional business-data reads or writes.
- UI gates and server gates must match. Server gates remain authoritative.

## 4. Firestore Transactions — All Reads Before Writes

- Complete all transaction reads before transaction writes.
- Use transactions for inventory, cancellation, Loyalty, payment, refund, and reversal invariants.
- Make transaction handlers idempotent because Firestore can retry transaction functions.

## 5. Tenant Scoping

- Every tenant-owned path starts below `tenants/{tenantId}`.
- Every callable derives and validates the active membership independently.
- ADMIN bypass is explicit, server-verified, and automatically audited by the application.
- A shared in-memory client read cache is permitted only when keys include authenticated UID, tenant ID, path, and query; clear or isolate it on sign-out, account/role/session changes, and tenant switch. The cache is never authorization evidence.

## 6. Client Constraints

- Keep the approved React and TypeScript stack.
- Use bounded Firestore listeners owned and deduplicated by the shared client store; preserve them across route changes and dispose them when auth/tenant context becomes invalid.
- Never let a bounded read hide a tenant's own data. A listener, query, or page limit either covers the tenant's whole set for that view or the screen states the bound; a count, total, or warning is never computed from a partially read set as if it were complete (NFR-DATA-002, REQ-CAT-004, REQ-INV-013, REQ-RPT-005).
- Client cache is in-memory, read-only, identity/tenant scoped, and invalidated after relevant writes or explicit refresh. Cached values may render immediately but never authorize access.
- Never put Firebase Admin credentials, Gemini secrets, or payment secrets in the web client.

## 7. Anti-Patterns — Tester Must Reject

- Business rules implemented only in the UI.
- Direct client writes to business collections.
- Authorization based only on `activeTenantId`.
- Plaintext Staff PIN storage.
- Unbounded listeners or collection-wide scans.
- A bound that hides records without saying so — a menu, ingredient, or report page that silently drops rows, or a floor-plan state derived from a truncated Order window (NFR-DATA-002, ADR 0023).
- A plan limit that exists only in the UI, so a tenant exceeds what it pays for (REQ-SUB-002).
- Payment posting without signature verification and idempotency.
- Routing a shop's settlement into an account the Tenant does not own (REQ-PAY-006, ADR 0022).
- Secrets committed to Git.

## 8. Traceability

| Rule area | SRS link |
|---|---|
| Tenant membership and isolation | REQ-TEN-001, NFR-SEC-001 |
| Server-only business writes | CON-002, REQ-ACL-001 |
| Transactions and idempotency | REQ-INV-001, REQ-PAY-001, REQ-PAY-002 |
| Public ordering protection | NFR-SEC-002 |
| ADMIN access | REQ-ADM-001, NFR-PRIV-001 |
