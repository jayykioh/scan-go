# SRS — ScanGo

| Field | Value |
|---|---|
| Document ID | SRS-SCANGO-001 |
| Version | 1.3 |
| Date | 2026-10-15 |
| Status | Approved foundation with insight and growth amendment; Gemini-only AI provider (ADR 0020) |
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
| Staff-entered table bookings | Approved narrow P1 slice under REQ-TBL-005..007; Customer reservations/pre-ordering remain deferred. See §4.11 and ADR 0009. |

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
- **REQ-AUTH-003 (P0) MUST** let Owner provision one account and tenant-scoped roles for each Staff member. **Acceptance:** Given an Owner and a new staff email, when Owner creates the Staff account, then the system creates the account and an active Staff membership, the Staff signs in and verifies the PIN, and the plaintext PIN never leaves the server.
- **REQ-AUTH-004 (P0) MUST** keep the Staff PIN length in one place: the Owner-set PIN must match the tenant's resolved `pinPolicy.length`, and verification must compare the stored hash rather than reject a PIN for its length. **Acceptance:** Given the default six-digit policy, when the Owner sets a four-digit PIN, then the server rejects it before creating any Auth account and the Owner Staff form asks for exactly six digits; given a Staff membership whose stored PIN is four digits, when the Staff member submits it, then the server verifies the hash and starts the session; given an existing membership with a missing `staffDirectory` row, when the backfill runs, then the Owner Staff list shows it.
- **REQ-AUTH-005 (P0) MUST** let the Owner of the active Tenant work on the operating pages without entering a Staff PIN, because Firebase Auth has already authenticated them and an Owner membership carries no reduced role set. **Acceptance:** Given the signed-in Owner of the active Tenant, when they open `/operation/staff`, then the operating tabs open with Bếp, Phục vụ, and Thu ngân available and no PIN prompt; given a Staff membership on the same route, then the PIN prompt still stands; given the Owner has tapped Đăng xuất, then the PIN prompt stands for the rest of that visit so the next person can sign in as themselves.
- **REQ-AUTH-006 (P0) MUST** keep the Owner console to a membership that owns the active Tenant. **Acceptance:** Given a signed-in Staff membership, when they open `/dashboard`, then the console is replaced by the Staff entry at `/staff` and no dashboard navigation is rendered; given the Owner, then the console renders; given a membership that is unknown or has not settled, then the console is left alone and the server refuses every Owner read it makes.
- **REQ-ACL-001 (P0) MUST** enforce role defaults and Owner-reduced permissions on the server. **Acceptance:** Given a Staff permission is absent, when Staff calls that operation, then the server denies it despite any UI state.
- **REQ-INV-008 (P1) MUST** let the Owner and an active Kitchen member manage ingredients, recipes, and stock, and report every add, edit, and archive. **Acceptance:** Given an active Kitchen session, when the member adds, edits, or archives an ingredient, then the server accepts it and the inventory change report lists the change with its actor, action, and time; given the Kho screen, then the report is a view of its own that can be filtered to the waste rows, each waste row marked and showing its ingredient, quantity, reason, and note (amended 2026-10-14: the report was a collapsible section and is now a page of the Kho screen).
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
- **REQ-INV-005 (P0) MUST** let Owner enter an ingredient purchase price by purchase unit and store the integer VND Cost per base unit. **Acceptance:** Given 100000 VND for one kilogram, when Owner saves, then the stored Cost is 100 VND per gram.
- **REQ-INV-006 (P0) MUST** let Owner enter each recipe line in a chosen unit and convert it to integer base units. **Acceptance:** Given a line of 0.2 kg, when saved, then the stored quantity is 200 g; a unit that does not match the ingredient base unit is rejected.
- **REQ-INV-007 (P0) MUST** let Owner set a fixed waste quantity per recipe line in the same chosen unit. **Acceptance:** Given a line of 200 g with 20 g waste, when cooking starts, then one transaction deducts 220 g and the recipe Cost includes the waste.
- **REQ-CAT-003 (P1) MUST** let Owner and an active Kitchen member change availability for a whole menu category in one command. **Acceptance:** Given a category, when the caller sets it unavailable, then the server updates every active item in that category, writes one audit event per item, and the public projection hides them within two seconds.
- **REQ-INV-009 (P1) MUST** let Owner and an active Kitchen member record a manual stock deduction with a reason and a required note. **Acceptance:** Given a waste or manual-adjustment deduction, when the caller omits the note, then the server rejects it; given a note, then the movement and the audit event record the reason and the note; given one or many ingredients picked in the Kho screen, then one submission deducts each typed quantity and writes one audit row per ingredient with the shared reason and note (amended 2026-10-14: the deduction covers a selection of ingredients, not one row at a time).
- **REQ-INV-012 (P1) MUST** let Owner name the count unit of a count ingredient with free text. **Acceptance:** Given a count ingredient, when Owner enters a unit name such as "trái", then the server stores it and the inventory screen shows it in place of the generic count label; given a count ingredient without a name, then the server rejects it.
- **REQ-INV-010 (P1) MUST** record the purchase price on every stock-in movement and recompute the ingredient Cost as the weighted average of quantity on hand and the new lot. **Acceptance:** Given a lot of 1000 g at 100 VND per g and a new lot of 1000 g at 200 VND per g, when the second lot is recorded, then the movement stores its own lot price and the stored Cost per base unit becomes 150 VND per g.
- **REQ-INV-011 (P1) SHOULD** warn the Owner when a new stock-in lot price exceeds the previous Cost per base unit by more than ten percent. **Acceptance:** Given a previous Cost of 100 VND per g, when a new lot is 115 VND per g, then the system records a price-increase warning with both prices and the change percentage; given 105 VND per g, then no warning occurs.

### 4.4 Tables, QR, and NFC
- **REQ-TBL-001 (P0) MUST** let Owner create, rename, archive, and regenerate tenant tables and QR table links. **Acceptance:** Given a regenerated link, when Customer opens the old link, then access fails; the new link opens only its table menu.
- **REQ-TBL-002 (P1) MUST** let Owner arrange tables on a floor plan by area, seat count, and position, and switch between a plan view and a list view. **Acceptance:** Given an Owner session, when Owner moves a table, names its area, or sets its seat count, then the server stores the layout and the next visit to the plan shows the same arrangement; given a table outside the floor grid or a seat count outside the allowed range, then the server rejects the command; given another role, then the command stays denied.
- **REQ-TBL-003 (P1) MUST** show the service state of every table on the floor plan, derived from live Orders. **Acceptance:** Given a served, unsettled Order on a table, when the plan refreshes, then that table shows "chờ thanh toán" and no other table changes state; given an open Order, then the table shows "có khách"; given a ready Order, then the table shows "món sẵn sàng"; given no open Order, then "trống"; and the projection carries no money, customer, or Order line data.
- **REQ-TBL-004 (P1) MUST** let the Owner assign zero or more active Waiter Staff to each table area. **Acceptance:** Given an area, when the Owner saves active Waiter UIDs, then floor-plan and list headers show every assigned Waiter name; inactive members and members without the Waiter role are rejected; unassigned areas remain valid. Area labels remain grouping labels, and assignments use UIDs without changing roles or permissions.
- **REQ-TBL-005 (P1) MUST** let authorized shop Staff create and manage table reservations as records separate from Orders. A reservation MUST identify one table, a tenant-local start and end time, party size, and a lifecycle state; the implementation MUST NOT create or mutate an Order, Payment, or Inventory movement as a side effect. **Acceptance:** Given an authorized user and a valid future time interval, when they create a reservation, then the server stores it for that tenant and table and the floor plan shows "Đã đặt" with party size without showing the table as occupied; given an invalid time range, party size outside 1–50, a different tenant, or unauthorized caller, then the server rejects the request; overlapping active reservations are rejected atomically.
- **REQ-TBL-006 (P1) MUST** let authorized Staff confirm arrival, cancel a reservation, and mark it no-show, with each valid transition audited. The reservation MUST stop blocking its table when cancelled, completed, or no-show; an arrived reservation MUST display as occupied until its visit is completed. **Acceptance:** Given a confirmed reservation, when Staff records arrival, then the table shows "Có khách"; given a cancellation, completion, or no-show, when the plan refreshes and no open Order or other effective reservation exists, then the table shows its underlying Order state or "Trống"; invalid transitions are rejected and history is retained.
- **REQ-TBL-007 (P1) MUST** show the applicable reservation state on the table plan and detail view without confusing future reservations with current occupancy. **Acceptance:** Given a future active reservation, then the table shows "Đã đặt" and party size; given an arrived reservation or an open Order, then current occupancy/order state takes precedence; given a reservation with minimal Customer contact data, then only authorized Owner/Staff can read that data and Waiter views receive no Customer contact fields.
- **REQ-NFC-001 (P2) SHOULD** let the same table link open through a programmed NFC tag. **Acceptance:** Given a supported NFC device, when Customer taps the tag, then the same menu and table context open as QR.

### 4.5 Customer ordering
- **REQ-ORD-001 (P0) MUST** let Customer browse, search, filter, select modifiers, and manage a cart without an account. **Acceptance:** Given a valid table link, when Customer changes cart quantities, then totals use current menu prices and integer VND.
- **REQ-ORD-002 (P0) MUST** support Pay-First and Pay-Later submission. **Acceptance:** Given Pay-First, when payment is unconfirmed, then Kitchen receives nothing; given Pay-Later, submission creates `pending` immediately.
- **REQ-ORD-003 (P0) MUST** track `pending`, `cooking`, `ready`, `served`, and `paid` in real time. **Acceptance:** Given a valid transition, when Staff changes status, then authorized views update within two seconds.
- **REQ-ORD-004 (P0) MUST** block order submission offline while allowing an already cached menu view. **Acceptance:** Given no connection, when Customer submits, then no order is created and the interface shows the connection problem.
- **REQ-ORD-005 (P1) MUST** let Owner and Cashier create an Order from the current menu with server-owned prices, for a table or for takeaway. **Acceptance:** Given Owner or Cashier input, when the server saves the Order, then the server sets every price and total, a takeaway Order shows the reserved takeaway label, and Kitchen receives it like a Customer Order.
- **REQ-PRO-001 (P2) SHOULD** apply configured automatic promotions deterministically. **Acceptance:** Given an eligible cart, when totals are calculated, then one documented promotion result appears consistently on client and server, and the applied Promotion, its integer-VND discount, and any gift line are recorded on the Order snapshot.
- **REQ-PRO-002 (P2) SHOULD** give Owner one screen to create, edit, activate, pause, archive, and review Promotions. **Acceptance:** Given an Owner session, when a Promotion is saved or its status changes, then the list reflects the server state and an audit event exists; given another role, then the commands stay denied.
- **REQ-PRO-003 (P2) SHOULD** support item-level Promotion benefits: buy X get Y, a free item, and a bundle price. **Acceptance:** Given an eligible cart, when an item-level benefit applies, then the Order records the discounted line values and one gift line per rewarded item with zero revenue and a real Cost.
- **REQ-PRO-004 (P2) SHOULD** let a verified Loyalty member spend points through a Promotion. **Acceptance:** Given a Promotion that costs points, when the Order commits, then the ledger records the redemption once in the same transaction, an insufficient balance rejects the Order, and cancelling an unpaid Order restores the points exactly once.
- **REQ-PRO-005 (P2) SHOULD** support time, weekday, code, and customer-segment Promotion eligibility. **Acceptance:** Given a Promotion limited to a local time window, weekday list, typed code, or customer segment, when the cart does not match, then the Promotion does not apply and the server states why.
- **REQ-PRO-006 (P2) SHOULD** enforce Promotion limits per plan. **Acceptance:** Given the Free plan, when a second Promotion is activated, then the server rejects it with a message that names the limit; given Lite or Pro, then advanced benefits and unlimited active Promotions are allowed.
- **REQ-PRO-007 (P2) SHOULD** provide an Owner/admin promotion-building assistant that asks structured questions, accepts natural-language answers for parsing, persists normalized answers for resume, supports all six Promotion benefit types, and produces an inactive draft requiring explicit human confirmation. **Acceptance:** Given an authorized Owner/admin, when the assistant collects sufficient validated answers, then it stores a resumable structured session, shows a complete draft, and confirmation creates an inactive Promotion through the deterministic Promotion command; reload/resume does not repeat completed questions, invalid or unavailable menu items are rejected, plan entitlements are enforced, and no AI output activates or directly mutates business state.

### 4.6 Kitchen, Waiter, Cashier, and Solo
- **REQ-KDS-001 (P0) MUST** let Kitchen move orders from `pending` to `cooking` to `ready` and mark items unavailable. **Acceptance:** Given an authorized Kitchen session, when status or stock changes, then Customer and Staff views update within two seconds.
- **REQ-KDS-002 (P1) SHOULD** split the Kitchen screen into three tabs — the order queue with its floor plan, the menu state, and the ingredient in/out — keep the queue readable at every width, and group the menu state by category. **Acceptance:** Given the Kitchen page, when it opens, then three tabs are offered and the queue tab is active; given the queue tab, then the Order cards come first with the floor plan below them, stacked in one column on a phone and flowing into multiple columns when the tab is wide; given the menu-state tab, then items group by category with a per-category control and a per-item toggle that keeps an unavailable item visible; given the ingredient tab, then Kitchen records stock in, stock out, and waste with a reason; given a phone viewport, then no tab needs a horizontal scrollbar to be reached. *(Amended 2026-10-14: the queue and the availability board are tabs instead of two side-by-side columns, by product decision.)*
- **REQ-UX-002 (P1) SHOULD** show each operating page full-screen at every viewport, with no simulated device frame, and let the operator switch between the pages from one hub. **Acceptance:** Given any viewport, when an operating page opens, then it fills the available space with no bezel, status bar, or home indicator; given the hub, then it lists the operating pages (Cashier, Kitchen, Staff, Customer) and opens the chosen one; given an unknown or old `/simulator` address, then it resolves to the hub. *(Amended 2026-10-14: the small-viewport phone frame is removed by product decision; P0-017 previously required it.)*
- **REQ-UX-003 (P1) SHOULD** show the floor plan on the Kitchen, Cashier, and Waiter pages, with the per-table order load, so each role picks the table it acts on. **Acceptance:** Given a page with tables, then every table is drawn as a tap target larger than the administration canvas with its area, state, and open-order count; given a phone viewport, then the plan scrolls horizontally with snap instead of shrinking the tiles; given the Kitchen page, then the Order cards come first and the floor plan sits below them; given the Cashier and Waiter pages, then the plan sits above the list below it; given a selected table, then the order list is scoped to it and the same control clears the filter without hiding takeaway orders; given no table, then the page says so instead of drawing an empty grid. *(Amended 2026-10-14: on the Cashier page a selected table opens that table's invoice dialog (REQ-CAS-003) and on the Waiter page it opens that table's order/serve dialog (REQ-WAI-002) instead of scoping the list below it, by product decision; Kitchen keeps the inline scope.)*
- **REQ-NOT-001 (P0) MUST** provide visual and audible Kitchen and Waiter notifications with a mute control. **Acceptance:** Given sound is enabled, when a relevant new order or ready event arrives, then one visible and audible notification occurs.
- **REQ-WAI-001 (P0) MUST** let Waiter view ready orders and mark them `served`. **Acceptance:** Given a ready order, when Waiter confirms service, then status becomes `served`; payment and menu operations remain denied. *(Amended 2026-10-14: taking an order at the table is added by REQ-WAI-002; payment stays cashier-gated.)*
- **REQ-WAI-002 (P1) SHOULD** let Waiter take an order at the table it serves, and collect that table's payment when the Waiter also carries the Cashier role. **Acceptance:** Given a signed-in Waiter, when it picks a table on the floor plan, then a dialog opens with a searchable dish list and a cart for that table, and submitting creates one server-priced Order for that table; given a table whose Order is `ready`, then its tile carries a `!` ping and the dialog serves those dishes; given a Waiter without the Cashier role, then the dialog offers no payment action and the server still denies payment; given a Waiter with the Cashier role, then the dialog shows the same per-table invoice sheet the Cashier page opens, with the unpaid bills and the Cash, VietQR, and PayOS actions; given a Waiter and a takeaway request, then the server denies it because the role takes orders at a table; given a Kitchen-only or cross-Tenant caller, then the server denies Order creation.
- **REQ-CAS-001 (P0) MUST** let Cashier view unpaid orders, confirm cash, and confirm dynamic VietQR payments manually. **Acceptance:** Given verified payment, when Cashier confirms it, then status becomes `paid` once and the payment record is immutable.
- **REQ-CAS-002 (P0) MUST** let Cashier cancel any unpaid order with a reason. **Acceptance:** Given an unpaid order, when Cashier confirms cancellation, then fulfilment stops, inventory restores once, and an audit event records the reason.
- **REQ-CAS-003 (P1) SHOULD** open one table's invoices for the Cashier from the floor plan, so the till settles the open bill and reconciles an old one. **Acceptance:** Given a table and a signed-in Cashier, when the Cashier picks the table, then a dialog opens with that table's name and every unpaid Order of the table, each printing its lines, quantity, unit price, total, and the table; given an Order whose `loyaltyMemberId` resolves, then the dialog prints the returning customer's name; given a table with an open bill, then the open bill comes first and the settled history sits below it behind one control; given a table with no open bill, then the dialog opens directly onto that table's settled invoices; given more than five settled invoices, then the first page prints five and the next control prints the rest; given a settled invoice, when the Cashier opens it, then its Payment record is shown (method, amount, time, payment id, status) and no new PayOS link is offered for it; given the unpaid read has not settled yet, then the dialog states that it is loading instead of calling the table empty; given a caller who is not an active Cashier or Owner of the Tenant, then the server denies the read.
- **REQ-PAY-001 (P0) MUST** correct paid orders only through reversal or refund. **Acceptance:** Given a paid order, when an authorized user corrects it, then the original remains and a linked compensating record is created.
- **REQ-SOLO-001 (P1) SHOULD** combine authorized Owner, Cashier, and Kitchen actions in one view. **Acceptance:** Given an authorized Solo session, when Solo changes an order, then the same module rules and audit behavior apply.

### 4.7 Loyalty, reports, AI, and subscription
- **REQ-LOY-001 (P2) SHOULD** support configurable point earning and verified-phone redemption. **Acceptance:** Given the default one point per 10,000 VND, when a paid order posts, then points update once; redemption requires valid phone verification.
- **REQ-RPT-001 (P1) SHOULD** report paid revenue, Cost, gross profit, popular items, and table stats by day, week, and month. **Acceptance:** Given paid orders and complete recipes, when Owner selects a period, then each result reconciles to underlying records.
- **REQ-RPT-002 (P1) SHOULD** maintain rebuildable daily stats keyed by tenant-local `yyyymmdd`. **Acceptance:** Given order, payment, cancellation, reversal, or refund events, when their transactions commit, then daily counters update exactly once and reconcile to source records.
- **REQ-RPT-003 (P1) SHOULD** compare one reporting period with the immediately preceding period of equal length and state how many days carry data in each period. **Acceptance:** Given a period with data, when the Owner selects it, then each compared figure shows the previous value, the delta, and the count of days with data in both periods; given a previous period without data, then the comparison states the gap and shows no percentage; given a previous value of zero, then no percentage is shown.
- **REQ-RPT-004 (P1) SHOULD** report the Cost coverage behind every Cost or profit figure. **Acceptance:** Given sold items, when a Cost or profit figure is shown, then the screen states how many of the sold items carry a Cost and how many do not; given any item without a Cost, then the profit figure is labelled partial rather than presented as complete; given an item sold only as a Promotion gift, then it is excluded from the margin sample and counted separately.
- **REQ-AI-001 (P1) SHOULD** provide read-only warnings for loss, low profit, and low ingredient stock. **Acceptance:** Given sufficient data, when Owner asks, then AI cites inputs and formulas; missing data produces a warning, not an invented value.
- **REQ-AI-007 (P1) SHOULD** warn the Owner when a tenant-local day's paid revenue drops at least twenty percent against the previous day with data. **Acceptance:** Given a previous day of 500000 VND and a current day of 300000 VND, when warnings run, then one revenue-drop warning cites both day keys and states the arithmetic formula; given a smaller drop, then no warning occurs.
- **REQ-AI-008 (P1) SHOULD** warn the Owner when a sold menu item's margin falls below the configured `lowMarginPercent`, computed only from data that caller is authorized to read. **Acceptance:** Given a configured threshold of 20 and a sold item whose margin is below it, when warnings run, then one low-margin warning cites the item, the period, the threshold, and the arithmetic formula; given an item at or above the threshold, then no warning occurs; given an item without a recipe Cost, then the warning states the missing Cost instead of reporting a margin; given a caller without the Cost permission, then no margin is computed or returned.
- **REQ-AI-002 (P1) SHOULD** run a scheduled weekly analysis for each tenant in tenant time. **Acceptance:** Given a completed week, when the schedule runs, then the tenant receives a bounded Insight list with department, priority, period, source, confidence, and missing-data notes.
- **REQ-AI-003 (P1) SHOULD** answer Owner questions from authorized tenant data only and state the data update time. **Acceptance:** Given an authorized question, when data exists, then the answer cites the source and period; given missing data, then the answer states the gap and does not invent a value.
- **REQ-AI-004 (P1) MUST** call one replaceable AI provider adapter and record provider, model, tokens, and cost per call. Gemini is the only model provider; the deterministic adapter is the fallback when no provider secret is bound (ADR 0020). **Acceptance:** Given a Config change between `gemini` and `rule-based`, when analysis runs, then no other module changes and each call records provider, model, and cost.
- **REQ-AI-005 (P1) MUST** enforce a per-tenant AI cost budget from Config. **Acceptance:** Given a tenant at budget, when a new AI call starts, then the server rejects or degrades the call and records an audit event.
- **REQ-AI-006 (P1) MUST NOT** let AI output change permissions, money, prices, or inventory. **Acceptance:** Given an AI suggestion, when a change occurs, then a human-approved deterministic command performs it and an audit event exists.
- **REQ-AI-009 (P1) SHOULD** give the Owner assistant a bounded read context that also carries menu price and Cost, ingredient stock and Cost, and feedback topic counts, so a question about an item, an ingredient, or a reported problem is answered from data instead of only from warnings already computed. **Acceptance:** Given an authorized question naming a menu item, an ingredient, or a feedback topic, when the assistant answers, then that record is in the context and can be cited as a source; the context stays within the module read limits and carries no other tenant's data and no personal data.
- **REQ-SUB-001 (P2) SHOULD** enforce Free, Lite, and Pro entitlements through configuration. **Acceptance:** Given a tenant plan, when Owner requests a restricted feature, then server enforcement matches configured plan entitlements.
- **REQ-PAY-002 (P2) SHOULD** support automatic transfer confirmation through a replaceable payment adapter. **Acceptance:** Given a valid signed provider event, when the adapter verifies it, then the matching payment posts exactly once.
- **REQ-PAY-003 (P2) SHOULD** let the Cashier open a PayOS payment link for one unpaid Order and show the customer its QR. **Acceptance:** Given an unpaid Order and a Cashier session, when the Cashier asks for a PayOS link, then the server creates one link per Order, stores the provider `orderCode` mapping server-side, and returns the checkout URL and QR; given an Order that already holds a pending link, then the stored link is returned instead of a second one; given a caller without the Cashier role, then the server denies it; given no PayOS credentials on the server, then the server refuses with a stated reason rather than a half-configured link.
- **REQ-PAY-004 (P2) SHOULD** settle a PayOS transfer from its webhook exactly once. **Acceptance:** Given a webhook whose HMAC-SHA256 checksum signature verifies with the merchant key, when the signed `orderCode` resolves a link, then one immutable Payment posts, the Order becomes `paid`, provider evidence is recorded, and the link becomes `paid`; given a replayed webhook, then the result is a replay and no second Payment exists; given a forged signature or an amount changed after signing, then the request is rejected and no Payment is written; given an unknown `orderCode`, then the endpoint answers not-found; given a non-settled event, then the endpoint acknowledges it as ignored without writing a Payment.
- **REQ-I18N-001 (P0) MUST** translate the system interface into Vietnamese and English without translating Owner menu content. **Acceptance:** Given a saved user choice or Customer browser language, when the interface opens, then supported labels use that language and a switch remains available.

### 4.8 Customer feedback
- **REQ-FDB-001 (P1) MUST** let Customer submit a review or issue about an Order or visit. **Acceptance:** Given a submission, when stored, then it is tenant-scoped and marked verified only when a matching Order reference exists.
- **REQ-FDB-002 (P1) SHOULD** group feedback with AI and cite the original text as the source. **Acceptance:** Given a set of feedback, when grouping runs, then each theme cites source feedback IDs and removes unnecessary personal data.
- **REQ-FDB-003 (P2) MUST** track a Feedback ticket through `received`, `in_progress`, and `resolved` with an owner and history. **Acceptance:** Given a ticket change, when saved, then state, actor, time, and reason are recorded.

### 4.8.1 Product feedback (added 2026-10-08)
Product feedback is the operator's report about ScanGo itself — a bug, a usability
problem, a performance complaint, or a feature request — as distinct from
REQ-FDB-001, which is the Customer's report about the shop.
- **REQ-FDB-004 (P1) MUST** let an authenticated Tenant member submit product feedback with a category, severity, message, and up to three optional screenshots. **Acceptance:** Given an active member, when the submission is stored, then it is tenant-scoped, server-written, attributed to the member's derived role, and a non-member or anonymous caller is rejected.
- **REQ-FDB-005 (P1) MUST** store each product-feedback screenshot under the reporter's own tenant and uid prefix with a raster-image allowlist and a bounded size, and deny client deletes. **Acceptance:** Given an upload outside the reporter prefix, a non-raster content type, an oversized file, or a client delete, then the write is denied; given a valid upload, then only an active Tenant member or ADMIN can read it.
- **REQ-FDB-006 (P2) SHOULD** give the Owner a product-feedback inbox for the active Tenant and record every status change with actor, time, and reason. **Acceptance:** Given an active Owner, when the inbox opens, then only that Tenant's reports and their screenshots are shown; given a status change, then the append-only history gains an entry with actor, time, and reason; given a Staff member, then the read is denied.

### 4.8.2 Customer report topics and surge warning (added 2026-10-13)
A Customer report is tagged with one topic from a bounded catalog, and the server
keeps a per-topic counter. The tag is the only part a model may decide; the count,
the threshold, and the warning are arithmetic in code (ADR 0008, REQ-AI-006).
- **REQ-FDB-007 (P2) MUST** tag each stored Customer feedback with exactly one topic from the bounded catalog and increment that topic's counter once per submission. **Acceptance:** Given a submission, when stored, then it carries one topic tag and the matching `feedbackTopics` counter increases by exactly one, including under concurrent submissions; given a message that matches no topic, then it is tagged `other` and no counter is invented.
- **REQ-FDB-008 (P1) SHOULD** warn the Owner when one topic receives at least the configured number of reports inside the configured window. **Acceptance:** Given `ai.feedbackTopicAlertCount` reports of one topic within `ai.feedbackTopicWindowHours`, when the threshold is crossed, then one warning naming the topic and citing its source feedback IDs appears in the Owner assistant and one Insight is written; given a count below the threshold, then no warning occurs; given the threshold at zero, then the warning is disabled.

### 4.9 Workforce and attendance
- **REQ-HRM-001 (P2) MUST** let Owner schedule Shifts per Staff and date. **Acceptance:** Given two overlapping Shifts for one Staff, when saved, then the server rejects the overlap.
- **REQ-HRM-002 (P2) MUST** record clock in and clock out and require approval for a correction. **Acceptance:** Given a wrong time, when Staff requests a correction, then it stays pending until an authorized user approves, and history remains.
- **REQ-HRM-003 (P2) MUST NOT** derive or export payroll. **Acceptance:** Given Shift and attendance data, when any report runs, then no salary, wage, or payroll figure is produced.

### 4.10 Inventory count and loss review
- **REQ-INV-003 (P2) MUST** let Owner record stock-in, a Stock count, waste, and a manual adjustment with a reason. **Acceptance:** Given a Stock count, when saved, then the system computes expected quantity from stock-in, deduction, and restoration, and stores the variance with an audit event.
- **REQ-INV-004 (P2) SHOULD** attribute an unexplained variance to ingredient, item, shift, or time window for AI review. **Acceptance:** Given complete counts, when loss review runs, then each finding cites the count, movements, and period; given missing counts, then the finding states the limitation.

### 4.11 Reservations — staff-entered table bookings (P1 amendment, 2026-10-13)

This amendment approves a deliberately small reservation workflow for the floor plan. Reservations are entered by authorized shop Staff for one specific table; Customer self-service, pre-ordering, deposits/payments, table combinations, and automated seating are excluded. The reservation is separate from Order, Payment, and preparation state. No reservation creates an Order or authorizes Kitchen preparation. The legacy `REQ-RSV-001..003` remain deferred for Customer requests, capacity/ingredient approval, and pre-ordering; the approved staff booking requirements are `REQ-TBL-005..007`.

Product policy for this slice: a booking has a table, tenant-local start/end time, party size, and state `booked | arrived | cancelled | completed | no_show`; arrival is explicit, and an arrived visit remains occupied until completed. Active `booked` intervals block overlapping bookings on the same table. No deposit is collected. Store Customer name/phone only when needed by the shop; contact fields are optional and private to Owner/authorized Staff, never included in the general table-status or Waiter projection. No automatic grace period or inferred no-show: Staff explicitly marks no-show. An active booking makes the table show `Đã đặt` before arrival; arrival or an open Order takes precedence and shows `Có khách` (or its more urgent Order state). `foodReady` and `awaitingPayment` retain their existing urgency. Terminal reservation states no longer hold the table.

- **REQ-TBL-005 (P1) MUST** let authorized shop Staff create, view, and edit a reservation for one table, with tenant-local start/end time, party size, and lifecycle state, stored separately from Orders. **Acceptance:** Given an authorized user and a valid future interval, when they save a booking, then the server stores it for the same tenant/table and the floor plan shows `Đã đặt` and party size without showing occupancy; reservation writes never create or mutate an Order, Payment, or Inventory movement. Given an interval where end is not after start, a party size outside 1–TABLE_MAX_SEATS, a different tenant, or an unauthorized caller, then the server rejects the request.
- **REQ-TBL-006 (P1) MUST** prevent two active bookings from overlapping on the same table and support explicit arrival, cancellation, completion, and no-show transitions. **Acceptance:** Given an overlapping `booked` interval, when a concurrent create/edit is committed, then at most one booking succeeds; given a valid transition, then the server records actor/time and retains history; given cancelled, completed, or no-show state, then the booking no longer blocks the table; an arrived booking remains occupied until completed.
- **REQ-TBL-007 (P1) MUST** combine reservations with live Order state on the plan without treating a future booking as current occupancy. **Acceptance:** Given a future active booking, then the table shows `Đã đặt` and party size; given an arrived booking or open Order, then occupancy/Order state takes precedence; given no effective booking and no open Order, then existing Order-derived state or `Trống` is shown; the general status result contains no Customer contact fields.

### 4.11.1 Waiter coverage by area

- **REQ-TBL-004 (P1) MUST** let the Owner assign zero or more active Waiter Staff to each table area. **Acceptance:** Given one area, when the Owner saves one or more active Waiter UIDs, then the floor-plan and list show all assigned Waiter names for that area; a Staff member without the Waiter role or who is inactive is rejected; unassigned areas remain valid. Area labels remain grouping labels, not geometric constraints. Assignments use UIDs and do not affect Staff roles or permissions.

### 4.12 Data reads and shared client cache
- **REQ-CACHE-001 (P1) MUST** route non-ADMIN data-only reads through direct, tenant-scoped Firestore client adapters backed by Security Rules and audience-safe projections; ADMIN reads remain server-side. **Acceptance:** Given an authorized non-ADMIN user, when the application retrieves stored data without a trusted server-side computation, then the client reads the authorized document/query or safe server-written projection directly and does not call a Cloud Function whose only purpose is to fetch and return that data; given a screen unmounts and remounts in the same authenticated user/tenant/query context while its cache entry is valid, then it immediately displays the cached value without creating a duplicate read or listener; live queries update through one shared listener; given a successful relevant server command, explicit refresh, sign-out, tenant switch, or role/session revocation, then affected entries are invalidated or cleared before another context can display them; cross-tenant/unauthorized reads and direct client business writes remain denied.

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
| `tenants/{tenantId}/payosPaymentLinks/{orderId}` | Server-only PayOS link and `orderCode` mapping for one Order |
| `platform/payosCounter` | Server-only `orderCode` allocator, so no two Orders share one |
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
- One replaceable AI provider adapter for read-only analysis (ADR 0008, ADR 0020). Gemini is the only model provider; the deterministic adapter is the fallback when no provider secret is bound.
- Sentry for P1 frontend error reporting.

## 8. Security and Privacy
- Security Rules deny by default and scope every read to tenant membership or a valid public projection.
- Collections that carry money, Cost, or customer personal data are scoped by membership **and** role, so a Staff member's reduced permission set also bounds a direct Firestore read: `payments` requires Owner or Cashier; `ingredients`, `recipes`, `stockMovements`, and `stockCounts` require Owner or Kitchen (ADR 0013); `dailyStats`, `aiUsage`, `aiInsights`, `feedback`, and `feedbackTickets` are Owner-only.
- Cloud Functions validate authentication, tenant, role, permission, input, transition, and idempotency.
- ADMIN has unrestricted application access without approval prompts. The application records every ADMIN change automatically; ADMIN reads are not audited (ADR 0010).
- Staff PIN values are never stored as plaintext.
- Customer phone data is minimized and returned only by server-enforced permissions.
- Secrets remain in managed secret storage and never enter Git or AI prompts.
- Storage writes accept an explicit raster image allowlist, so a scriptable SVG cannot be stored at a public menu image path.

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
| Deferred | Customer self-service reservations/pre-ordering §4.11; staff-entered table bookings are separate approved P1 scope | Not scheduled |
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
| R-012 | Reservation scope expands beyond staff-entered bookings | ADR 0009 amendment keeps Customer self-service, deposits, and pre-ordering deferred; booking, payment, and preparation remain separate | REQ-TBL-005..007, REQ-RSV-003 |
| R-013 | A forged or replayed PayOS webhook settles an Order | HMAC-SHA256 checksum verified over the signed `data` object before any read, deterministic Payment and evidence ids, and an `orderCode` mapping the body cannot name | REQ-PAY-004 |
| R-014 | A Staff PIN the Owner set can never verify | One policy length enforced where the PIN is set, and verification compares the stored hash | REQ-AUTH-004 |

## 14. Open Questions

| State | Decision |
|---|---|
| Q-1 RESOLVED 2026-09-30; amended 2026-10-13 | "Cọc full" means the Customer paid the full value of the ordered items, not only a shop deposit. Customer reservations/pre-orders remain deferred; staff-entered table bookings are approved without deposits under REQ-TBL-005..007 (ADR 0009). |
| Q-2 RESOLVED 2026-09-30 | First pilot segments are coffee and tea shops and kitchen shops. |
| Q-3 RESOLVED 2026-09-30; amended 2026-10-15 | Gemini is the only AI model provider, reached through one replaceable adapter; TypeSafe Jev is dropped (ADR 0020, superseding ADR 0008). |
| Q-4 RESOLVED 2026-10-15 | Closed without a TypeSafe contract. TypeSafe zero-retention and Vietnamese-quality terms no longer gate anything, because TypeSafe is no longer a candidate (ADR 0020). |
| Q-5 OPEN | Minimum data each shop type will enter for inventory, workforce, and return-customer analysis. Owner: Founder. |

Open questions must be answered before the related extension enters a release phase. The original foundation questions were decided on 2026-09-12.

## 15. Traceability

| REQ ID | Status | Code location or TODO reason |
|---|---|---|
| REQ-AUTH-001 | Done | P0-002A: email/password register and sign-in with `callableAuthRegisterOwner`, App Check, Zod boundaries, and idempotent first Tenant. Web 79, functions 87, Rules 27, Functions Emulator 47 pass. |
| REQ-TEN-001 | Done | P0-002B and P0-003: first Tenant bootstrap, additional Tenant, membership list, active select and switch, bounded listener with disposal, `TenantCreated` and `ActiveTenantChanged` audit. Emulator and Rules evidence pass. |
| REQ-AUTH-002 | Done | P0-004: hashed tenant-scoped Staff PIN, Config policy (six digits, five attempts, 15-minute lock), sessionVersion revocation, audit events, and server-issued sessions. No plaintext PIN in server storage or client state. Emulator evidence pass. |
| REQ-AUTH-003 | Done | Staff module: `callableStaffCreate/Update/SetActive/ResetPin`, Owner gate, hashed PIN, `sessionVersion` revocation on disable, private memberships, and a Staff sign-in page that resolves the Tenant then verifies the PIN. The Owner Staff list reads the PIN-free `staffDirectory` projection directly (ADR 0015, REQ-CACHE-001). The projection landed after memberships already existed, so `npm run backfill:staff-directory` fills the missing rows; it is additive and idempotent. Unit, Rules, and Staff Emulator evidence pass. |
| REQ-AUTH-004 | Done | `assertPinMatchesPolicy` gates `callableStaffCreate` and `callableStaffResetPin` against the resolved `pinPolicy.length` before any Auth account exists, `callableAuthStaffPinVerify` no longer rejects a PIN for its length (the stored hash is the authority), and the Owner Staff form reads the policy length for its label, bounds, and placeholder. `MOCK_STAFF_ACCOUNTS` uses six-digit PINs. Unit and Staff Emulator evidence pass. |
| REQ-AUTH-005 | Done | The Owner of the active Tenant opens `/operation/staff` straight into the operating tabs: `useActiveMembership` reads the caller's own membership of the active Tenant (`tenants/{tenantId}/members/{uid}`), `toOwnerStaffSessionView` builds the session with every role, and `StaffView` seeds it once per mount, so Đăng xuất still reaches the PIN gate for the next person (ADR 0021). A Staff membership keeps the PIN gate; the server authorizes every command from the membership either way. `src/hooks/useActiveMembership.test.ts` and `src/data/adapters/staff-session.adapter.test.ts` pass. |
| REQ-AUTH-006 | Done | `DashboardLayout` replaces the Owner console with `/staff` for an active non-Owner membership (`ownerConsoleRedirect`, ADR 0021). The boundary is server-side and unchanged: `dailyStats`, `aiUsage`, and `aiInsights` are `isActiveOwner` reads in `firestore.rules`, `payments` is Owner-or-Cashier, and every business callable re-verifies the membership. `src/hooks/useActiveMembership.test.ts` passes. |
| REQ-ACL-001 | Done | P0-003 and P0-004: server membership gate, navigation-only `activeTenantId`, and server role/reduced-permission/tenant/sessionVersion checks independent of UI. Emulator matrix pass. |
| REQ-ADM-001 | Done | P0-L01: claim-verified delegated ADMIN commands and queries, an ADMIN route with a CUD audit view, and non-ADMIN denial. Read-access audit was removed by ADR 0010. Emulator and Rules evidence pass. |
| REQ-ONB-001 | Done | P0-010: server onboarding checklist for shop name, industry, plan, payment mode, Tables, and menu, with next incomplete step. Dashboard navigation now remains available on narrow screens for the Table/Menu setup steps. Emulator evidence pass. |
| REQ-ONB-002 | PARTIAL | P0-010: 15-minute budget assertion is in the onboarding emulator test. A separate timed usability study artifact is still required. |
| REQ-CFG-001 | Done | P0-001: three-layer resolution, allowed-key filtering, versioning, `ConfigurationChanged`, ADMIN `callableConfigUpdatePlatform` with audit, and tenant-visible read projection. Unit, Rules (8), and Functions Emulator (12) evidence pass. |
| REQ-CAT-001 | Done | P0-005: Catalog callables (create/edit/archive/availability/template) with App Check and Zod, private item and `publicMenuItems` written in one command, projection excludes Cost/recipe/private metadata, bounded public listener under two seconds. Emulator and Rules evidence pass. |
| REQ-CAT-002 | Done | P0-005: industry template seeds editable categories and items scoped to one Tenant. Emulator isolation evidence pass. |
| REQ-CAT-003 | Done | P0-015: `callableCatalogSetCategoryAvailability` changes every active item in one category in one transaction, skips items already at the target, writes one audit event per changed item, and `callableCatalogListAvailability` returns a Cost-free availability list. Unit, Functions Emulator, and Rules evidence pass. |
| REQ-INV-001 | Done | P0-008: Owner ingredient/stock/recipe/base-unit commands, and one transaction deducts configured quantities with stockMovements exactly once when cooking starts. Emulator and Rules evidence pass. |
| REQ-INV-002 | Done | P0-L07: unpaid cancellation restores inventory through one idempotent server transaction with audit. Emulator evidence pass. |
| REQ-INV-005 | Done | P0-011: ingredient commands accept a purchase unit and purchase price and store integer VND Cost per base unit. Unit and emulator evidence pass. |
| REQ-INV-006 | Done | P0-011: recipe lines accept a chosen unit, convert to integer base units, and reject a unit that does not match the ingredient base unit. Unit and emulator evidence pass. |
| REQ-INV-007 | Done | P0-011: each recipe line stores a fixed waste quantity; cooking deducts quantity plus waste and the recipe Cost includes it. Unit and emulator evidence pass. |
| REQ-INV-008 | Done, amended 2026-10-14 | Inventory module: the Owner and an active Kitchen member manage ingredients, recipes, and stock through the same callables; audit events record the acting role. `callableInventoryChangeReport` lists every add, edit, archive, and adjustment with actor and time; the Kho screen exposes it as a view of its own ("Báo cáo kho") with a waste-only filter and a waste badge on each deduction row. Unit evidence pass; emulator test pending. |
| REQ-INV-010 | Done | G3-07: a stock-in movement stores its own lot price, and the ingredient Cost per base unit becomes the weighted average of quantity on hand and the new lot. Unit evidence pass. |
| REQ-INV-011 | Done | G3-07: a stock-in lot price above the previous Cost by more than ten percent records a price-increase warning with both prices, the delta, and the percentage. Unit evidence pass. |
| REQ-INV-009 | Done, amended 2026-10-14 | P0-016: a `waste` or `manual_adjustment` deduction requires a free-text note; the server stores it on the stock movement and the audit event, and the inventory change report shows the reason and the note. The Kho screen records the deduction for one or many selected ingredients in one submission with a shared reason and note. Unit, Functions Emulator, and Rules evidence pass; browser evidence in `verify-operation-pages.mjs` (83/83). |
| REQ-INV-012 | Done | P0-018: a count ingredient stores a free-text `countUnitLabel`; the server requires it for a `unit` purchase unit and clears it for mass and volume. The inventory screen shows the name in place of the generic count label. Unit and Functions Emulator evidence pass. |
| REQ-TBL-001 | Done | P0-006: Table Access callables (create/rename/archive/regenerate) with App Check and Zod, opaque random token, atomic old-link revocation, minimal public resolver, QR payload rotation. Emulator and Rules evidence pass. The Owner screen now reads the `tables` slice of the shared tenant store, so opening or reloading `/dashboard/tables` by URL shows the real tables instead of a false empty shop, and loading, empty, and error are three distinct states. `docs/feedback/harness/verify-tables-page.mjs` passes 27/27 checks against the real tenant. |
| REQ-TBL-002 | Done | Table contract v2 adds nullable `area`, `seats`, and `position` to the table document, written only by `callableTableConfigure` (Owner-only, audited as `TableConfigured`); `callableTableCreate` accepts the same fields so a new table lands in its cell in one command. Positions are validated grid cells (12×10) in the contract, so the server rejects a cell outside the floor and a rejected command leaves the stored layout untouched. The screen draws the plan on a scaled grid, drags or arrow-key moves a tile, filters and groups by area, and switches between plan and list. Evidence: `docs/feedback/harness/verify-table-plan-server.mjs` 12/12 and `verify-tables-page.mjs` 27/27 on the real tenant; 19 unit tests for the plan geometry. |
| REQ-TBL-003 | Done | `callableOrderListTableStatus` folds the tenant's open Orders into one state per table (`awaitingPayment` > `foodReady` > `occupied` > `free`), from a pure `deriveTableServiceState` rule. The projection carries no money, Customer identity, or Order line, so any active member may read it. The plan polls it every ten seconds, pauses while the tab is hidden, and prints the state as text on every tile plus a five-figure summary strip. Evidence: `verify-table-plan-server.mjs` drives a real Order through `pending → ready → served → cancelled` and observes all four states; 7 unit tests for the fold and the precedence rule. |
| REQ-TBL-004..007 | Approved amendment; implementation pending | SRS amendment 2026-10-13 and amended ADR 0009 approve multiple Waiter assignments per area plus staff-entered table bookings. TODO: area assignment contract/command/UI; tenant reservation collection and validated/audited callable lifecycle; atomic overlap protection; combined Order/reservation plan state with PII-safe projections; contract, unit, Functions Emulator, Rules, and floor-plan UI evidence. Customer self-service, deposits, pre-ordering, grouped tables, and automatic no-show/grace-period behavior remain out of scope. |
| REQ-NFC-001 | PARTIAL | M3: server-verified NFC provision, revoke, and resolve with opaque tokens and Rules. The physical NDEF device write/read step remains a client task. |
| REQ-ORD-001 | Done | P0-007: server validates the active Table link and current `publicMenuItems`, and computes integer VND totals from modifiers. Customer cart now sends selected option IDs to server pricing. Emulator evidence pass. The cart also sends one optional trimmed `customerNote` (200 characters) that Kitchen reads on the ticket. |
| REQ-ORD-002 | Done | P0-007 and P0-009: Pay-Later creates `pending`; Pay-First stays hidden from Kitchen until confirmed Payment. Emulator evidence pass. |
| REQ-ORD-003 | Done | P0-007, P0-008, P0-009, P0-010: immutable Order, status events, same-transaction tracking projection, and bounded realtime updates. Emulator evidence pass. |
| REQ-ORD-004 | Done | P0-007: offline submission blocks with a problem UI and creates no Order. Adapter and UI evidence pass. |
| REQ-ORD-005 | Done | P0-012/P0-013: Owner and Cashier create server-priced Orders for a table or takeaway, with recorded actor and audit. Unit, Rules, and Functions Emulator tests for this ticket pass. |
| REQ-PRO-001 | Done | M3: one deterministic engine (`evaluatePromotionForCart`) shared by the public evaluate callable and Order creation; the Order records `discountVnd`, `promotionSnapshot`, `loyaltyMemberId`, and `pointsRedeemed`, and Reporting item revenue is net of the line discount (ADR 0016). Evidence: contract and function unit tests pass, and the harness proves against the real tenant that a 10% promotion yields `discountVnd 1000` on a `10000` subtotal, that the Order stores the same figure and the frozen snapshot, that the public tracking projection carries it, and that a changed code on a reused idempotency key is rejected (`docs/feedback/harness/verify-promotion-server.mjs`). |
| REQ-PRO-002 | Done | M3: `/dashboard/promotions` Owner screen with create, edit, activate, pause, archive, a reserved Settings-owned quick discount, and the AI campaign suggestion section. Evidence: 20 UI checks pass on the real tenant, including the separate route and nav entry, the six benefit types, and the portal modal spanning the viewport with no containing block and no unnamed icon button (`docs/feedback/harness/run-promotion-verification.mjs`). |
| REQ-PRO-003 | Done | M3: `buyXGetY`, `freeItem`, and `bundlePrice` benefits with deterministic integer-VND rewards and gift Order lines that carry zero revenue and a real Cost. Evidence: unit tests cover each reward calculation and the gift-line projection. End-to-end gift verification still needs a Lite tenant, because the QA tenant is on Free and the `promotionAdvanced` gate correctly refuses an item-level benefit there. |
| REQ-PRO-004 | Done | M3: `pointsRedemption` spends Loyalty points inside the Order transaction with an in-transaction balance check, and cancelling an unpaid Order restores them through a deterministic `loyalty_redeem_reverse_<orderId>` ledger entry that cannot collide with the earned-point reversal. Unit evidence pass; an end-to-end redemption still needs an OTP-verified Loyalty member, which the current harness does not provision. |
| REQ-PRO-005 | Done | M3: tenant-local happy hour (including a window across midnight), weekday list, typed code, and customer segment eligibility, each reported with a distinct ineligibility reason. Unit evidence covers the window boundaries, the weekday match, the code match, and each segment. |
| REQ-PRO-006 | Done | M3: `maxActivePromotions` and the `promotionAdvanced` entitlement are enforced in trusted code. Evidence: the harness proves against the real tenant that the server refuses a second active promotion on Free with a message naming the limit, leaves the refused record `inactive`, and refuses an item-level benefit on Free; the UI additionally disables the four advanced types (ADR 0016). |
| REQ-KDS-001 | Done | P0-008: server transitions `pending -> cooking -> ready`, one-transaction deduction, and Kitchen availability control through Catalog. Emulator and Rules evidence pass. |
| REQ-KDS-002 | Done | P0-014 plus the 2026-10-14 amendment: the Kitchen screen is three tabs — queue with its floor plan, menu state, and ingredient in/out. The menu-state tab groups items by category with a per-category on/off control and per-item toggles that keep unavailable items visible; the ingredient tab embeds the inventory panel, which pages the ingredient list at ten rows with Trước/Sau. The queue tab keeps the ticket tiles ordered oldest first, each showing its queue position, order time, waiting minutes with an age tone, modifiers, and the Customer request, and flows from one column on a phone into multiple columns on a wide tab. Component, unit, typecheck, and lint evidence pass. |
| REQ-UX-002 | Done | P0-017 originally kept a phone frame on a small viewport; amended 2026-10-14 by product decision. `PhoneSimulator` is deleted, so every operating page (`/operation/cashier`, `/operation/kitchen`, `/operation/staff`, `/operation/customer`) renders full-screen with no bezel, status bar, or home indicator at any width. The Test Environment framing and its demo controls (`Đơn ảo`, `Xóa Data`, `Reset State`, second device panel) are gone, `/operation` is the only page chooser (amended 2026-10-14: the in-page role select is removed, so an operating page only offers the way back to the hub), and `/simulator` redirects to it. The `/staff` route keeps its expanded column. Typecheck, lint, and the web/shared unit suite pass; browser harness `docs/feedback/harness/verify-operation-pages.mjs` 83/83. |
| REQ-UX-003 | Done | `OperationTableBoard` draws the Owner's floor plan read-only at a 96px minimum cell (62px on the administration canvas) on the Kitchen, Cashier, and Waiter pages, printing each table's area, seat count, state, and open-order count, with `snap-x` horizontal scrolling on a phone and `max-h` so the list below stays reachable. On the Kitchen page selecting a table scopes the list below it and one control clears the filter while the unfiltered view keeps takeaway Orders visible; on the Cashier page the selection opens that table's invoice dialog (amended 2026-10-14, REQ-CAS-003) and on the Waiter page it opens that table's order/serve dialog (amended 2026-10-14, REQ-WAI-002). On the Kitchen page the Order cards come first and the plan sits below them; on the Cashier and Waiter pages the plan sits above the list below it. `useOperationTables` reads the `tables` store slice when a Tenant is resolved and the demo list otherwise. Evidence: 6 unit tests for `summarizeOrdersByTable` and `toOperationTables`; typecheck, lint, and the web/shared unit suite pass; browser harness `docs/feedback/harness/verify-operation-pages.mjs` reads the tenant's real tables from Firestore and asserts the board, the Kitchen card-above-plan order, the till plan-above-bills order, the Cashier invoice dialog, and the phone swipe. |
| REQ-NOT-001 | Done | P0-010: visual and audible notification with dedupe and persistent mute for Kitchen and Waiter. Unit and emulator evidence pass. |
| REQ-WAI-001 | Done | P0-010: Waiter queue and `ready -> served` callable with server role enforcement that denies payment and menu operations. Emulator evidence pass. Amended 2026-10-14: taking the order at the table is REQ-WAI-002; payment stays cashier-gated. |
| REQ-WAI-002 | Done | The Waiter floor plan pings every table that has a `ready` dish (`!` on the tile plus "cần phục vụ" in its accessible name), and tapping a table opens one dialog with three tabs: the dishes to carry and their `Đã phục vụ` command, the existing `StaffOrderEntry` locked to that table with a dish search, and — only when the Waiter also carries the `cashier` role — the Cashier's own invoice sheet (`CashierView` in `focusTableId` mode) with the unpaid bills, the settled history, settle, cancel, and PayOS. `callableOrderStaffCreate` now accepts an active membership carrying `cashier` (any Order) or `waiter` (a dine-in Order only, because the role takes the order at a table); takeaway, cancellation (REQ-CAS-002), and payment (REQ-CAS-001) stay cashier-only. The dish list and the tables come from the shared tenant store, so the dialog opens no new read for either. Evidence: `filterAvailableItems` 3 unit tests, `OperationTableBoard` ping 2 component tests, web 374/374 and functions 542/542 pass, typecheck and lint pass, `functions/test/ordering/staff-order.emulator.test.ts` 7/7 (a Waiter creates a dine-in Order and is denied a takeaway one; Kitchen and a cross-Tenant Owner stay denied), and Playwright screenshots of the board plus all three dialog tabs at 1440×900 and 390×844 were reviewed through a temporary preview harness that was removed afterwards. The emulator run needs the JS `firebase-tools` package under Node 24: the pkg-built `firebase` binary embeds Node 20 and cannot load the codebase. ADR 0019. |
| REQ-CAS-001 | Done | P0-009: dynamic VietQR instructions, unpaid queue, idempotent cash/VietQR confirmation, and one immutable Payment. Emulator and Rules evidence pass. |
| REQ-CAS-002 | Done | P0-L07: cashier reversal records reason, an inventory transaction, and audit. Emulator and Rules evidence pass. |
| REQ-CAS-003 | Done | The Cashier floor plan opens a per-table invoice dialog: the table's open bills first (lines, quantity, unit price, total, table, and the returning customer's name resolved from `loyaltyMemberId` through `callableLoyaltyListMembers`), the settled invoices below behind one control at five rows a page with Trước/Tiếp, and each settled row opens its immutable Payment record (method, amount, time, payment id, status). `callableOrderListTableInvoices` is the cashier-gated, table-scoped, paid-only read because `orders` is not client-readable; it uses the existing `(tableId, createdAt)` index and filters the status in the handler. A settled invoice offers no new PayOS link; an open one reuses `callablePaymentCreatePayosLink`, which returns the stored pending link. Evidence: 6 unit tests for `ordersForTable`, `paginateInvoices`, and `resolveCustomerName`; `functions/test/ordering/table-invoices.emulator.test.ts` 6/6 for the callable gate, table scope, paid-only filter, and ordering; browser harness `docs/feedback/harness/verify-cashier-invoices.mjs` 18/18 covers the dialog, the customer name, the five-row paging, the reopened payment record, the empty table's history, and the phone sheet, and `verify-operation-pages.mjs` 83/83 still passes. |
| REQ-PAY-001 | Done | P0-L09: refunds and corrections write an immutable payment ledger with idempotency. Emulator evidence pass. |
| REQ-SOLO-001 | Done | M2: Solo flow dispatches to the shared Fulfilment, Payment, Ordering, and Catalog callables through `src/data/adapters/solo.adapter.ts`. Server re-checks role and transition. |
| REQ-LOY-001 | PARTIAL | M3: append-only loyalty transactions, idempotent earn/redeem/reverse, config, and server phone verification. SMS/Zalo code delivery remains a provider task. |
| REQ-RPT-001 | Done | M2: durable paid-order revenue, COGS, and gross profit queries from Payment and Order data, tenant-scoped and server-authorized, with Zod result schemas. Emulator and Rules evidence pass. |
| REQ-RPT-002 | Done | M2: rebuildable dailyStats per ADR 0005, a scheduled rebuild function, and an on-demand rebuild command. Emulator evidence pass. |
| REQ-AI-001 | Done | M2: permission-scoped read-only context assembly and a server AI callable seam. Answers cite sources and formulas, warn on missing data, and never mutate business state or log secrets. Emulator evidence pass. |
| REQ-AI-007 | Done | The AI ask reads the current and prior tenant-local day, so `computeWarnings` adds a deterministic revenue-drop warning (at least 20 percent down) that cites both day keys. Unit evidence pass. |
| REQ-AI-008 | PARTIAL | Added to SRS 2026-10-13 from code that already implemented it: `lowMarginPercent` from Config reaches `computeWarnings` through `WarningThresholds`, with `AI_LOW_MARGIN_PERCENT` as the built-in fallback. No dedicated test covers the low-margin branch yet, and the missing-Cost and unauthorized-caller clauses are unverified. |
| REQ-SUB-001 | Done | M3: server-side plan entitlements and limits enforced in trusted code, and gated in NFC, Loyalty, and Promotion. Emulator evidence pass. |
| REQ-PAY-002 | PARTIAL | M3: automatic confirmation behind a feature flag through the signed provider adapter. Real HTTP webhook transport and the provider secret remain a deployment task. |
| REQ-PAY-003 | Done | `callablePaymentCreatePayosLink` resolves the Cashier/Owner membership, refuses an already-settled Order, reuses a pending link, allocates a unique `orderCode` from the server-only `platform/payosCounter` inside one transaction, and stores `tenants/{t}/payosPaymentLinks/{orderId}` before calling PayOS. The Cashier view shows the returned QR with `qrcode.react` and closes when the Payment appears. Unit and Emulator evidence pass. |
| REQ-PAY-004 | Done | `payosWebhookV1` verifies the HMAC-SHA256 checksum over the signed `data` object before any read, resolves the Tenant and Order through the signed `orderCode`, and settles through the shared idempotent core with `method: 'payos'`; a replay is reported as a replay. `functions/test/payment/payos.emulator.test.ts` covers settle, replay, forged signature, tampered amount, malformed body, unknown `orderCode`, mismatched amount, and non-settled event. Unit and Emulator evidence pass. |
| REQ-I18N-001 | PARTIAL | P0-L05: typed `vi`/`en` catalogs, server locale profile, and Customer/Settings wiring. OwnerView and PublicMenuPage strings are not yet migrated. |
| NFR-PERF-001 | Done | P0-L06: bounded-query and aggregation tests plus a 100-load menu resolver budget (p95 467 ms on a modeled 4G profile, budget 2000 ms). |
| NFR-RT-001 | Done | P0-007..P0-010: bounded Firestore listeners for Ordering, Fulfilment, Catalog, Payment, and notification, with a two-second update harness. Emulator evidence pass. |
| REQ-CACHE-001 | In Progress | Approved scope: direct non-ADMIN data reads through Rules-authorized projections and a shared cache keyed by user, tenant, path, and query. App-lifetime tenant slices reuse menu/public menu, inventory, tables, promotions, campaign suggestions, Loyalty config, subscription, and the Owner-only Staff directory across remounts; identity/tenant/role isolation is covered by unit tests and the private-menu/Staff projection boundaries by 122 passing Rules tests. Removed the fetch-only `callableStaffList`, `callablePromotionList`, `callableLoyaltyGetConfig`, and `callableReportingGetSummary`. Remaining callable reads are the explicit exceptions recorded in ADR 0015 (Orders, Loyalty phones, resolved Config, inventory report, memberships/onboarding, feedback). |
| NFR-UX-001 | PARTIAL | P0-007 offline problem UI and P0-010 notification and onboarding flows exist. A dedicated usability timing report is still required. |
| NFR-SEC-001 | PARTIAL | P0-001 proves the Config boundary: `firestore.rules` deny-by-default with ADMIN-only platform read and active-member scope, plus server authorization. Other modules remain TODO. |
| NFR-SEC-002 | Done | P0-006 and P0-007: App Check on public writes, Order rate limits, and opaque revocable Table tokens. Emulator and Rules evidence pass. App Check enforcement is temporarily off in `scango-8f0e9` because the web client does not send a token yet (ADR 0017). |
| NFR-PRIV-001 | Done | P0-L04: server field-level Customer-phone filtering by role/permission/tenant. ADMIN access is unrestricted and is not audited (ADR 0010). Unit, emulator, and Rules evidence pass. |
| NFR-DATA-001 | Done | P0-007..P0-009: integer VND snapshots and UTC ISO timestamps asserted across Ordering, Inventory, and Payment tests. |
| NFR-RET-001 | Done | P0-L02: retention and archive jobs with documented policy and tests; archived Orders and Payments are tenant-scoped and server-write-only. |
| NFR-REL-001 | Done | P0-L03: backup policy records plus a documented restore rehearsal covered by an emulator test. |
| NFR-CFG-001 | Done | P0-001: typed `shared/config/defaults.ts`, `configValuesSchema`, and `tenantVisibleConfigSchema` in use. Unit, Rules (8), and Functions Emulator (12) evidence pass. |
| NFR-MOD-001 | PARTIAL | Views are separated; Config module contract, service, and unit tests exist. Other module contracts and tests remain TODO. |
| NFR-OBS-001 | Done | M2: Sentry monitoring for the frontend and Cloud Functions, disabled and no-op without a DSN, with secret scrubbing. Unit evidence pass. |
| REQ-AI-002 | Done | G2-02: scheduled per-tenant weekly analysis in the tenant timezone writes grounded Insights with department, priority, period, source, confidence, and missing-data notes. Idempotency and timezone tests pass. |
| REQ-AI-003 | Done | G2-03: open Owner Q&A with update time and sources, missing-data honesty, and server-side denial of out-of-permission questions. Emulator evidence pass. |
| REQ-AI-004 | PARTIAL | G2-01: one replaceable provider adapter behind Config, with `aiUsage` provider/model/token/cost evidence — Done. ADR 0020 is specified but **not implemented yet**: `aiProviderSchema` still accepts `jev`, and `functions/src/modules/ai/service.ts` still holds the Jev adapter, `TYPESAFE_JEV_ENABLED` flag, response schema, and cost model. Checked 2026-10-15. |
| REQ-AI-005 | Done | G2-01: every AI call records provider, model, tokens, and cost to `aiUsage`; per-tenant budget stops or degrades with an audit event. Emulator evidence pass. |
| REQ-AI-006 | Done | G3-06: AI campaign suggestions require Owner approval before apply, with audit and measurement. Emulator evidence pass. |
| REQ-AI-009 | Done | The ask prompt now carries daily aggregates, menu price/Cost, ingredient stock/Cost, and report topic counts, and the budget reservation is estimated from the whole prompt. The weekly run and the feedback grouping make no provider call and record no `aiUsage`; `@google/genai` was an unused dependency and was removed. Unit, Functions Emulator, and lint evidence pass. |
| NFR-AI-001 | Done | G2-02 and G2-03: grounding, citation, and missing-data tests pass. |
| NFR-AI-002 | Done | G2-01: cost accounting, budget enforcement, and no-secret-log tests pass. |
| REQ-FDB-001 | Done | G2-04: Customer feedback submit is tenant-scoped and only marked verified with a valid Order reference, with personal-data minimization. Emulator and Rules evidence pass. |
| REQ-FDB-002 | Done | G2-05: AI feedback grouping cites source feedback IDs, masks personal data, and resists adversarial input. Emulator evidence pass. |
| REQ-FDB-003 | Done | G3-01: feedback ticket workflow records state, actor, time, and reason on each transition. Emulator evidence pass. |
| REQ-FDB-007 | Done | Each Customer report is tagged with one bounded-catalog topic and the matching `feedbackTopics` counter increments in the same transaction as the report, so concurrent submissions still count once each. Unit, Functions Emulator, and Rules evidence pass. |
| REQ-FDB-008 | Done | A topic crossing `ai.feedbackTopicAlertCount` inside `ai.feedbackTopicWindowHours` writes one `aiInsights` record with a deterministic per-window id, one `FeedbackTopicAlerted` audit event, and a `feedbackSurge` warning in the Owner assistant; a zero count disables it. Unit and Functions Emulator evidence pass. |
| NFR-PRIV-002 | Done | G2-04 and G2-05: shared masking of personal data in feedback and AI input. Unit and emulator evidence pass. |
| NFR-SEC-003 | Done | G3-06: Owner approval gate before any AI campaign change, with audit. Emulator evidence pass. |
| REQ-HRM-001 | Done | G3-02: shift schedule with server-side overlap rejection for one Staff. Emulator evidence pass. |
| REQ-HRM-002 | Done | G3-03: clock in/out and pending correction that an authorized approver resolves, keeping history. Emulator and Rules evidence pass. |
| REQ-HRM-003 | Done | G3-03: attendance summaries are minutes only and produce no payroll figure; a no-payroll test proves it. |
| REQ-INV-003 | Done | G3-04: Stock count computes expected quantity from stock-in, deduction, and restoration, and stores variance with audit. Emulator evidence pass. |
| REQ-INV-004 | Done | G3-05: loss review cites count, movement, and period, and states the limitation when counts are missing. Emulator evidence pass. |
| REQ-RSV-001 | DEFERRED | ADR 0009. Customer self-service reservation and pre-ordering remain deferred; see approved staff-entered REQ-TBL-005..007. |
| REQ-RSV-002 | DEFERRED | ADR 0009. Requires an approved amendment. |
| REQ-RSV-003 | DEFERRED | ADR 0009. Separate reservation, payment, and preparation states. |

The deferral applies to customer-requested reservations and pre-ordering only; the approved staff-entered table booking slice is tracked under REQ-TBL-004..007 and ADR 0009.

---

## Appendices
- ADR index: `docs/adr/`
- Glossary: `docs/glossary.md`
- Data model: `docs/data-model.md`
- Module contracts: `docs/module/README.md`
- Research: `research/firestore-foundation.md`
