# F-08 — KDS simulator hiện lỗi tiếng Anh thô

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=s2` trong [`harness/run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Vào `/simulator/kitchen`, nhập PIN, màn hình bếp hiện `0 Đơn Chờ` kèm dòng chữ
tiếng Anh **`Missing or insufficient permissions.`** giữa giao diện tiếng Việt. Đây là tái xác
nhận BUG-03 của đợt 1.

**Nguyên nhân gốc.** Các route `/simulator/*` là công khai (không có phiên Firebase Auth), nhưng
`KitchenView` lại mở listener Firestore trực tiếp theo ADR 0015. Firestore Rules từ chối và trả về
thông điệp mặc định bằng tiếng Anh, rồi view hiển thị nguyên văn:

```ts
// src/data/adapters/fulfilment.adapter.ts:262-272
return onSnapshot(
  menuQuery,
  (snap) => { /* … */ },
  (error) => onError?.(error),      // ← lỗi thô đi thẳng lên UI
);
```

**Hướng sửa.** Trong simulator, không mở listener thật: truyền dữ liệu mock vào `KitchenView`/
`CashierView` giống cách `CustomerView` và `OwnerView` đang nhận props. Nếu vẫn muốn gọi thật, phải
bọc lỗi thành câu tiếng Việt nói rõ tình trạng và việc cần làm.

**REQ liên quan:** REQ-KDS-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs --only=s2` (từ thư mục gốc repo)
