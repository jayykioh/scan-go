# Khuyến nghị theo thứ tự ưu tiên

18 việc, chia ba đợt, kèm hai việc mang tính hệ thống.

[← Về mục lục](README.md) · [Báo cáo đợt 1](../comparative-review-2026-10.md)

---

### Đợt 1 — sửa ngay (ước tính 1–2 ngày)

1. **[F-02](F-02-xoa-mon-khong-bien-mat.md)** — thêm `where('archivedAt', '==', null)` vào `subscribeOwnerMenu`
   (`catalog.adapter.ts:228`). Một dòng. Kèm một test khẳng định món đã lưu trữ không hiện.
2. **[F-04](F-04-do-dai-pin-nhan-su.md)** — form Nhân sự đọc `pinPolicy.length`; đồng bộ `staffCreateInputSchema` với chính
   sách; sửa `MOCK_STAFF_ACCOUNTS` sang 6 số. Thêm test emulator: tạo PIN 4 số phải bị từ chối
   **ngay ở bước tạo**, không phải ở bước đăng nhập.
3. **[F-03](F-03-fixed-bi-animate-fadein-giam.md)** — bỏ `transform` khỏi keyframe `fadeIn` (hoặc đổi fill-mode). Kiểm lại 3 chỗ:
   thẻ hướng dẫn Thực đơn, thẻ hướng dẫn Sơ đồ bàn, modal Thêm nguyên liệu.
4. **[F-07](F-07-nut-goi-cuoc-sai-chieu.md)** — sửa nhãn nút theo thứ tự gói và thêm nút "Về gói Free".
5. **[F-13](F-13-req-inv-011-thieu-canh-bao-gia.md)** — nối `lotPriceIncreasePercent` vào callable, lưu cảnh báo, hiện lên UI. Sửa lại
   trạng thái REQ-INV-011 cho tới khi có bằng chứng tầng callable.

### Đợt 2 — trong sprint tới (ước tính 1 tuần)

6. **[F-01](F-01-tai-cung-rong-du-lieu.md)** — lớp "chờ auth sẵn sàng" dùng chung, thay vì vá từng adapter. Đây là gốc của ba triệu
   chứng (Thực đơn, Sơ đồ bàn, Cấu hình). Thêm test tải cứng cho từng trang dashboard.
7. **[F-05](F-05-cau-hinh-chi-luu-localstorage.md)** — nối nút "Lưu thay đổi" vào `updateTenantConfig`, hoặc đổi nhãn cho trung thực.
8. **[F-06](F-06-cong-loyalty-nguoc.md)** — dùng `allowsFeature(entitlements, …)` thay vì so sánh chuỗi; bỏ Enterprise khỏi ô
   chọn gói.
9. **[F-08](F-08-kds-loi-tieng-anh-tho.md) + [F-10](F-10-nhan-vien-simulator-401.md)** — cho simulator dùng dữ liệu mock thay vì gọi máy chủ thật; bọc mọi lỗi thành
   câu tiếng Việt.
10. **[F-09](F-09-pin-simulator-hinh-thuc.md)** — kiểm PIN simulator với `MOCK_STAFF_ACCOUNTS`, hoặc ghi rõ đây là chế độ demo.
11. **[F-14](F-14-mat-mang-trang-trang.md)** — banner mất kết nối + nút thử lại.

### Đợt 3 — cải thiện trải nghiệm

12. **[F-12](F-12-don-vi-kho-khong-nhat-quan.md)** — ghi đơn vị vào nhãn Kho; thống nhất đơn vị hiển thị giá vốn.
13. **[F-11](F-11-do-phu-ngon-ngu.md)** — quyết định phạm vi i18n và nói đúng phạm vi đó; nếu làm thật, ưu tiên điều hướng
    và tiêu đề dashboard.
14. **[F-15](F-15-nut-icon-thieu-ten.md)** — `aria-label` cho mọi nút chỉ-có-icon.
15. **[F-16](F-16-tao-cua-hang-window-prompt.md)** — modal tạo cửa hàng thay `window.prompt`.
16. **[F-17](F-17-trang-tu-choi-admin.md)/[F-18](F-18-ten-model-ai.md)/[F-19](F-19-thieu-tai-khoan-admin.md)** — lối quay lại ở trang từ chối ADMIN; xác nhận tên model AI; tạo một tài
    khoản ADMIN để khu vực ADMIN có bằng chứng chạy thật.

### Việc mang tính hệ thống

17. **Thêm cột `UI` vào bảng trạng thái SRS** (hoặc một bài kiểm CI) để không lặp lại trường hợp
    REQ-HRM-001/002, REQ-PRO-001 và REQ-INV-011: máy chủ xong nhưng người dùng không tới được.
18. **Thêm test tải cứng (hard-load) cho mọi trang dashboard.** [F-01](F-01-tai-cung-rong-du-lieu.md) đã tồn tại từ đợt 1 và vẫn
    còn; nó chỉ lộ ra khi mở trang trực tiếp, còn test điều hướng trong app thì luôn xanh.

---

[← Về mục lục](README.md)
