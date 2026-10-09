# Đánh giá tính năng ScanGo — đợt 2 (2026-10)

Báo cáo này tiếp nối [comparative-review-2026-10.md](../comparative-review-2026-10.md). Đợt 1 quét
toàn bộ bề mặt trang và 7 luồng tương tác chính. Đợt 2 đi vào **các module tính năng còn lại**
mà đợt 1 chưa chạm tới: Thực đơn, Kho nguyên liệu, Sơ đồ bàn, Nhân sự, Cấu hình, Gói cước,
Doanh thu, Trợ lý AI, Cửa hàng (tenant), cùng 6 vai trò của simulator.

Mọi kết luận dưới đây đều có ảnh chụp hoặc số đo kèm theo trong `artifacts/` (trong `docs/feedback/`), và
mỗi lỗi đều truy được về dòng mã gây ra.

---

## Cấu trúc folder

Mỗi phát hiện nằm trong một file riêng, tự chứa đủ hiện tượng, bằng chứng, nguyên nhân gốc và hướng
sửa — để tra cứu nhanh mà không phải cuộn một báo cáo dài.

| Nhóm | File |
|---|---|
| Tổng quan | `README.md` (file này) |
| Lỗi nghiêm trọng | [F-01](F-01-tai-cung-rong-du-lieu.md) · [F-02](F-02-xoa-mon-khong-bien-mat.md) · [F-03](F-03-fixed-bi-animate-fadein-giam.md) |
| Lỗi mức cao | [F-04](F-04-do-dai-pin-nhan-su.md) · [F-05](F-05-cau-hinh-chi-luu-localstorage.md) · [F-06](F-06-cong-loyalty-nguoc.md) · [F-07](F-07-nut-goi-cuoc-sai-chieu.md) · [F-08](F-08-kds-loi-tieng-anh-tho.md) · [F-09](F-09-pin-simulator-hinh-thuc.md) · [F-10](F-10-nhan-vien-simulator-401.md) |
| Lỗi mức trung bình | [F-11](F-11-do-phu-ngon-ngu.md) · [F-12](F-12-don-vi-kho-khong-nhat-quan.md) · [F-13](F-13-req-inv-011-thieu-canh-bao-gia.md) · [F-14](F-14-mat-mang-trang-trang.md) · [F-15](F-15-nut-icon-thieu-ten.md) · [F-16](F-16-tao-cua-hang-window-prompt.md) |
| Lỗi mức thấp | [F-17](F-17-trang-tu-choi-admin.md) · [F-18](F-18-ten-model-ai.md) · [F-19](F-19-thieu-tai-khoan-admin.md) |
| Phân tích chéo | [strengths.md](strengths.md) — điểm mạnh đã kiểm chứng · [reachability.md](reachability.md) — yêu cầu "Done" nhưng không tới được người dùng |
| Hành động | [recommendations.md](recommendations.md) — 18 khuyến nghị theo 3 đợt · [appendix.md](appendix.md) — đính chính, harness, cách chạy lại, trạng thái dữ liệu |

## Ba việc nên sửa trước

| | Việc | Vì sao trước |
|---|---|---|
| 1 | [F-02](F-02-xoa-mon-khong-bien-mat.md) — thêm bộ lọc `archivedAt` cho danh sách món | Một dòng lệnh, sửa ngay được, đang làm hỏng niềm tin vào nút Xoá |
| 2 | [F-04](F-04-do-dai-pin-nhan-su.md) — đồng bộ độ dài PIN giữa form và máy chủ | Đang chặn hoàn toàn một luồng P0: tạo tài khoản nhân viên |
| 3 | [F-01](F-01-tai-cung-rong-du-lieu.md) — lớp "chờ auth sẵn sàng" dùng chung | Là gốc của bốn triệu chứng ở bốn trang khác nhau |

---

## Tóm tắt điều hành

Đợt 2 kiểm 23 luồng (16 luồng dashboard + 7 luồng simulator), thu **hơn 60 ảnh chụp** và 2 báo
cáo JSON. Kết quả chạy cuối cùng: **43/62 assertion đạt** ở bộ dashboard và **34/37 assertion đạt**
ở bộ simulator — tức **19 + 3 điểm không đạt**, gom thành **19 phát hiện**, trong đó 3 lỗi nghiêm
trọng và 7 lỗi mức cao.

| # | Mức độ | Phát hiện | Ảnh hưởng tới người dùng |
|---|---|---|---|
| [F-01](F-01-tai-cung-rong-du-lieu.md) | **Nghiêm trọng** | Tải cứng làm rỗng dữ liệu ở Thực đơn, Sơ đồ bàn và bảng "Cấu hình đang áp dụng" | Chủ quán mở link đã lưu hoặc tải lại tab là thấy quán "trắng", tưởng mất dữ liệu |
| [F-02](F-02-xoa-mon-khong-bien-mat.md) | **Nghiêm trọng** | "Xóa món" không làm món biến mất khỏi Thực đơn | Bấm xoá mãi không được; tưởng nút hỏng |
| [F-03](F-03-fixed-bi-animate-fadein-giam.md) | **Nghiêm trọng** | `position: fixed` bị `.animate-fadeIn` giam | Thẻ hướng dẫn che nút "THÊM MÓN" (không bấm được) và trôi khỏi màn hình; modal kho sai vị trí |
| [F-04](F-04-do-dai-pin-nhan-su.md) | Cao | Form Nhân sự mời PIN 4 số, máy chủ đòi đúng 6 số | Chủ quán tạo tài khoản nhân viên mà nhân viên **không bao giờ** đăng nhập được |
| [F-05](F-05-cau-hinh-chi-luu-localstorage.md) | Cao | "Lưu thay đổi" ở Cấu hình chỉ ghi vào localStorage | Cấu hình không đồng bộ giữa máy tính và điện thoại |
| [F-06](F-06-cong-loyalty-nguoc.md) | Cao | Cổng bật Loyalty ngược với bảng quyền lợi gói | Chặn đúng gói có quyền, mở cho gói không có quyền |
| [F-07](F-07-nut-goi-cuoc-sai-chieu.md) | Cao | Đang ở gói Free nhưng nút ghi "HẠ CẤP LITE"; không có lối về Free | Sai nghiêm trọng về thương mại, dễ gây tranh chấp |
| [F-08](F-08-kds-loi-tieng-anh-tho.md) | Cao | KDS simulator hiện lỗi tiếng Anh thô `Missing or insufficient permissions.` | Bếp không biết app hỏng hay mất mạng |
| [F-09](F-09-pin-simulator-hinh-thuc.md) | Cao | Bếp/Thu ngân simulator nhận **mọi** PIN 4 số | PIN chỉ còn là hình thức trong bản demo |
| [F-10](F-10-nhan-vien-simulator-401.md) | Cao | Vai trò Nhân viên trong simulator không dùng được (`[401]`) | Không thể demo luồng nhân viên |
| [F-11](F-11-do-phu-ngon-ngu.md) | Trung bình | Đổi ngôn ngữ không ảnh hưởng dashboard, KDS, Thu ngân | Chủ quán nói tiếng Anh vẫn nhận giao diện tiếng Việt |
| [F-12](F-12-don-vi-kho-khong-nhat-quan.md) | Trung bình | Đơn vị không nhất quán trong Kho (kg so với g, nhãn không ghi đơn vị) | Nhập "10" tưởng 10 g nhưng thành 10 kg; giá vốn hiển thị hai đơn vị cạnh nhau |
| [F-13](F-13-req-inv-011-thieu-canh-bao-gia.md) | Trung bình | **REQ-INV-011 ghi "Done" nhưng cảnh báo giá nhập tăng >10% không hề tồn tại** | Chủ quán không biết giá nguyên liệu vừa tăng vọt — đúng thứ ăn mòn lợi nhuận |
| [F-14](F-14-mat-mang-trang-trang.md) | Trung bình | Mất mạng: tải lại app ra trang trắng, không thông báo | Nhân viên không biết phải làm gì |
| [F-15](F-15-nut-icon-thieu-ten.md) | Trung bình | Nút Sửa/Xoá món chỉ có icon, không có tên truy cập được | Trình đọc màn hình không dùng được |
| [F-16](F-16-tao-cua-hang-window-prompt.md) | Trung bình | Tạo cửa hàng dùng `window.prompt` gốc của trình duyệt | Trải nghiệm thô, không kiểm tra tên |
| [F-17](F-17-trang-tu-choi-admin.md) | Thấp | Trang từ chối ADMIN không có lối quay lại | Ngõ cụt nhỏ |
| [F-18](F-18-ten-model-ai.md) | Thấp | Tên model AI hiển thị `GEMINI-3.5-FLASH-LITE` | Cần xác nhận đây là model thật |
| [F-19](F-19-thieu-tai-khoan-admin.md) | Thấp | Không có tài khoản ADMIN nào để kiểm thử end-to-end | Khu vực ADMIN chưa từng được chạy thật |

Ba việc nên sửa ngay, theo đúng thứ tự: **F-02** (một dòng lệnh, xem §3.2), **F-04**
(chặn hoàn toàn một luồng P0), **F-01** (gốc rễ của nhiều triệu chứng).

---

## Phương pháp và bằng chứng

Hai harness mới, chạy trên dev server thật, Firebase Auth/Firestore thật (`scango-8f0e9`) và
Cloud Functions emulator:

| Harness | Số luồng | Nội dung |
|---|---|---|
| [`harness/run-feature-audit.mjs`](../harness/run-feature-audit.mjs) | 16 | Thực đơn, Kho, Bàn, Nhân sự, Cấu hình, Gói cước, Doanh thu, AI, tenant, ADMIN, offline, quét tải cứng 8 trang |
| [`harness/run-simulator-audit.mjs`](../harness/run-simulator-audit.mjs) | 7 | 6 vai trò simulator + đo độ phủ ngôn ngữ |

```bash
# Bộ đầy đủ (cần dev server ở :3000 và functions emulator ở :5001)
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs
```

Kết quả máy đọc được: `artifacts/feature-audit-report.json`,
`artifacts/simulator-audit-report.json`, `artifacts/discover-surface.json`.
Ảnh chụp theo tên `artifacts/audit-<luồng>-<bước>.png`.

**Nguyên tắc phân định.** Mọi phát hiện dưới đây đã được đối chiếu hai chiều: số đo trên trình
duyệt **và** trạng thái thật trong Firestore **và** dòng mã nguồn. Những hiện tượng chỉ xuất hiện
do harness nhập liệu phi thực tế đã bị loại bỏ, không đưa vào báo cáo (xem §7 để biết các trường
hợp đã loại).

---

---

[← Mục lục feedback](../README.md) · Chạy lại toàn bộ: `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs` và `... run-simulator-audit.mjs` (từ thư mục gốc repo)
