# Kế hoạch mở rộng phân khúc 5–50 bàn

**Nguồn:** SRS 1.4, ADR 0022, ADR 0023, ADR 0020, `PRODUCT_OBJECTIVES.md`.
**Phạm vi:** P1. P0 không đổi.
**Điều kiện vào:** M1 đã đạt P0 acceptance. Không bắt đầu ticket nào khi M1 còn thiếu bằng chứng.

**Vì sao cần:** SRS 1.3 ghi phân khúc 5–15 bàn, và giả định đó nằm rải trong các hằng số giới hạn đọc. Ở 15–50 bàn, các giới hạn đó không gây lỗi mà gây **sai âm thầm**: bàn đang có khách hiện "trống", hàng đợi bếp bỏ ticket chờ lâu nhất, menu thiếu món. Ticket S-01 và S-02 sửa đúng gốc đó.

**Thứ tự:** S-01 → S-02 → S-03 → S-04 → S-05 → S-06 → S-07 → S-08. S-09 để sau. G2-06 (bỏ TypeSafe Jev) độc lập với tất cả và có thể làm trước S-01.

---

### S-01 — Trạng thái bàn là projection trên document bàn
- **REQ/NFR:** REQ-TBL-008, REQ-TBL-003 (cơ chế), NFR-RT-001. **ADR 0023.**
- **Mục tiêu:** Mỗi bàn mang `activeOrderCount`, `readyOrderCount`, `unsettledOrderCount`, `oldestActiveOrderAt`, do transaction của Ordering/Payment ghi. Sàn bàn đọc từ store slice `tables` đã có sẵn, không đọc Order, không poll.
- **Khu vực:** `shared/contracts/table.contract.ts` (thêm 4 field + reader tolerant cho row cũ); `shared/contracts/tableStatus.contract.ts` (`TableServiceFacts` đã đúng hình); Ordering transaction (tạo/gửi đơn, bắt đầu nấu, xong món, huỷ); Payment transaction (settle, reverse, refund); `src/pages/dashboard/tables/useTableServiceStatus.ts` (xoá); `src/data/adapters/table.adapter.ts` (`listTableServiceStatus` xoá); `functions/src/modules/ordering/index.ts` (`callableOrderListTableStatus` xoá); mapper phía client.
- **Kiểm tra chấp nhận:** Given số Order mở nhiều hơn mọi giới hạn đọc, when sàn bàn render, then mỗi bàn đúng trạng thái và đúng số của chính nó; given một Order đi `pending → ready → served → paid`, then chỉ bàn đó đổi; given counter lệch khỏi Order, then một lệnh repair tính lại idempotent.
- **Tests:** unit cho 4 counter qua từng transition kể cả cancel/reverse/refund; concurrency test hai Order cùng bàn trong một transaction; test row cũ thiếu field đọc ra 0/null chứ không lỗi.
- **Bằng chứng:** unit + Functions Emulator pass; không còn `callableOrderListTableStatus` và không còn poll 10 giây; số lượt đọc của sàn bàn bằng 0 ngoài listener `tables` sẵn có.

### S-02 — Hàng đợi bị chặn thì giữ ticket cũ nhất
- **REQ/NFR:** REQ-ORD-006. **ADR 0023.**
- **Mục tiêu:** `callableOrderListKitchen` và hàng đợi `ready` của Waiter truy vấn `(status ASC, createdAt ASC)`, giữ ticket chờ lâu nhất; nếu vẫn vượt trần thì màn hình nói đang hiện trang cũ nhất.
- **Khu vực:** `functions/src/modules/ordering/index.ts`; `functions/src/modules/fulfilment/index.ts` (`WAITER_READY_QUEUE_LIMIT`); `firestore.indexes.json` (index `(status ASC, createdAt ASC)`); Kitchen board và Waiter dialog.
- **Kiểm tra chấp nhận:** Given nhiều ticket hơn trần, then hàng đợi trả ticket cũ nhất và bỏ ticket mới nhất; given bị chặn, then màn hình ghi rõ.
- **Tests:** unit cho thứ tự khi vượt trần; Emulator đẩy nhiều hơn trần ticket và assert ticket cũ nhất còn; hai comment `shortcut:` hiện có được xoá cùng lúc.
- **Bằng chứng:** index đã deploy; Kitchens queue evidence; Waiter ready queue evidence.

### S-03 — Thực thi `maxTables` và `maxOrdersPerDay` ở server
- **REQ/NFR:** REQ-SUB-002, NFR-SEC-001. **ADR 0022 (scope note).**
- **Mục tiêu:** `callableTableCreate` từ chối khi tenant đã đủ số bàn của gói. Đường tạo Order từ chối khi tenant-local day đã đủ số đơn. Pro không giới hạn cả hai.
- **Cảnh báo thiết kế:** **không đọc `dailyStats` để đếm đơn.** `dailyStats` là projection rebuild được (ADR 0005) và tụt hậu so với Order, nên đếm từ nó vừa sai vừa không atomic. Cần một counter sống, tăng trong **cùng transaction** với Order create (ví dụ `tenants/{t}/orderQuota/{yyyymmdd}`), giống hình dạng sổ ngân sách AI đang dùng.
- **Khu vực:** `functions/src/modules/subscription/service.ts` (`assertFeatureEntitlement` đã có; thêm hàm assert theo `maxTables`/`maxOrdersPerDay`); `functions/src/modules/table-access/index.ts`; `functions/src/modules/ordering/index.ts` (cả đường khách tự đặt và nhân viên nhập); `firestore.rules` cho collection counter; `src/pages/dashboard/SubscriptionPage.tsx` (hiện chỉ hiển thị).
- **Kiểm tra chấp nhận:** Given tenant đạt trần bàn, when tạo thêm một bàn, then server từ chối và số bàn đã lưu không đổi; given tenant đạt trần đơn trong ngày tenant-local, when gửi thêm một đơn, then server từ chối và không tạo gì; given đổi gói, then lệnh kế tiếp dùng trần mới không cần deploy lại; given gói Pro, then không chặn.
- **Tests:** unit cho hàm assert theo từng gói và `null` = không giới hạn; Emulator: Free tạo bàn thứ 4 bị từ chối, Lite tạo bàn thứ 11 bị từ chối, Pro vượt 50 vẫn được; Emulator: vượt `maxOrdersPerDay` bị từ chối và counter chỉ tăng khi đơn được tạo; race test hai đơn cùng lúc ở đúng trần.
- **Bằng chứng:** unit, Rules, Functions Emulator pass; traceability REQ-SUB-002 chuyển Done.

### S-04 — Tài khoản ngân hàng của quán, và xoá PayOS
- **REQ/NFR:** REQ-PAY-005, REQ-PAY-006, REQ-PAY-003/004 (withdrawn), NFR-SEC-001. **ADR 0022.**
- **Mục tiêu:** Owner **chọn ngân hàng từ danh sách** (không gõ BIN), nhập số tài khoản, **quét thử QR bằng app ngân hàng của chính mình để xác nhận**, rồi lưu; server ghi vào map `tenants/{t}.vietQr` bằng một lệnh Owner-only có audit. Cashier dùng đúng tài khoản đó để dựng QR VietQR. Đồng thời xoá đường PayOS.
- **Vì sao chọn từ danh sách:** chỉ `bankBin` và `accountNo` quyết định tiền đi đâu. `accountName` **chỉ là chữ trên ảnh** — tài liệu VietQR ghi rõ trường này "không nằm trong tiêu chuẩn tạo mã VietQR", nên nó không định tuyến tiền và không được dùng làm căn cứ xác minh. Gõ tay BIN 6 số là lỗi thật; chọn từ danh sách thì hết.
- **Vì sao quét thử:** API tra cứu số tài khoản của VietQR **đã dừng cung cấp** và đang chuyển sang bankHub Pay Out; bản thay thế cần đăng ký tích hợp. Quét QR bằng app ngân hàng là chính ngân hàng tra tên chủ tài khoản — miễn phí, và là bước xác nhận thật duy nhất trước khi lưu.
- **Danh sách ngân hàng:** lấy từ `GET https://api.vietqr.io/v2/banks` (miễn phí, không cần auth; trả `bin`, `code`, `shortName`, `name`, `logo`, `transferSupported`, `lookupSupported`) nhưng **check-in vào repo** thành một file dữ liệu, không gọi lúc chạy: màn cài đặt không được hỏng vì bên thứ ba không tới được, và không cần cache. Có script làm mới theo đúng khuôn `functions/src/scripts/market-prices/` đã có. Owner vẫn nhập được tên viết tắt (`VCB`) làm đường dự phòng vì VietQR chấp nhận BANK_ID là BIN, tên thường gọi, hoặc mã NAPAS.
- **Lưu ở đâu:** giữ nguyên map `tenants/{t}.vietQr` trên document tenant — **không** đưa vào hệ thống config nhiều tầng. Lý do: `platform/config` do ADMIN ghi được, nên tài khoản nhận tiền ở tầng đó là quyền đổi điểm đến tiền của quán. Không thêm khoá config ⇒ không đụng `configValuesSchema`, `tenantOverridableConfigKeySchema`, `platformConfigOverrideInputSchema`, `TENANT_VISIBLE_VALUE_KEYS`, và **không phải migrate** vì `buildVietQrInstruction` đã đọc map này.
- **Uỷ quyền:** callable mới dùng `assertActiveOwnerMember` ([config/service.ts:243](functions/src/modules/config/service.ts#L243)) và **không** truyền cờ `isAdmin`. Helper này yêu cầu membership đang hoạt động với `membershipType === 'owner'`, nên cấm ADMIN là miễn phí. **Không** thêm bypass ADMIN cho đường ghi này — khác với `callableReportingRebuildDailyStats`, `callableSubscriptionGet`, `callableConfigGetResolved` là những đường đọc có bypass.
- **Khu vực thêm:** `shared/contracts/payment.contract.ts` (input schema cho lệnh set merchant, tái dùng `vietQrMerchantConfigSchema`; `template` đổi thành enum 5 theme `compact|compact2|qr_only|print|loax`; siết `accountNo` từ `.max(32)` xuống `.max(19)` cho khớp chuẩn VietQR, và `addInfo` phải giữ ≤50 ký tự không ký tự đặc biệt — `SCANGO {orderId}` với auto-id chữ-số đã thoả); `functions/src/modules/payment/index.ts` (callable mới, từ chối BIN ngoài danh sách, ghi audit như `callableConfigUpdateTenant`); file dữ liệu danh sách ngân hàng + script làm mới; `src/pages/dashboard/SettingsPage.tsx` (khối tài khoản nhận tiền **trong màn Cài đặt sẵn có**, chỉ hiện với Owner, có ô chọn ngân hàng và **ảnh QR xem trước để quét thử**); `src/components/CashierView.tsx` (cảnh báo khi quán chưa nhập tài khoản).
- **Ghi chú để không ai "sửa" nhầm:** thêm một dòng vào `docs/module/config.md` nói rõ tài khoản nhận tiền cố ý **không** phải khoá config, kèm lý do, để lần sau không ai đưa nó vào cho "đồng bộ".
- **Khu vực xoá:** `functions/src/modules/payment/payos.ts` và `payos.test.ts`; `callablePaymentCreatePayosLink`; `payosWebhookV1`; block Rules và collection `payosPaymentLinks`; `platform/payosCounter`; index collection-group trên `payosPaymentLinks.orderCode`; ba secret `PAYOS_*` trong `functions/src/shared/secrets.ts`; `'payos'` khỏi `paymentMethodSchema`; `qrcode.react` khỏi `package.json`; panel PayOS trong `CashierView.tsx`; document `payosPaymentLinks` còn sót của tenant `first-g43h5hgnc4RJ0FJrYHxmd3g7qXl1`.
- **Khu vực test/harness phải sửa cùng:** `functions/test/payment/payos.emulator.test.ts` (xoá); `docs/feedback/harness/verify-cashier-invoices.mjs` (xoá `SCANGO_CLICK_PAYOS` và hai phép kiểm nút "Tạo mã PayOS", nếu không harness hỏng ngay sau khi gỡ nút); `docs/feedback/artifacts/cashier-invoice-verification-report.json` (bản ghi cũ, giữ nguyên).
- **Ghi chú tài liệu:** ADR 0019 mô tả tab hoá đơn của Waiter có "settle, cancel, and PayOS controls". Sau S-04 câu đó sai. ADR là bản ghi lịch sử nên **không sửa**; ADR 0022 là bản ghi thay đổi.
- **Kiểm tra chấp nhận:** Given Owner chọn ngân hàng từ danh sách và nhập số tài khoản, then màn hình dựng QR thật của đúng cặp đó để quét thử trước khi lưu; given Owner lưu, then giá trị nằm trên Tenant và QR của đơn chưa trả dùng đúng chúng; given BIN không có trong danh sách hoặc `template` ngoài enum, then server từ chối; given caller không phải Owner đang hoạt động, then từ chối — **kể cả ADMIN**, vì đường ghi này không có bypass `isAdmin`; given quán chưa nhập tài khoản, then Cashier được báo chứ không thấy QR của tài khoản lạ, và **không tầng nào khác hay hành động ADMIN nào cấp được tài khoản đó**; given mọi tenant, then không Payment nào chảy vào tài khoản không thuộc tenant.
- **Tests:** unit cho schema input, cho enum `template`, và cho lệnh từ chối BIN lạ; **unit/Emulator khẳng định ADMIN bị từ chối ghi `vietQr`** (dựng một caller có `token.admin === true` nhưng không có membership owner, và khẳng định `permission-denied`); unit cho việc `accountName` không chặn lưu khi thiếu; Rules test cho việc ghi `vietQr` vẫn server-only; Emulator: Owner lưu tài khoản rồi Cashier lấy instruction và settle, replay không tạo Payment thứ hai; xoá `functions/test/payment/payos.emulator.test.ts`; `grep -ri payos` phải rỗng ngoài docs lịch sử.
- **Bằng chứng:** unit, Rules, Emulator pass; ảnh chụp màn hình khối tài khoản nhận tiền theo `AGENTS.md` (Playwright) cho thấy ô chọn ngân hàng và QR xem trước; `npm run deploy:indexes` sau khi xoá index; xác nhận production không còn `method: 'payos'` (đã kiểm 2026-10-15: 0/238) và document sót đã xoá.

### S-05 — Menu không được cắt âm thầm
- **REQ/NFR:** REQ-CAT-004, NFR-DATA-002.
- **Mục tiêu:** Menu của quán 50 bàn hiện đủ, hoặc nói rõ đang hiện một trang. Trần đọc đi theo gói.
- **Khu vực:** `src/data/adapters/catalog.adapter.ts` (`PRIVATE_MENU_LISTENER_LIMIT`, `PUBLIC_MENU_LISTENER_LIMIT`); `functions/src/modules/catalog/performance.ts` (`PUBLIC_MENU_LOAD_LIMIT`); projection public menu; màn Menu của Owner; menu của khách.
- **Kiểm tra chấp nhận:** Given tenant nhiều món hơn trần, when Owner mở menu hoặc khách mở menu bàn, then mọi món đang bán đều tới được, hoặc màn hình ghi rõ còn bao nhiêu và có trang kế; given bị chặn, then không con số doanh thu/biên lợi nào được tính từ tập thiếu mà trình bày như đủ.
- **Tests:** unit cho phân trang và cho cờ "còn nữa"; Emulator/Rules giữ nguyên ranh giới public projection.
- **Bằng chứng:** harness menu ở ngưỡng >100 món; `NFR-PERF-001` p95 hai giây vẫn đạt.

### S-06 — Nguyên liệu và công thức không được cắt âm thầm
- **REQ/NFR:** REQ-INV-013, NFR-DATA-002.
- **Mục tiêu:** Sổ nguyên liệu/công thức của quán lớn hiện đủ, hoặc nói rõ đang hiện một trang.
- **Khu vực:** `src/data/adapters/inventory.adapter.ts` (`INGREDIENT_LISTENER_LIMIT`, `RECIPE_LISTENER_LIMIT`); `src/components/InventoryPanel.tsx` (đã tự phân trang phía client — kiểm lại là nó phân trang trên tập đã bị cắt); `functions/src/modules/inventory/index.ts` (`RECIPE_QUERY_IN_LIMIT = 30` là chunk của Firestore `in`, phải giữ chunking khi số món tăng).
- **Kiểm tra chấp nhận:** Given nhiều nguyên liệu/công thức hơn trần, then mọi bản ghi tới được hoặc màn hình ghi rõ trần; given tập bị cắt, then không con số giá vốn/tồn/sắp hết nào tính từ tập thiếu mà trình bày như đủ.
- **Tests:** unit cho chunking `in` khi vượt 30; unit cho cờ bị cắt.
- **Bằng chứng:** Emulator với >100 nguyên liệu; cảnh báo `lowStock` không bỏ sót.

### S-07 — Báo cáo theo ngày không được cắt âm thầm
- **REQ/NFR:** REQ-RPT-005, NFR-DATA-002.
- **Mục tiêu:** Breakdown theo món và theo bàn của một ngày đông khách không rơi dòng, và tổng của ngày vẫn khớp doanh thu ngày đó.
- **Khu vực:** `src/data/firestoreRead.ts` (`MAX_ITEMS_PER_DAY`, `MAX_TABLES_PER_DAY`); `functions/src/modules/reporting/service.ts`; màn báo cáo.
- **Kiểm tra chấp nhận:** Given ngày tenant-local nhiều dòng món hơn trần, when Owner mở ngày đó, then mọi dòng tới được hoặc màn hình ghi rõ trần; given bị cắt, then tổng theo món/bàn được ghi là một phần chứ không trình bày như cả ngày.
- **Tests:** unit cho cờ bị cắt; unit tổng ngày khớp doanh thu khi breakdown đầy đủ.
- **Bằng chứng:** rebuild trên ngày >100 dòng món; `computeWarnings` không bỏ sót món lỗ.

### S-08 — Context AI không được cắt âm thầm
- **REQ/NFR:** REQ-AI-010, REQ-AI-009, NFR-DATA-002.
- **Mục tiêu:** Câu trả lời và cảnh báo của trợ lý phải nói khi context bị chặn, và **không** được khẳng định một kết luận về toàn quán từ một tập đã cắt.
- **Hiện trạng (kiểm 2026-10-15):** `MAX_AI_MENU_ITEMS = 200`, `MAX_AI_INGREDIENTS = 200`, `MAX_AI_FEEDBACK_TOPICS = 50` gọi `.limit()` **không `orderBy`** — 200 doc giữ lại là một lát cắt bất kỳ theo document id, không phải "200 cái quan trọng nhất". `MAX_AI_ITEM_STATS = 100` chặn mẫu món bán ra mà cảnh báo `lowProfit` quét, nên ngày bán hơn 100 món thì món lỗ thứ 101 không bao giờ được soi. Quán 15–50 bàn vượt các ngưỡng này là chuyện thường.
- **Vì sao nặng hơn cắt trên màn hình:** màn hình cắt thì người dùng thấy một danh sách và có thể nhận ra thiếu. Trợ lý thì **khẳng định kết luận kèm số độ tin cậy và kỳ** từ tập đã cắt — đúng chỗ NFR-DATA-002 cấm.
- **Khu vực:** `functions/src/modules/ai/service.ts` (các `read*` + `computeWarnings` + `assembleSafeContext`); `functions/src/modules/ai/index.ts` (kết quả trả về); `shared/contracts/ai.contract.ts` (thêm trường mô tả context bị chặn); `src/components/AiChatWidget.tsx` (hiển thị ghi chú đó).
- **Hướng làm (chọn cái nhỏ nhất đủ đúng):** thêm `orderBy` có ý nghĩa cho từng read (ví dụ menu theo `updatedAt desc` hoặc theo món bán chạy) **và** trả về số doc đã đọc trên tổng, để `buildAiResult` mang một ghi chú "đã xét N món, còn M món chưa xét". Không cần bỏ trần: trần là cần thiết cho chi phí prompt, chỉ cần **nói ra**.
- **Kiểm tra chấp nhận:** Given quán nhiều món/nguyên liệu/món bán ra hơn trần, when trợ lý trả lời hoặc tính cảnh báo, then kết quả ghi rõ tập nào bị chặn và đã xét bao nhiêu; given context bị chặn, then không cảnh báo nào tự nhận đã xét mọi món và không con số nào được trình bày như tổng của quán; given context trong trần, then không hiện ghi chú đó.
- **Tests:** unit cho từng `read*` trả đúng số lượng và cờ bị chặn; unit cho `computeWarnings` khi mẫu món bị chặn (không được khẳng định "không có món lỗ"); unit cho `buildAiResult` mang ghi chú; contract test cho trường mới.
- **Bằng chứng:** unit pass; một lần chạy thật trên tenant có >200 món cho thấy ghi chú xuất hiện trong câu trả lời.

### S-09 — Sàn bàn nhiều khu (để sau)
- **REQ/NFR:** REQ-TBL-002, REQ-UX-003, REQ-TBL-008.
- **Mục tiêu:** Quán 2–3 tầng có nhiều mặt sàn thay vì một lưới 12×10 dùng chung, và bảng vận hành lọc được theo khu.
- **Hiện trạng:** `TABLE_FLOOR_COLUMNS = 12` × `TABLE_FLOOR_ROWS = 10` = 120 ô dùng chung; `TablesPage` đã lọc theo khu, `OperationTableBoard` thì chưa. 50 bàn vẫn vừa 120 ô, nên đây là việc dễ dùng hơn chứ không phải việc gãy.
- **Chưa làm vì:** không cần cho mục tiêu 5–50 bàn, và đụng contract vị trí bàn (`position`) cùng harness sàn bàn. Cần amendment riêng khi có quán nhiều tầng thật.

---

## Ngoài phạm vi kế hoạch này
- **Xác minh số tài khoản bằng API.** Không làm. Chỉ `bankBin` và `accountNo` định tuyến tiền; `bankBin` được chọn từ danh sách còn `accountNo` được Owner quét thử QR bằng app ngân hàng để xác nhận. API tra cứu của VietQR đã dừng cung cấp và bản thay thế (bankHub Pay Out) cần đăng ký tích hợp — không đáng cho một bước kiểm tra lúc lưu. Ghi là `shortcut:` trong ADR 0022 và `docs/module/payment.md`; thêm khi có tích hợp bankHub được hỗ trợ.
- **Tự động xác nhận thanh toán.** REQ-PAY-002 giữ seam adapter nhưng không provider nào hiện thực. Cần ADR riêng.
- **`MAX_REBUILD_RECORDS = 5000`.** Không phải vấn đề ở phân khúc này: job đêm chỉ rebuild 2 ngày, tương đương ~2500 đơn/ngày, cao hơn quán 50 bàn. Khi vượt thì rebuild **báo lỗi rõ** kèm `truncated: true` để retry hẹp hơn, chứ không cắt âm thầm — nên không cần sửa.
- **G2-06 (bỏ TypeSafe Jev).** Độc lập, xem `docs/plan/insight-growth-plan.md`.
