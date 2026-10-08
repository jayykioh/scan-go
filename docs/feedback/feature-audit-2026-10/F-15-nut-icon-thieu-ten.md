# F-15 — Nút Sửa/Xoá món không có tên truy cập được

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=f6` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Trên thẻ món ở `/dashboard/menu`, hai nút chỉ có icon, không `title`, không
`aria-label`:

```tsx
// src/pages/dashboard/MenuPage.tsx:234-245
<button onClick={() => handleOpenModal(item)} className="w-8 h-8 …">
  <Edit2 className="w-4 h-4" />
</button>
<button onClick={() => setDeletingItem(item)} className="w-8 h-8 …">
  <Trash2 className="w-4 h-4" />
</button>
```

**Đo được:** số nút khớp `button[title="Sửa"], button[aria-label*="Sửa"]` trên trang = **0**.

**Đối chứng.** Module Bàn làm đúng, có đủ cả hai:
`title="Lưu trữ bàn"` và `aria-label={\`Lưu trữ ${table.name}\`}`
(`src/pages/dashboard/TablesPage.tsx:164-165`).

**Hướng sửa.** Thêm `aria-label` động theo tên món (`Sửa {item.name}` / `Xoá {item.name}`) như
`TablesPage` đang làm. Rà lại toàn bộ nút chỉ-có-icon trong `MenuPage` và `InventoryPanel`.

**REQ liên quan:** NFR-A11Y.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f6` (từ thư mục gốc repo)
