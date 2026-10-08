# F-16 — Tạo cửa hàng dùng hộp thoại gốc của trình duyệt

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=f12` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Bấm nút "+" cạnh "CỬA HÀNG" → trình duyệt bật `window.prompt` gốc. Harness bắt
được sự kiện: `hộp thoại gốc: prompt — "Tên cửa hàng mới"`. Ảnh: [audit-f12-tenant-create.png](../artifacts/audit-f12-tenant-create.png).

**Nguyên nhân gốc.**

```ts
// src/layouts/DashboardLayout.tsx:130-132
const handleCreateTenant = async () => {
  const shopName = window.prompt('Tên cửa hàng mới', 'Cửa hàng mới');
  if (!shopName || !shopName.trim()) return;
```

**Đánh giá.** Đây là hành động tạo tenant — bước đầu tiên của mọi chủ quán mới. Hộp thoại gốc
không style được, không kiểm tra tên trùng/độ dài, và trên một số trình duyệt di động còn bị chặn.
Không có thông báo lỗi trong UI nếu `createTenant` thất bại (chỉ ghi vào `tenantError` ở sidebar).

**Hướng sửa.** Thay bằng modal trong app (đã có sẵn `Modal` ở `InventoryPanel` và pattern portal ở
`StaffPage`), có ô nhập tên, kiểm tra độ dài, và trạng thái đang lưu.

**REQ liên quan:** REQ-TEN-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f12` (từ thư mục gốc repo)
