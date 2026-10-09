# F-11 — Đổi ngôn ngữ chỉ ảnh hưởng một phần giao diện

**Mức độ:** TRUNG BÌNH · **Luồng kiểm chứng:** `--only=s7` trong [`harness/run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs)

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

**Phương pháp.** Đặt ngôn ngữ về `English`, chụp từng bề mặt; đặt về `Tiếng Việt`, chụp lại; so
sánh danh sách nhãn nút, tiêu đề và điều hướng.

**Kết quả đo được.**

| Bề mặt | Chuyển ngôn ngữ có đổi? | Ghi chú |
|---|---|---|
| Dashboard — điều hướng | **Không** | `DOANH THU \| VẬN HÀNH \| QUẢN LÝ QUÁN \| THỰC ĐƠN \| …` giống hệt ở cả hai chế độ |
| Dashboard — tiêu đề/KPI | **Không** | `TỔNG QUAN KINH DOANH`, `DOANH THU HÔM NAY`, `SỐ ĐƠN`, `ĐƠN ĐÃ THU` giống hệt |
| `/dashboard/menu` | **Không** | `QUẢN LÝ THỰC ĐƠN`, `THÊM MÓN`, `TẤT CẢ` giống hệt |
| `/simulator/kitchen` | **Không** | toàn bộ nội dung giống hệt |
| `/simulator/cashier` | **Không** | toàn bộ nội dung giống hệt |
| `/simulator/owner` — tab | **Có** | `Report/Dishes/Inventory/QR tables/Staff/AI assistant` ⇄ `Báo cáo/Món ăn/Kho /NVL/Bàn QR/Nhân viên/Trợ lý AI` |
| `/simulator/customer` | **Có** | `Choose a table to open the menu.` ⇄ `Chọn bàn để mở menu.` |
| Nút feedback nổi | **Có** | `Send feedback` ⇄ `Gửi phản hồi` |

Ngoài ra, khi đã chọn **Tiếng Việt**, màn khách trong simulator vẫn còn tiếng Anh:
`Member`, `Sign in`, `Track order`, `Add to cart`, `Topping`, `1 items`.

**Đánh giá.** Cơ chế i18n hoạt động (có lưu lên máy chủ, có đổi thật). Vấn đề là **độ phủ**: 9
trang dashboard — nơi chủ quán làm việc cả ngày — hardcode tiếng Việt, nên nút "English" hầu như
không có tác dụng với người dùng chính. Đây là vấn đề định vị: app tự nhận hỗ trợ hai ngôn ngữ.

**Hướng sửa.** Nếu chưa có nhu cầu đa ngôn ngữ thật, hãy nói đúng phạm vi: đổi nhãn khu vực ngôn
ngữ thành "Ngôn ngữ màn hình khách" và ghi chú rõ dashboard hiện chỉ có tiếng Việt. Nếu cần đa
ngôn ngữ thật, đưa các chuỗi hardcode vào catalog theo từng trang, ưu tiên điều hướng + tiêu đề
trước vì đó là phần người dùng thấy nhiều nhất.

**REQ liên quan:** REQ-I18N-001.

---

[← Về mục lục](README.md) · Chạy lại: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs --only=s7` (từ thư mục gốc repo)
