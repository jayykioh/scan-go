# DR-001 — Reporting: chỉ số đáng tin trên dashboard

- **Capability:** `reporting` (bản đồ đã duyệt: [README.md](README.md))
- **Trạng thái:** **CHỜ DUYỆT** — chưa implement. `AGENTS.md`: không implement khi chưa có REQ ID được duyệt.
- **Nguồn:** [dashboard-data-research-2026-10.md](../../feedback/dashboard-data-research-2026-10.md) — DB-01…DB-08, DB-26
- **Ngày:** 2026-10-13

## 1. Requirement links

| Loại | REQ | Ghi chú |
|---|---|---|
| **Lỗ hổng acceptance của REQ có sẵn** | REQ-RPT-001 | SRS yêu cầu *"report paid revenue, Cost, gross profit, popular items, **and table stats** by day, week, and month"*. `reportingSummaryResultSchema` **đã trả về đủ** (`costVnd`, `tables[]`, huỷ/hoàn, `grossProfitVnd` từng món); `OverviewPage` chỉ đọc 6 field và **vứt `tables[]`**. Đây là bug/partial, **không cấp REQ mới** |
| Không đổi | REQ-RPT-002 | `dailyStats` giữ nguyên: không thêm field, không đổi document, không đổi `REPORTING_CONTRACT_VERSION` |
| Không đụng | REQ-AI-006 | Chỉ số mới là **đọc**; AI vẫn không được đổi tiền/giá |
| NFR | NFR-DATA-001, NFR-SEC-001, NFR-MOD-001 | Tenant isolation; Cost chỉ tới Owner/Kitchen/ADMIN |

**Đề xuất REQ mới (nguyên văn để đưa vào SRS §4.7 khi spec được duyệt):**

> **REQ-RPT-003 (P1) SHOULD** compare one reporting period with the immediately preceding period of
> equal length and state how many days carry data in each period. **Acceptance:** Given a period with
> data, when the Owner selects it, then each compared figure shows the previous value, the delta, and
> the count of days with data in both periods; given a previous period without data, then the
> comparison states the gap and shows no percentage.

> **REQ-RPT-004 (P1) SHOULD** report the Cost coverage behind every Cost or profit figure.
> **Acceptance:** Given sold items, when a Cost or profit figure is shown, then the screen states how
> many of the sold items carry a Cost and how many do not; given any item without a Cost, then the
> profit figure is labelled partial rather than presented as complete.

**Phát hiện phụ, không sửa trong ticket này:** `shared/contracts/config.contract.ts:58` trích dẫn
`REQ-AI-008`, nhưng **REQ-AI-008 không tồn tại trong SRS** (SRS chỉ có REQ-AI-001…REQ-AI-007). Cần một
dòng sửa riêng để traceability không trôi (RULES §1).

## 2. Objective

**Ai:** Owner (và Solo, ADMIN) — người ra quyết định tiền. **Vấn đề:** dashboard hôm nay hiện doanh thu
và lợi nhuận gộp như một sự thật, nhưng (a) lợi nhuận gộp có thể **sai mà không báo** vì món thiếu công
thức có giá vốn 0, và (b) hai con số trên cùng một thẻ nằm ở **hai cơ sở khác nhau**. Một dashboard
không đáng tin thì tệ hơn không có dashboard: chủ quán ra quyết định sai.

**Kết quả mong đợi:** mọi con số tiền trên dashboard **tự nói được mức độ đáng tin của nó** — doanh
thu gộp hay thuần, lợi nhuận tính trên bao nhiêu phần trăm món bán ra, và kỳ này so kỳ trước thế nào.

**Không phải mục tiêu:** thêm chỉ số mới cần tổng hợp ở máy chủ (theo giờ, hình thức thanh toán,
kênh, thời gian chế biến). Đó là nhóm C, đợt sau, dùng contract v2.

## 3. Định nghĩa chỉ số — phần dễ sai nhất

Ticket này gần như không thêm dữ liệu; giá trị của nó nằm ở **định nghĩa đúng**. Bốn cái bẫy đã xác
minh trong mã nguồn:

### 3.1 Bẫy 1 — doanh thu gộp và lợi nhuận gộp khác cơ sở

`functions/src/modules/reporting/service.ts:340`:

```ts
grossProfitVnd: acc.revenueVnd - acc.costVnd - acc.reversedVnd - acc.refundedVnd,
```

Lợi nhuận gộp **đã trừ** đảo và hoàn tiền; `revenueVnd` thì **chưa**. Hiện `OverviewPage` đặt hai số
cạnh nhau trên cùng một thẻ → thẻ tự mâu thuẫn.

**Bắt buộc:** định nghĩa `netRevenueVnd = revenueVnd − reversedVnd − refundedVnd` và hiện doanh thu
thuần, hoặc ghi rõ nhãn. Giữ bất biến kiểm được: `grossProfitVnd === netRevenueVnd − costVnd`.

### 3.2 Bẫy 2 — dòng quà tặng làm hỏng menu engineering

`service.ts:517` cộng **mọi** dòng: `itemAcc.paidQuantity += item.quantity`. Dòng `isGift` có
`lineTotalVnd = 0` nhưng **giá vốn thật**. Nếu tính ma trận menu engineering từ `paidQuantity`:

- Món chỉ cho không có contribution margin **âm** → rơi vào "Dogs" dù đó là quà khuyến mãi, không
  phải vấn đề thực đơn.
- `averagePaidQuantity` bị thổi lên → ngưỡng "phổ biến" sai theo.

**Bắt buộc:** mẫu số của menu engineering **loại** món có `revenueVnd = 0` và `paidQuantity > 0`
(tức dòng chỉ có quà tặng). Ghi rõ số món bị loại.

### 3.3 Bẫy 3 — `popularItems` bị cắt ở 20 theo **doanh thu**

`src/data/firestoreRead.ts:323`:

```ts
return [...byId.values()]
  .sort((a, b) => b.revenueVnd - a.revenueVnd || b.paidQuantity - a.paidQuantity)
  .slice(0, 20);
```

Trục "phổ biến" của menu engineering **chính là thứ bị phép cắt này bóp méo**: một món bán rất chạy
nhưng giá rẻ (Plowhorse kinh điển) có thể bị cắt khỏi top 20 theo doanh thu, nên ma trận sẽ **thiếu
đúng nhóm mà nó tồn tại để tìm ra**.

**Bắt buộc:** phân loại trên **toàn bộ** danh sách món đã tổng hợp trong kỳ, không phải trên 20 món
đã cắt. Tầng đọc đã có sẵn danh sách đầy đủ trong bộ nhớ trước khi cắt (`items` được truyền vào
`mergePopularItems`), nên **không cần thêm lượt đọc nào**. Phép cắt 20 chỉ áp cho danh sách hiển thị
"món bán chạy" hiện có.

**Giới hạn phải ghi trên màn hình:** mỗi ngày chỉ đọc tối đa `MAX_ITEMS_PER_DAY = 100`
(`firestoreRead.ts:56`). Menu trên 100 món thì ma trận là **một phần**, không phải toàn bộ.

### 3.4 Bẫy 4 — chia cho 0

Mọi tỷ lệ phải trả `null` (không phải `0`, không phải `NaN`/`Infinity`) khi mẫu số bằng 0, và giao diện
hiện "chưa có dữ liệu". Tiền vẫn là **integer VND**; phần trăm là integer đã làm tròn.

### 3.5 Bảng định nghĩa chốt

| Chỉ số | Công thức | Bằng 0 / thiếu dữ liệu |
|---|---|---|
| `netRevenueVnd` | `revenueVnd − reversedVnd − refundedVnd` | `0` là hợp lệ |
| `foodCostPercent` | `round(costVnd × 100 / netRevenueVnd)` | `null` khi `netRevenueVnd ≤ 0` |
| `averageOrderValueVnd` | `floor(netRevenueVnd / paidOrderCount)` | `null` khi `paidOrderCount = 0` |
| `cancellationRatePercent` | `round(cancelledOrderCount × 100 / createdOrderCount)` | `null` khi `createdOrderCount = 0` |
| `refundRatePercent` | `round((reversedVnd + refundedVnd) × 100 / revenueVnd)` | `null` khi `revenueVnd = 0` |
| `unitContributionMarginVnd` (món) | `floor(item.grossProfitVnd / item.paidQuantity)` | loại món khỏi mẫu khi `paidQuantity = 0` |
| `popularityIndex` (món) | `round(item.paidQuantity × 100 / averagePaidQuantity)` | `null` khi mẫu rỗng |
| `popular` (món) | `popularityIndex ≥ 70` (Kasavana & Smith) | — |
| `highMargin` (món) | `unitContributionMarginVnd > averageUnitContributionMarginVnd` | — |
| Nhóm | `popular & highMargin` = **Stars** · `popular & !highMargin` = **Plowhorses** · `!popular & highMargin` = **Puzzles** · `!popular & !highMargin` = **Dogs** | — |
| `menuCostCoveragePercent` | món đang bán có `recipeId` hợp lệ ÷ món đang bán × 100 | `null` khi chưa có món |
| `periodCostCoveragePercent` | món trong kỳ có `costVnd > 0` ÷ món trong kỳ × 100 | `null` khi kỳ rỗng |
| `comparisonDeltaPercent` | `round((current − previous) × 100 / previous)` | `null` khi `previous = 0` |

**Quy tắc hiển thị (không phải quy tắc tính):** khi `menuCostCoveragePercent < 100`, mọi con số
`grossProfitVnd`, `foodCostPercent` và nhóm menu engineering phải mang nhãn
*"tính trên X/Y món có giá vốn"*. Khi `dayCount` của hai kỳ khác nhau, phần so sánh phải hiện số ngày
có dữ liệu ở **cả hai** kỳ — so sánh một kỳ 30 ngày với một kỳ 3 ngày mà không nói gì là nói dối.

## 4. Sáu khu vực spec (theo định dạng repo)

**Tech stack:** không thêm phụ thuộc. Xem [TECH_STACK.md](../../TECH_STACK.md). Zod đã có; React đã có;
`recharts` **không** có — biểu đồ hiện vẽ bằng div, giữ nguyên cách đó.

**Commands:**

```bash
npm run typecheck          # TS toàn repo
npm run lint               # eslint
npm run test               # vitest: web + shared
npm run test:rules         # Rules trên Firestore emulator (cần Java)
npm run test:emulator      # callable trên emulator
```

**Project structure (chỉ những file được phép đụng):**

```
src/data/firestoreRead.ts                  # tầng đọc: phơi danh sách món đầy đủ cho phân loại
src/data/adapters/reporting.adapter.ts     # định nghĩa chỉ số dẫn xuất + gọi kỳ trước
src/data/adapters/reporting.adapter.test.ts
src/data/adapters/data-health.adapter.ts   # MỚI: độ phủ giá vốn (đọc menuItems/recipes/ingredients)
src/data/adapters/data-health.adapter.test.ts
shared/contracts/reporting.contract.ts     # chỉ khi cần type cho kết quả dẫn xuất (không đổi document)
src/pages/dashboard/OverviewPage.tsx       # hiển thị
docs/module/reporting.md                   # cập nhật Queries + Rules
docs/SRS.md, docs/traceability.md          # REQ-RPT-003/004
```

Không đụng: `functions/src/modules/reporting/**` (máy chủ không đổi), `firestore.rules` (quyền đọc đã
đủ), Ordering, Payment, Catalog write, Inventory write.

**Code style** — theo đúng nhà đang viết: tiền là integer VND, `null` cho "chưa biết", Zod `strictObject`
ở biên, hàm thuần tách ra để test được.

```ts
/** Food cost percent of net revenue. Null when there is no net revenue. */
export function foodCostPercent(totals: ReportingTotals): number | null {
  const netRevenueVnd = netRevenue(totals);
  if (netRevenueVnd <= 0) return null;
  return Math.round((totals.costVnd * 100) / netRevenueVnd);
}
```

**Testing strategy:** vitest, cạnh mã nguồn (`*.test.ts`), không cần emulator cho ticket này vì **không
đổi máy chủ**. Bắt buộc có test cho: chia 0 trả `null`; `grossProfitVnd === netRevenueVnd − costVnd`;
loại dòng quà tặng khỏi mẫu menu engineering; phân loại đúng 4 nhóm trên một fixture nhỏ; kỳ trước
không có dữ liệu thì trả `null` chứ không `NaN`; `menuCostCoveragePercent` khi thiếu `recipeId`.
Fixture dùng lại `shared/fixtures/reporting.fixture.ts`.

## 5. Boundaries

- **Always:** chạy `npm run typecheck` + `npm run test` trước khi báo xong; giữ integer VND và UTC;
  `null` cho dữ liệu thiếu; nhãn độ phủ đi kèm mọi số lợi nhuận.
- **Ask first:** đổi `REPORTING_CONTRACT_VERSION`; thêm field vào `dailyStats`; nới quyền đọc trong
  `firestore.rules`; thêm phụ thuộc (kể cả thư viện biểu đồ).
- **Never:** ghi thẳng vào business collection từ client; hardcode ngưỡng benchmark (28–35% của Mỹ
  không đúng cho VN); hiện `NaN`/`Infinity`/`0%` khi thực ra là "chưa có dữ liệu"; bỏ test đang fail
  để cho qua.

## 6. Atomic acceptance checklist

- [ ] Given một kỳ có dữ liệu, when Owner chọn kỳ, then mỗi số tiền hiện trên cơ sở đã ghi rõ (gộp hay thuần) và `grossProfitVnd === netRevenueVnd − costVnd` (REQ-RPT-001).
- [ ] Given `costVnd` và `revenueVnd` dương, when tính `foodCostPercent`, then kết quả là integer đã làm tròn và **không** kèm ngưỡng hardcode nào (REQ-RPT-001).
- [ ] Given `netRevenueVnd ≤ 0` hoặc `paidOrderCount = 0`, when tính tỷ lệ, then trả `null` và giao diện hiện "chưa có dữ liệu", không hiện `0%`, `NaN` hay `Infinity` (REQ-RPT-001).
- [ ] Given `tables[]` trong kết quả, when mở dashboard, then có bảng hiệu suất theo bàn với doanh thu, số đơn và lợi nhuận gộp mỗi bàn (REQ-RPT-001 — **lỗ hổng đang tồn tại**).
- [ ] Given một kỳ, when phân loại menu engineering, then mẫu **loại** món có `paidQuantity > 0` và `revenueVnd = 0`, và số món bị loại được hiện ra (REQ-RPT-004).
- [ ] Given một món bán chạy doanh thu thấp nằm ngoài top 20, when phân loại, then món đó **vẫn** được phân loại (phân loại trên danh sách đầy đủ, không trên 20 món đã cắt).
- [ ] Given menu trên `MAX_ITEMS_PER_DAY = 100` món, when hiện ma trận, then có nhãn "một phần" (REQ-RPT-004).
- [ ] Given `menuCostCoveragePercent < 100`, when hiện lợi nhuận gộp hoặc food cost, then có nhãn "tính trên X/Y món có giá vốn" (REQ-RPT-004).
- [ ] Given một kỳ có dữ liệu, when hiện so sánh, then có giá trị kỳ trước, delta, và **số ngày có dữ liệu ở cả hai kỳ** (REQ-RPT-003).
- [ ] Given kỳ trước không có dữ liệu, when hiện so sánh, then nêu rõ khoảng trống và **không** hiện phần trăm (REQ-RPT-003).
- [ ] Given một tài khoản Cashier, Kitchen hoặc Waiter, when gọi dữ liệu báo cáo, then bị từ chối như hiện nay (NFR-SEC-001 — không đổi ACL).

## 7. Success criteria

1. `npm run typecheck`, `npm run lint`, `npm run test` xanh; test mới phủ 6 nhóm ở §4.
2. Trên dữ liệu thật của một tenant, mọi con số tiền trên dashboard **tự giải thích được cơ sở** của nó.
3. Không file nào ngoài danh sách §4 bị đụng; `git diff` không chạm `functions/src/modules/reporting/**`.
4. `docs/traceability.md` và SRS §15 có dòng cho REQ-RPT-003, REQ-RPT-004; REQ-RPT-001 được ghi nhận
   là **partial → done** sau khi bảng theo bàn lên màn hình.

## 8. Open questions

1. **REQ-RPT-003/004 có được duyệt không?** Nếu không, ticket này rút xuống chỉ còn phần REQ-RPT-001
   (hiển thị `costVnd`, huỷ/hoàn, `tables[]`) — vẫn đủ giá trị.
2. **`REQ-AI-008` không tồn tại trong SRS.** Sửa comment trong `config.contract.ts` thành REQ-AI-007,
   hay bổ sung REQ-AI-008 vào SRS? (Cần bạn chọn; không tự quyết.)
3. **`revenueVnd` (tổng) và tổng doanh thu theo món có luôn bằng nhau không?** Máy chủ cộng doanh thu
   kỳ từ `payment.amountVnd` nhưng doanh thu món từ `netLineRevenueVnd(item)`. Chưa tìm thấy test
   khẳng định hai tổng này bằng nhau. Nếu chúng có thể lệch, dashboard phải hiện chênh lệch thay vì
   chọn một bên.
4. **Thẻ "sức khoẻ dữ liệu" (DB-27) nằm ở DR-001 hay DR-002?** Tôi đề xuất **DR-002** (`owner-dashboard`)
   vì đó là bố cục màn hình; DR-001 chỉ cung cấp phép tính độ phủ.

## 9. Không làm trong ticket này

- Nhóm C (theo giờ, hình thức thanh toán, kênh, thời gian chế biến, khuyến mãi, live pulse) — cần
  tổng hợp máy chủ + contract v2.
- Prime cost / labour cost — payroll ngoài phạm vi v1.
- Mục tiêu doanh thu, giờ mở cửa, ngưỡng cảnh báo — `config`, đợt sau.
- Sửa nút "Xem AI Báo Cáo" — `owner-dashboard`, DR-002.
