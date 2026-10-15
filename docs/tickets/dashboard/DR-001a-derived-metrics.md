# DR-001a — Chỉ số dẫn xuất của kỳ báo cáo

## Requirement links

REQ-RPT-001 (phần Cost và gross profit), NFR-DATA-001, NFR-SEC-001, NFR-MOD-001.

## Owning module

Reporting sở hữu phép tính dẫn xuất trên kết quả tổng hợp. Không module nào khác tính lại.

## Allowed file paths

- `src/data/adapters/reporting.adapter.ts`
- `src/data/adapters/reporting.adapter.test.ts`
- `shared/fixtures/reporting.fixture.ts`

Do not change `functions/**`, `firestore.rules`, `dailyStats` documents, or `REPORTING_CONTRACT_VERSION`.

## Dependencies

None. **Làm đầu tiên** — mọi task sau dùng lại định nghĩa này.

## Atomic acceptance checklist

- Given `revenueVnd`, `reversedVnd` và `refundedVnd`, when tính doanh thu thuần, then `netRevenueVnd = revenueVnd − reversedVnd − refundedVnd`.
- Given một kỳ có dữ liệu, when kiểm bất biến, then `grossProfitVnd === netRevenueVnd − costVnd`.
- Given `netRevenueVnd ≤ 0`, when tính `foodCostPercent`, then trả `null` — không `0`, không `NaN`, không `Infinity`.
- Given `paidOrderCount = 0`, when tính `averageOrderValueVnd`, then trả `null`.
- Given `createdOrderCount = 0`, when tính `cancellationRatePercent`, then trả `null`.
- Given `revenueVnd = 0`, when tính `refundRatePercent`, then trả `null`.
- Given một kỳ có dữ liệu, when kiểm tổng, then tổng doanh thu theo món bằng doanh thu của kỳ; nếu fixture cho thấy hai tổng có thể lệch, then hàm trả về cả hai và độ lệch thay vì chọn một bên (câu hỏi mở #4 của plan).
- Given mọi giá trị tiền, when trả về, then là integer VND (`Math.trunc`/`Math.floor`, không float).

## Test plan

- Unit trong `reporting.adapter.test.ts`: mỗi hàm một test cho nhánh có dữ liệu và một test cho nhánh mẫu số bằng 0.
- Unit: test bất biến `grossProfitVnd === netRevenueVnd − costVnd` trên `shared/fixtures/reporting.fixture.ts`.
- Unit: test tổng doanh thu món so với doanh thu kỳ (phát hiện lệch nếu có).
- Verify: `npm run test -- reporting.adapter` và `npm run typecheck`.
