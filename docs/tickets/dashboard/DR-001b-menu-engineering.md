# DR-001b — Phân loại menu engineering

## Requirement links

REQ-RPT-001 (popular items và gross profit từng món), REQ-RPT-004.

## Owning module

Reporting sở hữu phân loại, vì nó là cách đọc `grossProfitVnd` từng món chứ không phải dữ liệu mới.

## Allowed file paths

- `src/data/adapters/reporting.adapter.ts`
- `src/data/adapters/reporting.adapter.test.ts`
- `shared/fixtures/reporting.fixture.ts`

Do not change `functions/**` or the `dailyStats` write model. Không thêm phụ thuộc.

## Dependencies

DR-001a. **Và REQ-RPT-004 phải có trong SRS trước** (DR-001j giai đoạn 1) — `AGENTS.md` cấm implement khi chưa có REQ ID được duyệt.

## Atomic acceptance checklist

- Given một món có `paidQuantity > 0` và `revenueVnd = 0` (dòng chỉ có quà tặng), when phân loại, then món đó **bị loại khỏi mẫu** và số món bị loại được trả về.
- Given mẫu đã loại quà tặng, when tính `popularityIndex`, then `averagePaidQuantity` là trung bình trên mẫu đã loại, không phải trên toàn bộ.
- Given `popularityIndex ≥ 70`, when phân loại, then món là `popular`.
- Given `unitContributionMarginVnd` lớn hơn trung bình mẫu, when phân loại, then món là `highMargin`.
- Given hai trục, when phân loại, then bốn nhóm là **Stars** (`popular & highMargin`), **Plowhorses** (`popular & !highMargin`), **Puzzles** (`!popular & highMargin`), **Dogs** (`!popular & !highMargin`).
- Given mẫu rỗng, when phân loại, then trả danh sách rỗng và `null` cho các trung bình — không chia 0.
- Given `paidQuantity = 0`, when phân loại, then món bị loại khỏi mẫu.
- Given một món bán chạy doanh thu thấp, when phân loại trên danh sách đầy đủ, then món đó vẫn được phân loại (không phụ thuộc top 20).

## Test plan

- Unit: fixture có (a) một dòng `isGift` doanh thu 0 giá vốn thật → không nằm trong mẫu và **không** bị xếp Dogs; (b) một món bán chạy giá rẻ → được phân loại; (c) mẫu rỗng.
- Unit: fixture nhỏ 4 món cho ra đủ 4 nhóm.
- Verify: `npm run test -- reporting.adapter`.
