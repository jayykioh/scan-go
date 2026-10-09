# F-10 — Vai trò Nhân viên trong simulator không dùng được

**Mức độ:** CAO · **Luồng kiểm chứng:** `--only=s4` trong [`harness/run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** `/simulator/staff`, nhập PIN bất kỳ → `Cần đăng nhập để thực hiện thao tác này. [401]`.

**Nguyên nhân gốc.** `StaffView` xác thực PIN qua callable cần phiên Firebase Auth
(`verifyStaffPin`), nhưng route simulator là công khai và không có phiên nào. Cùng gốc rễ với F-08:
simulator mount các view sản xuất vốn đòi quyền, trên route không đăng nhập.

**Hướng sửa.** Như F-08 — cho simulator dùng đường mock, hoặc chặn hẳn vai trò này trong simulator
kèm thông báo giải thích thay vì để người xem gặp lỗi 401.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs --only=s4` (từ thư mục gốc repo)
