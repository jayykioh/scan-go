# F-17 — Trang từ chối ADMIN là ngõ cụt

**Mức độ:** THẤP · **Luồng kiểm chứng:** `--only=f13` trong
[`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Chủ quán thường mở `/dashboard/manage` sẽ thấy "KHU VỰC ADMIN — Tài khoản này
không có quyền ADMIN. Mọi truy cập đều bị máy chủ từ chối." Trang này **không có nút hay link nào**
để quay lại (đo được: 1 phần tử bấm được trong `main`, chính là nút gửi phản hồi nổi).

**Đánh giá.** Việc từ chối là **đúng** và có cả hai lớp (giao diện + máy chủ) — xem
[strengths.md](strengths.md). Vấn đề chỉ là trải nghiệm: người dùng gõ nhầm URL hoặc bấm nhầm mục
"QUẢN LÝ QUÁN" trong sidebar sẽ bị đưa vào một trang không có lối ra, phải dùng nút Back của trình
duyệt.

**Bằng chứng.** Ảnh: [audit-f13-admin-guard.png](../artifacts/audit-f13-admin-guard.png)

**Nguyên nhân gốc.** `src/pages/dashboard/ManagementPage.tsx` render nhánh từ chối chỉ với tiêu đề
và một đoạn mô tả, không kèm hành động nào.

**Hướng sửa.** Thêm một nút "Về trang doanh thu" (link tới `/dashboard`) trong nhánh từ chối. Cân
nhắc ẩn hẳn mục "QUẢN LÝ QUÁN" khỏi sidebar khi tài khoản không có ADMIN claim, thay vì để người
dùng bấm vào rồi bị chặn.

**REQ liên quan:** REQ-ADM-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f13` (từ thư mục gốc repo)
