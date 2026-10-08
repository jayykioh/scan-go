# Bản đồ tính năng không tới được người dùng

Những yêu cầu được SRS đánh dấu **Done** nhưng không có bề mặt nào để người dùng chạm tới.

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

Đây là loại phát hiện mà `AGENTS.md` quan tâm nhất, vì SRS là nguồn sự thật. Có những yêu cầu
được đánh dấu **Done** nhưng **không có bề mặt nào để người dùng chạm tới**.

| REQ | Trạng thái SRS | Thực tế trong mã | Hệ quả |
|---|---|---|---|
| REQ-HRM-001 (P2 MUST) — xếp ca cho nhân viên | **Done** — "Emulator evidence pass" | `functions/src/modules/workforce/index.ts` có `callableWorkforceScheduleShift`. **Không có** `src/data/adapters/workforce.adapter.ts`; **không** file nào trong `src/` tham chiếu callable workforce | Chủ quán **không thể** xếp ca |
| REQ-HRM-002 (P2 MUST) — chấm công vào/ra, sửa có phê duyệt | **Done** — "Emulator and Rules evidence pass" | 4 callable (`ClockIn`, `ClockOut`, `RequestCorrection`, `ApproveCorrection`) + `GetAttendanceSummary`; **0 tham chiếu trong `src/`** | Nhân viên **không thể** chấm công |
| REQ-PRO-001 (P2) — khuyến mãi | **Done** — "Emulator evidence pass" | `src/data/adapters/promotion.adapter.ts` chỉ được `src/data/tenantStore.ts` import; **không** component hay trang dashboard nào dùng | Không có màn hình khuyến mãi |
| REQ-INV-011 (P1 SHOULD) — cảnh báo giá nhập tăng >10% | **Done** — "Unit evidence pass" | Hàm có, không nơi nào gọi (xem [F-13](F-13-req-inv-011-thieu-canh-bao-gia.md)) | Cảnh báo không bao giờ xuất hiện |
| REQ-INV-003 (P2 MUST) — kiểm kê và lưu chênh lệch | **Done** — "Emulator evidence pass" | `functions/src/modules/inventory/count.service.ts` có; UI Kho chỉ có `Tồn / Sửa / Lưu trữ`, không thấy luồng kiểm kê | Cần xác minh thêm (xem §7) |

**Đọc bảng này thế nào.** Máy chủ làm rất tốt — có callable, có test emulator. Vấn đề nằm ở chữ
**"Done"**: với người dùng, một yêu cầu chỉ "done" khi họ chạm được vào nó. Nên tách trạng thái
thành hai cột — `Server` và `UI` — hoặc thêm quy ước: chỉ đánh dấu Done khi có ít nhất một đường
dẫn từ giao diện tới lệnh đó.

**Đề xuất cụ thể.** Trước khi coi M3 hoàn thành, thêm một bài kiểm tra tự động duyệt mọi callable
đã export trong `functions/src/index.ts` và xác nhận mỗi cái có ít nhất một tham chiếu trong `src/`.
Đây là một script nhỏ, chạy trong CI, và nó sẽ bắt được đúng loại khoảng cách này.

---

[← Về mục lục](README.md)
