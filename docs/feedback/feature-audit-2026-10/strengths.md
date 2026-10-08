# Điểm mạnh đã kiểm chứng

Những gì chạy đúng — nền để cải thiện và là chất liệu bán hàng.

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

Ghi lại những gì chạy đúng, vì chúng là nền để cải thiện và là chất liệu bán hàng.

**Bình quân gia quyền giá vốn — đúng.** Nhập 10 kg @ 200 000/kg, sau đó 10 kg @ 300 000/kg →
`unitCostVnd = 250` (250đ/g = 250 000/kg). Khớp chính xác kỳ vọng của ADR 0014 và REQ-INV-010.
Đây là lợi thế mà đợt 1 ghi nhận **không đối thủ nào trong 8 sản phẩm khảo sát có**.

**Trợ lý AI trả lời trung thực.** Hỏi "Hôm nay doanh thu bao nhiêu?" khi chưa có đơn nào được thu:

> "Chào bạn, Hôm nay cửa hàng chưa có doanh thu nào vì chưa có đơn hàng nào được thanh toán trong
> kỳ. Chưa có đơn đã thanh toán trong kỳ. **Không kết luận về lợi nhuận.**"
> kèm `ĐỘ TIN CẬY 30%`, `THIẾU DỮ LIỆU`, và `GEMINI · GEMINI-3.5-FLASH-LITE`

Đúng tinh thần REQ-AI-001/REQ-AI-003: nói rõ chỗ thiếu dữ liệu thay vì bịa số. Không lộ lỗi hệ
thống. Ảnh: [audit-f11-ai-answer.png](../artifacts/audit-f11-ai-answer.png).

**Kho — kiểm soát hao hụt chặt.** Giảm tồn bắt buộc chọn lý do (`Hao hụt / hết hạn` hoặc
`Điều chỉnh khác`) **và** bắt buộc ghi chú; báo cáo thay đổi ghi lại actor, hành động, thời gian,
số lượng và lý do. Đúng REQ-INV-008/REQ-INV-009.

**Sơ đồ bàn — vòng lặp QR khép kín.** Tạo bàn → link `/menu/<token>` → mở link thấy đúng tên bàn
và đúng danh sách món → lưu trữ bàn thì bàn biến mất khỏi danh sách. Đây chính là hành vi mà
module Thực đơn đang thiếu ([F-02](F-02-xoa-mon-khong-bien-mat.md)).

**Nhân sự — luồng end-to-end thật.** Tạo tài khoản có email/mật khẩu tạm/PIN → nhân viên đăng nhập
tại `/staff` bằng email + mật khẩu tạm → nhập PIN 6 số → vào màn hình nhân viên với đúng quyền
theo vai trò (`Lên món tại quầy`, `Tại bàn`, `Mang về`, `Lên món`, `Thu ngân`). Xác thực ở máy chủ,
có phân quyền. Chỉ vướng [F-04](F-04-do-dai-pin-nhan-su.md) ở khâu độ dài PIN.

**ADMIN được chặn đúng hai lớp.** `/dashboard/manage` với tài khoản chủ quán thường hiện
"Tài khoản này không có quyền ADMIN. Mọi truy cập đều bị máy chủ từ chối." — giao diện chặn và
máy chủ cũng chặn. Đúng tinh thần ADR 0010 và REQ-ADM-001.

**Báo cáo doanh thu không sập.** Cả ba kỳ (Hôm nay / Tuần / Tháng) render ổn định, có trạng thái
rỗng rõ ràng ("Chưa có số liệu báo cáo cho hôm nay"), định dạng tiền Việt Nam nhất quán.

**Trang khách công khai hoạt động độc lập với auth.** `/menu/<token>` render đúng trên tải cứng,
không dính [F-01](F-01-tai-cung-rong-du-lieu.md) — một dấu hiệu nữa cho thấy [F-01](F-01-tai-cung-rong-du-lieu.md) là lỗi thời điểm khôi phục phiên, không phải lỗi
dữ liệu.

**Đã loại khỏi báo cáo (không phải lỗi sản phẩm).** Trong quá trình kiểm, bốn hiện tượng trông
giống lỗi đã được xác định là do harness hoặc do thao tác ngoài app, và **không** được tính là
phát hiện:

1. "Báo cáo thay đổi kho (0)" xuất hiện một lần — không tái hiện được; các lần sau đều hiện đúng
   số bản ghi (3, 5, 11).
2. "Menu công khai hiện tên bàn cũ" — harness chọn nhầm link của bàn đầu tiên; đã sửa và xác nhận
   đúng.
3. `publicMenuItems` còn hai món đã bị xoá — do chính script dọn dẹp của tôi xoá thẳng tài liệu
   mà không đi qua app; đã dọn lại. Đây là hành vi đúng của một dự phóng denormalised, không phải
   lỗi.
4. Giá vốn "không đổi" trong lần chạy đầu — do harness nhập 10 000 kg; tính lại theo số thực thì
   bình quân gia quyền chính xác.

Còn **một** điểm chưa xác minh, cần người có ngữ cảnh xác nhận:

- **REQ-INV-003 (kiểm kê)** — `count.service.ts` có ở máy chủ nhưng tôi chưa tìm thấy luồng kiểm kê
  trên giao diện Kho. Có thể nằm ở màn hình khác mà tôi chưa mở tới, nên tôi để ở dạng câu hỏi
  thay vì kết luận.

---

[← Về mục lục](README.md)
