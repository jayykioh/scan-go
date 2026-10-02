# ScanGo — Current Project Status

**Audit date:** 2026-10-01  
**Branch:** `release/mvp`  
**Current architecture:** React 19 + TypeScript + Vite frontend on Firebase (Auth, Firestore, Cloud Functions, Storage)

## Executive summary

M1/P0, M2/P1, and the M3/P2 baseline are implemented with a Firebase backend, tenant-scoped Security Rules, and server-only business writes. The initial React mockup is now wired to server callables and Firestore listeners.

Relative assessment:

- Frontend/UI: **90%**. Core flows are server-backed; a few demo fallbacks remain.
- Backend/database: **85%**. Auth, Tenant, Config, Catalog, Table Access, Ordering, Inventory, Fulfilment, Payment, Reporting, Feedback, AI, Workforce, Promotion, Loyalty, and Subscription have callables, contract tests, emulator tests, and Rules.
- Production-ready MVP: **70–80%**. Remaining gaps are device/provider integrations and acceptance artifacts.

These percentages are engineering estimates for planning, not automated metrics.

## Verification

- `npm run test`: 36 files, 199 web/shared tests pass.
- `npm --workspace functions run test`: 32 files, 342 tests pass.
- `npm run test:rules`: 17 files, 100 Security Rules tests pass (Firestore and Storage emulators).
- `npm run test:emulator`: 38 files, 224 Functions Emulator callable tests pass (Auth, Firestore, Functions emulators).
- `npm run typecheck`, `npm run typecheck:functions`, `npm run lint`, `npm run lint:functions`, `npm run build`: pass.
- Java is required for the Firestore emulator.

## Implemented (M1, M2, M3 baseline)

- **Auth/Tenant:** Owner email/password, first and additional Tenant, membership list, active-Tenant switch, Staff PIN with lockout and sessionVersion, server ACL, privacy filtering, ADMIN delegation with audit.
- **Config:** three-layer resolution, allowed-key filtering, versioning, ADMIN platform command, tenant-visible projection.
- **Catalog/Table Access:** menu and template commands, public menu projection, Table create/rename/archive/regenerate, opaque revocable links, QR payload.
- **Ordering/Fulfilment/Inventory/Payment:** server-priced Pay-Later and Pay-First Orders, immutable Orders, public tracking, Kitchen `pending -> cooking -> ready -> served`, one-transaction inventory deduction, dynamic VietQR, idempotent cash/VietQR settlement, reversal, refund, signed payment webhook.
- **Reporting:** paid-order revenue, COGS, gross profit, and rebuildable dailyStats.
- **AI:** provider adapter with usage and budget, grounded weekly insights, open Q&A, feedback grouping, campaign suggestions with Owner approval, and a TypeSafe Jev evaluation seam (ADR 0008).
- **Feedback/Workforce:** feedback submit and verification, feedback ticket workflow, shift schedule, clock in/out with correction approval (no payroll), stock count and loss review.
- **Promotion/Loyalty/Subscription:** deterministic promotion, append-only loyalty ledger, plan entitlements.
- **Observability:** Sentry monitoring for the frontend and Cloud Functions.
- **i18n:** typed `vi`/`en` catalog with server locale profile.

## Partial or pending

| Area | Current behavior | Missing |
|---|---|---|
| NFC | Server provision/revoke/resolve with opaque tokens | Physical NDEF device write/read |
| Loyalty | Server-verified earn/redeem/reverse | SMS/Zalo code delivery provider |
| Payment | Signed provider adapter and webhook | Production provider secret and live transport |
| i18n | Typed catalog, Customer and Settings wired | A few OwnerView error strings |
| Usability evidence | Automated timing harness and budget assertions | Separate timed usability study artifact |
| PWA | Manifest | Service worker and offline caching |
| AI live | Adapter and evaluation | Live provider secret; default stays deterministic |

## Not implemented (out of scope)

- Reservations (DEFERRED, ADR 0009), payroll, ingredient purchasing, delivery, printers, tax invoices, native applications, and enterprise features.

## Architecture decision

Keep React/Vite and Firebase:

- React/Vite for the customer PWA and dashboards.
- Firebase Auth for internal actors.
- Firestore for tenant-scoped realtime data.
- Cloud Functions 2nd gen for trusted business logic.
- Security Rules to block unauthorized and direct writes.
- Cloud Scheduler for daily stats, weekly analysis, retention, and expired sessions.

## Next milestones

1. Complete device and provider integrations (NFC NDEF, loyalty code delivery, live payment provider).
2. Add the timed usability study artifact and finish PWA offline caching.
3. Run a production deployment rehearsal with a real Firestore project and secrets.
