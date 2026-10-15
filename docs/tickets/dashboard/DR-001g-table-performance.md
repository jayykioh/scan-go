# DR-001g — Bảng hiệu suất theo bàn

## Requirement links

**REQ-RPT-001** — acceptance đòi *"table stats by day, week, and month"* nhưng **không màn nào hiện**.
Đây là lỗ hổng acceptance đang tồn tại, không phải tính năng mới. REQ-I18N-001, NFR-UX-001.

## Owning module

`owner-dashboard` hiển thị; Reporting sở hữu `tables[]` (đã có trong `reportingSummaryResultSchema`, tối đa 50).

## Allowed file paths

- `src/pages/dashboard/overview/TablePerformance.tsx` (mới)
- `src/pages/dashboard/overview/TablePerformance.test.ts` (mới — sửa ticket 2026-10-13: thiếu đường dẫn test)
- `src/pages/dashboard/OverviewPage.tsx` (chỉ để gắn khối, một lần)
- `shared/contracts/i18n.contract.ts` (nhãn vi + en)

Do not change the reporting contract, `functions/**`, or Rules. `tables[]` đã được trả về sẵn.

**Phát hiện khi implement:** tầng đọc đã sort theo `revenueVnd` giảm dần và **cắt ở 50**
(`firestoreRead.ts:357`), và **không báo hiệu bị cắt**. Nên không thể "xem phần còn lại" như acceptance
mong; cách trung thực là **nói rõ thứ tự và giới hạn trên giao diện**. Điều kiện "nhiều bàn hơn số hiển
thị" vì vậy được thoả bằng nhãn, không bằng phân trang.

## Dependencies

None về dữ liệu (API đã trả `tables[]`). **Tuần tự trên `OverviewPage.tsx`** với DR-001f/h/i.

## Atomic acceptance checklist

- Given một kỳ có dữ liệu, when mở dashboard, then bảng hiện doanh thu, số đơn và lợi nhuận gộp của **từng bàn**.
- Given `tables[]` rỗng, when mở, then hiện trạng thái trống có nội dung, không phải bảng rỗng.
- Given một bàn đã archive trong kỳ, when hiện, then dùng `tableName` đã snapshot trong kỳ, không tra lại tên hiện tại.
- Given bàn `takeaway` (mang về), when hiện, then nó xuất hiện như một dòng bình thường, không bị ẩn.
- Given một kỳ `day`, when hiện, then số trong bảng khớp `dailyStats/{day}/tables`.
- Given ngôn ngữ `en`, when đổi, then tiêu đề và nhãn cột có bản dịch (REQ-I18N-001).
- Given nhiều bàn hơn số hiển thị, when mở, then có cách xem phần còn lại (không im lặng cắt bớt).
  → **Sửa 2026-10-13:** tầng đọc cắt ở 50 và không báo hiệu; thoả bằng **nhãn nêu thứ tự và giới hạn**, và `mayBeTruncated` bật khi chạm 50.

## Test plan

- Unit/component: render `tables[]` fixture → đúng số dòng và giá trị; fixture rỗng → trạng thái trống.
- Unit: khoá i18n mới có ở cả `vi` và `en`.
- Manual: đối chiếu tay một bàn với `dailyStats/{day}/tables` trên dữ liệu thật.
- Verify: `npm run test`, `npm run typecheck`, `npm run lint`.

## Bằng chứng — 2026-10-13

**Đã chạy và đạt:**

| Lệnh | Kết quả |
|---|---|
| `npm run test -- TablePerformance` | 15/15 (8 render + 7 hàm thuần) |
| `npm run test` | 348/348, 53 file |
| `npm run typecheck` | sạch — ép đủ khoá i18n ở cả `vi` và `en` |
| `npm run lint` | sạch |
| `XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/verify-table-performance-panel.mjs` | **12/12**, exit 0 |

**Hạ tầng test thêm trong ticket này:** `jsdom` + `@testing-library/react` + `@testing-library/dom` (devDependency) và `vitest.config.ts` mở `include` cho `.test.tsx`. Môi trường mặc định vẫn là `node`; file component tự chọn jsdom bằng `// @vitest-environment jsdom`.

**Harness kiểm trên trang thật** (`verify-table-performance-panel.mjs`) đối chiếu DOM với `dailyStats/{day}/tables` đọc bằng admin SDK: trạng thái trống của kỳ ngày, 10 dòng của kỳ tháng khớp từng tên bàn và số liệu, màn 390px không tràn, nhãn `en` cho cả tiêu đề lẫn trạng thái trống, console sạch. Báo cáo: `docs/feedback/artifacts/table-performance-verification-report.json`.

**Hai phát hiện khi kiểm, không phải lỗi của khối này:**

1. Giao diện mở theo **ngôn ngữ trình duyệt** khi chưa có lựa chọn đã lưu (đúng REQ-I18N-001), nên trên Chromium `en-US` khối này hiện tiếng Anh trong khi phần còn lại của trang hardcode tiếng Việt — kể cả nút chọn kỳ. Đây là hệ quả đã dự liệu của **IMP-11**, không phải khuyết điểm của khối.
2. Nút nổi "Gửi phản hồi" và nút AI (`position: fixed`) che phần cuối của bảng khi cuộn tới đó. Hành vi có sẵn của app với mọi nội dung dài, không riêng khối này.

