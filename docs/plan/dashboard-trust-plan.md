# Kế hoạch đợt Dashboard trust — DR-001 Reporting

**Spec đã duyệt:** [DR-001-reporting-trust.md](../tickets/dashboard/DR-001-reporting-trust.md)
**Bản đồ capability:** [docs/tickets/dashboard/README.md](../tickets/dashboard/README.md)
**Ngày:** 2026-10-13 · **Phạm vi:** chỉ capability `reporting` (DB-01…DB-08, DB-26)
**Điều kiện vào:** spec DR-001 đã được duyệt. `docs/SRS.md` đang được sửa bởi một đợt khác — xem Rủi ro R1.

> **Nơi ghi task:** theo `AGENTS.md`, task list của dự án nằm ở `docs/tickets/` (không dùng `tasks/todo.md`).
> Kế hoạch này giữ **đầy đủ acceptance/verify/files** để duyệt ngay; Phase 3 sẽ tách mỗi task thành một
> file `docs/tickets/dashboard/DR-001x-*.md` theo đúng khuôn `docs/tickets/p0/P0-015-*.md`, và mục
> "Task list" dưới đây khi đó rút lại thành chỉ mục.

## Overview

Đưa bốn chỉ số đã có trong `reportingSummaryResultSchema` nhưng bị `OverviewPage` vứt đi (`costVnd`,
huỷ/hoàn, `tables[]`, lợi nhuận gộp từng món) lên màn hình, **kèm định nghĩa đúng** cho từng chỉ số
dẫn xuất và **nhãn độ phủ giá vốn** để mọi con số lợi nhuận tự nói được mức độ đáng tin của nó. Không
đổi máy chủ, không đổi `dailyStats`, không đổi Rules.

**Bằng chứng bổ sung cho REQ-RPT-004:** acceptance của REQ-RPT-001 (SRS:198) đã tự đặt điều kiện
*"Given paid orders and **complete recipes**"* — nhưng không có chỗ nào nói cho Owner biết công thức đã
đủ chưa. REQ-RPT-001 lại đang được ghi **Done** ở SRS §15 (dòng 452) trong khi acceptance đòi
*"table stats by day, week, and month"* mà không màn nào hiện. Đây đúng là dạng
"Done nhưng không tới được người dùng" mà `docs/feedback/feature-audit-2026-10/reachability.md` đã gọi tên.

## Architecture Decisions

| # | Quyết định | Lý do |
|---|---|---|
| A1 | **Không đổi `REPORTING_CONTRACT_VERSION` và không thêm field vào `dailyStats`.** Đợt này chỉ đọc. | `firestore.rules` đã cho Owner đọc `menuItems` (95), `ingredients` (109), `recipes` (116), `stockCounts` (277), nên độ phủ giá vốn tính được ở client. Contract v2 để dành cho nhóm C. |
| A2 | **Phân loại menu engineering trên danh sách món đầy đủ, không trên `popularItems` đã cắt 20.** | Phép cắt sort theo `revenueVnd` (`firestoreRead.ts:323`) bóp méo đúng trục "phổ biến" mà ma trận cần. Tầng đọc đã có sẵn danh sách đầy đủ trong bộ nhớ trước khi cắt → không thêm lượt đọc. |
| A3 | **Loại dòng quà tặng khỏi mẫu menu engineering** (`paidQuantity > 0 && revenueVnd = 0`). | `service.ts:517` cộng cả dòng `isGift` (doanh thu 0, giá vốn thật) → contribution margin âm giả. |
| A4 | **Doanh thu hiển thị phải ghi rõ gộp hay thuần**, và giữ bất biến `grossProfitVnd === netRevenueVnd − costVnd`. | `service.ts:340` tính lợi nhuận gộp **đã trừ** đảo/hoàn, còn `revenueVnd` thì chưa → hai số cùng thẻ mâu thuẫn. |
| A5 | **Mọi tỷ lệ trả `null` khi mẫu số bằng 0**, giao diện hiện "chưa có dữ liệu". | Tránh `NaN`/`Infinity`/`0%` giả. Tiền vẫn là integer VND. |
| A6 | **Nhãn độ phủ là một hàm dùng chung, không rải rác trong JSX.** | Nếu rải, chỉ số thêm sau này sẽ quên nhãn và lỗi niềm tin quay lại. |
| A7 | **Không thêm phụ thuộc** (kể cả thư viện biểu đồ). | Biểu đồ hiện vẽ bằng div; đủ dùng. |

## Dependency graph

```text
T1 chỉ số dẫn xuất (hàm thuần)
  ├─> T2 menu engineering ──┐
  ├─> T5 so sánh kỳ trước ──┤
  └─> T6 thẻ KPI ───────────┤
T3 độ phủ giá vốn ──────────┼─> T6, T8 (nhãn độ phủ)
T4 tầng đọc phơi danh sách ─┴─> T8 ma trận
T7 bảng theo bàn (độc lập, chỉ cần tables[] đã có)
T9 khối so sánh (cần T5)
T10 giấy tờ (sau cùng, cần mọi task trên xong)
```

**Ràng buộc cứng — T10 giai đoạn 1 mở khoá phần lớn task:** `AGENTS.md` cấm implement khi chưa có REQ ID
được duyệt. T1 và T7 chỉ dùng REQ-RPT-001 (**đã có**) nên **chạy được ngay**. T2, T3, T4, T6, T8 cần
REQ-RPT-004; T5, T9 cần REQ-RPT-003 — bảy task này **chặn cho tới khi T10 giai đoạn 1 thêm hai REQ vào
SRS §4.7**. T10 giai đoạn 2 (traceability + module doc) làm cuối cùng.

**Làm song song được ngay:** `{T1→T2}`, `{T3}`, `{T7}` **về dữ liệu** — nhưng T2/T3 vẫn chờ REQ, còn T7
chỉ chờ ở phần gắn file. T7 độc lập về dữ liệu nhưng **không** song song được trên file: T6–T9 cùng
gắn khối vào `OverviewPage.tsx`.
**Phải tuần tự:** T10 giai đoạn 1 → T2/T3/T4/T5/T6/T8/T9; T4 sau T2 (T4 phục vụ T8); T9 sau T5;
T6 → T7 → T8 → T9 (chung `OverviewPage.tsx`, mỗi khối nằm trong component riêng để giảm đụng độ);
T10 giai đoạn 2 cuối cùng.
**Rủi ro cao làm trước:** T1 và T2 (định nghĩa sai thì mọi thứ sau đều sai) — đúng thứ tự "fail fast".

## Task list

> **Nguồn chính thức của từng task là file ticket**, không phải mục này:
> [DR-001a](../tickets/dashboard/DR-001a-derived-metrics.md) ·
> [DR-001b](../tickets/dashboard/DR-001b-menu-engineering.md) ·
> [DR-001c](../tickets/dashboard/DR-001c-cost-coverage.md) ·
> [DR-001d](../tickets/dashboard/DR-001d-read-layer.md) ·
> [DR-001e](../tickets/dashboard/DR-001e-period-comparison.md) ·
> [DR-001f](../tickets/dashboard/DR-001f-kpi-cards.md) ·
> [DR-001g](../tickets/dashboard/DR-001g-table-performance.md) ·
> [DR-001h](../tickets/dashboard/DR-001h-menu-engineering-panel.md) ·
> [DR-001i](../tickets/dashboard/DR-001i-period-comparison-panel.md) ·
> [DR-001j](../tickets/dashboard/DR-001j-docs-traceability.md).
> Mục dưới đây giữ bản tóm tắt để đọc một mạch; nếu lệch, **ticket thắng**.

### Phase 1 — Nền: định nghĩa chỉ số (test được ngay, chưa đụng UI)

- [x] **T1 — Hàm thuần tính chỉ số dẫn xuất** · S (2 file)
  - **Description:** Cài `netRevenue`, `foodCostPercent`, `averageOrderValueVnd`, `cancellationRatePercent`, `refundRatePercent` trong tầng adapter báo cáo, mỗi hàm trả `number | null` theo bảng §3.5 của spec.
  - **Acceptance:** `netRevenueVnd = revenueVnd − reversedVnd − refundedVnd`; mọi tỷ lệ trả `null` khi mẫu số ≤ 0; tiền là integer; `grossProfitVnd === netRevenueVnd − costVnd` được khẳng định bằng test.
  - **Verify:** `npm run test -- reporting.adapter`; `npm run typecheck`.
  - **Files:** `src/data/adapters/reporting.adapter.ts`, `src/data/adapters/reporting.adapter.test.ts`.
  - **Depends:** None.

- [ ] **T2 — Phân loại menu engineering** · S (2 file)
  - **Description:** Hàm phân loại Stars/Plowhorses/Puzzles/Dogs theo ngưỡng phổ biến 70% và contribution margin trung bình; **loại dòng quà tặng** khỏi mẫu và trả về số món đã loại.
  - **Acceptance:** fixture có (a) một dòng `isGift` doanh thu 0 giá vốn thật → **không** xuất hiện trong mẫu và **không** bị xếp Dogs; (b) một món bán chạy doanh thu thấp → vẫn được phân loại; (c) mẫu rỗng → trả danh sách rỗng, không chia 0.
  - **Verify:** `npm run test -- reporting.adapter` (test riêng cho ma trận).
  - **Files:** `src/data/adapters/reporting.adapter.ts`, `src/data/adapters/reporting.adapter.test.ts`.
  - **Depends:** T1.

- [ ] **T3 — Độ phủ giá vốn (DB-26)** · S (2 file)
  - **Description:** Adapter mới đọc `menuItems` + `recipes` + `ingredients` (Owner đọc được) và tính `menuCostCoveragePercent`, số món thiếu công thức, số nguyên liệu `unitCostVnd = 0`.
  - **Acceptance:** món đang bán không có `recipeId` → bị đếm là thiếu; nguyên liệu đã archive → không tính; chưa có món nào → `null` chứ không `0`.
  - **Verify:** `npm run test -- data-health`; `npm run typecheck`.
  - **Files:** `src/data/adapters/data-health.adapter.ts` (mới), `src/data/adapters/data-health.adapter.test.ts` (mới).
  - **Depends:** None. **Song song với T1–T2.**

- [ ] **Checkpoint A (sau T1–T3)** — `npm run test` + `npm run typecheck` + `npm run lint` xanh; mọi định nghĩa chỉ số đã có test; **review với người trước khi đụng UI**.

### Phase 2 — Tầng đọc và so sánh kỳ

- [ ] **T4 — Phơi danh sách món đầy đủ từ tầng đọc** · S (2 file)
  - **Description:** Tách phép tổng hợp khỏi phép cắt: trả danh sách món đã tổng hợp **đầy đủ** cho phân loại, giữ nguyên `popularItems` cắt 20 cho danh sách "bán chạy" hiện có.
  - **Acceptance:** kết quả cũ của `popularItems` **không đổi** (cùng 20 món, cùng thứ tự); danh sách đầy đủ có nhiều hơn 20 phần tử khi dữ liệu cho phép; không thêm lượt đọc Firestore nào.
  - **Verify:** `npm run test -- firestoreRead`.
  - **Files:** `src/data/firestoreRead.ts`, `src/data/firestoreRead.test.ts`.
  - **Depends:** T2.

- [ ] **T5 — So sánh kỳ trước** · S (2 file)
  - **Description:** Gọi `getReportingSummary` lần hai với `anchorDay` lùi đúng độ dài kỳ, tính delta cho doanh thu thuần, số đơn, AOV, lợi nhuận gộp; mang theo `dayCount` của cả hai kỳ.
  - **Acceptance:** kỳ trước rỗng → delta `null` và nêu rõ khoảng trống, **không** hiện phần trăm; hai kỳ khác số ngày có dữ liệu → cả hai số ngày đều được trả về.
  - **Verify:** `npm run test -- reporting.adapter`.
  - **Files:** `src/data/adapters/reporting.adapter.ts`, `src/data/adapters/reporting.adapter.test.ts`.
  - **Depends:** T1.

- [ ] **Checkpoint B (sau T4–T5)** — tầng đọc trả đủ dữ liệu; so sánh có test cho nhánh rỗng; chưa đổi giao diện.

### Phase 3 — Màn hình (mỗi task là một lát cắt thấy được)

- [ ] **T6 — Thẻ KPI đúng cơ sở + nhãn độ phủ** · M (3 file)
  - **Description:** Thẻ doanh thu hiện gộp **và** thuần; thêm thẻ AOV và tỷ lệ huỷ; gắn nhãn "tính trên X/Y món có giá vốn" từ T3 vào mọi số lợi nhuận/food cost.
  - **Acceptance:** khi `menuCostCoveragePercent < 100`, mọi số `grossProfitVnd`/`foodCostPercent` trên màn hình đều có nhãn; khi thiếu dữ liệu hiện "chưa có dữ liệu", không hiện `0%`.
  - **Verify:** `npm run test`; mở `/dashboard` bằng dữ liệu thật, đối chiếu tay với `dailyStats` của ngày hôm nay.
  - **Files:** `src/pages/dashboard/OverviewPage.tsx`, `src/data/adapters/reporting.adapter.ts`, `shared/contracts/i18n.contract.ts` (nhãn mới).
  - **Depends:** T1, T3.

- [x] **T7 — Bảng hiệu suất theo bàn** · S (2 file)
  - **Description:** Hiện `summary.tables` (đang bị vứt) thành bảng doanh thu, số đơn, lợi nhuận gộp mỗi bàn.
  - **Acceptance:** có dữ liệu → bảng hiện đúng số của `tables[]`; kỳ rỗng → trạng thái trống; bàn đã archive vẫn hiện tên đã snapshot trong kỳ.
  - **Verify:** `npm run test`; đối chiếu tay với `dailyStats/{day}/tables`.
  - **Files:** `src/pages/dashboard/OverviewPage.tsx`, `shared/contracts/i18n.contract.ts`.
  - **Depends:** None. **Song song với Phase 1–2.** ← *đây là lỗ hổng acceptance của REQ-RPT-001*

- [ ] **T8 — Ma trận menu engineering** · M (3 file)
  - **Description:** Khối 2×2 Stars/Plowhorses/Puzzles/Dogs từ T2 trên danh sách đầy đủ của T4, kèm nhãn "một phần" khi chạm trần 100 món/ngày.
  - **Acceptance:** món ngoài top 20 vẫn xuất hiện trong ma trận; số món bị loại vì là quà tặng được hiện; chạm trần → có nhãn "một phần".
  - **Verify:** `npm run test`; kiểm tay một món bán chạy giá rẻ có mặt trong ma trận.
  - **Files:** `src/pages/dashboard/OverviewPage.tsx`, `src/data/adapters/reporting.adapter.ts`, `shared/contracts/i18n.contract.ts`.
  - **Depends:** T2, T4.

- [ ] **T9 — Khối so sánh kỳ trước** · S (2 file)
  - **Description:** Hiện delta và số ngày có dữ liệu của cả hai kỳ từ T5.
  - **Acceptance:** kỳ trước rỗng → chỉ hiện câu nêu khoảng trống; kỳ trước có dữ liệu → delta kèm số ngày hai kỳ.
  - **Verify:** `npm run test`; kiểm tay với kỳ hôm qua.
  - **Files:** `src/pages/dashboard/OverviewPage.tsx`, `shared/contracts/i18n.contract.ts`.
  - **Depends:** T5.

- [ ] **Checkpoint C (sau T6–T9)** — mở `/dashboard` thấy đủ 4 khối; đối chiếu tay với `dailyStats` khớp; nhãn độ phủ xuất hiện; **review với người trước khi chốt giấy tờ**.

### Phase 4 — Giấy tờ và traceability

- [ ] **T10 — SRS, traceability, module doc** · S (3 file)
  - **Description:** Thêm REQ-RPT-003/004 vào SRS §4.7, cập nhật §15 và `docs/traceability.md`, mở rộng `docs/module/reporting.md` (Queries + Rules cho chỉ số dẫn xuất và quyền đọc catalog/inventory/config), ghi REQ-RPT-001 là **partial → done**.
  - **Acceptance:** mỗi REQ mới có một dòng traceability; `docs/module/reporting.md` nêu rõ Reporting đọc thêm Catalog/Inventory/Config; dòng REQ-RPT-001 ở SRS §15 nêu bằng chứng bảng theo bàn (hiện ghi **Done** dù acceptance đòi table stats mà không màn nào hiện).
  - **Verify:** `grep -n "REQ-RPT-003\|REQ-RPT-004" docs/SRS.md docs/traceability.md` trả về cả hai file.
  - **Files:** `docs/SRS.md`, `docs/traceability.md`, `docs/module/reporting.md`.
  - **Depends:** mọi task trên. **Làm cuối cùng** vì `docs/SRS.md` đang bị sửa song song.

- [ ] **Checkpoint D (kết thúc)** — `npm run typecheck`, `npm run lint`, `npm run test` xanh; `git diff --stat` **không** chạm `functions/**` hay `firestore.rules`; spec §6 checklist tick đủ 11 mục.

## Risks and Mitigations

| # | Rủi ro | Mức | Cách giảm |
|---|---|---|---|
| R1 | **Working tree đang có công việc khác chạy song song** — 22 file code (~829 dòng) gồm `firestore.rules`, `docs/SRS.md`, module feedback/AI, không phải của đợt này | **Cao** | Làm DR-001 trên **nhánh riêng**; không sửa file ngoài danh sách §4 của spec; T10 (đụng SRS) làm **cuối cùng**, sau khi đợt kia chốt; kiểm `git diff --stat` ở mỗi checkpoint |
| R2 | `docs/SRS.md` bị sửa đồng thời → REQ-RPT-003/004 đụng độ | Trung bình | Chỉ một task (T10) đụng SRS, và làm cuối; nếu vẫn đụng thì rebase và thêm lại hai dòng |
| R3 | Nhãn độ phủ bị bỏ quên khi thêm chỉ số sau này → lỗi niềm tin quay lại | Trung bình | A6: một hàm nhãn dùng chung + test; ghi quy tắc vào `docs/module/reporting.md` ở T10 |
| R4 | Định nghĩa chỉ số sai (đặc biệt lợi nhuận gộp gộp/thuần) | Trung bình | T1 làm đầu tiên, có test bất biến; checkpoint A review trước khi đụng UI |
| R5 | Menu trên 100 món/ngày → ma trận là một phần nhưng trông như toàn bộ | Thấp–TB | Nhãn "một phần" bắt buộc ở T8 + test chạm trần |
| R6 | Trích dẫn dòng trong spec trôi khi file bị sửa song song | Thấp | Đã kiểm lại toàn bộ số dòng ngày 2026-10-13; mỗi task tự đọc lại mã trước khi sửa |
| R7 | **T3 mở quyền đọc `recipes`/`ingredients` (có Cost) cho Reporting, và dữ liệu Cost đó rò sang ngữ cảnh AI** | **Cao** | Ràng buộc cứng của chủ dự án: AI chỉ đọc dữ liệu được phép. DR-001c có mục acceptance riêng + test khẳng định ngữ cảnh AI **không** chứa trường Cost; REQ-AI-008 (đã vào SRS) ghi *"given a caller without the Cost permission, then no margin is computed or returned"* |

## Open Questions

1. **`REQ-AI-008` — ĐÃ GIẢI QUYẾT 2026-10-13, chọn (b).** Audit traceability tìm thấy **4 chỗ** trích `REQ-AI-008` khi ID này chưa có trong SRS: `config.contract.ts:58`, `shared/config/defaults.ts:33`, `functions/src/modules/ai/service.ts:43`, `shared/contracts/promotionAi.contract.ts:21`. `ai/service.ts:43` ghi rõ *"Built-in fallback margin threshold for the **low-profit warning**"*. **Lựa chọn đầu tiên của tôi ("đổi thành REQ-AI-007") là sai** — REQ-AI-007 là cảnh báo doanh thu giảm 20% so với hôm trước, không phải biên lợi nhuận. Chủ dự án chọn **(b)**: viết REQ-AI-008 thành yêu cầu riêng, đối xứng với REQ-AI-007.
   - **Đã làm:** thêm REQ-AI-008 vào SRS §4.7 (dòng 202) + một dòng traceability §15 (dòng 457) đánh dấu **PARTIAL** — trung thực vì code có nhưng **chưa có test** cho nhánh low-margin. Acceptance của REQ-AI-008 có gắn ràng buộc quyền đọc Cost.
   - **Còn lại:** `promotionAi.contract.ts:21` trích `REQ-AI-008` cho *trợ lý dựng khuyến mãi* — đó là chuyện khác và đã được REQ-PRO-007 bao trọn; trích dẫn thứ hai ở đó là **sai**, cần bỏ trong một lần sửa comment sau (không sửa lúc này vì file đang bị đợt song song chỉnh).
   - **Còn lại:** chưa có test cho nhánh low-margin. Nếu muốn REQ-AI-008 lên **Done**, cần một ticket test riêng (không thuộc DR-001).
2. **Hai trích dẫn ma khác, mức thấp hơn:** `REQ-CAT-006` (chỉ trong `docs/feedback/feature-audit-2026-10/F-02-*.md`) và `REQ-STAFF-001` (chỉ trong `F-04-*.md`). Đây là **tài liệu phân tích lịch sử**, không phải code — tôi đề xuất **không sửa** (viết lại hồ sơ cũ là sai) mà chỉ ghi nhận.
3. **`REQ-CON-001`/`REQ-CON-003`** là lỗi tiền tố: ID thật là `CON-001`…`CON-007` (ràng buộc, SRS §2.4), không có tiền tố `REQ-`. Sửa ở đợt dọn traceability riêng.
4. **Doanh thu kỳ và tổng doanh thu theo món có luôn bằng nhau không?** Máy chủ cộng doanh thu kỳ từ `payment.amountVnd` nhưng doanh thu món từ `netLineRevenueVnd(item)`. Chưa tìm thấy test khẳng định hai tổng bằng nhau. Nếu có thể lệch, T6 phải hiện chênh lệch thay vì chọn một bên. **Kiểm ở T1** (thêm một test bất biến trên fixture).
5. **Thẻ "sức khoẻ dữ liệu" (DB-27) nằm ở DR-001 hay DR-002?** Đề xuất: **DR-002** (`owner-dashboard`) vì đó là bố cục màn hình; DR-001 chỉ cung cấp phép tính ở T3.
