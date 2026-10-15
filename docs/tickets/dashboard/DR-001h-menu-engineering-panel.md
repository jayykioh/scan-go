# DR-001h — Ma trận menu engineering

## Requirement links

REQ-RPT-001 (popular items và gross profit từng món), REQ-RPT-004, REQ-I18N-001, NFR-UX-001.

## Owning module

`owner-dashboard` hiển thị; Reporting sở hữu phân loại (DR-001b) và danh sách đầy đủ (DR-001d).

## Allowed file paths

- `src/pages/dashboard/overview/MenuEngineering.tsx` (mới)
- `src/pages/dashboard/OverviewPage.tsx` (chỉ để gắn khối, một lần)
- `shared/contracts/i18n.contract.ts` (nhãn vi + en)

Do not compute the classification inside the component — nó đến từ `reporting.adapter`.
Do not change `functions/**` or Rules.

## Dependencies

DR-001b, DR-001d. **Và REQ-RPT-004 phải có trong SRS trước** (DR-001j giai đoạn 1). **Tuần tự trên `OverviewPage.tsx`** với DR-001f/g/i.

## Atomic acceptance checklist

- Given một kỳ, when mở, then ma trận 2×2 hiện đủ **Stars / Plowhorses / Puzzles / Dogs** với số món mỗi nhóm.
- Given một món bán chạy doanh thu thấp nằm ngoài top 20, when mở, then món đó **có mặt** trong ma trận.
- Given có món bị loại vì chỉ là quà tặng, when mở, then hiện số món đã loại và lý do.
- Given danh sách chạm trần `MAX_ITEMS_PER_DAY = 100`, when mở, then có nhãn "một phần, không phải toàn bộ thực đơn".
- Given `menuCostCoveragePercent < 100`, when mở, then ma trận mang nhãn "tính trên X/Y món có giá vốn".
- Given mẫu rỗng, when mở, then trạng thái trống có nội dung, không hiện ma trận rỗng 4 ô.
- Given ngôn ngữ `en`, when đổi, then tên 4 nhóm và nhãn có bản dịch (REQ-I18N-001).
- Given một món trong ma trận, when xem, then thấy số lượng bán, doanh thu và contribution margin của nó.

## Test plan

- Unit/component: fixture có món ngoài top 20 → xuất hiện trong ma trận; món quà tặng → bị loại và đếm đúng.
- Unit/component: fixture chạm trần → nhãn "một phần" xuất hiện.
- Unit: khoá i18n mới có ở cả `vi` và `en`.
- Manual: kiểm tay một món bán chạy giá rẻ có trong ma trận trên dữ liệu thật.
- Verify: `npm run test`, `npm run typecheck`, `npm run lint`.
