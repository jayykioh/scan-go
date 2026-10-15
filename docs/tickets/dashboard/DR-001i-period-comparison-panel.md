# DR-001i — Khối so sánh kỳ trước

## Requirement links

REQ-RPT-003 (đề xuất mới), REQ-I18N-001, NFR-UX-001.

## Owning module

`owner-dashboard` hiển thị; Reporting sở hữu phép so sánh (DR-001e).

## Allowed file paths

- `src/pages/dashboard/overview/PeriodComparison.tsx` (mới)
- `src/pages/dashboard/OverviewPage.tsx` (chỉ để gắn khối, một lần)
- `shared/contracts/i18n.contract.ts` (nhãn vi + en)

Do not change `functions/**`, the summary contract, or Rules.

## Dependencies

DR-001e. **Và REQ-RPT-003 phải có trong SRS trước** (DR-001j giai đoạn 1). **Tuần tự trên `OverviewPage.tsx`** với DR-001f/g/h.

## Atomic acceptance checklist

- Given kỳ trước có dữ liệu, when mở, then mỗi chỉ số so sánh hiện giá trị kỳ trước, delta và delta phần trăm.
- Given kỳ trước có dữ liệu, when mở, then hiện **số ngày có dữ liệu của cả hai kỳ** ngay cạnh phần so sánh.
- Given kỳ trước không có dữ liệu, when mở, then hiện câu nêu rõ khoảng trống và **không** hiện phần trăm.
- Given delta phần trăm là `null` (kỳ trước bằng 0), when mở, then hiện delta tuyệt đối và không hiện `∞`/`NaN`.
- Given lỗi khi đọc kỳ trước, when mở, then kỳ hiện tại vẫn hiện đủ và phần so sánh báo lỗi riêng, không trắng trang.
- Given ngôn ngữ `en`, when đổi, then nhãn so sánh có bản dịch (REQ-I18N-001).
- Given người dùng chưa chọn kỳ, when mở lần đầu, then mặc định là `day` và so với ngày liền trước có dữ liệu.

## Test plan

- Unit/component: kỳ trước có dữ liệu → delta + hai `dayCount`; kỳ trước rỗng → câu khoảng trống, không có `%`.
- Unit/component: `previous = 0` → không có `Infinity`/`NaN` trong DOM.
- Unit: lỗi đọc kỳ trước không làm mất kỳ hiện tại.
- Unit: khoá i18n mới có ở cả `vi` và `en`.
- Manual: kiểm tay so với kỳ hôm qua trên dữ liệu thật.
- Verify: `npm run test`, `npm run typecheck`, `npm run lint`.
