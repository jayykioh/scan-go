# ScanGo — Current Project Status

**Audit date:** 2026-10-06  
**Branch:** `release/mvp`  
**Current architecture:** React 19 + TypeScript + Vite frontend on Firebase (Auth, Firestore, Cloud Functions, Storage)

## Executive summary

M1/P0, M2/P1, and the M3/P2 baseline are implemented with a Firebase backend, tenant-scoped Security Rules, and server-only business writes. The initial React mockup is now wired to server callables and Firestore listeners.

Relative assessment:

- Frontend/UI: **90%**. Core flows are server-backed; `/simulator` stays a demo surface on `src/mockData.ts`.
- Backend/database: **85%**. Auth, Tenant, Config, Catalog, Table Access, Ordering, Inventory, Fulfilment, Payment, Reporting, Feedback, AI, Workforce, Promotion, Loyalty, and Subscription have callables, contract tests, emulator tests, and Rules.
- Production-ready MVP: **70–80%**. Remaining gaps are device/provider integrations and acceptance artifacts.

These percentages are engineering estimates for planning, not automated metrics.

## Verification

Measured on 2026-10-06. Every suite below is green, and all four run in CI
(`.github/workflows/ci.yml`).

- `npm --workspace functions run test`: 44 files, 477 tests pass.
- `npm run test`: 38 files, 220 web/shared tests pass.
- `npm run test:rules`: 18 files, 120 Security Rules tests pass (Firestore and Storage emulators).
- `npm run test:emulator`: 40 files, 248 Functions Emulator callable tests pass (Auth, Firestore, Functions emulators).
- `npm run typecheck`, `npm run typecheck:functions`, `npm run lint`, `npm run lint:functions`, `npm run build:functions`, `npm run build`: pass.
- Java 21+ is required for the Firestore emulator; the CI `emulator` job installs it.

The emulator suites are hermetic. No suite depends on a provider secret: the AI
tests pin the deterministic provider in their own seed, so a `GEMINI_API_KEY`
present on a developer machine cannot change a result or incur provider spend.

## Implemented (M1, M2, M3 baseline)

- **Auth/Tenant:** Owner email/password, first and additional Tenant, membership list, active-Tenant switch, Staff PIN with lockout and sessionVersion, server ACL, privacy filtering, ADMIN delegation with audit.
- **Config:** three-layer resolution, allowed-key filtering, versioning, ADMIN platform command, tenant-visible projection.
- **Catalog/Table Access:** menu and template commands, public menu projection, Table create/rename/archive/regenerate, opaque revocable links, QR payload.
- **Ordering/Fulfilment/Inventory/Payment:** server-priced Pay-Later and Pay-First Orders, immutable Orders, public tracking, Kitchen `pending -> cooking -> ready -> served`, one-transaction inventory deduction, dynamic VietQR, idempotent cash/VietQR settlement, reversal, refund, signed payment webhook.
- **Reporting:** paid-order revenue, COGS, gross profit, and rebuildable dailyStats.
- **AI:** provider adapter with usage and budget, grounded weekly insights, open Q&A, feedback grouping, campaign suggestions with Owner approval, and a TypeSafe Jev evaluation seam (ADR 0008).
- **Feedback/Workforce:** feedback submit and verification, feedback ticket workflow, shift schedule, clock in/out with correction approval (no payroll), stock count and loss review.
- **Product feedback (added 2026-10-08):** any signed-in member reports a bug, usability problem, or feature request about ScanGo with up to three screenshots uploaded to `tenants/{tenantId}/feedbackAttachments/{uid}/`; the Owner inbox at `/dashboard/feedback` triages it with an append-only history (REQ-FDB-004, REQ-FDB-005, REQ-FDB-006).
- **Promotion/Loyalty/Subscription:** deterministic promotion, append-only loyalty ledger, plan entitlements.
- **Observability:** Sentry monitoring for the frontend and Cloud Functions.
- **i18n:** typed `vi`/`en` catalog with server locale profile.
- **Access control:** Security Rules gate money, Cost, and customer personal data
  by membership *and* role. `payments` needs Owner or Cashier, `ingredients`,
  `recipes`, `stockMovements`, and `stockCounts` need Owner or Kitchen,
  `dailyStats`, `aiUsage`, `aiInsights`, `feedback`, and `feedbackTickets` are
  Owner-only. Storage writes accept an explicit raster image allowlist.
- **Durable work:** every scheduled job has a retry policy and reports a failed
  run instead of swallowing the error, so Cloud Scheduler retries and the
  failure is searchable (NFR-OBS-001).

## Partial or pending

| Area | Current behavior | Missing |
|---|---|---|
| NFC | Server provision/revoke/resolve with opaque tokens | Physical NDEF device write/read |
| Loyalty | Server-verified earn/redeem/reverse | SMS/Zalo code delivery provider |
| Payment | Signed provider adapter and webhook | Production provider secret and live transport |
| i18n | Typed catalog, Customer and Settings wired | Hardcoded strings in OwnerView, InventoryPanel, MenuPage |
| Usability evidence | Automated timing harness and budget assertions | Separate timed usability study artifact |
| PWA | Manifest | Service worker and offline caching |
| AI live | Adapter and evaluation | Live provider secret; default stays deterministic |
| Deploy pipeline | Manual scripts for rules, storage, indexes, and functions | No staged/production promotion or rollback gate |
| NFR-RT-001 | Bounded listeners and a two-second contract | No measured end-to-end latency harness |

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

## Usability review — 2026-10-08

Playwright was used to drive the real user workflows and record evidence; the findings,
screenshots, and a competitor comparison live in
`docs/feedback/comparative-review-2026-10.md`. Two defects found there are open and are the
highest-value fixes:

- A hard reload leaves the Menu and Table lists empty with no error, because the Firestore
  listeners give up while Firebase Auth is still restoring the session.
- The `/simulator` demo surface cannot complete a customer order, and its Kitchen and Cashier
  screens show a raw English permission error.

The new product-feedback channel added in the same pass is the intended way to collect this
kind of report from operators from now on.

## Next milestones

1. Complete device and provider integrations (NFC NDEF, loyalty code delivery, live payment provider).
2. Add the timed usability study artifact and finish PWA offline caching.
3. Run a production deployment rehearsal with a real Firestore project and secrets.
4. Add a staged/production promotion gate so `deploy:*` cannot target production
   from an arbitrary branch, and move the project id out of `package.json`.

## Correctness pass — 2026-10-06

Closed in this pass, each verified by re-running the affected suite:

- The three failing Functions Emulator tests are fixed. Two asserted a
  `rule-based` provider while the three-layer Config default is `gemini`
  (ADR 0008), so they now pin the deterministic provider in their own seed and
  are hermetic. The third asserted that Kitchen is denied inventory writes,
  which ADR 0013 deliberately reversed; it now asserts the documented rule.
- CI runs the Functions unit suite, the Security Rules suite, and the Functions
  Emulator suite, with a JDK installed for the Firestore emulator.
- Security Rules gate sensitive collections by role, not membership alone, and
  `isAdmin()` no longer raises an evaluation error when the token has no claim.
- Storage Rules accept a raster image allowlist instead of `image/.*` and deny
  client deletes explicitly.
- `callableAuthAuthorizeStaff` enforces App Check like every other auth callable.
- Scheduled jobs log, capture, and surface per-tenant failures with a retry policy.
- `.pw-cache/` (37 MB) and `.playwright-cli/` are untracked and ignored.
