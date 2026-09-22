# Kế hoạch giao P0 đầu tiên — ScanGo

**Nguồn:** SRS 1.1, TECH_STACK 1.1, data model, module contracts, ADR 0001–0005.  
**Phạm vi:** M1/P0. Không có thay đổi yêu cầu.

## Lộ trình pha

| Pha | Phạm vi đã duyệt | Kết quả |
|---|---|---|
| M1 / P0 | Auth, Tenant, Config, Catalog, Inventory, Table Access, Ordering, Fulfilment, Payment, onboarding, ADMIN, i18n, bảo mật, hiệu năng, lưu giữ, sao lưu. | Customer đặt Order và Staff vận hành an toàn. |
| M2 / P1 | Solo, Reporting, dailyStats, AI assistant, Sentry. | Owner dùng báo cáo và AI assistant. |
| M3 / P2 | NFC, Promotion, Loyalty, Subscription, tự động xác nhận Payment. | Mở rộng cách dùng và kế hoạch. |
| Roadmap / P3 | Chỉ yêu cầu P3 hoặc sửa đổi SRS đã duyệt. | Không có REQ P3 đã duyệt để thực hiện. |

Không thuộc các pha: Enterprise, delivery, printers, tax invoices, payroll, ingredient purchasing, và native application.

## Đồ thị phụ thuộc P0

```text
P0-001 Config
  ├─> P0-002 Owner Auth + Tenant creation
  │     └─> P0-003 Membership + tenant reads
  │           └─> P0-004 Staff PIN + ACL
  ├─> P0-005 Catalog ─> P0-007 Customer Order ─> P0-009 Payment
  └─> P0-006 Table Access ─┘                     └─> P0-later cancel/reversal
P0-005 Catalog ─> P0-008 Inventory + Kitchen ─> P0-010 Waiter + notification
P0-005 + P0-006 + P0-009 ─> P0-010 Onboarding evidence

P0-later: ADMIN, i18n, offline cache validation, privacy, retention/archive,
backup/restore, performance, real-time p95, and Customer usability evidence.
```

`P0-later` là phạm vi M1 còn lại. Nó không phải ticket trong đợt đầu này.

## Làn làm việc song song

- **Developer 1 — Config, Firebase Auth, Tenant:** P0-001 đến P0-004 và P0-010B.
- **Developer 2 — Catalog, Table Access:** P0-005 và P0-006.
- **Developer 3 — Ordering, Fulfilment:** P0-007 và P0-010A; P0-008B dùng Inventory contract.
- **Developer 4 — Inventory, Payment:** P0-008A và P0-009; Payment và cooking chỉ tích hợp tại atomic transaction gate.

**Ticket bắt đầu:** **P0-001**. Nó tạo Config contract cho PIN, retry, retention, backup, timezone, và public-order rate limit.

## Tickets theo thứ tự khuyến nghị

### P0-001 — Config: defaults, precedence, và inspection
- **Mục tiêu:** Cung cấp Config đã kiểm tra cho các module và cho phép inspection nguồn giá trị.
- **REQ/NFR:** REQ-CFG-001, NFR-CFG-001, CON-006, CON-007, NFR-MOD-001.
- **Chi tiết:** Tạo typed `config.ts`; resolve defaults → `platform/config` → allowed tenant overrides; từ chối key hoặc value không hợp lệ; version thay đổi; callable ADMIN-config qua Config; UI chỉ hiển thị nguồn config tại vị trí có quyền.
- **Module sở hữu:** Config. ADMIN chỉ gọi Config, không ghi `platform/config` trực tiếp.
- **Khu vực:** frontend cấu hình và route có quyền; Firebase Functions Config handler/service/schema; `platform/config`, tenant `configOverrides`; Firestore Rules, Emulator fixtures; `docs/module/config.md` và SRS traceability.
- **Phụ thuộc:** Không có. Chặn P0-002, P0-004, P0-009, và P0-later retention/backup.
- **Kiểm tra chấp nhận:** Given ba giá trị hợp lệ, when resolve một key, then tenant value thắng và API/UI cho biết nguồn. Given key cấm, when Owner ghi override, then server từ chối.
- **Tests:** Config unit/contract tests; Functions Emulator validation and authorization tests; Rules deny direct `platform/config` write.
- **Bằng chứng hoàn thành:** ảnh hoặc video inspection; log Emulator xanh; traceability cập nhật cho năm ID.

### P0-002 — Owner phone OTP và Tenant đầu tiên
- **Mục tiêu:** Owner xác thực bằng phone OTP và có Tenant đầu tiên với user profile.
- **REQ/NFR:** REQ-AUTH-001, CON-001, CON-002, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001.
- **Chi tiết:** Dùng Firebase Auth phone OTP; sau xác thực, Tenant tạo profile `users/{uid}`, Tenant, và Owner membership qua server command; UI auth chuyển sang Tenant đầu tiên.
- **Module sở hữu:** Auth sở hữu xác thực. Tenant sở hữu Tenant, profile, và membership.
- **Khu vực:** `src/pages/auth/`; frontend auth/Tenant adapter; Firebase Functions Auth và Tenant services; `users`, `tenants`, `members`, audit; Rules/Emulator fixtures; module Auth/Tenant docs.
- **Phụ thuộc:** P0-001. Chặn P0-003 đến P0-010.
- **Kiểm tra chấp nhận:** Given registered phone, when Owner verifies valid OTP, then authenticated session bắt đầu. Given Tenant mới, when command hoàn tất, then mỗi business record có `tenantId` và Owner membership.
- **Tests:** Auth adapter tests; Functions Emulator command tests; Rules cross-user deny tests; timestamp and integer-field fixtures.
- **Bằng chứng hoàn thành:** Firebase Auth Emulator flow; Tenant/membership fixture; traceability cập nhật.

### P0-003 — Nhiều Tenant, activeTenantId, và read boundary
- **Mục tiêu:** Owner chọn Tenant hoạt động mà không có cross-tenant leakage.
- **REQ/NFR:** REQ-TEN-001, REQ-ACL-001, NFR-SEC-001, NFR-MOD-001.
- **Chi tiết:** Callable Tenant đổi `activeTenantId`; membership query; bounded tenant-scoped read adapters; deny-by-default Rules cho Tenant data. UI Tenant switcher làm mới dữ liệu và quyền theo membership.
- **Module sở hữu:** Tenant; các module khác chỉ nhận authorization decision.
- **Khu vực:** `src/layouts/SimulatorLayout.tsx`; Tenant query adapters; Firebase Functions Tenant command/authorization service; `users`, `members`, Rules, indexes, Emulator tests; `docs/module/tenant.md`.
- **Phụ thuộc:** P0-002. Chặn P0-004, P0-005, P0-006, P0-008, P0-009.
- **Kiểm tra chấp nhận:** Given hai memberships, when Owner switches Tenant, then data và permission đổi. Given user khác Tenant, when read hoặc gọi command, then server và Rules từ chối.
- **Tests:** Two-Tenant Emulator matrix; listener unsubscribe and bounded-query unit tests; Tenant contract test with Auth double.
- **Bằng chứng hoàn thành:** recorded Tenant switch; Rules test report; traceability cập nhật.

### P0-004 — Staff PIN, lockout, và server ACL
- **Mục tiêu:** Staff chỉ dùng role và permission đã được Tenant cấp.
- **REQ/NFR:** REQ-AUTH-002, REQ-ACL-001, NFR-SEC-001, NFR-PRIV-001, NFR-MOD-001.
- **Chi tiết:** Callable Auth xác minh hashed tenant Staff PIN; Config áp dụng six digits, five attempts, 15-minute lock; tạo audit event; server authorization kiểm tra role, reduced permission, tenant, session version. UI Staff PIN và denied state dùng kết quả server.
- **Module sở hữu:** Auth sở hữu Staff session và lock state. Tenant sở hữu roles/permissions. Config sở hữu policy. Không module nào ghi state của module khác trực tiếp.
- **Khu vực:** `src/components/StaffView.tsx`; Staff auth UI; Firebase Functions Auth/Tenant authorization contracts; `members`, `audit`; Rules and Emulator tests; Auth/Tenant module docs.
- **Phụ thuộc:** P0-001, P0-003. Chặn Staff, Fulfilment, và Payment tickets.
- **Kiểm tra chấp nhận:** Given default policy, when năm PIN sai, then access locks 15 minutes và audit event tồn tại. Given permission thiếu, when Staff calls operation, then server denies dù UI state thế nào.
- **Tests:** hash and lockout unit tests; Functions Emulator role/reduced-permission/tenant matrix; audit assertion; no plaintext PIN scan.
- **Bằng chứng hoàn thành:** Emulator audit fixture; authorization matrix; traceability cập nhật.

### P0-005 — Catalog Owner và public menu projection
- **Mục tiêu:** Owner quản lý menu; Customer chỉ đọc public-safe menu của Tenant.
- **REQ/NFR:** REQ-CAT-001, REQ-CAT-002, CON-002, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001.
- **Chi tiết:** Catalog callable create/edit/archive/search/category/price/description/image/availability; một template ngành; update private item và `publicMenuItems` trong cùng command; Owner UI menu. Không có Cost, recipe, hoặc private metadata trong public projection.
- **Module sở hữu:** Catalog.
- **Khu vực:** `src/pages/dashboard/MenuPage.tsx`, `src/components/OwnerView.tsx`; Catalog UI/query adapter; Functions Catalog service/schema; `menuItems`, `publicMenuItems`, Storage paths/Rules, indexes, Emulator fixtures; `docs/module/catalog.md`.
- **Phụ thuộc:** P0-001, P0-003, P0-004. Chặn P0-007 và P0-008.
- **Kiểm tra chấp nhận:** Given valid item, when Owner saves, then Customer sees tenant-scoped result within two seconds. Given template, when Owner initializes, then editable categories/items xuất hiện chỉ trong Tenant đó.
- **Tests:** Catalog contract tests; Functions/Routing Emulator isolation tests; projection privacy tests; UI test; bounded public-menu listener test.
- **Bằng chứng hoàn thành:** Owner-to-Customer demo; test p95 measurement fixture; traceability cập nhật.

### P0-006 — Table Access, QR table link, và revocation
- **Mục tiêu:** Owner quản lý Table và Customer chỉ mở đúng Table link hợp lệ.
- **REQ/NFR:** REQ-TBL-001, NFR-SEC-002, CON-002, NFR-SEC-001, NFR-MOD-001.
- **Chi tiết:** Table Access callable create/rename/archive/regenerate; random opaque token; atomically revoke old `publicTableLinks`; Owner Table UI hiển thị QR payload; public resolver chỉ trả Table context tối thiểu.
- **Module sở hữu:** Table Access.
- **Khu vực:** `src/pages/dashboard/TablesPage.tsx`; Table UI/public resolver; Functions Table Access service/schema; `tables`, `publicTableLinks`, Rules and indexes, Emulator fixtures; `docs/module/table-access.md`.
- **Phụ thuộc:** P0-001, P0-003, P0-004. Chặn P0-007.
- **Kiểm tra chấp nhận:** Given regenerated link, when Customer opens old link, then access fails. When Customer opens new link, then chỉ menu context của Table đó mở.
- **Tests:** transaction/revocation Emulator test; public token Rules test; cross-Tenant test; QR UI test; rate-limit Config contract test.
- **Bằng chứng hoàn thành:** old/new link test record; Rules report; traceability cập nhật.

### P0-007 — Customer cart, Pay-Later Order, tracking, và offline block
- **Mục tiêu:** Customer tạo Pay-Later Order không cần account và theo dõi Order an toàn.
- **REQ/NFR:** REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001, NFR-UX-001, NFR-MOD-001.
- **Chi tiết:** Customer browse/search/filter/modifier/cart UI; server validates active Table link, current `publicMenuItems`, integer VND totals, rate limit, App Check, and idempotency; creates immutable Order and `publicOrderTracking`; Pay-Later creates `pending`; offline submit blocks with problem UI.
- **Module sở hữu:** Ordering. Ordering đọc Table Access và Catalog contracts; không ghi data của các module đó.
- **Khu vực:** `src/components/CustomerView.tsx`; customer route/cart/tracking adapter; Functions Ordering service/schema; `orders`, `statusEvents`, `idempotency`, `publicOrderTracking`; Rules/indexes; Ordering module docs.
- **Phụ thuộc:** P0-005, P0-006, P0-001. Chặn P0-008 và P0-009.
- **Kiểm tra chấp nhận:** Given valid Table link, when Customer changes quantities, then current price và integer VND total dùng đúng. Given Pay-Later, when submit, then `pending` tạo. Given no connection, when submit, then không Order nào tạo và UI báo lỗi.
- **Tests:** cart and modifier unit tests; Functions Emulator token/App Check/rate-limit/idempotency tests; public tracking Rules test; end-to-end Pay-Later flow; offline browser test.
- **Bằng chứng hoàn thành:** Order and tracking fixture; E2E report; usability timing script; traceability cập nhật.

### P0-008 — Inventory transaction và Kitchen workflow
- **Mục tiêu:** Kitchen chuyển Order và Inventory khấu trừ đúng một lần khi bắt đầu cooking.
- **REQ/NFR:** REQ-INV-001, REQ-KDS-001, REQ-ORD-003, CON-002, CON-004, NFR-RT-001, NFR-MOD-001.
- **Chi tiết:** Owner quản lý ingredient, stock, recipe, base unit; Fulfilment command `pending → cooking → ready`; Ordering chuẩn bị Order mutation, Inventory chuẩn bị deduction/stockMovements, rồi một transaction commit. Kitchen có thể đổi item availability qua Catalog contract.
- **Module sở hữu:** Inventory sở hữu ingredients/recipes/stockMovements; Fulfilment phối hợp; Ordering là owner duy nhất của Order mutation; Catalog sở hữu availability.
- **Khu vực:** Owner inventory UI, `src/components/KitchenView.tsx`; Functions Inventory/Fulfilment/Ordering contracts; `ingredients`, `recipes`, `stockMovements`, `orders/statusEvents`; Rules/indexes/Emulator tests; three module docs.
- **Phụ thuộc:** P0-004, P0-005, P0-007. Chặn P0-010 và cancel work sau đợt đầu.
- **Kiểm tra chấp nhận:** Given recipe, when Order starts cooking, then một transaction deducts configured quantities. Given authorized Kitchen, when status hoặc availability đổi, then Customer và Staff views update within two seconds.
- **Tests:** quantity/Cost unit tests; retry/idempotency transaction Emulator tests; Kitchen role denial tests; real-time timing harness; E2E pending-to-ready flow.
- **Bằng chứng hoàn thành:** stock movement ledger fixture; transaction retry report; two-second update sample; traceability cập nhật.

### P0-009 — Cashier settlement, dynamic VietQR, và Pay-First gate
- **Mục tiêu:** Cashier xác nhận cash hoặc VietQR đúng một lần; Pay-First không vào Kitchen trước Payment.
- **REQ/NFR:** REQ-CAS-001, REQ-ORD-002, REQ-ORD-003, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001.
- **Chi tiết:** Payment tạo dynamic VietQR instructions; Cashier unpaid queue UI; callable manual cash/VietQR confirmation với idempotency; Payment tạo immutable payment; Ordering prepares `paid` mutation; Pay-First Order bị ẩn với Kitchen trước confirmed Payment.
- **Module sở hữu:** Payment sở hữu payments/VietQR; Ordering sở hữu Order mutation; Fulfilment chỉ đọc Order đủ điều kiện.
- **Khu vực:** `src/components/CashierView.tsx`, Customer payment step, Kitchen query adapter; Functions Payment/Ordering contracts; `payments`, `orders`, `idempotency`, audit; Rules/indexes/Emulator fixtures; Payment and Ordering module docs.
- **Phụ thuộc:** P0-001, P0-004, P0-007. Chặn P0-010 onboarding Payment completion và P0-later cancellation/reversal.
- **Kiểm tra chấp nhận:** Given verified payment, when Cashier confirms, then status becomes `paid` once và immutable Payment tồn tại. Given Pay-First unconfirmed, when Kitchen loads queue, then Order không xuất hiện.
- **Tests:** payment idempotency and immutability Emulator tests; Cashier authorization matrix; Pay-First/Pay-Later E2E tests; VND snapshot tests.
- **Bằng chứng hoàn thành:** Cash/VietQR settlement fixtures; immutable-record assertion; E2E report; traceability cập nhật.

### P0-010 — Waiter, notification, và onboarding completion
- **Mục tiêu:** Hoàn tất vận hành cơ bản và checklist onboarding sau core Ordering slice.
- **REQ/NFR:** REQ-WAI-001, REQ-NOT-001, REQ-ONB-001, REQ-ONB-002, REQ-ORD-003, NFR-RT-001, NFR-UX-001, NFR-MOD-001.
- **Chi tiết:** Fulfilment Waiter queue và `ready → served` callable; visual/audible Kitchen/Waiter notification sau user interaction và persistent mute; Owner onboarding checklist cho shop name, industry, plan, payment mode, Tables, menu, hiển thị bước chưa hoàn tất tiếp theo; chạy usability evidence 15 phút.
- **Module sở hữu:** Fulfilment sở hữu workflow coordination/notification effects. Tenant sở hữu onboardingChecklist. Ordering sở hữu Order mutation. Không module nào ghi state của module khác trực tiếp.
- **Khu vực:** `src/components/StaffView.tsx`, `src/components/KitchenView.tsx`, `src/components/OwnerView.tsx`; notification/mute preference adapter; Functions Fulfilment/Tenant/Ordering contracts; `orders/statusEvents`, Tenant onboarding checklist; Rules/Emulator fixtures; Fulfilment/Tenant docs.
- **Phụ thuộc:** P0-003, P0-004, P0-005, P0-006, P0-008, P0-009.
- **Kiểm tra chấp nhận:** Given ready Order, when Waiter confirms, then status becomes `served`; payment/menu operations remain denied. Given sound enabled, when relevant new Order or ready event arrives, then one visible and audible notification occurs. Given new Tenant, when each onboarding item completes, then checklist marks it complete and shows next item. Given prepared Owner, when following checklist, then all required steps finish within 15 minutes.
- **Tests:** Fulfilment transition/role Emulator tests; notification dedupe and mute UI tests; onboarding state unit/E2E tests; documented timed usability study; real-time timing harness.
- **Bằng chứng hoàn thành:** served Order fixture; muted/unmuted video; checklist E2E and 15-minute study record; traceability cập nhật.

## Quy tắc hoàn thành chung

Mỗi ticket phải giữ server-only business writes, Zod validation, App Check khi có public Order, tenant-scoped Rules, bounded listeners, UTC timestamps, integer VND, and REQ traceability. Worker không được mở rộng sang P1, P2, P3, hoặc non-goal.
