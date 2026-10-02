# SRS — ScanGo

| Field | Value |
|---|---|
| Document ID | SRS-SCANGO-001 |
| Version | 1.2 |
| Date | 2026-09-30 |
| Status | Approved foundation with insight and growth amendment |
| Companion to | `TECH_STACK.md`, `RULES.md`, `RULES_FIREBASE.md`, `docs/adr/` |
| Source template | `~/.config/opencode/docs-template/SRS.template.md` |

---

## 1. Introduction

### 1.1 Purpose
ScanGo is a contactless ordering and shop-management product for Vietnamese F&B shops with 5–15 tables. It gives Customer a fast QR and NFC order flow. It gives Owner clear cost and profit information without accounting knowledge. It separates Owner, Cashier, Kitchen, Waiter, Staff, Solo, and ADMIN permissions. This SRS is the contractual source for design, implementation, QA, and acceptance.

### 1.2 Scope — In / Out

| Area | Included in v1 |
|---|---|
| Shop types | Quán ăn, quán cà phê, tiệm bánh, trà sữa, nhà hàng |
| Customer ordering | QR, NFC, menu, cart, Pay-First, Pay-Later, tracking |
| Shop operations | Menu, ingredients, recipe, tables, order lifecycle, Staff |
| Payment | Cash and dynamic VietQR with Cashier confirmation |
| Insights | Reports, cost, gross profit, popular items, AI assistant |
| Insight extended (M2) | Weekly AI analysis, open Owner Q&A, traceable citations, AI cost budget |
| Customer feedback (M2) | Reviews, issue tickets, AI topic grouping, improvement tracking |
| Workforce (M3) | Shift schedule, clock in/out, correction with approval. No payroll. |
| Inventory count (M3) | Stock count, waste and adjustment recording, variance review for loss analysis |
| Growth | Loyalty, promotions, Free, Lite, and Pro subscription |
| Platform operations | ADMIN tenant access and global configuration |
| Reservations (deferred) | Not in M1–M3. See §4.11. |

**Pilot segments:** the first pilots are coffee and tea shops and kitchen shops. Other F&B models stay in scope but are not first.

**Out of scope for v1:** Enterprise, delivery, printers, tax invoices, payroll, ingredient purchasing as a procurement system, native mobile applications, table reservations, and unspecified future integrations.

### 1.3 Definitions

| Term | Definition |
|---|---|
| Tenant | One isolated shop workspace with its own data, settings, Staff, and subscription. |
| Owner | A user who owns or manages one or more tenants. |
| Staff | A tenant member assigned one or more Cashier, Kitchen, or Waiter roles. |
| Solo | A combined Owner, Cashier, and Kitchen workflow for one-person operation. |
| ADMIN | The ScanGo system owner with unrestricted access to all tenants and platform settings. |
| Table link | A revocable public token that identifies one tenant table for QR and NFC access. |
| Order lifecycle | `pending → cooking → ready → served → paid`, with controlled cancellation and reversal. |
| Pay-First | Kitchen receives an order only after payment confirmation. |
| Pay-Later | Kitchen receives an order before Cashier settles payment. |
| Cost | Recipe-based ingredient cost for an ordered menu item. |
| Gross profit | Paid revenue minus deterministic recipe-based Cost. |
| Weekly analysis | A scheduled per-tenant AI run that ranks operational issues by department. |
| Insight | One reviewed finding with priority, period, source data, confidence, and suggested action. |
| Feedback ticket | A Customer review or issue, linked to an Order only when verifiable, tracked to resolution. |
| Shift | A scheduled work period for one Staff member on one date. |
| Stock count | A recorded physical quantity that supports variance and loss analysis. |
| Reservation | A Customer request for a future visit. Deferred by ADR 0009 and not part of v1 order flow. |

### 1.4 References
- `docs/context.md`
- `docs/features.md`
- `docs/architecture.md` for historical context only; this SRS supersedes conflicts.
- Firebase documentation cited in `research/firestore-foundation.md`.
- Vietnam personal-data requirements require legal verification before production release.

### 1.5 Requirement conventions
- IDs are stable and never reused.
- P0 is an M1 blocker. P1 targets M2. P2 targets M3. P3 is roadmap scope.
- MUST, SHOULD, and MAY follow RFC 2119.
- Money uses integer VND. Time is stored in UTC and rendered with the tenant timezone.

---

## 2. Overall Description

### 2.1 Product perspective
The repository contains a frontend prototype with local browser persistence. The target product replaces every simulated flow with authenticated Firebase services. ScanGo owns tenant data, ordering, permissions, reports, and subscription behavior. It integrates with VietQR and Gemini behind replaceable module contracts.

### 2.2 User classes

| # | Persona | Primary needs | Skill |
|---|---|---|---|
| 1 | Customer | Open a table menu and submit an order quickly | Low |
| 2 | Owner | Configure the shop and understand revenue, Cost, and gross profit | Low |
| 3 | Cashier | Settle or cancel orders and manage Loyalty | Low |
| 4 | Kitchen | Process orders and control stock | Low |
| 5 | Waiter | Find ready orders and mark them served | Low |
| 6 | Staff | Use only assigned tenant roles and permissions | Low |
| 7 | Solo | Run one shop from one combined view | Low |
| 8 | ADMIN | Operate tenants, subscriptions, and global settings | Expert |

### 2.3 Operating environment
- Responsive web application.
- Latest two major Chrome and Safari versions.
- Mobile-first Customer experience and desktop/tablet Staff experience.
- Vietnamese and English user interface.
- No native mobile application in v1.

### 2.4 Constraints (CON)
- **CON-001:** Every business record MUST belong to one tenant.
- **CON-002:** All business writes MUST use Cloud Functions and server authorization.
- **CON-003:** Paid orders and payment records MUST use reversal or refund, not hard deletion.
- **CON-004:** Money MUST use integer VND with deterministic calculations.
- **CON-005:** Modules MUST expose explicit contracts and MUST NOT own another module's state.
- **CON-006:** The checked-in `config.ts` supplies typed defaults. ADMIN and tenant settings may override allowed values.
- **CON-007:** Cloud Functions runtime options remain deployment configuration, not tenant configuration.

### 2.5 Assumptions (AS)

| ID | Assumption | Impact if false |
|---|---|---|
| AS-001 | Shops have internet for order submission | Customer can only view a cached menu offline. |
| AS-002 | Customer devices can scan QR | Staff must provide the table link manually. |
| AS-003 | NFC-capable devices can open standard web links | QR remains the fallback. |
| AS-004 | Owner supplies accurate cost price, recipe, and ingredient data | Reports and AI assistant show missing-data warnings. |
| AS-005 | Cashier can confirm M1 VietQR transfers | Automatic confirmation waits for M3. |
| AS-006 | Owner records Stock counts for loss analysis | Loss findings state that counts are missing, not a variance value. |
| AS-007 | The default AI provider serves Vietnamese well enough for Owner answers | The system falls back to the default provider or states low confidence. |
| AS-008 | AI provider cost stays within the configured tenant budget | The server stops or degrades AI calls and records the event. |

---

## 3. System Architecture Overview
Use independent Auth, Tenant, Config, Catalog, Inventory, Table Access, Ordering, Fulfilment, Payment, Promotion, Loyalty, Reporting, AI, Feedback, Workforce, Subscription, and ADMIN modules. Each module owns its data and public contract. The AI module reads other module outputs and calls one replaceable AI provider adapter; it never writes another module's state. Refer to `TECH_STACK.md §2`; this SRS wins on conflict.

---

## 4. Functional Requirements

### 4.1 Auth, tenant, and access
- **REQ-AUTH-001 (P0) MUST** register and authenticate Owner by email and password. **Acceptance:** Given a new email and password, when Owner registers, then the system creates the Owner profile and first Tenant; given valid credentials, when Owner signs in, then the system starts an authenticated session.
- **REQ-TEN-001 (P0) MUST** let one user belong to multiple tenants and select `activeTenantId`. **Acceptance:** Given two memberships, when the user switches tenant, then data and permissions change without cross-tenant leakage.
- **REQ-AUTH-002 (P0) MUST** authenticate Staff with a tenant-scoped PIN policy from configuration. **Acceptance:** Given the default six-digit policy, when five invalid attempts occur, then access locks for 15 minutes and an audit event exists.
- **REQ-ACL-001 (P0) MUST** enforce role defaults and Owner-reduced permissions on the server. **Acceptance:** Given a Staff permission is absent, when Staff calls that operation, then the server denies it despite any UI state.
- **REQ-ADM-001 (P0) MUST** give ADMIN unrestricted tenant and platform access. **Acceptance:** Given an ADMIN session, when ADMIN opens or changes any tenant, then the operation succeeds without an approval prompt; every ADMIN change records an automatic audit event and ADMIN reads are not audited (ADR 0010).

### 4.2 Onboarding and configuration
- **REQ-ONB-001 (P0) MUST** guide Owner through shop name, industry, plan, payment mode, tables, and menu. **Acceptance:** Given a new tenant, when each item is complete, then the checklist marks it complete and shows the next incomplete item.
- **REQ-ONB-002 (P0) MUST** support completion of the standard onboarding flow within 15 minutes. **Acceptance:** Given a prepared Owner and valid inputs, when Owner follows the checklist, then all required steps can finish within 15 minutes.
- **REQ-CFG-001 (P0) MUST** apply configuration in this order: typed `config.ts`, ADMIN settings, then allowed tenant settings. **Acceptance:** Given three values for one setting, when the system resolves it, then the allowed tenant value wins and the source is inspectable.

### 4.3 Catalog and inventory
- **REQ-CAT-001 (P0) MUST** let Owner create, edit, archive, search, categorize, price, describe, image, and stock menu items. **Acceptance:** Given valid item data, when Owner saves it, then Customer sees the tenant-scoped result within two seconds.
- **REQ-CAT-002 (P0) MUST** support modifiers and five approved industry templates. **Acceptance:** Given a selected template, when Owner initializes a menu, then suitable categories and editable items appear without affecting another tenant.
- **REQ-INV-001 (P0) MUST** let Owner manage ingredients, stock, recipes, and recipe quantities. **Acceptance:** Given a recipe, when an order starts cooking, then one transaction deducts the configured ingredient quantities.
- **REQ-INV-002 (P0) MUST** restore eligible ingredients after an unpaid order cancellation. **Acceptance:** Given a previously deducted unpaid order, when Cashier cancels it, then one transaction restores each deduction exactly once.

### 4.4 Tables, QR, and NFC
- **REQ-TBL-001 (P0) MUST** let Owner create, rename, archive, and regenerate tenant tables and QR table links. **Acceptance:** Given a regenerated link, when Customer opens the old link, then access fails; the new link opens only its table menu.
- **REQ-NFC-001 (P2) SHOULD** let the same table link open through a programmed NFC tag. **Acceptance:** Given a supported NFC device, when Customer taps the tag, then the same menu and table context open as QR.

### 4.5 Customer ordering
- **REQ-ORD-001 (P0) MUST** let Customer browse, search, filter, select modifiers, and manage a cart without an account. **Acceptance:** Given a valid table link, when Customer changes cart quantities, then totals use current menu prices and integer VND.
- **REQ-ORD-002 (P0) MUST** support Pay-First and Pay-Later submission. **Acceptance:** Given Pay-First, when payment is unconfirmed, then Kitchen receives nothing; given Pay-Later, submission creates `pending` immediately.
- **REQ-ORD-003 (P0) MUST** track `pending`, `cooking`, `ready`, `served`, and `paid` in real time. **Acceptance:** Given a valid transition, when Staff changes status, then authorized views update within two seconds.
- **REQ-ORD-004 (P0) MUST** block order submission offline while allowing an already cached menu view. **Acceptance:** Given no connection, when Customer submits, then no order is created and the interface shows the connection problem.
- **REQ-PRO-001 (P2) SHOULD** apply configured automatic promotions deterministically. **Acceptance:** Given an eligible cart, when totals are calculated, then one documented promotion result appears consistently on client and server.

### 4.6 Kitchen, Waiter, Cashier, and Solo
- **REQ-KDS-001 (P0) MUST** let Kitchen move orders from `pending` to `cooking` to `ready` and mark items unavailable. **Acceptance:** Given an authorized Kitchen session, when status or stock changes, then Customer and Staff views update within two seconds.
- **REQ-NOT-001 (P0) MUST** provide visual and audible Kitchen and Waiter notifications with a mute control. **Acceptance:** Given sound is enabled, when a relevant new order or ready event arrives, then one visible and audible notification occurs.
- **REQ-WAI-001 (P0) MUST** let Waiter view ready orders and mark them `served` only. **Acceptance:** Given a ready order, when Waiter confirms service, then status becomes `served`; payment and menu operations remain denied.
- **REQ-CAS-001 (P0) MUST** let Cashier view unpaid orders, confirm cash, and confirm dynamic VietQR payments manually. **Acceptance:** Given verified payment, when Cashier confirms it, then status becomes `paid` once and the payment record is immutable.
- **REQ-CAS-002 (P0) MUST** let Cashier cancel any unpaid order with a reason. **Acceptance:** Given an unpaid order, when Cashier confirms cancellation, then fulfilment stops, inventory restores once, and an audit event records the reason.
- **REQ-PAY-001 (P0) MUST** correct paid orders only through reversal or refund. **Acceptance:** Given a paid order, when an authorized user corrects it, then the original remains and a linked compensating record is created.
- **REQ-SOLO-001 (P1) SHOULD** combine authorized Owner, Cashier, and Kitchen actions in one view. **Acceptance:** Given an authorized Solo session, when Solo changes an order, then the same module rules and audit behavior apply.

### 4.7 Loyalty, reports, AI, and subscription
- **REQ-LOY-001 (P2) SHOULD** support configurable point earning and verified-phone redemption. **Acceptance:** Given the default one point per 10,000 VND, when a paid order posts, then points update once; redemption requires valid phone verification.
- **REQ-RPT-001 (P1) SHOULD** report paid revenue, Cost, gross profit, popular items, and table stats by day, week, and month. **Acceptance:** Given paid orders and complete recipes, when Owner selects a period, then each result reconciles to underlying records.
- **REQ-RPT-002 (P1) SHOULD** maintain rebuildable daily stats keyed by tenant-local `yyyymmdd`. **Acceptance:** Given order, payment, cancellation, reversal, or refund events, when their transactions commit, then daily counters update exactly once and reconcile to source records.
- **REQ-AI-001 (P1) SHOULD** provide read-only warnings for loss, low profit, and low ingredient stock. **Acceptance:** Given sufficient data, when Owner asks, then AI cites inputs and formulas; missing data produces a warning, not an invented value.
- **REQ-AI-002 (P1) SHOULD** run a scheduled weekly analysis for each tenant in tenant time. **Acceptance:** Given a completed week, when the schedule runs, then the tenant receives a bounded Insight list with department, priority, period, source, confidence, and missing-data notes.
- **REQ-AI-003 (P1) SHOULD** answer Owner questions from authorized tenant data only and state the data update time. **Acceptance:** Given an authorized question, when data exists, then the answer cites the source and period; given missing data, then the answer states the gap and does not invent a value.
- **REQ-AI-004 (P1) MUST** call one replaceable AI provider adapter and record provider, model, tokens, and cost per call. **Acceptance:** Given a provider change in Config, when analysis runs, then no other module changes and each call records provider, model, and cost.
- **REQ-AI-005 (P1) MUST** enforce a per-tenant AI cost budget from Config. **Acceptance:** Given a tenant at budget, when a new AI call starts, then the server rejects or degrades the call and records an audit event.
- **REQ-AI-006 (P1) MUST NOT** let AI output change permissions, money, prices, or inventory. **Acceptance:** Given an AI suggestion, when a change occurs, then a human-approved deterministic command performs it and an audit event exists.
- **REQ-SUB-001 (P2) SHOULD** enforce Free, Lite, and Pro entitlements through configuration. **Acceptance:** Given a tenant plan, when Owner requests a restricted feature, then server enforcement matches configured plan entitlements.
- **REQ-PAY-002 (P2) SHOULD** support automatic transfer confirmation through a replaceable payment adapter. **Acceptance:** Given a valid signed provider event, when the adapter verifies it, then the matching payment posts exactly once.
- **REQ-I18N-001 (P0) MUST** translate the system interface into Vietnamese and English without translating Owner menu content. **Acceptance:** Given a saved user choice or Customer browser language, when the interface opens, then supported labels use that language and a switch remains available.

### 4.8 Customer feedback
- **REQ-FDB-001 (P1) MUST** let Customer submit a review or issue about an Order or visit. **Acceptance:** Given a submission, when stored, then it is tenant-scoped and marked verified only when a matching Order reference exists.
- **REQ-FDB-002 (P1) SHOULD** group feedback with AI and cite the original text as the source. **Acceptance:** Given a set of feedback, when grouping runs, then each theme cites source feedback IDs and removes unnecessary personal data.
- **REQ-FDB-003 (P2) MUST** track a Feedback ticket through `received`, `in_progress`, and `resolved` with an owner and history. **Acceptance:** Given a ticket change, when saved, then state, actor, time, and reason are recorded.

### 4.9 Workforce and attendance
- **REQ-HRM-001 (P2) MUST** let Owner schedule Shifts per Staff and date. **Acceptance:** Given two overlapping Shifts for one Staff, when saved, then the server rejects the overlap.
- **REQ-HRM-002 (P2) MUST** record clock in and clock out and require approval for a correction. **Acceptance:** Given a wrong time, when Staff requests a correction, then it stays pending until an authorized user approves, and history remains.
- **REQ-HRM-003 (P2) MUST NOT** derive or export payroll. **Acceptance:** Given Shift and attendance data, when any report runs, then no salary, wage, or payroll figure is produced.

### 4.10 Inventory count and loss review
- **REQ-INV-003 (P2) MUST** let Owner record stock-in, a Stock count, waste, and a manual adjustment with a reason. **Acceptance:** Given a Stock count, when saved, then the system computes expected quantity from stock-in, deduction, and restoration, and stores the variance with an audit event.
- **REQ-INV-004 (P2) SHOULD** attribute an unexplained variance to ingredient, item, shift, or time window for AI review. **Acceptance:** Given complete counts, when loss review runs, then each finding cites the count, movements, and period; given missing counts, then the finding states the limitation.

### 4.11 Reservations — DEFERRED
Reservations and pre-ordering are deferred by ADR 0009. They are outside M1–M3 and must not change the v1 Order lifecycle. "Cọc full" means the Customer paid the full value of the ordered items.

| REQ | Phase | Requirement direction |
|---|---|---|
| REQ-RSV-001 | DEFERRED | Customer requests an arrival time, party size, and pre-ordered items. |
| REQ-RSV-002 | DEFERRED | Shop confirms capacity and ingredient availability before the request is accepted. |
| REQ-RSV-003 | DEFERRED | Reservation state, payment state, and preparation state are separate. Payment alone never starts preparation. |

Each deferred REQ needs an approved amendment, acceptance criteria, and a refund and late-arrival policy before any code.

---

## 5. Non-Functional Requirements
- **NFR-PERF-001 (P0) MUST** load a Customer menu within two seconds at p95 on a representative 4G profile. **Acceptance:** Given the test profile, when 100 production-like menu loads run, then p95 is at most two seconds.
- **NFR-RT-001 (P0) MUST** deliver order and status updates within two seconds at p95. **Acceptance:** Given connected authorized clients, when a server commit succeeds, then 95% receive the update within two seconds.
- **NFR-UX-001 (P0) MUST** allow a typical prepared Customer to complete an order within 30 seconds. **Acceptance:** Given the standard usability scenario, when Customer starts at a table menu, then the median successful completion is at most 30 seconds.
- **NFR-SEC-001 (P0) MUST** deny cross-tenant access through Security Rules and Cloud Functions. **Acceptance:** Given users from different tenants, when each attempts every other tenant operation, then all unauthorized reads and writes fail.
- **NFR-SEC-002 (P0) MUST** use revocable table tokens, App Check, and configurable rate limits for public ordering. **Acceptance:** Given an invalid token or exceeded limit, when Customer submits, then the server rejects the request without creating an order.
- **NFR-PRIV-001 (P0) MUST** restrict Customer phone access by configured role permissions. ADMIN remains unrestricted. **Acceptance:** Given each role, when it requests Customer phone, then server results match the tenant permission matrix and ADMIN access is not audited (ADR 0010).
- **NFR-DATA-001 (P0) MUST** store money as integer VND and timestamps as UTC. **Acceptance:** Given financial and time events, when stored and rendered, then no floating money exists and tenant time uses `Asia/Ho_Chi_Minh` by default.
- **NFR-RET-001 (P0) MUST** default retention to five years through configuration. Paid orders and payment records are archived, not automatically deleted. **Acceptance:** Given expired eligible data, when retention runs, then policy applies once and protected records remain recoverable.
- **NFR-REL-001 (P0) MUST** back up Firestore daily and keep backups for 30 days by deployment configuration. **Acceptance:** Given a scheduled backup, when a restore drill runs, then tenant records restore into an isolated environment.
- **NFR-CFG-001 (P0) MUST** centralize retry, schedule, PIN, retention, and feature defaults in a typed `config.ts`. **Acceptance:** Given a valid configuration change and deployment, when modules start, then they use the same validated default values.
- **NFR-MOD-001 (P0) MUST** keep approved modules independently testable. **Acceptance:** Given one module test harness, when its external contracts are replaced by test doubles, then its acceptance tests run without another module's internal state.
- **NFR-OBS-001 (P1) SHOULD** capture production frontend errors with Sentry and server events with Firebase logging. **Acceptance:** Given a synthetic error, when it occurs, then the correct environment and release receive one searchable event without secrets.
- **NFR-AI-001 (P1) MUST** ground each AI output in cited tenant data. **Acceptance:** Given incomplete source data, when analysis runs, then each claim has a source or is labelled a hypothesis, and no value is invented.
- **NFR-AI-002 (P1) MUST** keep AI spend within the configured tenant budget and record provider, model, tokens, and cost per call. **Acceptance:** Given usage at budget, when a new call starts, then the server stops or degrades it and writes an audit event.
- **NFR-PRIV-002 (P1) MUST** remove unnecessary personal data from AI input. **Acceptance:** Given feedback with a phone number or name, when analysis runs, then the model input is masked and raw text stays permission-controlled.
- **NFR-SEC-003 (P1) MUST** require human approval before an AI suggestion changes business state. **Acceptance:** Given an AI suggestion with no human approval, when the system evaluates it, then no business state changes.

---

## 6. Data Model Summary

| Entity or path | Purpose |
|---|---|
| `users/{uid}` | User email, profile, locale, and `activeTenantId` |
| `tenants/{tenantId}` | Tenant identity and default settings |
| `tenants/{tenantId}/members/{uid}` | Roles, reduced permissions, active state, and Staff PIN metadata |
| `tenants/{tenantId}/menuItems/{itemId}` | Menu, modifiers, price, cost price, and stock |
| `tenants/{tenantId}/ingredients/{ingredientId}` | Ingredient quantity and unit Cost |
| `tenants/{tenantId}/recipes/{recipeId}` | Ingredient quantities for a menu item |
| `tenants/{tenantId}/stockMovements/{movementId}` | Append-only Inventory effects |
| `tenants/{tenantId}/tables/{tableId}` | Table identity and revocable access token state |
| `publicTableLinks/{token}` | Minimal public projection for one active table link |
| `tenants/{tenantId}/publicMenuItems/{itemId}` | Public-safe active menu projection |
| `publicOrderTracking/{trackingToken}` | Minimal Customer tracking projection for one Order |
| `tenants/{tenantId}/orders/{orderId}` | Immutable price snapshot, lifecycle, and cancellation state |
| `tenants/{tenantId}/idempotency/{key}` | Retry-safe command result |
| `tenants/{tenantId}/payments/{paymentId}` | Settlement, reversal, refund, and idempotency data |
| `tenants/{tenantId}/loyaltyMembers/{memberId}` | Verified phone, points, visits, and totals |
| `tenants/{tenantId}/loyaltyTransactions/{transactionId}` | Append-only Loyalty effects |
| `tenants/{tenantId}/promotions/{promotionId}` | Promotion eligibility and benefit rules |
| `tenants/{tenantId}/dailyStats/{yyyymmdd}` | Rebuildable daily totals with item and table subcollections |
| `tenants/{tenantId}/audit/{eventId}` | Append-only actor, action, target, and server timestamp |
| `tenants/{tenantId}/aiInsights/{insightId}` | Weekly Insight with department, priority, sources, confidence, and status |
| `tenants/{tenantId}/aiUsage/{usageId}` | Provider, model, tokens, cost, and budget evidence per AI call |
| `tenants/{tenantId}/feedback/{feedbackId}` | Customer review or issue with verification state |
| `tenants/{tenantId}/feedbackTickets/{ticketId}` | Ticket state, owner, and history |
| `tenants/{tenantId}/shifts/{shiftId}` | Scheduled Staff Shift |
| `tenants/{tenantId}/attendance/{recordId}` | Clock in/out, correction state, and history |
| `tenants/{tenantId}/stockCounts/{countId}` | Stock count, waste, adjustment, and variance |
| `platform/config` | ADMIN runtime defaults and feature flags |

Every tenant document carries or inherits `tenantId`. Cloud Functions use transactions for order, inventory, Loyalty, and payment invariants.

## 7. External Interfaces
- Firebase Auth email/password for Owner (ADR 0007).
- Firebase callable or HTTP Cloud Functions for all writes.
- Firestore listeners for authorized real-time reads.
- Firebase Storage for menu images.
- VietQR-compatible dynamic payload generation for M1.
- Replaceable signed-event payment adapter for M3 automatic confirmation.
- One replaceable AI provider adapter for read-only analysis (ADR 0008). Default provider is Gemini; TypeSafe Jev is an evaluation candidate for structured decisions only.
- Sentry for P1 frontend error reporting.

## 8. Security and Privacy
- Security Rules deny by default and scope every read to tenant membership or a valid public projection.
- Cloud Functions validate authentication, tenant, role, permission, input, transition, and idempotency.
- ADMIN has unrestricted application access without approval prompts. The application records every ADMIN change automatically; ADMIN reads are not audited (ADR 0010).
- Staff PIN values are never stored as plaintext.
- Customer phone data is minimized and returned only by server-enforced permissions.
- Secrets remain in managed secret storage and never enter Git or AI prompts.

## 9. Compliance and Legal
- Obtain clear consent before Loyalty phone collection and explain its purpose.
- Provide correction and deletion workflows for eligible personal data.
- Preserve protected paid orders and payment records through archival and reversal rules.
- Send AI input only to an approved provider under a data-processing agreement, and select zero-retention where available.
- Complete Vietnamese privacy, payment, tax, and retention legal review before production release.

## 10. Internationalization
- Interface locales: `vi` and `en`.
- Default tenant timezone: `Asia/Ho_Chi_Minh`.
- User locale persists per authenticated user.
- Customer starts with browser language and can switch.
- Owner menu content remains exactly as entered.

---

## 11. Release Plan

| Phase | Scope | Date |
|---|---|---|
| M1 | All P0 requirements: safe ordering and operations | Unscheduled |
| M2 | All P1 requirements: reporting, weekly analysis, open Q&A, customer feedback | Unscheduled |
| M3 | All P2 requirements: promotion, loyalty, feedback tickets, workforce, inventory count | Unscheduled |
| Deferred | Reservations §4.11, outside M1–M3 until an approved amendment | Not scheduled |
| Roadmap | P3 and approved amendments | Unscheduled |

## 12. Verification and Acceptance
- Each requirement needs automated or documented Given/When/Then evidence.
- Firestore Emulator tests must cover role, permission, tenant, and public token boundaries.
- ADR 0006 defers Firestore Emulator tests until before the first tenant data exists.
- Contract tests must cover each independent module interface.
- End-to-end tests must cover Pay-First and Pay-Later order lifecycles.
- Payment and inventory tests must prove idempotency and exact reversal.
- AI tests must prove source citation, missing-data warnings, and budget enforcement.
- Feedback, workforce, and stock count tests must prove tenant scoping, correction approval, and variance reconciliation.
- M1 cannot release with a failed P0 acceptance criterion.

## 13. Risks

| ID | Risk | Mitigation | REQ link |
|---|---|---|---|
| R-001 | Weak or shared Staff PIN | Configurable policy, lockout, hashed storage, audit | REQ-AUTH-002 |
| R-002 | Cross-tenant data leakage | Deny-by-default rules and server checks | NFR-SEC-001 |
| R-003 | Duplicate orders or payments | Idempotency keys and transactions | REQ-ORD-002, REQ-PAY-002 |
| R-004 | Incorrect Cost or AI advice | Deterministic recipes and missing-data warnings | REQ-RPT-001, REQ-AI-001 |
| R-005 | Internet loss during ordering | Cached menu view and explicit submission block | REQ-ORD-004 |
| R-006 | ADMIN misuse | Strong authentication and automatic audit trail | REQ-ADM-001 |
| R-007 | Configuration drift | Typed defaults, validation, and documented precedence | REQ-CFG-001, NFR-CFG-001 |
| R-008 | Firestore cost growth | Tenant-scoped queries, bounded listeners, and usage monitoring | NFR-RT-001 |
| R-009 | AI provider cost or quality falls short | Replaceable adapter, per-tenant budget, recorded evaluation | REQ-AI-004, NFR-AI-002 |
| R-010 | AI advice drives a wrong business action | Read-only AI and human approval before any change | REQ-AI-006, NFR-SEC-003 |
| R-011 | Feedback leaks personal data into AI | Mask personal data before AI input | NFR-PRIV-002 |
| R-012 | Reservation scope expands into v1 | ADR 0009 deferral and separate reservation, payment, and preparation states | REQ-RSV-003 |

## 14. Open Questions

| State | Decision |
|---|---|
| Q-1 RESOLVED 2026-09-30 | "Cọc full" means the Customer paid the full value of the ordered items, not only a shop deposit. Reservations are deferred (ADR 0009). |
| Q-2 RESOLVED 2026-09-30 | First pilot segments are coffee and tea shops and kitchen shops. |
| Q-3 RESOLVED 2026-09-30 | Keep Gemini as the default AI provider. Evaluate TypeSafe Jev behind the adapter and do not switch yet (ADR 0008). |
| Q-4 OPEN | TypeSafe contract terms, Vietnamese answer quality, and zero-retention availability. Owner: Founder. |
| Q-5 OPEN | Minimum data each shop type will enter for inventory, workforce, and return-customer analysis. Owner: Founder. |

Open questions must be answered before the related extension enters a release phase. The original foundation questions were decided on 2026-09-12.

## 15. Traceability

| REQ ID | Status | Code location or TODO reason |
|---|---|---|
| REQ-AUTH-001 | Done | P0-002A: email/password register and sign-in with `callableAuthRegisterOwner`, App Check, Zod boundaries, and idempotent first Tenant. Web 79, functions 87, Rules 27, Functions Emulator 47 pass. |
| REQ-TEN-001 | Done | P0-002B and P0-003: first Tenant bootstrap, additional Tenant, membership list, active select and switch, bounded listener with disposal, `TenantCreated` and `ActiveTenantChanged` audit. Emulator and Rules evidence pass. |
| REQ-AUTH-002 | Done | P0-004: hashed tenant-scoped Staff PIN, Config policy (six digits, five attempts, 15-minute lock), sessionVersion revocation, audit events, and server-issued sessions. No plaintext PIN in server storage or client state. Emulator evidence pass. |
| REQ-ACL-001 | Done | P0-003 and P0-004: server membership gate, navigation-only `activeTenantId`, and server role/reduced-permission/tenant/sessionVersion checks independent of UI. Emulator matrix pass. |
| REQ-ADM-001 | Done | P0-L01: claim-verified delegated ADMIN commands and queries, an ADMIN route with a CUD audit view, and non-ADMIN denial. Read-access audit was removed by ADR 0010. Emulator and Rules evidence pass. |
| REQ-ONB-001 | Done | P0-010: server onboarding checklist for shop name, industry, plan, payment mode, Tables, and menu, with next incomplete step. Emulator evidence pass. |
| REQ-ONB-002 | PARTIAL | P0-010: 15-minute budget assertion is in the onboarding emulator test. A separate timed usability study artifact is still required. |
| REQ-CFG-001 | Done | P0-001: three-layer resolution, allowed-key filtering, versioning, `ConfigurationChanged`, ADMIN `callableConfigUpdatePlatform` with audit, and tenant-visible read projection. Unit, Rules (8), and Functions Emulator (12) evidence pass. |
| REQ-CAT-001 | Done | P0-005: Catalog callables (create/edit/archive/availability/template) with App Check and Zod, private item and `publicMenuItems` written in one command, projection excludes Cost/recipe/private metadata, bounded public listener under two seconds. Emulator and Rules evidence pass. |
| REQ-CAT-002 | Done | P0-005: industry template seeds editable categories and items scoped to one Tenant. Emulator isolation evidence pass. |
| REQ-INV-001 | Done | P0-008: Owner ingredient/stock/recipe/base-unit commands, and one transaction deducts configured quantities with stockMovements exactly once when cooking starts. Emulator and Rules evidence pass. |
| REQ-INV-002 | Done | P0-L07: unpaid cancellation restores inventory through one idempotent server transaction with audit. Emulator evidence pass. |
| REQ-TBL-001 | Done | P0-006: Table Access callables (create/rename/archive/regenerate) with App Check and Zod, opaque random token, atomic old-link revocation, minimal public resolver, QR payload rotation. Emulator and Rules evidence pass. |
| REQ-NFC-001 | PARTIAL | M3: server-verified NFC provision, revoke, and resolve with opaque tokens and Rules. The physical NDEF device write/read step remains a client task. |
| REQ-ORD-001 | Done | P0-007: server validates the active Table link and current `publicMenuItems`, and computes integer VND totals from modifiers. Emulator evidence pass. |
| REQ-ORD-002 | Done | P0-007 and P0-009: Pay-Later creates `pending`; Pay-First stays hidden from Kitchen until confirmed Payment. Emulator evidence pass. |
| REQ-ORD-003 | Done | P0-007, P0-008, P0-009, P0-010: immutable Order, status events, same-transaction tracking projection, and bounded realtime updates. Emulator evidence pass. |
| REQ-ORD-004 | Done | P0-007: offline submission blocks with a problem UI and creates no Order. Adapter and UI evidence pass. |
| REQ-PRO-001 | Done | M3: server-side deterministic promotion evaluation, upsert, and status with integer VND, plus the campaign approval gate. Emulator evidence pass. |
| REQ-KDS-001 | Done | P0-008: server transitions `pending -> cooking -> ready`, one-transaction deduction, and Kitchen availability control through Catalog. Emulator and Rules evidence pass. |
| REQ-NOT-001 | Done | P0-010: visual and audible notification with dedupe and persistent mute for Kitchen and Waiter. Unit and emulator evidence pass. |
| REQ-WAI-001 | Done | P0-010: Waiter queue and `ready -> served` callable with server role enforcement that denies payment and menu operations. Emulator evidence pass. |
| REQ-CAS-001 | Done | P0-009: dynamic VietQR instructions, unpaid queue, idempotent cash/VietQR confirmation, and one immutable Payment. Emulator and Rules evidence pass. |
| REQ-CAS-002 | Done | P0-L07: cashier reversal records reason, an inventory transaction, and audit. Emulator and Rules evidence pass. |
| REQ-PAY-001 | Done | P0-L09: refunds and corrections write an immutable payment ledger with idempotency. Emulator evidence pass. |
| REQ-SOLO-001 | Done | M2: Solo flow dispatches to the shared Fulfilment, Payment, Ordering, and Catalog callables through `src/data/adapters/solo.adapter.ts`. Server re-checks role and transition. |
| REQ-LOY-001 | PARTIAL | M3: append-only loyalty transactions, idempotent earn/redeem/reverse, config, and server phone verification. SMS/Zalo code delivery remains a provider task. |
| REQ-RPT-001 | Done | M2: durable paid-order revenue, COGS, and gross profit queries from Payment and Order data, tenant-scoped and server-authorized, with Zod result schemas. Emulator and Rules evidence pass. |
| REQ-RPT-002 | Done | M2: rebuildable dailyStats per ADR 0005, a scheduled rebuild function, and an on-demand rebuild command. Emulator evidence pass. |
| REQ-AI-001 | Done | M2: permission-scoped read-only context assembly and a server AI callable seam. Answers cite sources and formulas, warn on missing data, and never mutate business state or log secrets. Emulator evidence pass. |
| REQ-SUB-001 | Done | M3: server-side plan entitlements and limits enforced in trusted code, and gated in NFC, Loyalty, and Promotion. Emulator evidence pass. |
| REQ-PAY-002 | PARTIAL | M3: automatic confirmation behind a feature flag through the signed provider adapter. Real HTTP webhook transport and the provider secret remain a deployment task. |
| REQ-I18N-001 | PARTIAL | P0-L05: typed `vi`/`en` catalogs, server locale profile, and Customer/Settings wiring. OwnerView and PublicMenuPage strings are not yet migrated. |
| NFR-PERF-001 | Done | P0-L06: bounded-query and aggregation tests plus a 100-load menu resolver budget (p95 467 ms on a modeled 4G profile, budget 2000 ms). |
| NFR-RT-001 | Done | P0-007..P0-010: bounded Firestore listeners for Ordering, Fulfilment, Catalog, Payment, and notification, with a two-second update harness. Emulator evidence pass. |
| NFR-UX-001 | PARTIAL | P0-007 offline problem UI and P0-010 notification and onboarding flows exist. A dedicated usability timing report is still required. |
| NFR-SEC-001 | PARTIAL | P0-001 proves the Config boundary: `firestore.rules` deny-by-default with ADMIN-only platform read and active-member scope, plus server authorization. Other modules remain TODO. |
| NFR-SEC-002 | Done | P0-006 and P0-007: App Check on public writes, Order rate limits, and opaque revocable Table tokens. Emulator and Rules evidence pass. |
| NFR-PRIV-001 | Done | P0-L04: server field-level Customer-phone filtering by role/permission/tenant. ADMIN access is unrestricted and is not audited (ADR 0010). Unit, emulator, and Rules evidence pass. |
| NFR-DATA-001 | Done | P0-007..P0-009: integer VND snapshots and UTC ISO timestamps asserted across Ordering, Inventory, and Payment tests. |
| NFR-RET-001 | Done | P0-L02: retention and archive jobs with documented policy and tests; archived Orders and Payments are tenant-scoped and server-write-only. |
| NFR-REL-001 | Done | P0-L03: backup policy records plus a documented restore rehearsal covered by an emulator test. |
| NFR-CFG-001 | Done | P0-001: typed `shared/config/defaults.ts`, `configValuesSchema`, and `tenantVisibleConfigSchema` in use. Unit, Rules (8), and Functions Emulator (12) evidence pass. |
| NFR-MOD-001 | PARTIAL | Views are separated; Config module contract, service, and unit tests exist. Other module contracts and tests remain TODO. |
| NFR-OBS-001 | Done | M2: Sentry monitoring for the frontend and Cloud Functions, disabled and no-op without a DSN, with secret scrubbing. Unit evidence pass. |
| REQ-AI-002 | Done | G2-02: scheduled per-tenant weekly analysis in the tenant timezone writes grounded Insights with department, priority, period, source, confidence, and missing-data notes. Idempotency and timezone tests pass. |
| REQ-AI-003 | Done | G2-03: open Owner Q&A with update time and sources, missing-data honesty, and server-side denial of out-of-permission questions. Emulator evidence pass. |
| REQ-AI-004 | Done | G2-01: replaceable provider adapter (Gemini default, Jev candidate) behind Config. ADR 0008 governs the switch. |
| REQ-AI-005 | Done | G2-01: every AI call records provider, model, tokens, and cost to `aiUsage`; per-tenant budget stops or degrades with an audit event. Emulator evidence pass. |
| REQ-AI-006 | Done | G3-06: AI campaign suggestions require Owner approval before apply, with audit and measurement. Emulator evidence pass. |
| NFR-AI-001 | Done | G2-02 and G2-03: grounding, citation, and missing-data tests pass. |
| NFR-AI-002 | Done | G2-01: cost accounting, budget enforcement, and no-secret-log tests pass. |
| REQ-FDB-001 | Done | G2-04: Customer feedback submit is tenant-scoped and only marked verified with a valid Order reference, with personal-data minimization. Emulator and Rules evidence pass. |
| REQ-FDB-002 | Done | G2-05: AI feedback grouping cites source feedback IDs, masks personal data, and resists adversarial input. Emulator evidence pass. |
| REQ-FDB-003 | Done | G3-01: feedback ticket workflow records state, actor, time, and reason on each transition. Emulator evidence pass. |
| NFR-PRIV-002 | Done | G2-04 and G2-05: shared masking of personal data in feedback and AI input. Unit and emulator evidence pass. |
| NFR-SEC-003 | Done | G3-06: Owner approval gate before any AI campaign change, with audit. Emulator evidence pass. |
| REQ-HRM-001 | Done | G3-02: shift schedule with server-side overlap rejection for one Staff. Emulator evidence pass. |
| REQ-HRM-002 | Done | G3-03: clock in/out and pending correction that an authorized approver resolves, keeping history. Emulator and Rules evidence pass. |
| REQ-HRM-003 | Done | G3-03: attendance summaries are minutes only and produce no payroll figure; a no-payroll test proves it. |
| REQ-INV-003 | Done | G3-04: Stock count computes expected quantity from stock-in, deduction, and restoration, and stores variance with audit. Emulator evidence pass. |
| REQ-INV-004 | Done | G3-05: loss review cites count, movement, and period, and states the limitation when counts are missing. Emulator evidence pass. |
| REQ-RSV-001 | DEFERRED | ADR 0009. No reservation requirement is approved for a release phase. |
| REQ-RSV-002 | DEFERRED | ADR 0009. Requires an approved amendment. |
| REQ-RSV-003 | DEFERRED | ADR 0009. Separate reservation, payment, and preparation states. |

---

## Appendices
- ADR index: `docs/adr/`
- Glossary: `docs/glossary.md`
- Data model: `docs/data-model.md`
- Module contracts: `docs/module/README.md`
- Research: `research/firestore-foundation.md`
