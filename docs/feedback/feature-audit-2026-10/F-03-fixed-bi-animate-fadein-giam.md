# F-03 — `position: fixed` bị giam bởi `.animate-fadeIn`

**Mức độ:** NGHIÊM TRỌNG · **Luồng kiểm chứng:** `--only=f5` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

Đây là lỗi có nguyên nhân gốc rõ ràng nhất trong đợt này, và nó giải thích ba triệu chứng khác nhau.

**Hiện tượng.**

1. Trên `/dashboard/menu`, thẻ hướng dẫn "SCANGO ASSISTANT / HƯỚNG DẪN NHANH" nằm **đè lên nút
   "THÊM MÓN"**. Playwright không bấm được nút này trong 30 giây và báo
   `<div …> subtree intercepts pointer events`. Diện tích chồng: **8 691 px²**.
2. Trên `/dashboard/tables`, thẻ hướng dẫn ở **y = −50** — tức phần trên của thẻ nằm **ngoài màn
   hình**, che nút "THÊM BÀN" (chồng **8 491 px²**). Thẻ được thiết kế để neo góc phải **dưới**.
3. Modal "Thêm nguyên liệu" (`fixed inset-0`) chỉ phủ **1152 × 339 px** trên khung nhìn
   **1440 × 900**. Nền tối hụt, modal lệch lên đỉnh trang, phần dưới trang vẫn sáng nguyên.
   Ảnh: [audit-f5-modal-inventory.png](../artifacts/audit-f5-modal-inventory.png).

**Nguyên nhân gốc.** Keyframe `fadeIn` đặt `transform`, và `animation-fill-mode: both` giữ giá trị
cuối cùng **vĩnh viễn**:

```css
/* src/index.css:119-135 */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }   /* ← transform khác none */
}
.animate-fadeIn { animation: fadeIn 0.25s ease-out both; }
```

Theo đặc tả CSS, một phần tử có `transform` khác `none` trở thành **containing block** cho mọi
con `position: fixed`. Nên mọi container `.animate-fadeIn` sẽ "giam" các phần tử `fixed` bên trong.
Đo trực tiếp trên trình duyệt:

```json
"containingBlock": {
  "className": "p-6 md:p-12 w-full max-w-6xl mx-auto animate-fadeIn space-y-6",
  "transform": "matrix(1, 0, 0, 1, 0, 0)",
  "animation": "fadeIn",
  "fillMode": "both"
}
```

`MenuPage.tsx:165` và `TablesPage.tsx:124` đều có root `animate-fadeIn`, và cả hai đặt
`<GuideModal>` **bên trong** root đó. `InventoryPanel.tsx:343` cũng vậy, và `Modal` của nó
(`InventoryPanel.tsx:812`) không dùng portal nên bị giam theo.

**Phép đối chứng.** Modal "Thêm nhân sự" — cùng khái niệm, nhưng `StaffPage.tsx:324` render qua
`createPortal(..., document.body)` — phủ **đúng 1440 × 900**, `containingBlock: null`. Vậy vấn đề
không phải "modal hỏng" mà là "modal không thoát khỏi ancestor biến đổi".

**Hướng sửa.** Chọn một trong hai, và làm nhất quán:

- **Khuyến nghị:** bỏ `transform` khỏi keyframe (chỉ dùng `opacity`), hoặc đổi
  `animation-fill-mode` từ `both` sang `forwards` kèm keyframe cuối không có `transform`. Như vậy
  `.animate-fadeIn` không còn tạo containing block, và mọi `fixed` bên trong hoạt động lại.
- Hoặc: render mọi modal/thẻ nổi qua `createPortal` ra `document.body`, như `StaffPage` và
  `TablesPage` đang làm. Cách này chữa triệu chứng cho từng chỗ, không chữa gốc.

**REQ liên quan:** NFR-UI (tính dùng được), không thuộc REQ nghiệp vụ nào.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f5` (từ thư mục gốc repo)
