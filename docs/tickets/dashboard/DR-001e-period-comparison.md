# DR-001e — So sánh kỳ trước

## Requirement links

REQ-RPT-003 (đề xuất mới), REQ-RPT-001, NFR-PERF-001.

## Owning module

Reporting. Dùng lại `getReportingSummary` với `anchorDay` — API **đã hỗ trợ sẵn**, không cần callable mới.

## Allowed file paths

- `src/data/adapters/reporting.adapter.ts`
- `src/data/adapters/reporting.adapter.test.ts`

Do not add a callable, do not change `functions/**`, do not change the summary contract.

## Dependencies

DR-001a (cần `netRevenueVnd` và AOV để so). **Và REQ-RPT-003 phải có trong SRS trước** (DR-001j giai đoạn 1) — `AGENTS.md`.

## Atomic acceptance checklist

- Given kỳ `day`, when so sánh, then kỳ trước là **một ngày** liền trước có dữ liệu.
- Given kỳ `week`, when so sánh, then kỳ trước là **bảy ngày** liền trước.
- Given kỳ `month`, when so sánh, then kỳ trước là **đúng số ngày của tháng đang xem** liền trước.
- Given kỳ trước có dữ liệu, when tính, then trả giá trị kỳ trước, delta tuyệt đối, delta phần trăm, và `dayCount` của **cả hai** kỳ.
- Given kỳ trước không có dữ liệu, when tính, then delta là `null` và có cờ nêu rõ khoảng trống — **không** hiện phần trăm.
- Given giá trị kỳ trước bằng 0, when tính delta phần trăm, then trả `null` (không chia 0).
- Given lỗi khi đọc kỳ trước, when hiện, then dashboard vẫn hiện kỳ hiện tại và báo lỗi phần so sánh, không trắng trang.
- Given một lượt xem, when so sánh, then chỉ **một** lượt đọc thêm (không đọc từng ngày).

## Test plan

- Unit: mỗi kỳ (`day`/`week`/`month`) tính đúng `anchorDay` lùi.
- Unit: kỳ trước rỗng → `null` + cờ khoảng trống; kỳ trước bằng 0 → delta phần trăm `null`.
- Unit: `dayCount` hai kỳ khác nhau vẫn được trả về đủ.
- Unit: lỗi đọc kỳ trước không làm hỏng kết quả kỳ hiện tại.
- Verify: `npm run test -- reporting.adapter`.
