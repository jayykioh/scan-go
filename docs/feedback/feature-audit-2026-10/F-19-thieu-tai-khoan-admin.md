# F-19 — Không có tài khoản ADMIN để kiểm thử end-to-end

**Mức độ:** THẤP (nhưng ảnh hưởng tới độ tin cậy của bằng chứng) · **Luồng kiểm chứng:** `--only=f13`
chỉ kiểm được **nhánh từ chối**

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Trong dữ liệu QA (`scango-8f0e9`) không có tài khoản nào mang ADMIN claim. Vì vậy
toàn bộ khu vực ADMIN — `src/pages/dashboard/ManagementPage.tsx`, các callable
`callableAdmin*`, bảng audit, danh sách số điện thoại khách — **chưa từng được chạy thật** trong
hai đợt đánh giá này. Thứ duy nhất kiểm được là nhánh từ chối (xem
[F-17](F-17-trang-tu-choi-admin.md)).

**Vì sao đáng ghi lại.** SRS đánh dấu REQ-ADM-001 là **Done** kèm "Emulator evidence pass". Bằng
chứng emulator là tốt, nhưng nó không trả lời được câu hỏi mà một buổi demo đặt ra: *"ADMIN bấm
vào thì thấy gì?"*. Đây cùng loại khoảng cách với [reachability.md](reachability.md) — có đường
máy chủ, thiếu đường người dùng.

**Bằng chứng.** `artifacts/discover-surface.json` ghi lại `/dashboard/manage` với đúng một tiêu đề
và không có phần tử tương tác nào; ảnh
[audit-f13-admin-guard.png](../artifacts/audit-f13-admin-guard.png).

**Đề xuất.**

1. Tạo một tài khoản ADMIN trên môi trường QA (set custom claim `admin: true`), ghi lại UID vào
   `docs/demo-runbook.md` để lần sau kiểm được.
2. Bổ sung vào harness một luồng `f20-admin-console`: mở `/dashboard/manage`, chọn một tenant, đổi
   tenant, xem bảng audit và danh sách số điện thoại — kèm khẳng định rằng **thao tác đọc không
   ghi audit** (đúng ADR 0010).
3. Lưu ý Storage Rules đã có nhánh ADMIN dùng `request.auth.token.get('admin', false)`
   (`storage.rules`), nên claim này cũng cần thiết để kiểm nhánh đó.

**REQ liên quan:** REQ-ADM-001, NFR-PRIV-001.

---

[← Về mục lục](README.md) · Đây là việc cần chuẩn bị dữ liệu, chưa có luồng harness tự động.
