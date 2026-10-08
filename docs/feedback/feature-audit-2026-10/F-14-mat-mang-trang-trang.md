# F-14 — Mất mạng: trang trắng, không thông báo

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=f14` trong [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Hiện tượng.** Bật offline rồi tải lại `/dashboard/inventory` → nội dung trang **rỗng hoàn toàn**,
không có câu thông báo nào, không có nút thử lại. Ảnh: [audit-f14-offline.png](../artifacts/audit-f14-offline.png).

**Đánh giá.** Với quán ăn, mất mạng là chuyện thường ngày (wifi yếu, 4G chập chờn). Nhân viên
đứng giữa ca cần biết "đang mất mạng, dữ liệu sẽ đồng bộ lại" chứ không phải nhìn màn hình trắng.
Đây cũng là khoảng trống so với đối thủ đã ghi trong đợt 1 (không đối thủ nào trong 8 sản phẩm
khảo sát chặn gửi đơn khi mất mạng, còn ScanGo thì chặn).

**Hướng sửa.** Thêm một lớp trạng thái kết nối: khi `navigator.onLine === false` hoặc một truy vấn
thất bại vì mạng, hiện một banner cố định "Mất kết nối — đang thử lại" kèm nút thử lại. Về sau mới
tính tới hàng đợi gửi đơn offline.

**REQ liên quan:** NFR-REL (độ tin cậy), không thuộc REQ nghiệp vụ cụ thể.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs --only=f14` (từ thư mục gốc repo)
