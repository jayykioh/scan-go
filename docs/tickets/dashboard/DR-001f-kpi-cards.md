# DR-001f — Thẻ KPI đúng cơ sở và nhãn độ phủ giá vốn

## Requirement links

REQ-RPT-001, REQ-RPT-004, REQ-I18N-001, NFR-UX-001.

## Owning module

`owner-dashboard` (lớp composition) hiển thị; Reporting sở hữu con số. Khối nằm trong component riêng,
theo tiền lệ `src/components/InventoryPanel.tsx`.

## Allowed file paths

- `src/pages/dashboard/overview/KpiCards.tsx` (mới)
- `src/pages/dashboard/OverviewPage.tsx` (chỉ để gắn khối, một lần)
- `shared/contracts/i18n.contract.ts` (nhãn vi + en)

Do not compute a metric inside the component — mọi con số đến từ `reporting.adapter`. Do not change Rules.

## Dependencies

DR-001a, DR-001c. **Và REQ-RPT-004 phải có trong SRS trước** (DR-001j giai đoạn 1). **Tuần tự trên `OverviewPage.tsx`** với DR-001g/h/i.

## Atomic acceptance checklist

- Given một kỳ, when hiện thẻ doanh thu, then doanh thu **gộp** và **thuần** đều hiện và ghi rõ nhãn.
- Given `menuCostCoveragePercent < 100`, when hiện lợi nhuận gộp hoặc food cost, then có nhãn "tính trên X/Y món có giá vốn".
- Given `menuCostCoveragePercent = 100`, when hiện, then **không** có nhãn độ phủ (không làm ồn khi dữ liệu đã đủ).
- Given AOV hoặc tỷ lệ huỷ là `null`, when hiện, then hiện "chưa có dữ liệu" — không `0%`, không `NaN`.
- Given một kỳ có dữ liệu, when hiện, then có thẻ giá vốn (COGS) và food cost %.
- Given ngôn ngữ `en`, when đổi ngôn ngữ, then mọi nhãn mới có bản dịch tiếng Anh (REQ-I18N-001).
- Given một tài khoản Cashier/Kitchen/Waiter, when mở route, then bị từ chối như hiện nay (không đổi ACL).
- Given màn hình hẹp (≤390px), when mở, then các thẻ không tràn và không che số.

## Test plan

- Unit/component: render với fixture có độ phủ <100 → nhãn xuất hiện; độ phủ 100 → nhãn vắng.
- Unit/component: `null` → chuỗi "chưa có dữ liệu"; không có `NaN` trong DOM.
- Unit: mọi khoá i18n mới tồn tại ở **cả** catalog `vi` và `en`.
- Manual: mở `/dashboard` bằng dữ liệu thật, đối chiếu tay với `dailyStats` của hôm nay.
- Verify: `npm run test`, `npm run typecheck`, `npm run lint`.
