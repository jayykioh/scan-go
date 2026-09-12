# TECH_STACK — ScanGo

| Field | Value |
|---|---|
| Document ID | TECH-SCANGO-001 |
| Version | 1.0 |
| Date | 2026-09-12 |
| Companion to | `SRS.md` §3 |
| Status | Approved foundation |
| Source template | `~/.config/opencode/docs-template/TECH_STACK.template.md` |

**SRS wins if these documents disagree.** DECIDED choices require an ADR-backed amendment.

## 1. How to read
`SRS.md §3` summarizes architecture. This document binds implementation choices. Every choice serves approved requirements.

## 2. Stack at a glance

| Layer | Choice | Status | Serves REQ |
|---|---|---|---|
| Web | React 19, TypeScript 5.8, Vite 6, React Router 7, Tailwind CSS 4 | DECIDED | REQ-ORD-001, REQ-ONB-001, REQ-I18N-001 |
| Mobile | Responsive web only; no native application | DECIDED | REQ-ORD-001, NFR-UX-001 |
| Hosting | Firebase Hosting | DECIDED | NFR-PERF-001, NFR-REL-001 |
| API | Cloud Functions for Firebase 2nd gen, TypeScript, Node.js 22 | DECIDED | CON-002, REQ-ORD-002, REQ-PAY-001 |
| Contract | Callable functions for authenticated actions; HTTP for signed provider events | DECIDED | REQ-ACL-001, REQ-PAY-002 |
| Validation | Zod schemas at every function boundary | DECIDED | NFR-SEC-001, NFR-MOD-001 |
| Primary DB | Firebase Firestore Native mode | DECIDED | REQ-TEN-001, REQ-ORD-003, NFR-RT-001 |
| Cache | No server cache in v1; Firestore web persistence for cached menu reads | DECIDED | REQ-ORD-004, NFR-CFG-001 |
| Object storage | Firebase Storage | DECIDED | REQ-CAT-001, NFR-SEC-001 |
| Auth | Firebase Auth phone OTP; server-issued Staff sessions | DECIDED | REQ-AUTH-001, REQ-AUTH-002 |
| Payment | Dynamic VietQR plus manual Cashier confirmation; replaceable automatic adapter | DECIDED | REQ-CAS-001, REQ-PAY-002 |
| AI | Gemini through a server-side read-only adapter | DECIDED | REQ-AI-001, NFR-PRIV-001 |
| Runtime config | Versioned typed `config.ts`, Firestore ADMIN defaults, allowed tenant overrides | DECIDED | REQ-CFG-001, NFR-CFG-001 |
| Observability | Firebase logging; Sentry for P1 web errors | DECIDED | NFR-OBS-001 |
| Analytics | Firebase Analytics with privacy review before production | DECIDED | NFR-PRIV-001 |
| Infrastructure | Firebase CLI and checked-in deployment configuration | DECIDED | NFR-REL-001, NFR-CFG-001 |
| CI/CD | GitHub Actions | DECIDED | NFR-SEC-001, NFR-MOD-001 |
| Test services | Firebase Emulator Suite plus web unit and end-to-end runners | DECIDED | NFR-SEC-001, NFR-MOD-001 |

Only `docs/RULES_FIREBASE.md` is active for the database-specific rules.

## 3. Client Tier
- Keep the existing React application and routes.
- Add module boundaries without replacing the approved framework.
- Use responsive web behavior for Customer, Staff, Solo, Owner, and ADMIN.
- Load `vi` and `en` interface catalogs. Keep Owner menu text unchanged.
- Use Firestore listeners only through bounded, tenant-scoped query adapters.
- Use web audio after user interaction and provide a persistent mute setting.

## 4. API and Compute
- Use Cloud Functions 2nd gen in `us-central1` initially.
- Use platform defaults for memory, timeout, and concurrency until measured evidence supports changes.
- Keep runtime options in deployment configuration. Do not expose them as tenant settings.
- Validate auth, App Check, tenant, role, permissions, payload, transitions, and idempotency for every write.
- Use callable functions for application commands.
- Use HTTP endpoints only for signed external provider events.
- Keep function handlers thin and delegate to independently testable modules.

## 5. Data Tier

### 5.1 Firestore
- Use `tenants/{tenantId}/...` for tenant-owned collections.
- Use `tenants/{tenantId}/members/{uid}` as the membership and permission source.
- Keep `activeTenantId` in the user profile as navigation state, not authorization proof.
- Permit direct client reads only through deny-by-default Security Rules.
- Permit no direct client business writes. Use Cloud Functions.
- Use transactions for inventory deductions, cancellation restoration, Loyalty changes, payment posting, and reversal.
- Store immutable price and Cost snapshots on orders.
- Use append-only audit events and compensating payment records.

### 5.2 Reporting
- Build deterministic tenant-scoped aggregates from paid orders.
- Reconcile report totals against immutable orders and payments.
- Do not add a separate reporting store before measured need.

### 5.3 Cache and rate limits
- Use no Redis in v1.
- Use Firestore offline persistence only for cached Customer menu viewing.
- Enforce public-order limits through Cloud Functions and configuration.

### 5.4 Object storage
- Store menu images in Firebase Storage under tenant-scoped paths.
- Validate content type and size before accepting metadata.
- Use Storage Rules that match tenant membership and public menu projection needs.

## 6. Configuration, Jobs, and Durable Work
- A typed `config.ts` defines validated defaults.
- Default PIN length is six digits.
- Default failed PIN attempts are five.
- Default PIN lock time is 15 minutes.
- Default data retention is five years.
- Default backup schedule is daily with 30-day retention.
- ADMIN settings may override product defaults through Firestore.
- Allowed tenant settings override ADMIN product defaults.
- Scheduled Cloud Functions handle retention, archival, and report maintenance.
- Payment callbacks use idempotency keys and transaction-backed posting.

## 7. Open Decisions

| State | Decision |
|---|---|
| Q-n = 0 OPEN | The Founder approved all foundation choices on 2026-09-12. |

## 8. Version Pinning
- Keep exact versions in `package-lock.json`.
- Current web baseline: React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4.
- Backend baseline: Node.js 22 and Cloud Functions 2nd gen.
- Add Firebase, Zod, i18n, test, and Sentry versions only during their approved implementation phase.

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-09-12 | Initial approved foundation from frontend evidence and Founder decisions. |
