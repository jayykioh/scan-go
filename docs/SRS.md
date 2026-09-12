# SRS — ScanGo

| Field | Value |
|---|---|
| Document ID | SRS-SCANGO-001 |
| Version | 1.0 |
| Date | 2026-09-12 |
| Status | Approved foundation |
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
| Growth | Loyalty, promotions, Free, Lite, and Pro subscription |
| Platform operations | ADMIN tenant access and global configuration |

**Out of scope for v1:** Enterprise, delivery, printers, tax invoices, payroll, ingredient purchasing, native mobile applications, and unspecified future integrations.

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

---

## 3. System Architecture Overview
Use independent Auth, Tenant, Config, Catalog, Inventory, Table Access, Ordering, Fulfilment, Payment, Loyalty, Reporting, AI, Subscription, and ADMIN modules. Each module owns its data and public contract. Refer to `TECH_STACK.md §2`; this SRS wins on conflict.

---

## 4. Functional Requirements

### 4.1 Auth, tenant, and access
- **REQ-AUTH-001 (P0) MUST** authenticate Owner by phone OTP. **Acceptance:** Given a registered phone, when Owner verifies a valid OTP, then the system starts an authenticated session.
- **REQ-TEN-001 (P0) MUST** let one user belong to multiple tenants and select `activeTenantId`. **Acceptance:** Given two memberships, when the user switches tenant, then data and permissions change without cross-tenant leakage.
- **REQ-AUTH-002 (P0) MUST** authenticate Staff with a tenant-scoped PIN policy from configuration. **Acceptance:** Given the default six-digit policy, when five invalid attempts occur, then access locks for 15 minutes and an audit event exists.
- **REQ-ACL-001 (P0) MUST** enforce role defaults and Owner-reduced permissions on the server. **Acceptance:** Given a Staff permission is absent, when Staff calls that operation, then the server denies it despite any UI state.
- **REQ-ADM-001 (P0) MUST** give ADMIN unrestricted tenant and platform access. **Acceptance:** Given an ADMIN session, when ADMIN opens or changes any tenant, then the operation succeeds and the system records an automatic audit event without an approval prompt.

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
- **REQ-AI-001 (P1) SHOULD** provide read-only warnings for loss, low profit, and low ingredient stock. **Acceptance:** Given sufficient data, when Owner asks, then AI cites inputs and formulas; missing data produces a warning, not an invented value.
- **REQ-SUB-001 (P2) SHOULD** enforce Free, Lite, and Pro entitlements through configuration. **Acceptance:** Given a tenant plan, when Owner requests a restricted feature, then server enforcement matches configured plan entitlements.
- **REQ-PAY-002 (P2) SHOULD** support automatic transfer confirmation through a replaceable payment adapter. **Acceptance:** Given a valid signed provider event, when the adapter verifies it, then the matching payment posts exactly once.
- **REQ-I18N-001 (P0) MUST** translate the system interface into Vietnamese and English without translating Owner menu content. **Acceptance:** Given a saved user choice or Customer browser language, when the interface opens, then supported labels use that language and a switch remains available.

---

## 5. Non-Functional Requirements
- **NFR-PERF-001 (P0) MUST** load a Customer menu within two seconds at p95 on a representative 4G profile. **Acceptance:** Given the test profile, when 100 production-like menu loads run, then p95 is at most two seconds.
- **NFR-RT-001 (P0) MUST** deliver order and status updates within two seconds at p95. **Acceptance:** Given connected authorized clients, when a server commit succeeds, then 95% receive the update within two seconds.
- **NFR-UX-001 (P0) MUST** allow a typical prepared Customer to complete an order within 30 seconds. **Acceptance:** Given the standard usability scenario, when Customer starts at a table menu, then the median successful completion is at most 30 seconds.
- **NFR-SEC-001 (P0) MUST** deny cross-tenant access through Security Rules and Cloud Functions. **Acceptance:** Given users from different tenants, when each attempts every other tenant operation, then all unauthorized reads and writes fail.
- **NFR-SEC-002 (P0) MUST** use revocable table tokens, App Check, and configurable rate limits for public ordering. **Acceptance:** Given an invalid token or exceeded limit, when Customer submits, then the server rejects the request without creating an order.
- **NFR-PRIV-001 (P0) MUST** restrict Customer phone access by configured role permissions. ADMIN remains unrestricted. **Acceptance:** Given each role, when it requests Customer phone, then server results match the tenant permission matrix and ADMIN access is audited automatically.
- **NFR-DATA-001 (P0) MUST** store money as integer VND and timestamps as UTC. **Acceptance:** Given financial and time events, when stored and rendered, then no floating money exists and tenant time uses `Asia/Ho_Chi_Minh` by default.
- **NFR-RET-001 (P0) MUST** default retention to five years through configuration. Paid orders and payment records are archived, not automatically deleted. **Acceptance:** Given expired eligible data, when retention runs, then policy applies once and protected records remain recoverable.
- **NFR-REL-001 (P0) MUST** back up Firestore daily and keep backups for 30 days by deployment configuration. **Acceptance:** Given a scheduled backup, when a restore drill runs, then tenant records restore into an isolated environment.
- **NFR-CFG-001 (P0) MUST** centralize retry, schedule, PIN, retention, and feature defaults in a typed `config.ts`. **Acceptance:** Given a valid configuration change and deployment, when modules start, then they use the same validated default values.
- **NFR-MOD-001 (P0) MUST** keep approved modules independently testable. **Acceptance:** Given one module test harness, when its external contracts are replaced by test doubles, then its acceptance tests run without another module's internal state.
- **NFR-OBS-001 (P1) SHOULD** capture production frontend errors with Sentry and server events with Firebase logging. **Acceptance:** Given a synthetic error, when it occurs, then the correct environment and release receive one searchable event without secrets.

---

## 6. Data Model Summary

| Entity or path | Purpose |
|---|---|
| `users/{uid}` | User profile, locale, and `activeTenantId` |
| `tenants/{tenantId}` | Tenant identity and default settings |
| `tenants/{tenantId}/members/{uid}` | Roles, reduced permissions, active state, and Staff PIN metadata |
| `tenants/{tenantId}/menuItems/{itemId}` | Menu, modifiers, price, cost price, and stock |
| `tenants/{tenantId}/ingredients/{ingredientId}` | Ingredient quantity and unit Cost |
| `tenants/{tenantId}/recipes/{recipeId}` | Ingredient quantities for a menu item |
| `tenants/{tenantId}/tables/{tableId}` | Table identity and revocable access token state |
| `publicMenus/{token}` | Minimal public projection for one active table link |
| `tenants/{tenantId}/orders/{orderId}` | Immutable price snapshot, lifecycle, and cancellation state |
| `tenants/{tenantId}/payments/{paymentId}` | Settlement, reversal, refund, and idempotency data |
| `tenants/{tenantId}/loyalty/{memberId}` | Verified phone reference, points, visits, and totals |
| `tenants/{tenantId}/audit/{eventId}` | Append-only actor, action, target, and server timestamp |
| `platform/config` | ADMIN runtime defaults and feature flags |

Every tenant document carries or inherits `tenantId`. Cloud Functions use transactions for order, inventory, Loyalty, and payment invariants.

## 7. External Interfaces
- Firebase Auth phone OTP for Owner.
- Firebase callable or HTTP Cloud Functions for all writes.
- Firestore listeners for authorized real-time reads.
- Firebase Storage for menu images.
- VietQR-compatible dynamic payload generation for M1.
- Replaceable signed-event payment adapter for M3 automatic confirmation.
- Gemini through a server-side AI adapter for read-only analysis.
- Sentry for P1 frontend error reporting.

## 8. Security and Privacy
- Security Rules deny by default and scope every read to tenant membership or a valid public projection.
- Cloud Functions validate authentication, tenant, role, permission, input, transition, and idempotency.
- ADMIN has unrestricted application access without approval prompts. The application records ADMIN actions automatically.
- Staff PIN values are never stored as plaintext.
- Customer phone data is minimized and returned only by server-enforced permissions.
- Secrets remain in managed secret storage and never enter Git or AI prompts.

## 9. Compliance and Legal
- Obtain clear consent before Loyalty phone collection and explain its purpose.
- Provide correction and deletion workflows for eligible personal data.
- Preserve protected paid orders and payment records through archival and reversal rules.
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
| M1 | All P0 requirements | Unscheduled |
| M2 | All P1 requirements | Unscheduled |
| M3 | All P2 requirements | Unscheduled |
| Roadmap | P3 and approved amendments | Unscheduled |

## 12. Verification and Acceptance
- Each requirement needs automated or documented Given/When/Then evidence.
- Firestore Emulator tests must cover role, permission, tenant, and public token boundaries.
- Contract tests must cover each independent module interface.
- End-to-end tests must cover Pay-First and Pay-Later order lifecycles.
- Payment and inventory tests must prove idempotency and exact reversal.
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

## 14. Open Questions

| State | Decision |
|---|---|
| Q-n = 0 OPEN | All foundation questions were decided with the Founder on 2026-09-12. Future changes require an SRS amendment. |

## 15. Traceability

| REQ ID | Status | Code location or TODO reason |
|---|---|---|
| REQ-AUTH-001 | PARTIAL | UI exists in `src/pages/auth/`; Firebase OTP is TODO. |
| REQ-TEN-001 | PARTIAL | Tenant state exists in `src/layouts/SimulatorLayout.tsx`; memberships are TODO. |
| REQ-AUTH-002 | PARTIAL | PIN UI exists in Staff views; secure server policy is TODO. |
| REQ-ACL-001 | PARTIAL | Role UI exists in `src/components/StaffView.tsx`; server enforcement is TODO. |
| REQ-ADM-001 | TODO | ADMIN product view does not exist. |
| REQ-ONB-001 | PARTIAL | Onboarding exists in `src/components/OwnerView.tsx`; checklist expansion is TODO. |
| REQ-ONB-002 | TODO | Requires usability acceptance evidence. |
| REQ-CFG-001 | TODO | Typed and runtime configuration layers do not exist. |
| REQ-CAT-001 | PARTIAL | `src/pages/dashboard/MenuPage.tsx` and `src/components/OwnerView.tsx`. |
| REQ-CAT-002 | PARTIAL | Templates exist in `src/mockData.ts`; server tenant isolation is TODO. |
| REQ-INV-001 | PARTIAL | Owner and Solo inventory UI exists; shared transactional persistence is TODO. |
| REQ-INV-002 | PARTIAL | Solo restoration exists; server idempotency is TODO. |
| REQ-TBL-001 | PARTIAL | `src/pages/dashboard/TablesPage.tsx`; secure real links are TODO. |
| REQ-NFC-001 | PARTIAL | NFC simulation exists; real NFC acceptance is TODO. |
| REQ-ORD-001 | PARTIAL | `src/components/CustomerView.tsx`; server prices are TODO. |
| REQ-ORD-002 | PARTIAL | Payment modes exist; real server gates are TODO. |
| REQ-ORD-003 | PARTIAL | Lifecycle UI exists; Firestore listeners are TODO. |
| REQ-ORD-004 | TODO | Offline read and submission blocking need implementation. |
| REQ-PRO-001 | PARTIAL | Promotion calculation UI exists; server calculation is TODO. |
| REQ-KDS-001 | PARTIAL | `src/components/KitchenView.tsx`; server transitions and visible stock control are TODO. |
| REQ-NOT-001 | TODO | Production web audio and notification behavior do not exist. |
| REQ-WAI-001 | PARTIAL | `src/components/StaffView.tsx`; server permission enforcement is TODO. |
| REQ-CAS-001 | PARTIAL | `src/components/CashierView.tsx`; real cash and VietQR records are TODO. |
| REQ-CAS-002 | PARTIAL | Cancel UI exists; reason, inventory transaction, and audit are TODO. |
| REQ-PAY-001 | PARTIAL | Solo reversal UI exists; immutable payment ledger is TODO. |
| REQ-SOLO-001 | PARTIAL | `src/components/SoloOperatorView.tsx`; shared module state is TODO. |
| REQ-LOY-001 | PARTIAL | Loyalty UI exists; real phone verification and idempotency are TODO. |
| REQ-RPT-001 | PARTIAL | Owner and Management metrics exist; durable paid-order reporting is TODO. |
| REQ-AI-001 | PARTIAL | Rule-based UI exists; secure Gemini adapter and grounding are TODO. |
| REQ-SUB-001 | PARTIAL | Subscription UI exists; server entitlements are TODO. |
| REQ-PAY-002 | TODO | Automatic payment adapter is M3 scope. |
| REQ-I18N-001 | TODO | Current interface is not fully localized. |
| NFR-PERF-001 | TODO | No performance tests exist. |
| NFR-RT-001 | TODO | No Firestore synchronization exists. |
| NFR-UX-001 | TODO | No usability timing evidence exists. |
| NFR-SEC-001 | TODO | No Firebase rules or Cloud Functions exist. |
| NFR-SEC-002 | TODO | App Check, rate limits, and secure table tokens do not exist. |
| NFR-PRIV-001 | TODO | Server field-level permission filtering does not exist. |
| NFR-DATA-001 | PARTIAL | VND UI exists; durable UTC and integer invariants need tests. |
| NFR-RET-001 | TODO | Retention and archival jobs do not exist. |
| NFR-REL-001 | TODO | Backup and restore configuration does not exist. |
| NFR-CFG-001 | TODO | Central typed configuration does not exist. |
| NFR-MOD-001 | PARTIAL | Views are separated; module contracts and tests do not exist. |
| NFR-OBS-001 | TODO | Sentry and production logging are not configured. |

---

## Appendices
- ADR index: `docs/adr/`
- Glossary: `docs/glossary.md`
- Research: `research/firestore-foundation.md`
