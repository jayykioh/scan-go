# F-02 — "Xóa món" không làm món biến mất khỏi Thực đơn

**Mức độ:** NGHIÊM TRỌNG · **Luồng kiểm chứng:** `--only=f6` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Trên `/dashboard/menu`, bấm icon thùng rác ở một món → hộp thoại "XÓA MÓN?" hiện
đúng tên món → bấm "XÓA" → hộp thoại đóng, **món vẫn nằm nguyên trong lưới**, không có thông báo
thành công. Chủ quán sẽ bấm lại nhiều lần.

**Bằng chứng đo được.** Sau khi bấm xoá và xác nhận, kiểm tra Firestore:

```
0fvZk3XTj2ufoDNYCfwP | [AUDIT] Phở 572234 | archivedAt: 2026-10-08T12:56:38.283Z
```

`archivedAt` **đã được ghi** — lệnh lưu trữ thành công. Nhưng 4/5 món trong `menuItems` đều có
`archivedAt` và **tất cả vẫn hiện** trong lưới Thực đơn (xem [audit-f6-menu-deleted.png](../artifacts/audit-f6-menu-deleted.png)).

**Nguyên nhân gốc.** Listener của trang Thực đơn đọc toàn bộ collection mà **không lọc** món đã
lưu trữ:

```ts
// src/data/adapters/catalog.adapter.ts:228-231
const menuQuery = query(
  collection(db, 'tenants', tenantId, 'menuItems'),
  limit(PRIVATE_MENU_LISTENER_LIMIT),   // ← thiếu where('archivedAt', '==', null)
);
```

Trong khi module Bàn làm **đúng**:

```ts
// src/data/adapters/table.adapter.ts:182
where('archivedAt', '==', null),
```

Và menu công khai cũng làm đúng (dự phóng `publicMenuItems` được dựng lại với
`where('archivedAt', '==', null)` tại `functions/src/modules/catalog/index.ts:431`). Nghĩa là
**khách đã không còn thấy món đó, nhưng chủ quán thì vẫn thấy** — hai bên nhìn hai thực tế khác nhau.

**Hướng sửa.** Thêm `where('archivedAt', '==', null)` vào truy vấn owner menu, y hệt
`table.adapter.ts:182`. Nếu muốn giữ món đã lưu trữ để xem lại, tách thành tab "Đã lưu trữ" riêng
thay vì trộn vào danh sách đang bán.

**REQ liên quan:** REQ-CAT-002 (quản lý món), REQ-CAT-006 (menu công khai).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f6` (từ thư mục gốc repo)
