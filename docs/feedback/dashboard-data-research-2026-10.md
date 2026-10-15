# Dashboard ScanGo: dữ liệu cần có và cách để quản lý cập nhật — nghiên cứu 2026-10

> Ngày khảo sát: **2026-10-13**. Đây là **tài liệu nghiên cứu + đề xuất**, không phải spec đã
> duyệt. Mọi việc trong đây **chưa có REQ ID** và **không được implement** cho tới khi được duyệt
> vào `docs/SRS.md` (xem [AGENTS.md](../../AGENTS.md) — "Do not implement code without an approved
> REQ ID"). Mã `DB-01…DB-39` ở đây là mã **đề xuất**, tách khỏi `IMP-01…IMP-40` của
> [improvement-backlog-2026-10.md](improvement-backlog-2026-10.md) để không trộn hai đợt.

## 0. Phương pháp, nguồn, giới hạn

**Câu hỏi:** (1) một dashboard của app SaaS quản lý quán ăn/nước uống/nhà hàng nên có **những dữ
liệu gì**; (2) đối thủ và tài liệu học thuật nói gì; (3) **dựa trên hệ thống ScanGo hiện tại**, cần
thêm gì để quản lý **cập nhật được những thông tin đó dễ hơn**.

**Nguồn:** khảo sát trực tiếp 8 đối thủ trong [competitor-report-2026-10.md](competitor-report-2026-10.md)
(tái sử dụng, không khảo sát lại), cộng khảo sát mới các dashboard/report của
[Toast](https://support.toasttab.com/en/article/Getting-Started-with-Analytics-and-Reports),
[Toast Reporting](https://pos.toasttab.com/products/reporting),
[Qube Dine](https://www.qubedine.com/dashboard-demo), [Bhookly](https://bhookly.com/product/dashboard),
[Menulisa](https://menulisa.com/docs/alerts), [Kayana](https://kayanaforbusiness.com/us/products/merchant-admin/),
[eresto Plus](https://eresto.in/products/eresto-plus), [DineOpen](https://www.dineopen.com/products/menu/management);
tài liệu ngành ([ClicData](https://www.clicdata.com/blog/restaurant-analytics/),
[GoAudits](https://goaudits.com/blog/restaurant-key-performance-indicators/),
[CostLab 2025](https://costlab.ai/blog/restaurant-industry-benchmarks-2025),
[Suntek](https://www.sunteksolutions.io/blog/restaurant-performance-dashboard-for-teams),
[Validator.vn — số liệu ngành F&B Việt Nam 2026](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026));
và các paper ở §2. Nguồn ScanGo: `docs/SRS.md`, `docs/data-model.md`, `firestore.rules`, và **đọc
trực tiếp mã nguồn** (`src/pages/dashboard/OverviewPage.tsx`, `shared/contracts/reporting.contract.ts`,
`functions/src/modules/reporting/service.ts`, `shared/contracts/*.contract.ts`).

**Giới hạn — đọc trước khi tin số nào:**

- `chưa xác minh` = đã tìm nhưng không có nguồn công khai xác nhận. **Không suy đoán.**
- Nhiều bài "benchmark" và "tỷ lệ dashboard bị bỏ" là **nội dung do nhà cung cấp/consultant viết**,
  không phải khảo sát công bố. Chỗ nào vậy đều ghi rõ.
- **Không có paper nào đo riêng "tỷ lệ quản lý quán dùng dashboard"** — bằng chứng peer-reviewed về
  adoption là BI nói chung, không phải F&B. Các con số F&B cụ thể đều từ khảo sát consultant.
- Ngưỡng benchmark của Mỹ/EU **không áp thẳng cho Việt Nam** (xem §1.2: giá vốn thực tế ở VN cao hơn
  hẳn ngưỡng lý thuyết).

---

## 1. Dashboard F&B SaaS nên có dữ liệu gì

### 1.1 Nguyên tắc: thiết kế theo **việc của người dùng**, không theo dữ liệu đang có

Bài học lặp lại ở cả tài liệu ngành lẫn paper: dashboard thất bại vì **quá nhiều chỉ số cho một
người** chứ không vì thiếu chỉ số. [Suntek](https://www.sunteksolutions.io/blog/restaurant-performance-dashboard-for-teams)
kể một chuỗi nhà hàng gửi báo cáo 40 chỉ số cho toàn bộ quản lý, và kết quả là **không ai dùng**:
"the manager who needed today's labor cost against yesterday's sales had to wade through 40 metrics".
[ClicData](https://www.clicdata.com/blog/restaurant-analytics/) kết luận tương tự: "different roles
need different dashboards… build for the role, not for 'the restaurant'", và "real-time analytics only
matter if they trigger action. A dashboard that nobody opens is wallpaper."

Hệ quả cho ScanGo — **bốn màn khác nhau, không phải một màn nhiều tab**:

| Vai trò | Câu hỏi cần trả lời trong 10 giây | Dữ liệu chính |
|---|---|---|
| **Chủ quán** (Owner) | Hôm nay lãi hay lỗ, so với hôm qua/tuần trước thế nào? | Doanh thu, giá vốn, lợi nhuận gộp, AOV, số đơn, huỷ/hoàn, món bán chạy, mục tiêu ngày |
| **Quản lý ca** | Bây giờ có gì cần xử lý? | Đơn đang mở, bàn đang ngồi, món sắp hết, đơn chờ lâu, chênh lệch tiền mặt, cảnh báo |
| **Bếp** | Còn nguyên liệu không, món nào cần nấu trước? | Tồn thấp, phiếu bếp theo thứ tự, thời gian chế biến |
| **Thu ngân** | Còn ai chưa trả tiền? | Đơn chưa thu, đối chiếu tiền mặt/VietQR cuối ca |

### 1.2 Bộ chỉ số chuẩn + ngưỡng (có số, có nguồn)

Công thức (theo [Metabase](https://www.metabase.com/metrics/average-check-size) và
[Kimes 1999](https://ecommons.cornell.edu/bitstreams/d878b940-cda9-406c-b444-972ca0f27508/download)):

- **Food cost %** = giá vốn nguyên liệu đã bán ÷ doanh thu bán món × 100
- **Labour cost %** = tổng chi phí lương (lương + làm thêm + BHXH) ÷ doanh thu × 100
- **Prime cost %** = food cost % + labour cost % *(chỉ số quan trọng nhất của ngành)*
- **RevPASH** = doanh thu ÷ (số ghế × số giờ mở cửa)
- **Table turnover** = số lượt khách/bàn ÷ số bàn; **Average check/AOV** = doanh thu ÷ số đơn (hoặc ÷ số khách)
- **Contribution margin** của một món = giá bán − giá vốn món; **menu-mix %** = lượng món bán ÷ tổng lượng bán

Ngưỡng:

| Chỉ số | Ngưỡng | Nguồn |
|---|---|---|
| Food cost % | 28–35% tuỳ phân khúc (fine dining 28–38%, casual 28–35%, fast casual 25–35%, QSR 25–31%, bar 18–24%) | [Hiệp hội nhà hàng — KPI guide](https://restaurantassociation.com/library/Restaurant-KPIs-Every-Owner-Should-Track.pdf/) |
| Food cost % (Mỹ, thực đo 2024) | trung vị **32,4%** limited-service, **32,0%** full-service | [NRA 2025 Operations Data Abstract](https://www.restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/) |
| Labour cost % (Mỹ, thực đo 2024) | trung vị **31,7%** limited-service, **36,5%** full-service; quán lỗ: 34,2%→42,9% (full-service) | [NRA 2025](https://www.restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/) |
| Prime cost % | **<55% xuất sắc · 55–60% tốt · 60–65% chấp nhận · 65–70% cảnh báo · >70% có vấn đề**; trung vị Mỹ 65% limited-service | [KPI guide](https://restaurantassociation.com/library/Restaurant-KPIs-Every-Owner-Should-Track.pdf/), [NRA 2025](https://www.restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/) |
| **Food cost % Việt Nam** | ngưỡng mục tiêu 28–35%, **nhưng thực tế VN 44,8% ở nhóm "30%+"** | [Validator.vn — F&B Việt Nam 2026](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026) |
| Prime cost % Việt Nam | mục tiêu 50–55%; **>60% là báo động đỏ**, >70% "khó tồn tại dù đông khách" | [Validator.vn](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026) |
| Bàn quay vòng | fast casual 3–4 lượt/suất ăn, casual 1,5–2, fine dining ~1 | nguồn blog vendor — coi là **tham khảo, `chưa xác minh`**: [kitchencost](https://kitchencost.app/en/blog/table-turnover-rate-guide/) |
| Bàn quay vòng (hướng dẫn của hiệp hội) | **8–16 lượt/12 giờ** ở phân khúc nhanh, 4–8 ở phân khúc khác | [2024 Restaurateur Benchmark Guide (PDF)](https://leveragebuyinggroup.com/wp-content/uploads/2024/10/2024-Restaurateur-Benchmark-Guide-FINAL-10-21.pdf) |
| Average check theo phân khúc (Mỹ) | QSR 8–15$ · fast casual 12–20$ · casual 20–45$ · upscale casual 40–70$ · fine dining 75–150$+ | [KPI guide](https://restaurantassociation.com/library/Restaurant-KPIs-Every-Owner-Should-Track.pdf/) |
| Lợi nhuận trước thuế (Mỹ, thực đo 2024) | **4,0%** limited-service, **2,8%** full-service | [NRA 2025](https://www.restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/), [Level CFO](https://levelcfo.com/benchmarks/restaurants/) |
| RevPASH | **không tìm được dải số đáng tin** → `chưa xác minh`. Vẫn nên hiện chỉ số vì so sánh với chính quán theo thời gian | — |

> **Cảnh báo quan trọng cho ScanGo:** ngưỡng "food cost 28–35%" của Mỹ **không dùng làm mặc định
> cho quán Việt Nam**. Theo [Validator.vn](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026),
> thực tế VN là 44,8%. Nếu ScanGo hardcode ngưỡng 35% rồi báo "giá vốn của bạn tệ", phần lớn quán
> VN sẽ thấy cảnh báo sai và **tắt cảnh báo** — đúng cơ chế thất bại mà tài liệu adoption mô tả.
> Ngưỡng phải **để quản lý tự đặt**, mặc định chỉ là gợi ý.

### 1.3 Dashboard và danh mục báo cáo của 8 đối thủ (khảo sát mới)

Đây là phần khảo sát mới, **tập trung riêng vào nội dung dashboard/báo cáo** (không khảo sát lại
đặt món, phần cứng, giá — những thứ đã có ở [competitor-report-2026-10.md](competitor-report-2026-10.md)).
**Cảnh báo phương pháp:** tất cả nguồn dưới đây là **tài liệu do chính nhà cung cấp viết** (help
center, bảng tính năng). Bảng tính năng có thể **chậm hơn sản phẩm đang bán**; trang marketing của
iPOS và POS365 là **tự công bố**. Chỗ nào không đọc được tài liệu chính thức thì ghi `chưa xác minh`.

| Sản phẩm | Trang chủ (dashboard) hiển thị gì | Danh mục báo cáo |
|---|---|---|
| **Toast (US)** | **Weekly Overview**: Net Sales, Labor Cost, Guest Count, Top Selling Items — **so với tuần trước / cùng tuần năm ngoái / 2 năm trước**; cập nhật theo giờ; có link drill-down | **40+ báo cáo trong 9 nhóm**: Sales, Labor, Menus, Payments, Cash & Loss Management, Accounts, Kitchen Operations, Marketing, Other. Có PMIX, **Food Waste Breakdown**, Employee Productivity, Hourly Sales, Voided Orders, Removed Items, Discounts, No Sale, Cash Drawer Overview, Tickets By Hour, Guest Summary, Location Breakdown. Tách theo **ngày/thứ/giờ/thanh toán/nhóm món/khu vực phục vụ/nhân viên/chi nhánh**. Có **Compare Dates + Compare Locations**; export email (.xls/.csv), PDF, và **export tự động hằng đêm** ([nguồn](https://support.toasttab.com/en/article/Getting-Started-with-Analytics-and-Reports), [Reporting](https://pos.toasttab.com/products/reporting)) |
| **Square (US)** | Ảnh chụp trong ngày: kỳ chuyển tiền tới, top món, **phản hồi khách** | Sales summary dạng bảng cân đối (product sales, service charges, discounts/comps, returns, net sales, taxes, tips, fees, total collected); sales trends; **payment methods** (debit/credit, brand); item/category/modifier; discounts-comps-voids; tax/fees; transaction status; gift cards; **custom report builder**; cash drawers; section sales; **kitchen performance**; reconciliation ([nguồn](https://squareup.com/help/us/en/article/5072-summaries-and-reports-from-the-online-dashboard)) |
| **Lightspeed (US/EU)** | K-Series: Gross/Net sales, Orders, **Order average**, **Covers**, **Cover average** — mỗi số **so với kỳ tương đương trước**; Best sellers; Top payment methods; **biểu đồ do AI tạo, lưu được vào dashboard**. O-Series "Insights Live" (mobile): Revenue, Open/Paid orders, Average Transaction, **xu hướng dự phóng theo giờ-ngày-tháng**, Guests (số khách + chi tiêu TB so benchmark), **Profit (doanh thu − COGS so benchmark)**, Order Types, Trends 3 tháng/6 tuần, **Alerts (chênh lệch đối soát, đơn bị xoá, cuối ngày)** | Advanced Insights: Sales (ngày đông nhất, **giờ cao điểm**, giờ khách quay lại), Menu (xếp hạng món), Staff (doanh thu theo nhân viên, TB/check và TB/khách so với trung bình chung) ([nguồn](https://k-series-support.lightspeedhq.com/hc/en-us/articles/4403208456603-Understanding-the-Dashboard-page), [Insights Live](https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329416356251-Navigating-Insights-Live)) |
| **iPOS.vn** | App FABi Manager: doanh thu **thời gian thực** theo từng quán/toàn chuỗi, biểu đồ so sánh ngày-tuần-tháng, chi tiết hoá đơn, **số khách**, trạng thái bàn, **theo ca**, **hiệu suất từng nhân viên**, trạng thái đơn | Bảng tính năng FABi có **mã báo cáo**: A01 doanh thu thuần, A02 theo quán, A03 theo khu; B01 xu hướng bán, B02 khuyến mãi, B03 **nguồn đơn**, B04–B06 món/nhóm/loại bán chạy, B07 **hình thức thanh toán**, **B08 thời gian chế biến TB, B09 thời gian hoàn tất đơn TB**, B10 combo, B11 buffet; C01 tổng quan quán, C02 **theo ca**, C03–C04 hoá đơn/đơn theo thời gian, **C05 hoá đơn bị sửa/huỷ**, C08 **món bị xoá**, C09 **lịch sử hết món**, C10 số đơn, C11 thay đổi món, C12 đặt cọc; D01 công nợ, **D02 đối chiếu VAT**, D04 tổng hợp theo hình thức thanh toán. **Có báo cáo doanh thu theo giờ** ([nguồn](https://huongdan.ipos.vn/docs/bang-tinh-nang-phan-mem-ipos-vn/tinh-nang-phan-mem-fabi/), [báo cáo theo giờ](https://ipos.vn/bao-cao-doanh-thu-theo-gio/)) |
| **CukCuk / MISA** | Mobile: Báo cáo → **Tình hình kinh doanh** (doanh thu, chi phí, lợi nhuận; theo từng chi nhánh khi có chuỗi) | **~25 báo cáo bán hàng có tên**: tổng hợp ngày, liệt kê hoá đơn, doanh thu chi tiết theo hoá đơn + món, **theo ca**, **theo thời gian (giờ / thứ / ngày / tuần / tháng / quý)**, theo món (số lượng, giá TB, giá trị khuyến mãi, **tỷ trọng doanh thu**, thành phần combo), theo **chỗ ngồi/khu vực**, theo khách, **theo nhân viên**, so sánh doanh thu món qua thời gian, theo đối tác giao hàng, **số khách TB qua thời gian**, so hoá đơn tạm với hoá đơn, **lịch sử sửa/huỷ**, **thời gian hoàn tất món**, đặt bàn, **số đơn/món bị huỷ theo lý do**, doanh thu theo khuyến mãi, **tần suất khách + giá trị mua TB**. Báo cáo lợi nhuận: kết quả kinh doanh (doanh thu vs toàn bộ chi phí), **lợi nhuận theo món** (doanh thu vs giá vốn nguyên liệu). Export Excel ([nguồn](https://helpv2.cukcuk.vn/vi/kb/1050000_tinh_hinh_ban_hang), [lợi nhuận](https://trienkhai.cukcuk.vn/1050000_tinh_hinh_loi_nhuan.htm)) |
| **POS365** | App chủ quán (POS365 Boss): **P&L và doanh thu thời gian thực** trên Cloud; tự công bố "30+ biểu đồ cập nhật theo giây" | Cuối ngày (món bán, số đơn, doanh thu, **hình thức thanh toán**), bán hàng, trả hàng, **tiêu hao/hao hụt nguyên liệu**, mua hàng, **tồn kho (giá trị, nhập-xuất-tồn)**, công nợ phải thu/phải trả, **hoa hồng nhân viên**, **sổ quỹ** (theo tài khoản/nhóm/hình thức/thời gian), nhiều chi nhánh (doanh thu, tần suất bán, hiệu quả), chăm sóc khách (theo chi nhánh, thói quen mua), phân tích bán hàng (**món bán chậm**, bán chạy, top khách), kết quả kinh doanh. Tách theo giờ / so sánh kỳ / export: `chưa xác minh` ([nguồn](https://pos365.vn/docs/bao-cao-2389.html)) |
| **Sapo FnB** | **Tổng quan: Tiền hàng / Hoàn huỷ / Giảm giá — kèm % thay đổi**; lọc thời gian Hôm nay/Hôm qua/Tuần/Tháng/Khác; **bộ lọc so sánh: không / kỳ trước / cùng tuần tuần trước / cùng tháng tháng trước / cùng kỳ năm trước** | 7 nhóm (doanh thu, món, kho, tài chính, khuyến mãi, nhân viên, sổ quỹ). Nhóm doanh thu có **10 báo cáo con**: tổng quan (số hoá đơn, **hoá đơn huỷ**, số món, TB món/hoá đơn, **TB doanh thu/hoá đơn**, **biểu đồ doanh thu THEO GIỜ**, **biểu đồ doanh thu THEO NGÀY**), **hình thức thanh toán** (doanh thu + số đơn mỗi hình thức), **doanh thu theo phục vụ**, **doanh thu theo thu ngân (gồm hoá đơn huỷ)**, thuế & phí (giảm giá, phí dịch vụ, thuế, tip, hoàn tiền, phí đối tác), loại hình dịch vụ, hoàn tiền, **đơn huỷ chưa thanh toán**, **đơn huỷ đã thanh toán**, đối tác giao hàng (GrabFood/ShopeeFood: hoá đơn, doanh thu, hoa hồng, thuế, thực nhận). Cùng 10 loại này **trên app chủ quán**. Export Excel ([nguồn](https://help.sapo.vn/tong-quan-he-thong-bao-cao-cua-sapo-fnb), [màn tổng quan](https://help.sapo.vn/gioi-thieu-man-hinh-tong-quan-sapo-fnb)) |
| **KiotViet FnB** | Doanh thu, số hoá đơn, số khách (biểu đồ) + **doanh thu tạm tính từ các bàn đang phục vụ** | Cuối ngày (theo doanh thu / thu-chi / hàng hoá), bán hàng (drill xuống doanh thu, **lợi nhuận**, bàn dùng nhiều nhất), hàng hoá (bán ra, lợi nhuận, nhập-xuất-tồn, **xuất huỷ**), khách hàng, nhà cung cấp, **nhân viên** (doanh thu/lợi nhuận/hàng hoá theo từng người), **kênh bán** (tại quán / mang về / GrabFood), tài chính (**kết quả kinh doanh tổng thể, lợi nhuận thực**). Có app chủ quán và app nhân viên. Tách theo giờ + so sánh kỳ: `chưa xác minh` ([nguồn](https://kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-bao-cao/he-thong-bao-cao/), [báo cáo mobile](https://kiotviet.vn/bao-cao-mobile-fnb/)) |

**Ma trận đối chiếu 8 đối thủ** (✅ có tài liệu xác nhận · ⚠️ một phần hoặc `chưa xác minh` · ❌ không tìm thấy):

| Năng lực | Toast | Square | Lightspeed | iPOS | CukCuk | POS365 | Sapo | KiotViet |
|---|---|---|---|---|---|---|---|---|
| Tổng hợp doanh thu thuần/gộp | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Danh mục báo cáo có phân nhóm** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tách **theo giờ / thời điểm trong ngày** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| Xu hướng theo ngày/thứ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theo món/nhóm/bán chạy (PMIX) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theo **hình thức thanh toán** | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| Theo **nhân viên / thu ngân** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Theo **kênh / loại hình / đối tác giao hàng** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Theo **chi nhánh** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| **Huỷ / sửa / hoàn tiền (chống thất thoát)** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| Thuế & phí | ✅ | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| **Giá vốn / lợi nhuận** | ⚠️ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Báo cáo kho | ⚠️ | ⚠️ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ✅ |
| **Báo cáo khách / số khách** | ✅ | ⚠️ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ |
| **So sánh với kỳ trước** | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ | ⚠️ |
| **Export Excel/CSV + gửi email/định kỳ** | ✅ | ✅ | ⚠️ | ✅ | ✅ | ⚠️ | ✅ | ✅ |
| **App chủ quán có báo cáo** | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom report builder | ⚠️ | ✅ | ⚠️ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Báo cáo bếp / thời gian chế biến** | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Kế toán/sổ cái/kê khai thuế | ✅ | ✅ | ⚠️ | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |

**Gần như đối thủ nào cũng có:** tổng hợp doanh thu có lọc ngày; **danh mục báo cáo phân nhóm** (không
phải một danh sách phẳng); tách theo món/nhóm; **hiệu suất theo nhân viên/thu ngân**; biểu đồ xu hướng
theo ngày; **app chủ quán có báo cáo chính** (7/8). Gần như phổ biến (6–7/8): **tách theo giờ**,
**tách theo hình thức thanh toán**, **thấy được huỷ/hoàn**, **so sánh kỳ trước**, **export Excel/CSV**.

**Chỉ nhóm lớn có:** custom report builder (chỉ Square); **báo cáo bếp/thời gian chế biến** (Toast,
Square, iPOS, CukCuk); kế toán/sổ cái/kê khai thuế đầy đủ (Toast, Square, iPOS, CukCuk qua MISA);
bộ chống thất thoát có kiểm két (Toast, Square); biểu đồ do AI tạo (Lightspeed K-Series); cảnh báo
đẩy tới điện thoại theo thời gian thực (Lightspeed O-Series); gửi báo cáo định kỳ qua email (chỉ
Toast xác minh được).

**Ba điều đáng chú ý nhất cho ScanGo:**

1. **Sapo FnB** — đối thủ Việt gần phân khúc ScanGo nhất (160k/tháng so với 99k của ScanGo) — có màn
   tổng quan **"Tiền hàng / Hoàn huỷ / Giảm giá + % thay đổi"** và **bộ lọc so sánh 5 lựa chọn** ngay
   trên trang chủ. ScanGo hiện **không có** cả ba con số đó (dù `cancelledOrderCount` và `reversedVnd`
   **đã có trong `dailyStats`**) và không có so sánh kỳ. Đây là khoảng cách **hiển thị**, không phải
   khoảng cách dữ liệu.
2. **iPOS có B08 "thời gian chế biến TB" và B09 "thời gian hoàn tất đơn TB"; CukCuk có "thời gian
   hoàn tất món"** → đo thời gian bếp **là kỳ vọng của thị trường Việt Nam**, không chỉ của Mỹ. ScanGo
   có đủ dữ liệu (`statusEvents` có timestamp) nhưng chưa tổng hợp (DB-20).
3. **CukCuk có "số đơn/món bị huỷ theo lý do" và "tần suất khách + giá trị mua TB"** → xác nhận DB-06
   (lý do huỷ) và DB-23 (khách quay lại) là chỉ số chuẩn của thị trường, không phải tính năng thừa.

---

## 2. Học thuật nói gì

### 2.1 Menu engineering (Kasavana & Smith 1982)

Khung gốc: Kasavana, M.L. & Smith, D.I. (1982), *Menu Engineering: A Practical Guide to Menu
Analysis* ([Google Books](https://books.google.com/books/about/Menu_Engineering.html?id=iJeCAAAACAAJ)).
Mỗi món được chấm trên **hai trục: độ phổ biến và contribution margin (giá bán − giá vốn)**:

- Chỉ số phổ biến = lượng bán của món ÷ lượng bán trung bình × 100; **≥70 là "phổ biến"** (quy tắc 70%).
  Ngưỡng này phụ thuộc số món trong nhóm: nhóm 8 món → phổ biến = (100%/8)×70% = **8,75%** tỷ trọng bán
  ([nguồn có giải thích](https://scispace.com/pdf/menu-engineering-a-model-including-labor-189jd546a9.pdf),
  [ví dụ tính](https://ritapos.com/en/academy/lessons/5-8-menu-engineering-tool/)).
- Ma trận 2×2: **Stars** (phổ biến + CM cao) · **Plowhorses** (phổ biến + CM thấp) · **Puzzles**
  (ít bán + CM cao) · **Dogs** (ít bán + CM thấp) ([ví dụ có số](https://moneydeck.io/tools/menu-engineering-calculator)).
- Kiểm chứng thực tế: một nghiên cứu 24 món chính trong 1 tháng ở nhà hàng fine dining Jakarta ra
  **2 Stars, 13 Plowhorses** (54,2% số món, 69,8% lượng bán, nhưng chỉ 62,9% contribution margin),
  7 Puzzles, 2 Dogs ([nguồn](https://journalcenter.org/index.php/jempper/article/view/7752)).
- Độ tập trung có thật nhưng quy tắc 80/20 không chặt: dữ liệu POS 244.398 đơn cho thấy **20% món
  đầu = 75,3% lượng bán**, và trung vị cần **28,1% số món để đạt 80% doanh số**
  ([Avocado POS](https://www.avocadopos.com/blog/restaurant-menu-engineering)).

**Ý nghĩa cho ScanGo:** `dailyStats/items` đã có `paidQuantity`, `revenueVnd`, `costVnd`,
`grossProfitVnd` cho **từng món, từng ngày** — tức là **đủ dữ liệu để vẽ ma trận menu engineering
mà không cần thêm gì ở backend**. Đây là tính năng "trông rất chuyên nghiệp" rẻ nhất còn lại.

### 2.2 Restaurant revenue management và RevPASH

Kimes và cộng sự lập luận rằng **hàng tồn kho dễ hỏng của nhà hàng là *thời gian*** (một "seat-hour"),
nên doanh thu/ngày hay số lượt bàn đều bỏ qua yếu tố thời gian; từ đó đưa ra **RevPASH = doanh thu ÷
(số ghế × độ dài kỳ)** (Kimes, Chase, Choi, Lee & Ngonzi 1998; Kimes 1999
[PDF Cornell](https://ecommons.cornell.edu/bitstreams/d878b940-cda9-406c-b444-972ca0f27508/download)).
Tổng quan hệ thống mới nhất (Bujalance-López et al., *British Food Journal* 127(6):2169–2196, 2025)
xác định ba đòn bẩy dữ liệu: **định giá động, dự báo bằng AI, và menu engineering**
([Emerald](https://www.emerald.com/bfj/article/127/6/2169/1263184/Restaurant-revenue-management-a-systematic)).
Một SLR thứ hai (PRISMA trên 70 bài) cho thấy **quản lý thời lượng bữa và đặt bàn là hai thực hành
được dùng nhiều nhất**, và khuyến nghị đo **thời lượng bữa + chỉ số + cơ cấu bàn**
([MDPI Tourism and Hospitality 6(1):44](https://www.mdpi.com/2673-5768/6/1/44)).

**Ý nghĩa cho ScanGo:** để tính RevPASH cần **số ghế** (đã có: `tables.seats`) và **giờ mở cửa**
(chưa có ở đâu — xem `DB-33`). Đây là ví dụ rõ nhất cho việc "dashboard thiếu dữ liệu không phải vì
máy chủ thiếu, mà vì **quản lý chưa có chỗ nhập**".

### 2.3 Dự báo nhu cầu

Kim, S. (2025), *Food Science and Biotechnology* 34(15):3597–3606: mô hình dự báo **từng món** bằng
mạng nơ-ron sâu (phân loại đa lớp) trên **doanh số lịch sử 2021–2023 + dữ liệu khí tượng**, ~384 món,
hệ số tương quan Pearson trung bình **0,7945** ([PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12528577/)).
Nghiên cứu trước đó ở một chuỗi lớn: Chae, Sheu & Park, *Decision Support Systems* 184:114291 (2024)
([DOI](https://doi.org/10.1016/j.dss.2024.114291)).

Cảnh báo về lượng dữ liệu (nguồn consultant, **không peer-reviewed**): sai số ±8–12% khi có **≥18
tháng lịch sử sạch**, nhưng **20–35% khi có <12 tháng**
([hospitalidad.ai](https://hospitalidad.ai/EN/real-time-dashboards-in-restaurants-myth-vs-reality.html)).

**Ý nghĩa cho ScanGo:** ScanGo chưa có 18 tháng dữ liệu của bất kỳ tenant nào, và **không có dữ liệu
khí tượng**. Dự báo ML ở giai đoạn này là **làm màu**. Việc đúng là **thu thập đủ dữ liệu sạch trước**
(xem §5, "sức khoẻ dữ liệu").

### 2.4 Dữ liệu và miền quyết định của "restaurant analytics"

Roy, Spiliotopoulou & de Vries, *Production and Operations Management* 31(10):3687–3709 (2022) —
năm miền quyết định: **vị trí; đặt bàn & quản lý bàn; quản lý hàng đợi; thiết kế & menu engineering;
quản lý đơn đa kênh**
([IIMA](https://www.iima.ac.in/publication/restaurant-analytics-emerging-practice-and-research-opportunities),
[DOI](https://doi.org/10.1111/poms.13809)). Danh sách nguồn dữ liệu chi tiết theo từng miền nằm trong
PDF trả phí (Wiley trả 403) → `chưa xác minh`.

Một nghiên cứu phỏng vấn 17 lãnh đạo về dữ liệu POS có tiêu đề nói thẳng vấn đề: *"Data rich,
extraction poor"* — nhu cầu thông tin có, nhưng dữ liệu **không đầy đủ, không chính xác, hoặc không
truy cập được** ([nguồn](https://exa.ai/library/publication/vywlty2rjyy)).

**Ý nghĩa cho ScanGo:** đúng tình trạng hiện tại — ScanGo **thu dữ liệu nhiều hơn mức nó hiển thị**
(xem §3.2). Vấn đề không phải "thêm nguồn dữ liệu" mà là **đưa dữ liệu đã có lên màn hình**.

### 2.5 Vì sao dashboard bị bỏ, và vì sao số liệu hao hụt hay sai

- Tổng quan hệ thống về khó khăn của người dùng cuối với BI (PRISMA, 18 nghiên cứu 2021–2024): 12
  chủ đề thuộc ba nhóm **công nghệ, cá nhân, tổ chức**, và các yếu tố **tác động lẫn nhau**
  ([Alfariz, Malik & Lokman 2024](https://ideas.repec.org/a/bcp/journl/v8y2024i11p304-315.html)).
- Riêng F&B: luận văn 2024 "Enhancing Staffing Efficiency in Restaurants with a Real-time BI
  Dashboard" nói vấn đề của ngành là **độ phức tạp của BI và gánh nặng nhận thức** đặt lên người dùng
  ([PDF](https://run.unl.pt/bitstreams/eb48cb6e-194b-472d-b021-5da044a776b6/download)).
- Khoảng cách giá trị: **83%** chủ quán nói công nghệ là lợi thế cạnh tranh nhưng **chỉ 28%** nói đầu
  tư công nghệ đã cải thiện lợi nhuận ([NRA 2025 State of the Industry qua NRN](https://www.nrn.com/restaurant-insights/state-of-the-industry-how-much-does-technology-really-improve-restaurant-operations-)).
  Deloitte 2025: chưa tới một nửa chủ quán thấy mình sẵn sàng về hạ tầng công nghệ (39%) hay vận hành (34%)
  ([Deloitte](https://www.deloitte.com/us/en/about/press-room/deloitte-how-ai-is-revolutionizing-restaurants.html)).
- **Hao hụt do nhân viên khai báo thì bị đánh giá thấp:** so với đo lường khoa học trong điều kiện
  kiểm soát, số do nhân viên khai báo **thấp hơn tới 80%**, trung bình **~29,4%** ở ba bếp bệnh viện và
  **~30,7%** ở buffet sáng khách sạn; **đếm thường xuyên hơn và phủ rộng hơn thì giảm sai lệch**
  (Leverenz et al. 2025, [PDF](https://pub.epsilon.slu.se/38907/1/leverenz-d-et-al-20251120.pdf)).
- Sai lệch hoá đơn/kiểm kê (dữ liệu nền tảng Supy, 93 triệu điểm dữ liệu — **do vendor công bố, `chưa
  xác minh` độc lập**): **22,7%** trong 1,27 triệu hoá đơn có ít nhất một dòng lệch giá so với giá đã
  thoả thuận; trong số dòng bị tính cao, gần một nửa cao hơn **≥20%**
  ([QSR Magazine](https://www.qsrmagazine.com/story/what-93-million-data-points-say-about-where-restaurants-actually-lose-money/)).
- Bất thường tồn kho tăng theo mức tồn trung bình, tần suất nhập hàng và độ dễ hỏng; **một lần kiểm kê
  tạo ra mức tăng doanh số 11% toàn cửa hàng**, tập trung ở các mặt hàng đang bị lệch âm
  (nghiên cứu bán lẻ tạp hoá, dùng làm phương pháp tham chiếu — [arXiv 2506.05357](https://arxiv.org/pdf/2506.05357)).

**Ý nghĩa cho ScanGo:** (a) cảnh báo phải **gắn với một hành động** và **có người chịu trách nhiệm**,
nếu không sẽ bị bỏ qua; (b) số hao hụt **chỉ đáng tin khi đếm thường xuyên** — nên thiết kế "kiểm nhanh
cuối ca" và **hiện luôn độ phủ dữ liệu** (đã kiểm kê mấy lần, bao nhiêu % nguyên liệu), thay vì hiện
một con số hao hụt trông chính xác nhưng sai.

---

## 3. Hiện trạng ScanGo

### 3.1 Dashboard hôm nay có gì

`src/pages/dashboard/OverviewPage.tsx` (296 dòng) chỉ có:

1. Bộ chọn kỳ **Hôm nay / Tuần / Tháng**.
2. **4 thẻ KPI**: Doanh thu kỳ (+ Lợi nhuận gộp), Số đơn, Đơn đã thu, Gói dịch vụ.
3. **Biểu đồ cột doanh thu theo ngày** trong kỳ (chỉ vẽ khi doanh thu > 0; nếu bằng 0 thì hiện ô trống).
4. **Top món bán chạy** (tối đa 20, có số lượt và doanh thu).
5. Nút **"Mở Máy Trạm (Simulator)"** và nút **"Xem AI Báo Cáo"**.

Bên cạnh đó là 9 trang rời: `manage` (cửa hàng/audit/khách), `menu`, `promotions`, `inventory`,
`tables`, `staff`, `subscription`, `settings`, `feedback`.

### 3.2 Dữ liệu **đã có sẵn** nhưng **không lên dashboard**

Đây là phần quan trọng nhất của tài liệu này: **phần lớn việc cần làm không phải thêm dữ liệu, mà là
hiển thị dữ liệu đang bị bỏ.**

**(a) API báo cáo đã trả về, giao diện không dùng** — `reportingSummaryResultSchema` trả về
`totals.costVnd`, `cancelledOrderCount`, `reversedOrderCount`, `refundedOrderCount`, `reversedVnd`,
`refundedVnd`, `popularItems[].costVnd/grossProfitVnd`, và **`tables[]` (tối đa 50 bàn)**. Trang
Overview chỉ đọc `revenueVnd`, `grossProfitVnd`, `createdOrderCount`, `paidOrderCount`,
`popularItems[].paidQuantity/revenueVnd`, `dailyBreakdown`. **Toàn bộ phần còn lại bị vứt đi**, kể cả
bảng hiệu suất theo bàn và lợi nhuận gộp theo món.

**(b) Backend có callable nhưng client không gọi lần nào** (đã kiểm tra: 0 tham chiếu trong `src/`):

| Callable | Dữ liệu sẽ có | Việc đề xuất |
|---|---|---|
| `callableInventoryRecordStockCount` | Kiểm kê + chênh lệch so với tồn hệ thống | DB-10 (trùng IMP-19) |
| `callableInventoryReviewLoss` | Thất thoát quy về nguyên liệu/món/ca/khung giờ | DB-11 |
| `callableFeedbackCreateTicket`, `callableFeedbackUpdateTicket` | Ticket phản hồi khách (`received → in_progress → resolved`) | DB-12 |
| `callableWorkforceScheduleShift`, `WorkforceClockIn/ClockOut`, `WorkforceGetAttendanceSummary`, `WorkforceApproveCorrection` | Ca làm, chấm công, đi muộn, tổng hợp công | DB-13 |
| `callableLoyaltyUpdateConfig`, `LoyaltyEarnPoints`, `LoyaltyReversePoints` | Cấu hình tích điểm, cấp/thu hồi điểm | DB-14 |
| `callablePaymentAutoConfirm` | Trạng thái xác nhận thanh toán tự động | DB-15 |
| `callableAiGroupFeedback`, `callableAiRunWeeklyAnalysis` | Nhóm phản hồi theo chủ đề; phân tích tuần có cấu trúc | DB-16 |
| `callableTenantListCustomerPhones` | Danh sách khách theo SĐT (Owner) | DB-12 (một phần) |

**(c) Có trong data model nhưng chưa có cả callable lẫn màn:** `reservations` (chỉ được nhắc trong
module AI, không có contract trong `shared/contracts/`), và `shifts`/`attendance` thì có contract +
callable nhưng **không có màn nào trong dashboard**.

**(d) Nút chết:** "Xem AI Báo Cáo" (OverviewPage dòng 287) là `<button>` **không có `onClick`**. Ở gói
Free, nút bên cạnh đẩy sang trang gói dịch vụ; ở gói trả tiền, nút **không làm gì**. Người dùng bấm
vào và không có gì xảy ra — mất niềm tin đúng vào chỗ ScanGo muốn bán giá trị AI.

**Cách kiểm lại (2 lệnh, không cần đọc lại tài liệu này):**

```bash
# (a) API trả về những field nào
grep -n "costVnd\|cancelledOrderCount\|refundedVnd\|tables:" shared/contracts/reporting.contract.ts
# (b)+(d) callable nào không được client gọi, và nút nào không có handler
for f in AiGroupFeedback AiRunWeeklyAnalysis FeedbackCreateTicket InventoryRecordStockCount \
         InventoryReviewLoss LoyaltyUpdateConfig PaymentAutoConfirm WorkforceGetAttendanceSummary; do
  echo "$f -> $(grep -rl "callable$f" src | wc -l)"; done
grep -n "Xem AI Báo Cáo" -A2 src/pages/dashboard/OverviewPage.tsx
```

### 3.3 Ba vấn đề **niềm tin số liệu** (không phải thiếu tính năng)

1. **Lợi nhuận gộp có thể sai mà không báo.** `lineCostVnd = unitCostVnd × quantity`, và
   `unitCostVnd = input.costByMenuItemId?.get(menuItemId) ?? 0`
   (`functions/src/modules/ordering/service.ts:255`). Món **không có công thức → giá vốn 0 → lợi
   nhuận gộp bị thổi lên 100%**. Dashboard hiện `grossProfitVnd` như một sự thật, chỉ có nhánh
   "Chưa có số liệu" khi null. Không có chỗ nào nói "lợi nhuận này tính trên 6/20 món có công thức".
   **Đây là lỗi nghiêm trọng nhất trong tài liệu này** — nó làm chủ quán ra quyết định sai.
2. **Không có kỳ so sánh.** Không có "so với hôm qua/tuần trước" ở bất kỳ đâu, trong khi đây là thứ
   gần như mọi dashboard đối thủ đều có ([Qube Dine](https://www.qubedine.com/dashboard-demo),
   [Bhookly](https://bhookly.com/product/dashboard)). API đã có sẵn `anchorDay` để lùi kỳ → chi phí gần bằng 0.
3. **Trần dữ liệu phía client.** `firestore.rules` chặn client đọc `orders` (`allow read: if false`)
   và chỉ cho Owner đọc `dailyStats`. Nghĩa là **mọi chỉ số mới đều phải được tính ở máy chủ rồi ghi
   vào `dailyStats` (hoặc một collection tổng hợp mới)** — không thể "tự tính ở client". Điều này
   quyết định chi phí của mọi đề xuất ở §4 nhóm C.

### 3.4 Đối chiếu trực tiếp: ScanGo vs 8 đối thủ

Cột "Dữ liệu có sẵn?" là kết quả **đọc mã nguồn** ở §3.2 — đây là chỗ phân biệt "thiếu dữ liệu" với
"thiếu màn hình":

| Năng lực | ScanGo hiện tại | Dữ liệu có sẵn? | Đối thủ Việt đã có | Mã |
|---|---|---|---|---|
| Tổng hợp doanh thu + lọc kỳ | ✅ có | ✅ | tất cả | — |
| Món bán chạy + doanh thu theo món | ✅ có | ✅ | tất cả | — |
| **Lợi nhuận gộp theo từng món** | ❌ không hiện | ✅ `popularItems[].grossProfitVnd` | CukCuk ("lợi nhuận theo món"), KiotViet, iPOS | DB-03 |
| **Danh mục báo cáo phân nhóm** | ❌ 1 trang tổng quan + 9 trang quản trị rời | — | tất cả (7–9 nhóm) | §7 đợt 1 |
| **Doanh thu theo giờ** | ❌ không có | ❌ cần tổng hợp | iPOS, CukCuk, Sapo (biểu đồ theo giờ) | DB-17 |
| **Theo hình thức thanh toán** | ❌ không có | ❌ cần tổng hợp | iPOS B07, CukCuk, Sapo, KiotViet | DB-18 |
| **Theo nhân viên / thu ngân** | ❌ không có | ❌ cần tổng hợp | iPOS, CukCuk, Sapo (theo phục vụ + thu ngân), KiotViet | DB-13 |
| **Theo kênh bán** | ❌ không có | ❌ cần tổng hợp | iPOS B03 (nguồn đơn), CukCuk, KiotViet | DB-19 |
| **Huỷ / hoàn / đảo** | ❌ không hiện | ✅ `cancelledOrderCount`, `reversedVnd`, `refundedVnd` | iPOS C05/C08/C09, CukCuk (theo lý do), Sapo (đơn huỷ chưa/đã thanh toán) | DB-01, DB-06 |
| **So sánh với kỳ trước** | ❌ không có | ✅ `anchorDay` đã hỗ trợ | **Sapo (5 lựa chọn so sánh)**, CukCuk, iPOS, Toast | DB-07 |
| **Giá vốn / food cost %** | ❌ không hiện | ✅ `totals.costVnd` | iPOS, CukCuk, KiotViet, POS365 | DB-02, DB-26 |
| Báo cáo kho / hao hụt trên dashboard | ❌ (có màn Kho riêng) | ✅ callable có | POS365 (tiêu hao/hao hụt), Toast (Food Waste Breakdown) | DB-24, DB-11 |
| **Thời gian chế biến / chờ** | ❌ không có | ✅ `statusEvents` có timestamp | **iPOS B08/B09**, CukCuk (thời gian hoàn tất món) | DB-20 |
| **Hiệu suất theo bàn** | ❌ API trả về, UI bỏ | ✅ `tables[]` | KiotViet (bàn dùng nhiều nhất), iPOS C07 | DB-04 |
| **Bàn đang phục vụ / doanh thu tạm tính** | ❌ không có trên dashboard | ❌ cần truy vấn live | **KiotViet**, iPOS (trạng thái bàn) | DB-40 |
| **Khách / hội viên quay lại** | ❌ không có | ❌ cần tổng hợp | CukCuk (tần suất + giá trị mua TB), iPOS (số khách), Sapo | DB-23 |
| **Xuất Excel/CSV** | ❌ không có | — | tất cả | DB-36 |
| **App chủ quán trên điện thoại** | ❌ chỉ desktop | — | 7/8 đối thủ | DB-37 |
| **Cảnh báo + digest đẩy tới người** | ❌ chỉ có chat AI | — | Lightspeed O-Series alerts, POS365, Toast (email hằng đêm) | DB-25, DB-34 |

**Kết luận của bảng này:** trong 19 dòng, ScanGo **có dữ liệu sẵn cho 7 dòng** mà vẫn không hiển thị.
Nói cách khác, **khoảng cách lớn nhất của dashboard ScanGo hôm nay là khoảng cách hiển thị, không
phải khoảng cách dữ liệu** — đúng với kết luận "Data rich, extraction poor" ở §2.4.

---

## 4. Đề xuất dữ liệu cần thêm

Phân tầng theo chi phí thật: **A = 0 backend** (dữ liệu đã trả về), **B = có backend, chỉ cần UI**,
**C = cần thêm tổng hợp ở máy chủ**.

### Nhóm A — hiện lên ngay, không cần sửa máy chủ

| Mã | Nội dung | Nguồn dữ liệu | Vì sao |
|---|---|---|---|
| **DB-01** | Thẻ **Đơn huỷ / Đảo / Hoàn tiền** (số lượng + số tiền) | `totals.cancelledOrderCount`, `reversedOrderCount`, `refundedOrderCount`, `reversedVnd`, `refundedVnd` | Huỷ và hoàn là rò rỉ lợi nhuận; đối thủ coi void là chỉ số hạng nhất ([Bhookly](https://bhookly.com/product/dashboard)) |
| **DB-02** | **Giá vốn (COGS) + Food cost %** của kỳ, kèm ngưỡng tham chiếu | `totals.costVnd` ÷ `revenueVnd` | Chỉ số quan trọng nhất ngành ([ClicData](https://www.clicdata.com/blog/restaurant-analytics/)); dữ liệu đã có, đang bị bỏ |
| **DB-03** | **Lợi nhuận gộp theo từng món** + **ma trận menu engineering** (Stars/Plowhorses/Puzzles/Dogs) | `popularItems[].paidQuantity/costVnd/grossProfitVnd` | §2.1; dữ liệu đã có; rẻ nhất mà trông chuyên nghiệp nhất |
| **DB-04** | **Bảng hiệu suất theo bàn** (doanh thu, số đơn, lợi nhuận gộp mỗi bàn) | `tables[]` — **API trả về, UI đang bỏ** | §2.2 nói bàn là miền quyết định; sửa 1 khối JSX |
| **DB-05** | **Giá trị đơn trung bình (AOV)** = `revenueVnd ÷ paidOrderCount` | Dẫn xuất từ dữ liệu đã có | Chỉ số cơ bản, mọi đối thủ có ([Qube Dine](https://www.qubedine.com/dashboard-demo)) |
| **DB-06** | **Tỷ lệ huỷ** = `cancelledOrderCount ÷ createdOrderCount` | Dữ liệu đã có | Cảnh báo sớm vấn đề bếp/phục vụ |
| **DB-07** | **So sánh kỳ trước** (mũi tên % so hôm qua/tuần trước/tháng trước) | `getReportingSummary` với `anchorDay` lùi kỳ — **API đã hỗ trợ** | Thứ đối thủ nào cũng có; chi phí = 1 lần gọi thêm |
| **DB-08** | **Số đơn đảo/hoàn theo tiền** trong biểu đồ, không chỉ doanh thu | `dailyBreakdown[].totals` | Doanh thu thuần vs doanh thu gộp |
| **DB-09** | **Sửa nút "Xem AI Báo Cáo" chết** | `AiChatWidget` đã có sẵn trong layout | Nút không làm gì là lỗi niềm tin, không phải thiếu tính năng |

### Nhóm B — máy chủ đã có, chỉ cần màn hình

| Mã | Nội dung | Backend sẵn có |
|---|---|---|
| **DB-10** | **Kiểm kê trên điện thoại**, chế độ "kiểm nhanh cuối ca" | `InventoryRecordStockCount` |
| **DB-11** | **Rà soát thất thoát** quy về nguyên liệu/món/ca/khung giờ + **độ phủ dữ liệu** (đã đếm mấy lần) | `InventoryReviewLoss` |
| **DB-12** | **Hộp thư phản hồi khách**: điểm hài lòng trung bình, số lượng, ticket theo trạng thái | `FeedbackCreateTicket`/`UpdateTicket` |
| **DB-13** | **Ca & chấm công**: ai đang làm, đi muộn, tổng giờ — để **đối chiếu doanh thu theo ca** | `Workforce*` (5 callable) |
| **DB-14** | **Cấu hình loyalty** ngay trong dashboard + số điểm đã cấp/đã dùng | `LoyaltyUpdateConfig`, `LoyaltyEarnPoints` |
| **DB-15** | **Trạng thái xác nhận thanh toán** (tự động/tay) — biết chuyển khoản nào chưa khớp | `PaymentAutoConfirm` |
| **DB-16** | **Nhóm phản hồi theo chủ đề** và **phân tích tuần** có cấu trúc (thay vì chỉ chat) | `AiGroupFeedback`, `AiRunWeeklyAnalysis` |

### Nhóm C — cần thêm tổng hợp ở máy chủ (đắt hơn, nhưng là thứ đối thủ đều có)

| Mã | Nội dung | Vì sao cần máy chủ | Ghi chú chi phí |
|---|---|---|---|
| **DB-17** | **Doanh thu theo giờ** (giờ cao điểm, giờ chết) | `dailyStats` không có bucket giờ | Toast tách theo "time of day" ([nguồn](https://support.toasttab.com/en/article/Getting-Started-with-Analytics-and-Reports)); mở rộng `dailyStats` hoặc thêm `dailyStats/{day}/hours/{hh}` |
| **DB-18** | **Cơ cấu thanh toán** (tiền mặt vs VietQR) | `payments.method` có, `dailyStats` không tách | Cần cho đối chiếu két và phí |
| **DB-19** | **Cơ cấu kênh**: tại bàn vs mang về; khách tự quét vs nhân viên nhập | `orders.orderType` có, chưa tổng hợp | Chỉ số chiến lược của ScanGo (QR self-order) |
| **DB-20** | **Thời gian chế biến / thời gian chờ** | Có `statusEvents` với timestamp, chưa tổng hợp | "Kitchen pace", "slow tickets" ([Bhookly](https://bhookly.com/product/dashboard)) |
| **DB-21** | **Vòng quay bàn & thời lượng bữa** (và **RevPASH** nếu có giờ mở cửa) | Cần ghép bàn + đơn + thời gian | §2.2: thực hành được dùng nhiều nhất ([MDPI](https://www.mdpi.com/2673-5768/6/1/44)) |
| **DB-22** | **Chi phí khuyến mãi**: tổng `discountVnd`, theo từng chương trình | `orders.promotionSnapshot` có, chưa tổng hợp | Không biết khuyến mãi tốn bao nhiêu là mù |
| **DB-23** | **Khách**: hội viên mới/quay lại, điểm phát/thu, tỷ lệ dùng điểm | `loyaltyMembers`, `loyaltyTransactions` | Có bảng, chưa có tổng hợp theo kỳ |
| **DB-24** | **Hao hụt & chênh lệch kiểm kê theo kỳ** | `stockMovements.reason = waste`, `stockCounts.variance` | §2.5: phải hiện **độ phủ** cùng con số |
| **DB-25** | **Cảnh báo + digest** (in-app/email hằng ngày) | Cần job định kỳ + ngưỡng | Đối thủ đều có ([Qube Dine](https://www.qubedine.com/dashboard-demo), [Menulisa](https://menulisa.com/docs/alerts)) |
| **DB-26** | **Sức khoẻ dữ liệu**: % món có công thức, % món có giá vốn, số nguyên liệu thiếu giá, số ngày đã kiểm kê | Cần đếm trên catalog/recipes/ingredients | **Chặn DB-02/DB-03 khỏi nói dối** (§3.3.1) |
| **DB-40** | **Nhịp đang diễn ra (live pulse)**: đơn đang mở, bàn đang phục vụ, **doanh thu tạm tính từ bàn đang ngồi**, đơn chờ lâu nhất | Cần truy vấn live (`OrderListTableStatus`, `OrderListUnpaid` đã có) | KiotViet và iPOS đều hiện; là thứ quản lý ca cần nhất ([Bhookly](https://bhookly.com/product/dashboard)) |

---

## 5. Để quản lý **cập nhật thông tin dễ hơn**

Đây là nửa thứ hai của yêu cầu, và là nửa khó hơn: dashboard chỉ đúng khi dữ liệu nền đúng, mà dữ
liệu nền do **quản lý** nhập. Nghiên cứu ở §2.4–2.5 nói thẳng: vấn đề không phải thiếu dữ liệu mà là
dữ liệu **không đầy đủ/không chính xác/không truy cập được**.

### 5.1 Vấn đề hiện tại (đã kiểm tra trong mã)

| Vấn đề | Bằng chứng |
|---|---|
| **Không có chỗ nào nói "quán còn thiếu gì"** | Checklist onboarding 6 bước (`shopName, industry, plan, paymentMode, tables, menu`) **chỉ tồn tại trong Simulator** (`src/components/OwnerView.tsx:889`); dashboard thật không hiện. Thiếu hẳn bước **công thức/giá vốn** — bước quyết định độ đúng của lợi nhuận |
| **Không có mục tiêu** | Không có "mục tiêu doanh thu ngày/tuần" ở bất kỳ contract hay màn nào → không thể hiện "đạt 78% mục tiêu" |
| **Không có giờ mở cửa / ngày nghỉ** | `configValuesSchema` chỉ có `locale, timezone, currency, pinPolicy, retention, backup, rateLimit, ai` → không tính được RevPASH, không so sánh "cùng giờ mở cửa" được |
| **Không đổi giá hàng loạt** | `catalogCommandSchema` chỉ có `create, update, archive, restore, setAvailability, setCategoryAvailability, applyTemplate` — không có lệnh đổi giá theo nhóm/% |
| **Không nhập menu từ file** | Không có CSV/Excel import ở đâu trong `src/` (chỉ có chuỗi `csv` trong `SimulatorRole.tsx`) |
| **Ngưỡng cảnh báo gần như cố định** | Chỉ có `ai.revenueDropPercent` và `ai.lowMarginPercent` là tenant tự đặt được; ngưỡng tồn thấp thì **theo từng nguyên liệu** (đúng), nhưng ngưỡng huỷ/chênh lệch két thì không có |
| **Không có "ai vừa đổi gì"** | Audit có (`audit` collection, `AdminListAudit`, ManagementPage) nhưng dashboard không trích ra "thay đổi gần đây" |
| **Chỉ tối ưu desktop** | Không có màn hình nào trong dashboard được thiết kế mobile-first, trong khi Toast/Bhookly đều nói rõ "kiểm tra từ điện thoại" ([Toast](https://pos.toasttab.com/products/reporting), [Bhookly](https://bhookly.com/product/dashboard)) |

### 5.2 Đề xuất

| Mã | Nội dung | Vì sao đúng hướng nghiên cứu |
|---|---|---|
| **DB-27** | **Thẻ "Sẵn sàng dữ liệu" trên dashboard**: mở rộng checklist onboarding với các bước **công thức/giá vốn, giờ mở cửa, mục tiêu, ngưỡng cảnh báo**; mỗi bước là **deep link tới đúng ô cần sửa**, và hiện % hoàn thành | Checklist sẵn có nhưng nằm sai chỗ; đây là cơ chế rẻ nhất để "quản lý cập nhật thông tin cần thiết" |
| **DB-28** | **Sửa nhanh tại chỗ (inline edit)** trên danh sách món: giá, tên, trạng thái — không mở modal | DineOpen nhấn "update any item detail instantly" ([nguồn](https://www.dineopen.com/products/menu/management)) |
| **DB-29** | **Bật/tắt món 1 chạm + cả nhóm** ngay trên dashboard khi hết nguyên liệu | eresto: "mark items unavailable — reflects live on digiMenu" ([nguồn](https://eresto.in/products/eresto-plus)). `setCategoryAvailability` **đã có ở backend**, chưa lên UI |
| **DB-30** | **Đổi giá hàng loạt**: theo nhóm, theo %, theo số tiền, có xem trước | Đối thủ lớn có; giảm mạnh công nhập tay. **Cần REQ mới** vì `catalogCommandSchema` không có |
| **DB-31** | **Nhập menu từ Excel/CSV** có kiểm tra lỗi trước khi ghi | DineOpen: "Got 50 or 500 items? Upload your entire menu from a spreadsheet in one go" ([nguồn](https://www.dineopen.com/products/menu/management)) |
| **DB-32** | **Mục tiêu doanh thu ngày/tuần/tháng** + thanh tiến độ trên dashboard | Chỉ số #1 trong "7 must-track metrics" của [Validator.vn](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026) là *daily revenue vs target* |
| **DB-33** | **Giờ mở cửa & ngày nghỉ** | Cần cho RevPASH (§2.2) và để so sánh công bằng |
| **DB-34** | **Ngưỡng cảnh báo do quản lý tự đặt** (huỷ cao, chênh lệch két, food cost %, tồn thấp mặc định) | §2.5: cảnh báo chỉ hiệu quả khi **ngưỡng được hiệu chỉnh theo từng quán** và **mỗi chỉ số có một người chịu trách nhiệm** |
| **DB-35** | **Nhập giá nhập nguyên liệu nhanh + nhắc lệch >10%** | Cảnh báo lệch giá **đã có** (REQ-INV-011) nhưng chưa lên dashboard; §2.5: 22,7% hoá đơn có dòng lệch giá |
| **DB-36** | **Xuất CSV/PDF và gửi email định kỳ** (daily summary, weekly digest) | Toast gửi email tự động hằng đêm; Qube Dine 6h sáng; Menulisa digest |
| **DB-37** | **Dashboard dùng được trên điện thoại** | Toast, Bhookly, Kayana đều nêu rõ |
| **DB-38** | **"Thay đổi gần đây" trên dashboard** (ai đổi giá/công thức/cấu hình, lúc nào) | Audit đã có; tăng niềm tin và truy vết khi số liệu nhảy |
| **DB-39** | **Gộp nhiều chi nhánh vào một màn** | Trùng **IMP-22** — không làm lại, chỉ liên kết |

---

## 6. Việc **KHÔNG** nên làm

1. **Không sao chép 40+ báo cáo / 9 nhóm của Toast.** Chính tài liệu ngành nói dashboard nhiều chỉ
   số là nguyên nhân thất bại ([Suntek](https://www.sunteksolutions.io/blog/restaurant-performance-dashboard-for-teams)).
   ScanGo nên có **≤8 chỉ số trên màn chính**, phần còn lại nằm sau một lần bấm.
2. **Không thêm payroll/labour cost.** `docs/SRS.md` dòng 38 đặt payroll ngoài phạm vi v1. Vì vậy
   **không hứa "prime cost"**: chỉ hiện **food cost %** và ghi rõ "chưa gồm chi phí lương".
   Hứa prime cost mà thiếu lương là nói dối số liệu.
3. **Không làm báo cáo thuế/VAT.** Hoá đơn điện tử là **IMP-17**, không phải việc dashboard.
4. **Không làm dự báo ML/AI nhu cầu.** §2.3: cần ≥18 tháng lịch sử sạch + dữ liệu khí tượng; chưa
   tenant nào có. Việc đúng là **DB-26 (sức khoẻ dữ liệu)** trước.
5. **Không tính chỉ số ở client.** `firestore.rules` chặn đọc `orders`; mọi chỉ số mới phải qua máy
   chủ. Đừng thiết kế màn hình dựa trên giả định đọc được đơn thô.
6. **Không thêm cảnh báo không có hành động.** §2.5: 4 cảnh báo hoạt động được, 15–40 cảnh báo mỗi
   ca thì bị bỏ qua trong ~2 tuần (`chưa xác minh` — nguồn consultant).
7. **Không hiện số hao hụt/giá vốn mà không kèm độ phủ dữ liệu.** §2.5: số do người khai báo bị đánh
   giá thấp tới 80%.

---

## 7. Thứ tự thực thi đề xuất

| Đợt | Việc | Vì sao trước |
|---|---|---|
| **1 — Niềm tin (làm ngay)** | DB-09 (nút chết) · DB-26 (sức khoẻ dữ liệu) · DB-01 · DB-02 · DB-06 | Số liệu đang có thể **sai mà không báo** (§3.3.1). Sửa niềm tin trước khi thêm chỉ số |
| **2 — Rẻ nhất, giá trị cao nhất (0 backend)** | DB-03 (menu engineering) · DB-04 (bảng theo bàn) · DB-05 · DB-07 (so sánh kỳ) · DB-27 (checklist sẵn sàng dữ liệu) · **gom 9 trang quản trị thành danh mục báo cáo phân nhóm** | Toàn bộ dùng dữ liệu API **đã trả về**; DB-27 là cơ chế để các bước sau có dữ liệu; danh mục phân nhóm là thứ 8/8 đối thủ có (§1.3) |
| **3 — Cho quản lý nhập liệu** | DB-28 · DB-29 · DB-32 · DB-33 · DB-35 · DB-38 | Không có dữ liệu nền thì mọi chỉ số ở đợt 4 đều sai |
| **4 — Chỉ số vận hành (cần máy chủ)** | DB-40 (live pulse) · DB-17 · DB-19 · DB-20 · DB-24 · DB-25 | Đắt hơn; cần đợt 3 xong trước |
| **5 — Mở rộng** | DB-30 · DB-31 · DB-36 · DB-37 · DB-10..DB-16 · DB-21..DB-23 | |

---

## Phụ lục — truy vết nguồn

| Nguồn | Dùng ở |
|---|---|
| [Toast — Getting Started with Analytics and Reports](https://support.toasttab.com/en/article/Getting-Started-with-Analytics-and-Reports) | §1.3, DB-17 |
| [Toast Reporting](https://pos.toasttab.com/products/reporting) | §1.3, §5.1 |
| [Qube Dine dashboard](https://www.qubedine.com/dashboard-demo) | §1.3, DB-05, DB-07, DB-25, DB-36 |
| [Bhookly dashboard](https://bhookly.com/product/dashboard) | §1.3, DB-01, DB-20, DB-37 |
| [Menulisa — Alerts & daily digest](https://menulisa.com/docs/alerts) | §1.3, DB-25, DB-36 |
| [Kayana merchant admin](https://kayanaforbusiness.com/us/products/merchant-admin/) | §1.3, DB-37 |
| [eresto Plus](https://eresto.in/products/eresto-plus) | §1.3, DB-29 |
| [DineOpen menu management](https://www.dineopen.com/products/menu/management) | §1.3, DB-28, DB-31 |
| [Square — summaries and reports](https://squareup.com/help/us/en/article/5072-summaries-and-reports-from-the-online-dashboard), [reporting with Square for Restaurants](https://squareup.com/help/us/en/article/6433-reporting-with-square-for-restaurants) | §1.3, §3.4 |
| [Lightspeed K-Series — Dashboard page](https://k-series-support.lightspeedhq.com/hc/en-us/articles/4403208456603-Understanding-the-Dashboard-page), [Advanced Insights](https://k-series-support.lightspeedhq.com/hc/en-us/articles/18812821372443-About-Advanced-Insights-2-0), [O-Series Insights Live](https://o-series-support.lightspeedhq.com/hc/en-us/articles/31329416356251-Navigating-Insights-Live) | §1.3, §3.4, DB-25, DB-34 |
| [iPOS — bảng tính năng FABi](https://huongdan.ipos.vn/docs/bang-tinh-nang-phan-mem-ipos-vn/tinh-nang-phan-mem-fabi/), [báo cáo doanh thu theo giờ](https://ipos.vn/bao-cao-doanh-thu-theo-gio/), [iPOS Manager](https://ipos.vn/ipos-manager/) | §1.3, §3.4, DB-17, DB-19, DB-20 |
| [CukCuk — tình hình bán hàng](https://helpv2.cukcuk.vn/vi/kb/1050000_tinh_hinh_ban_hang), [tình hình lợi nhuận](https://trienkhai.cukcuk.vn/1050000_tinh_hinh_loi_nhuan.htm) | §1.3, §3.4, DB-03, DB-06, DB-20, DB-23 |
| [Sapo FnB — hệ thống báo cáo](https://help.sapo.vn/tong-quan-he-thong-bao-cao-cua-sapo-fnb), [màn tổng quan](https://help.sapo.vn/gioi-thieu-man-hinh-tong-quan-sapo-fnb) | §1.3, §3.4, DB-07 |
| [KiotViet FnB — hệ thống báo cáo](https://kiotviet.vn/huong-dan-su-dung-kiotviet/fnb-bao-cao/he-thong-bao-cao/), [báo cáo mobile FnB](https://kiotviet.vn/bao-cao-mobile-fnb/) | §1.3, §3.4, DB-40 |
| [POS365 — danh mục báo cáo](https://pos365.vn/docs/bao-cao-2389.html) | §1.3, §3.4, DB-24 |
| [2024 Restaurateur Benchmark Guide (PDF)](https://leveragebuyinggroup.com/wp-content/uploads/2024/10/2024-Restaurateur-Benchmark-Guide-FINAL-10-21.pdf) | §1.2 |
| [Level CFO — restaurant benchmarks](https://levelcfo.com/benchmarks/restaurants/) | §1.2 |
| [ClicData — Restaurant analytics](https://www.clicdata.com/blog/restaurant-analytics/) | §1.1, DB-02 |
| [Suntek — dashboard your team will use](https://www.sunteksolutions.io/blog/restaurant-performance-dashboard-for-teams) | §1.1, §6.1 |
| [NRA 2025 qua Restaurant.org](https://www.restaurant.org/research-and-media/research/restaurant-economic-insights/analysis-commentary/elevated-labor-costs-had-a-significant-impact-on-restaurant-profitability-in-2024/) | §1.2 |
| [Hiệp hội nhà hàng — KPI guide (PDF)](https://restaurantassociation.com/library/Restaurant-KPIs-Every-Owner-Should-Track.pdf/) | §1.2 |
| [Validator.vn — số liệu ngành F&B Việt Nam 2026](https://www.validator.vn/en/knowledge/so-lieu-nganh-fnb-viet-nam-2026) | §1.2 (cảnh báo ngưỡng VN), DB-32 |
| [CostLab 2025 benchmarks](https://costlab.ai/blog/restaurant-industry-benchmarks-2025) | §1.2 (đối chiếu) |
| [Kasavana & Smith 1982 (Google Books)](https://books.google.com/books/about/Menu_Engineering.html?id=iJeCAAAACAAJ) | §2.1 |
| [Menu engineering — cách tính chỉ số phổ biến](https://scispace.com/pdf/menu-engineering-a-model-including-labor-189jd546a9.pdf) | §2.1 |
| [Ví dụ ma trận 24 món (Jakarta)](https://journalcenter.org/index.php/jempper/article/view/7752) | §2.1 |
| [Avocado POS — dữ liệu 244.398 đơn](https://www.avocadopos.com/blog/restaurant-menu-engineering) | §2.1 |
| [Kimes 1999 — Implementing Restaurant Revenue Management (PDF)](https://ecommons.cornell.edu/bitstreams/d878b940-cda9-406c-b444-972ca0f27508/download) | §1.2, §2.2 |
| [Bujalance-López et al. 2025, British Food Journal](https://www.emerald.com/bfj/article/127/6/2169/1263184/Restaurant-revenue-management-a-systematic) | §2.2 |
| [Malheiros et al. 2025, Tourism and Hospitality 6(1):44](https://www.mdpi.com/2673-5768/6/1/44) | §2.2, DB-21 |
| [Kim 2025 — AI menu demand prediction](https://pmc.ncbi.nlm.nih.gov/articles/PMC12528577/) | §2.3, §6.4 |
| [Chae, Sheu & Park 2024, Decision Support Systems](https://doi.org/10.1016/j.dss.2024.114291) | §2.3 |
| [Roy, Spiliotopoulou & de Vries 2022, POM](https://www.iima.ac.in/publication/restaurant-analytics-emerging-practice-and-research-opportunities) | §2.4 |
| [Alfariz, Malik & Lokman 2024 — BI end-user challenges](https://ideas.repec.org/a/bcp/journl/v8y2024i11p304-315.html) | §2.5 |
| [Real-time BI dashboard cho xếp ca (luận văn 2024)](https://run.unl.pt/bitstreams/eb48cb6e-194b-472d-b021-5da044a776b6/download) | §2.5 |
| [NRA State of the Industry qua NRN](https://www.nrn.com/restaurant-insights/state-of-the-industry-how-much-does-technology-really-improve-restaurant-operations-) | §2.5 |
| [Deloitte 2025 — AI trong nhà hàng](https://www.deloitte.com/us/en/about/press-room/deloitte-how-ai-is-revolutionizing-restaurants.html) | §2.5 |
| [Leverenz et al. 2025 — sai lệch số hao hụt do nhân viên khai báo (PDF)](https://pub.epsilon.slu.se/38907/1/leverenz-d-et-al-20251120.pdf) | §2.5, §6.7 |
| [QSR Magazine — 93 triệu điểm dữ liệu (vendor)](https://www.qsrmagazine.com/story/what-93-million-data-points-say-about-where-restaurants-actually-lose-money/) | §2.5, DB-35 |
| [arXiv 2506.05357 — inventory record inaccuracy](https://arxiv.org/pdf/2506.05357) | §2.5 |
| [hospitalidad.ai — dashboard adoption (consultant, `chưa xác minh`)](https://hospitalidad.ai/EN/real-time-dashboards-in-restaurants-myth-vs-reality.html) | §2.3, §2.5, §6.6 |
| Mã nguồn ScanGo: `src/pages/dashboard/OverviewPage.tsx`, `shared/contracts/reporting.contract.ts`, `shared/contracts/config.contract.ts`, `shared/contracts/catalog.contract.ts`, `shared/contracts/onboarding.contract.ts`, `functions/src/modules/ordering/service.ts`, `functions/src/modules/reporting/service.ts`, `firestore.rules` | §3, §5.1 |
