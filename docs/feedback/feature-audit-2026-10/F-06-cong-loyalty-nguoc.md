# F-06 — Cổng bật Loyalty ngược với bảng quyền lợi gói

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=f3` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Trong Cấu hình, chọn gói **Lite** thì ô "Bật tích điểm hội viên" bị **khoá** và
nhãn ghi thêm "(KHÔNG KHẢ DỤNG Ở LITE)". Chọn gói **Pro** thì mở. Gói **Free** cũng mở.

**Bằng chứng đo được.**

| Gói chọn trong Cấu hình | Ô Loyalty |
|---|---|
| Lite | `disabled=true`, nhãn "(KHÔNG KHẢ DỤNG Ở LITE)" |
| Pro | `disabled=false` |
| Danh sách gói cho chọn | `Lite \| Pro \| Enterprise` |

**Nguyên nhân gốc.** Bảng quyền lợi nói ngược lại hoàn toàn:

```ts
// shared/contracts/subscription.contract.ts:44-53
free: { maxTables: 3, maxOrdersPerDay: 15, features: [] },
lite: { /* … */ features: ['promotions', 'loyalty'] },   // ← Lite CÓ loyalty
pro:  { /* … */ features: ['promotions', 'loyalty', 'nfc', 'kds', 'ai', 'automaticPayment'] },
```

Nhưng giao diện lại khoá đúng gói Lite:

```tsx
// src/pages/dashboard/SettingsPage.tsx:673
disabled={draft.pricingTier === 'Lite'}

// src/pages/dashboard/SettingsPage.tsx:340
loyaltyEnabled: draft.pricingTier !== 'Lite' && draft.loyaltyEnabled,
```

Hệ quả: chủ quán gói Lite — gói được bán kèm loyalty — bị chặn; còn gói Free, vốn không có quyền
lợi nào, lại bật được.

**Hướng sửa.** Đọc quyền lợi từ `allowsFeature(entitlements, 'loyalty')` (đúng như
`SubscriptionPage.tsx:52-53` đang làm) thay vì so sánh chuỗi `pricingTier`. Đồng thời bỏ
"Enterprise" khỏi ô chọn gói: SRS §"Out of scope for v1" (`docs/SRS.md:38`) ghi rõ Enterprise
ngoài phạm vi v1, và ô chọn hiện tại cho phép đặt một gói không tồn tại.

**REQ liên quan:** REQ-SUB-001 (quyền lợi và giới hạn theo gói), REQ-LOY-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f3` (từ thư mục gốc repo)
