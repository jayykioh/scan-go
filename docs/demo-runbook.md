# ScanGo — Demo Runbook

| Field | Value |
|---|---|
| Document ID | DEMO-SCANGO-001 |
| Version | 1.0 |
| Date | 2026-10-02 |
| Status | Active |
| Companion to | `docs/SRS.md`, `docs/features.md` |

This runbook lists the main features to show in a product demo, the exact
screens to open, the talking points, and the known gaps. Each feature cites its
requirement ID from `docs/SRS.md`.

## 1. Preparation

Do this before the audience arrives.

1. Start the app and the Function emulator.
   ```bash
   npm run emulators
   npm run dev
   ```
2. Confirm `.env.local` has `VITE_USE_FUNCTIONS_EMULATOR=true`.
3. Seed the demo tenant (Owner email is required).
   ```bash
   npm run seed -- --owner-email <owner-email> --confirm
   ```
   Add `--orders 100` to spread 100 Orders across the days, for example
   `--days 10 --orders 100`.
4. Confirm the seed printed `Đã seed xong` and the demo tenant id `demo-nha-hang`.
   The seed also prints where each ingredient price came from. Ten of the 20
   prices come from a real retail survey and the rest from Seed defaults; run
   `npm run market:survey` to refresh them, and see
   [market price survey](market-price-survey.md) for why a retail price is not a
   purchase cost.
5. Open the Owner dashboard and confirm the revenue cards show numbers.

Warning: only one Functions emulator may use port 5001. A running test emulator
(`scango-rules-test`) steals that port and makes every callable fail. Stop it
first.

### Demo accounts

| Actor | Entry point | Credentials |
|---|---|---|
| Owner | `/login` | Owner email + password |
| Kitchen | `/staff` | `bep@demo.scango.vn` / `scango123` / PIN `111111` |
| Waiter | `/staff` | `phucvu@demo.scango.vn` / `scango123` / PIN `222222` |
| Cashier | `/staff` | `thungan@demo.scango.vn` / `scango123` / PIN `333333` |
| Customer | `/menu/<table-token>` | no account |

The seed data is 20 ingredients, 10 menu items with images, 10 tables, four
Staff, 14 days of paid orders, and revenue daily stats.

## 2. Demo flow (about 15 minutes)

Run the flow in this order. It follows one Order from scan to revenue.

### 2.1 Landing and problem framing — 1 min
- Screen: `/` and `/introduce`.
- Say: ScanGo removes the cashier bottleneck for shops with 5–15 tables.
- Feature: Self-service QR ordering (REQ-ORD-001).

### 2.2 Owner sign-in and dashboard — 2 min
- Screen: `/login`, then `/dashboard`.
- Show today's revenue, gross profit, and paid order count.
- Say: numbers come from paid Orders and recipes, not from manual entry.
- Feature: Reporting, REQ-RPT-001 and REQ-RPT-002.

### 2.3 Menu and image — 1 min
- Screen: `/dashboard/menu`.
- Show 10 items with images, price, and category.
- Say: one change reaches the Customer menu in under two seconds.
- Feature: Catalog, REQ-CAT-001 and REQ-CAT-002.

### 2.4 Tables and QR — 1 min
- Screen: `/dashboard/tables`.
- Generate or show a table QR link.
- Say: each table link is an opaque token and can be revoked.
- Feature: Table Access, REQ-TBL-001.

### 2.5 Inventory and change report — 2 min
- Screen: `/dashboard/inventory`.
- Add an ingredient, then open "Báo cáo thay đổi".
- Say: the Kitchen may also manage stock, and every add, edit, and archive is
  reported with the actor and time.
- Feature: Inventory and change report, REQ-INV-001, REQ-INV-008.

### 2.6 Staff accounts and PIN — 1 min
- Screen: `/dashboard/staff`.
- Add a Staff account with email, temporary password, PIN, and role.
- Say: each Staff has an account and a tenant-scoped PIN; the PIN is stored only
  as a hash.
- Feature: Staff accounts, REQ-AUTH-002 and REQ-AUTH-003.

### 2.7 Customer orders by QR — 2 min
- Screen: `/menu/<table-token>` on a phone.
- Choose items, add a topping, submit a Pay-Later order.
- Say: the server owns the price and the cart never sets money values.
- Feature: Customer ordering, REQ-ORD-001 and REQ-ORD-002.
- Feature: Public tracking, REQ-ORD-003.

### 2.8 Kitchen fulfilment and stock deduction — 2 min
- Screen: `/staff` as Kitchen, then the "Bếp" tab.
- Move the new order `Chờ → Đang nấu → Sẵn sàng`.
- Say: starting cooking deducts ingredients in one transaction.
- Feature: Kitchen, REQ-KDS-001; Inventory deduction, REQ-INV-001.

### 2.9 Waiter serves — 1 min
- Screen: `/staff` as Waiter, then "Phục vụ" tab.
- Mark the ready order served.
- Feature: Waiter, REQ-WAI-001.

### 2.10 Cashier payment — 2 min
- Screen: `/staff` as Cashier, or `/simulator/cashier`.
- Confirm cash, or show the dynamic VietQR instruction.
- Say: a confirmed Payment is immutable; correction uses reversal or refund.
- Feature: Cashier, REQ-CAS-001 and REQ-CAS-002; Payment, REQ-PAY-001.

### 2.11 Revenue lifted by the new order — 1 min
- Screen: `/dashboard`.
- Refresh and show the paid order count and revenue increased.
- Feature: Reporting, REQ-RPT-001.

### 2.12 AI assistant (Owner only) — 2 min
- Screen: `/dashboard`, open the AI assistant button.
- Ask "Hôm nay doanh thu và lãi gộp là bao nhiêu?".
- Then ask "Doanh thu có đang giảm so với hôm trước không?" to show the
  revenue-drop warning.
- Say: the assistant warns when revenue drops 20 percent or more against the
  previous day, cites both day keys, and shows the formula.
- Say: the assistant is read-only, cites its source, and never changes money.
- Feature: AI assistant, REQ-AI-001, REQ-AI-003, REQ-AI-006.
- Feature: AI revenue warning, REQ-AI-007.

### 2.13 Multi-tenant and ADMIN (optional) — 1 min
- Screen: Owner sidebar Tenant switcher; `/dashboard/manage` for ADMIN.
- Say: data is isolated per Tenant and every ADMIN change is audited.
- Feature: Tenant, REQ-TEN-001; ADMIN, REQ-ADM-001.

## 3. Feature-to-screen map

| Area | Requirement | Screen |
|---|---|---|
| Self-service QR ordering | REQ-ORD-001 | `/menu/<token>` |
| Pay-First / Pay-Later | REQ-ORD-002 | Public menu, Cashier |
| Order tracking | REQ-ORD-003 | Public menu tracking |
| Catalog and templates | REQ-CAT-001/002 | `/dashboard/menu` |
| Ingredient and Stock | REQ-INV-001 | `/dashboard/inventory` |
| Inventory change report | REQ-INV-008 | `/dashboard/inventory` |
| Kitchen flow | REQ-KDS-001 | `/staff` (Bếp) |
| Waiter flow | REQ-WAI-001 | `/staff` (Phục vụ) |
| Cashier and Payment | REQ-CAS-001/002 | `/staff` (Thu ngân) |
| Revenue reports | REQ-RPT-001/002 | `/dashboard` |
| Staff accounts and PIN | REQ-AUTH-002/003 | `/dashboard/staff` |
| Multi-tenant | REQ-TEN-001 | Owner sidebar |
| ADMIN audit | REQ-ADM-001 | `/dashboard/manage` |
| AI assistant | REQ-AI-001/003 | `/dashboard` widget |
| AI revenue warning | REQ-AI-007 | `/dashboard` widget |
| Table QR link | REQ-TBL-001 | `/dashboard/tables` |
| Workforce and attendance | REQ-HRM-001/002 | Dashboard Staff and Simulator |
| Feedback and loyalty | REQ-FDB-001, REQ-LOY-001 | Customer and Owner views |

## 4. Known gaps to state honestly

- Office Simulator (`/simulator`) still uses browser demo state, not Firestore.
- NFC needs a physical NDEF device step (REQ-NFC-001 is partial).
- Loyalty phone delivery provider is not live (REQ-LOY-001).
- Payment provider secret and live transport are not configured (REQ-PAY-002).
- PWA service worker and offline caching are not finished.
- AI default reply is deterministic without a live provider key.

## 5. Fallback if a live step fails

- If a callable fails, check the Functions emulator and port 5001 first.
- If the report is empty, the audit index may still be building; wait and retry.
- If the Customer page cannot submit offline, that is expected by REQ-ORD-004.
