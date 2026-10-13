# ADR 0015 — Direct Firestore reads and shared client cache

- Status: Accepted; implementation in progress under REQ-CACHE-001
- Original decision date: 2026-10-02
- Serves: REQ-RPT-001, REQ-PRO-001, REQ-LOY-001, NFR-SEC-001, REQ-CACHE-001

## Context

The original decision moved Reporting daily stats, Promotion definitions, and Loyalty configuration to direct Firestore reads when Security Rules permit the caller to read the complete returned data. Other non-ADMIN reads stayed on callables when they filtered fields or read collections denied to clients. Separate screens could also start duplicate reads or listeners when revisited.

## Decision

1. **Direct reads are the default for non-ADMIN data retrieval.** Use approved client adapters and Firestore Security Rules for tenant/user-scoped reads. Do not keep a non-ADMIN callable whose only responsibility is fetching and returning stored data. ADMIN reads remain server-side.
2. **Preserve least privilege.** Never weaken Rules or expose an entire sensitive document to enable a direct read. When a read currently filters fields or joins permission-sensitive data, create a server-written, tenant-scoped, audience-safe projection (or equivalent Rules-enforceable shape) containing only fields that audience may see. Client queries and projections must preserve the existing role and tenant boundaries.
3. **Keep trusted work on the server.** Business writes remain callable/HTTP server operations. Callables may remain for mutations, provider integrations, or domain computations that must be server-authoritative; they must not be thin data-fetch proxies. Direct client business writes remain denied.
4. **Use one app-lifetime in-memory read cache.** A shared singleton/repository owns non-ADMIN query state across screen unmounts. Cache keys include authenticated UID, tenant ID, data path, and query parameters. Reopening a screen in the same valid context reuses cached data and an existing listener instead of starting duplicate reads/listeners.
5. **Isolate and invalidate cached data.** Live query entries update from one shared listener. Relevant successful server commands and explicit refresh invalidate or update affected entries. Sign-out, account/role/session change, or tenant switch must clear or isolate entries before rendering the new context. Cached data is a display optimization, never authorization evidence.
6. **Retain bounded reads and listener lifecycle.** Queries remain bounded and tenant-scoped. Listeners are disposed when their authenticated or tenant context becomes invalid, not merely because one screen unmounts.

## Consequences

- `src/data/firestoreRead.ts` remains the single home for one-shot direct queries; the shared cache/store owns reusable query results and shared listeners.
- Sensitive reads still on callables (including Orders, phone-filtered Loyalty data, Inventory reports, resolved Config, and membership lists) require an audience-safe client-readable projection and Rules/tests for each permitted role. Owner Staff listing now uses the PIN-free `staffDirectory` projection with Owner-only Rules.
- ADMIN-only reads stay on their server callables and are excluded from the non-ADMIN cache.
- Read-only callable removals happen only after direct-read coverage and authorization tests pass. Server-authoritative calculations and write commands are not converted into client writes.
- Acceptance and traceability are defined by REQ-CACHE-001 in `docs/SRS.md`; `docs/RULES_FIREBASE.md` and Firestore Rules implement the same boundary.

## Remaining callable reads (explicit exceptions)

These reads intentionally stay on callables until a projection is designed; each is either a trusted computation or needs a new server-written projection and matching Rules:

| Callable | Why it stays server-side |
|---|---|
| `callableOrderListKitchen`, `callableFulfilmentListReady`, `callableOrderListUnpaid`, `callableOrderListTableStatus` | `orders` is denied to every client; a projection would drift from live Order state (ADR 0018). |
| `callableLoyaltyListMembers` | Customer phone values need server field-level filtering by role/permission (NFR-PRIV-001). |
| `callableConfigGetResolved` | Resolves layered defaults from `platform/config`, which is ADMIN-only by design (ADR 0003). |
| `callableInventoryChangeReport`, `callableCatalogListAvailability` | Derived stock/Cost reporting over server-written movements. |
| `callableTenantListMemberships`, `callableTenantOnboardingGet` | Navigation/membership state; needs a `users/{uid}`-scoped projection. |
| `callableProductFeedbackList` | Listing needs a bounded, role-scoped projection. |

Removed as thin data-fetch proxies under this ADR: `callableStaffList` (replaced by `staffDirectory`), `callablePromotionList`, `callableLoyaltyGetConfig`, `callableReportingGetSummary`, and the dead client wrapper `fetchPromotions`.
