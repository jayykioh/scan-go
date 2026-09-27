# ScanGo — Current Project Status

**Audit date:** 2026-09-15  
**Branch:** `release/mvp`  
**Current architecture:** React 19 + TypeScript + Vite frontend mockup  
**Target backend:** Firebase

## Executive summary

UI/UX và frontend flow đã đủ tốt cho demo sản phẩm. Hầu hết màn hình và actor chính đã có, nhưng dữ liệu vẫn là `mockData`/`localStorage`. Dự án chưa phải MVP production vì chưa có database, backend, authentication, tenant security, realtime đa thiết bị, NFC session, payment hoặc OTP thật.

Đánh giá tương đối:

- Frontend/UI demo: **80–90%**.
- Backend/database: **0–5%**.
- Production-ready MVP theo technical blueprint: **25–35%**.

Các tỷ lệ trên là đánh giá kỹ thuật để lập kế hoạch, không phải metric tự động.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm run lint`: passed (ESLint flat config, web + shared + functions).
- `npm run test`: Vitest runner configured; chưa có test.
- Firebase backend: project `scango-8f0e9`, deny-by-default Firestore and Storage rules.
- Tenant callables deployed: `callableTenantBootstrap`, `callableTenantListMemberships`, `callableTenantSelectActive`.
- Web login uses Firebase phone OTP; dashboard shows memberships and active-Tenant switch.
- Emulator Rules tests: deferred under ADR 0006.

## Completed for frontend demo

- Landing page, introduction, login và register UI.
- React Router với dashboard, simulator và public menu routes.
- Dashboard: overview, shop management, menu, tables, staff, settings, subscription.
- Simulator cho Owner, Customer, Kitchen, Cashier, Waiter/Staff và Solo Operator.
- Public menu theo route `/menu/:tableId`.
- Customer flow: menu, category/search, modifiers, cart, promotion, loyalty mock, order tracking.
- Order state mock: `pending → cooking → ready → served → paid`.
- Menu/table/staff/ingredient CRUD lưu local.
- Năm industry templates.
- Revenue/COGS/profit dashboard mock.
- PWA manifest và Vercel SPA rewrite.
- State persistence và sync giữa các tab cùng browser bằng `localStorage`.

## Partial or simulated features

| Feature | Current behavior | Missing for production |
|---|---|---|
| Authentication | Form/PIN UI | Firebase Auth, sessions, guards, RBAC |
| Realtime | React state + storage event | Firestore realtime across devices |
| QR | Public route by table ID | QR generation/printing, signed session |
| NFC | Simulated tap/flags | NDEF read/write, secret verification, session token |
| Pay-First | UI label/config | Payment state and kitchen gate |
| Cashier | Marks local order paid | Authorized/atomic server operation |
| Loyalty | Client-side points | Ledger, OTP provider, idempotency, fraud protection |
| Inventory | Partial local deduction | Shared model, transaction, Auto-86 |
| AI | Keyword/rule responses | Gemini/LLM integration and safe data context |
| Subscription | Changes local flag | Billing and server-side entitlement |
| PWA | Manifest | Service worker, caching and offline flow |

## Not implemented

- Firebase Emulator Suite and automated Rules tests (deferred under ADR 0006).
- Firestore collections and indexes; only deny-by-default Security Rules exist.
- Cloud Functions/API (Node 22 workspace built, no handlers yet).
- Multi-tenant data isolation.
- Protected dashboard routes and staff authorization.
- Table sessions and expiring session tokens.
- Server-side order pricing and modifier/promotion validation.
- Validated order/order-item state machine.
- Real payment confirmation, gateway callbacks or refunds.
- Inventory transactions, Auto-86 and scheduled reports.
- OTP delivery/verification and loyalty transaction ledger.
- Plan limits and subscription billing.
- Unit, integration and E2E tests.
- Monitoring, analytics and backup strategy. CI exists in `.github/workflows/ci.yml`.

## Known inconsistencies and risks

1. `tableSecret` is generated locally but not included in or validated from the public URL.
2. Regenerating a secret does not invalidate the old menu link.
3. Kitchen/Cashier standalone PIN screens accept any sufficiently long PIN.
4. Pay-First orders still enter Kitchen as `pending` before payment.
5. Loyalty points and OTP can be manipulated entirely from the browser.
6. Loyalty rate/welcome points differ between Customer, Cashier and Solo flows.
7. Solo Operator owns a separate ingredient model/state from Owner/dashboard.
8. Promotion `manual` mode is not fully enforced.
9. Some overview metrics are hard-coded while others derive from local orders.
10. Pricing names conflict between code and product blueprint.
11. `OwnerView` and `SoloOperatorView` are large monolithic components that will be difficult to test safely.

## Architecture decision

Keep React/Vite. Do not migrate to Next.js solely to add backend functionality.

Use:

- React/Vite for the customer PWA and internal dashboards.
- Firebase Auth for internal actors.
- Firestore for tenant-scoped realtime data.
- Cloud Functions 2nd gen for trusted business logic.
- Security Rules to block unauthorized/direct writes.
- Cloud Scheduler for daily reports, expired sessions and fraud scans.

## Recommended implementation roadmap

### Phase 0 — align contracts and product decisions

- Confirm `Free/Lite/Pro` versus `Lite/Pro/Enterprise`.
- Confirm when inventory is deducted.
- Choose NFC provisioning approach: Android Web NFC or external NFC Tools for MVP.
- Choose OTP provider.
- Define canonical order/payment/order-item state machines.
- Split large components and create shared domain/service boundaries.

### Phase 1 — Firebase foundation

- Initialize Firebase and Emulator Suite.
- Add Auth, tenant schema, custom claims/membership and route guards.
- Add Firestore rules/indexes and seed one demo tenant.
- Add shared validation types.

### Phase 2 — production Pay-Later vertical slice

- Implement `openTableSession` and `createOrder`.
- Recalculate prices, modifiers and promotions on the server.
- Connect Customer, Kitchen, Waiter and Cashier with Firestore realtime.
- Enforce authorized forward-only state transitions.
- Implement `confirmCashPayment`.

### Phase 3 — Pay-First and NFC/QR

- Separate `order_status` and `payment_status`.
- Prevent unpaid Pay-First orders from reaching Kitchen.
- Generate/print real QR codes.
- Validate table secret, expire sessions and support secret rotation.
- Implement NFC provisioning for the chosen platform strategy.

### Phase 4 — inventory and reports

- Unify ingredient/recipe model.
- Implement transactional deduct/restore inventory and Auto-86.
- Generate daily revenue/COGS/profit reports.

### Phase 5 — loyalty and OTP

- Add customers, loyalty config and append-only loyalty transactions.
- Implement OTP request/confirm, rate limits and fraud flags.
- Make earning/redemption/reversal idempotent.

### Phase 6 — production hardening

- Add unit, emulator integration and E2E tests.
- Add CI, error monitoring, analytics and backups.
- Add service worker/offline behavior and device testing.
- Enforce plan limits and integrate billing only after tiers are finalized.

## Immediate next milestone

The next engineering milestone should be one real Pay-Later flow across separate devices:

```text
Authenticated owner creates table/menu
→ customer opens a verified table session
→ server creates a priced order
→ kitchen receives it via Firestore realtime
→ staff advances the order
→ cashier confirms payment
→ owner sees the resulting revenue
```

Do not begin loyalty, AI or payment-gateway work before tenant security and this vertical slice are stable.
