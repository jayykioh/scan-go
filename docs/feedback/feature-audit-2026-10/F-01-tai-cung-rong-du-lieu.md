# F-01 — Tải cứng làm rỗng dữ liệu (mở rộng của BUG-01 đợt 1)

**Mức độ:** NGHIÊM TRỌNG · **Luồng kiểm chứng:** `--only=f1` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Mở trực tiếp `http://.../dashboard/menu` (hoặc bấm F5) → trang hiện
"Chưa có món ăn nào." Trong khi đó Firestore **có** dữ liệu. Chuyển trang trong app rồi quay lại
thì dữ liệu hiện đầy đủ.

**Bằng chứng đo được.**

| Bề mặt | Tải cứng | Điều hướng trong app |
|---|---|---|
| `/dashboard/menu` | "Chưa có món ăn nào." | hiện `Trà đá QA` + món vừa tạo |
| `/dashboard/tables` | "Chưa có bàn nào được thiết lập." | hiện `Bàn QA 01` |
| `/dashboard/settings` → "Cấu hình đang áp dụng" | 679 ký tự, **không có dòng nào** | 2 107 ký tự, đủ "Độ dài PIN — 6 chữ số", "Số lần nhập sai tối đa — 5 lần"… |
| `/dashboard/staff` | thoáng hiện "Chọn hoặc tạo cửa hàng trước khi quản lý nhân sự." | hiện bảng nhân sự bình thường |

Dòng cuối là triệu chứng thứ tư, bắt được ở lần chạy đầy đủ: `useActiveTenantId()` cũng trả `null`
trong lúc chờ, nên trang Nhân sự thoáng hiện trạng thái "chưa có cửa hàng" dù cửa hàng đang mở.
Người dùng thấy nó như một cái nháy màn hình; harness thì ghi nhận thành lỗi.

Đối chiếu Firestore ngay sau khi tạo món qua UI:

```
menuItems: [ { name: '[AUDIT] Phở 542235', priceVnd: 55000 }, { name: 'Trà đá QA', priceVnd: 10000 } ]
```

Giao diện vẫn nói "Chưa có món ăn nào". Ảnh: [audit-f1-menu-via-nav.png](../artifacts/audit-f1-menu-via-nav.png) (có dữ liệu) so với
[audit-f1-menu-via-hardload.png](../artifacts/audit-f1-menu-via-hardload.png) (rỗng).

**Nguyên nhân gốc.** Các adapter đọc dữ liệu thoát sớm khi `getFirebaseAuth()?.currentUser` còn
`null` — đúng lúc Firebase Auth đang khôi phục phiên từ IndexedDB — và trả về danh sách rỗng:

```ts
// src/data/adapters/catalog.adapter.ts:210-219
export function subscribeOwnerMenu(onChange, onError) {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    onChange([]);          // ← rỗng, và không ai gọi lại
    return () => undefined;
  }
```

Effect gọi nó chạy một lần với `[]` trong dependency, nên không bao giờ thử lại sau khi phiên
khôi phục xong. Vì vậy tải cứng hỏng, còn điều hướng trong app thì được (lúc đó auth đã sẵn sàng
và component mount lại).

**Hướng sửa.** Chờ tín hiệu auth sẵn sàng trước khi đọc (`onAuthStateChanged` hoặc một
`AuthReadyContext`), rồi mới gọi adapter; hoặc cho adapter trả về trạng thái "đang chờ" để
component tự thử lại. Đây là sửa một lần cho cả lớp lỗi, không phải vá từng trang.

**REQ liên quan:** REQ-CAT-001, REQ-TBL-001, REQ-CON-001 (đọc dữ liệu tenant).

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f1` (từ thư mục gốc repo)
