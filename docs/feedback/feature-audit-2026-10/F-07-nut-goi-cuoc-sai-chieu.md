# F-07 — Nút gói cước sai chiều và không có lối quay về Free

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=f4` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Tài khoản đang ở gói **FREE**. Trên `/dashboard/subscription`, thẻ Lite hiện nút
**"HẠ CẤP LITE"**. Nhưng từ Free lên Lite là **nâng cấp**, không phải hạ cấp.

**Bằng chứng đo được.**

```
Gói đang dùng   : FREE
Nhãn nút Lite   : HẠ CẤP LITE
Nhãn nút Pro    : NÂNG CẤP PRO
Số nút liên quan tới Free: 0
```

**Nguyên nhân gốc.** Nhãn chỉ so sánh "có phải gói hiện tại không", không xét thứ tự gói:

```tsx
// src/pages/dashboard/SubscriptionPage.tsx:158-161
disabled={currentPlan === 'Lite'}
{currentPlan === 'Lite' ? 'Đang sử dụng' : 'Hạ cấp Lite'}
```

Và hàm xử lý chỉ nhận ba giá trị, không có `'free'`:

```ts
// src/pages/dashboard/SubscriptionPage.tsx:59-70
const handleUpgrade = async (tier: 'Lite' | 'Pro' | 'Enterprise') => {
  if (!subscription || tier === currentPlan) return;
  /* … */
  const state = await changeSubscriptionPlan(tier === 'Pro' ? 'pro' : 'lite');
```

Trong khi hợp đồng và máy chủ **có** hỗ trợ `free`:
`subscriptionPlanSchema = z.enum(['free', 'lite', 'pro'])`
(`shared/contracts/subscription.contract.ts:14`), và `subscriptionChangePlanInputSchema` nhận
`plan: subscriptionPlanSchema`. Nên đây thuần tuý là thiếu đường dẫn trên giao diện.

Hai hệ quả: (a) nhãn sai chiều gây hiểu nhầm ngay khi đọc; (b) sau khi nâng cấp, **không có cách
nào quay về Free** — một rủi ro thương mại và niềm tin, đúng loại phàn nàn mà đợt 1 ghi nhận ở
đối thủ Toast (hợp đồng dài, khó thoát).

**Hướng sửa.** So sánh theo thứ tự gói (`free < lite < pro`) để chọn nhãn "Nâng cấp"/"Hạ cấp"/
"Đang sử dụng", và thêm nút "Về gói Free" (có bước xác nhận, nêu rõ sẽ mất tính năng nào).

**REQ liên quan:** REQ-SUB-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f4` (từ thư mục gốc repo)
