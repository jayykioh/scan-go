# Kế hoạch M2/M3 — Insight, Feedback, Workforce, Inventory count

> **Cập nhật 2026-10-15:** tầng model đã bị bỏ (ADR 0024). **G2-01** (adapter provider, `aiUsage`, budget) và **G2-06** (đánh giá TypeSafe Jev) **rút lại**; phần xoá code của chúng nằm ở [`docs/plan/remove-model-tier.md`](remove-model-tier.md) A-02 và A-04. **G2-02** (phân tích tuần), **G2-05** (gom chủ đề phản hồi) và mọi ticket M3 giữ nguyên, vì chúng vốn đã tất định. **G2-03** (hỏi đáp Owner) rút lại theo REQ-AI-003.

**Nguồn:** SRS 1.5, ADR 0024, ADR 0009, `PRODUCT_OBJECTIVES.md`.
**Phạm vi:** P1 và P2 mới. P0 không đổi. Đặt trước do khách tự yêu cầu/gọi món trước vẫn hoãn; đặt bàn do nhân viên nhập được duyệt riêng tại REQ-TBL-005..007.
**Điều kiện vào:** M1 đã đạt P0 acceptance. Không bắt đầu ticket nào khi M1 còn thiếu bằng chứng.

## Nguyên tắc

- Mọi thay đổi business state đi qua Cloud Functions và một command xác định.
- Phân tích chỉ đọc dữ liệu được phép, dẫn nguồn, nêu dữ liệu thiếu, và không tự đổi tiền, giá, quyền hay tồn kho. Không có model nào tham gia (ADR 0024).
- Mỗi ticket giữ tenant isolation, UTC, integer VND và REQ traceability.
- Ưu tiên dữ liệu đáng tin trước khi thêm phân tích. Không kết luận hao hụt chỉ từ lượng bán.

## Đồ thị phụ thuộc

```text
G2-01 AI provider adapter + usage/budget
  ├─> G2-02 Weekly analysis ─┐
  ├─> G2-03 Open Q&A ────────┤
  └─> G2-05 AI feedback group┘
G2-04 Feedback submit ─> G2-05 ─> G3-01 Feedback tickets
G3-02 Shift schedule ─> G3-03 Clock in/out + correction
G3-04 Stock count/waste/adjustment ─> G3-05 Loss variance review
G2-01 ─> G2-06 Remove TypeSafe Jev (Gemini only)
```

## M2 / P1 tickets

### G2-01 — AI provider adapter, usage, và budget
- **REQ/NFR:** REQ-AI-004, REQ-AI-005, NFR-AI-002, CON-005.
- **Mục tiêu:** Một adapter thay thế được; mỗi lượt AI ghi provider, model, token và cost; Config áp budget theo tenant.
- **Module sở hữu:** AI sở hữu adapter và `aiUsage`. Config sở hữu budget.
- **Khu vực:** `functions/src/ai/`; AI provider interface; Gemini implementation; `aiUsage`; Config keys; Rules/Emulator fixtures; `docs/module/ai.md`.
- **Phụ thuộc:** M1 xong. Chặn G2-02, G2-03, G2-05, G2-06.
- **Kiểm tra chấp nhận:** Given đổi provider trong Config, when analysis chạy, then không module nào đổi và mỗi call ghi provider, model, cost. Given tenant đạt budget, when call mới bắt đầu, then server dừng hoặc giảm cấp và ghi audit.
- **Tests:** provider contract test với test double; budget enforcement Emulator test; no-secret log test.
- **Bằng chứng:** `aiUsage` fixture; audit event; traceability cập nhật.

### G2-02 — Phân tích tuần theo lịch
- **REQ/NFR:** REQ-AI-002, NFR-AI-001, NFR-RT-001.
- **Mục tiêu:** Mỗi tuần một lần, theo múi giờ tenant, tạo danh sách Insight ngắn có bộ phận, mức ưu tiên, kỳ, nguồn, độ chắc chắn và dữ liệu thiếu.
- **Module sở hữu:** AI sở hữu `aiInsights`. Reporting cung cấp số liệu tổng hợp.
- **Khu vực:** scheduled Function; Reporting reads; `aiInsights`; Owner UI danh sách và trạng thái đã xử lý; Rules/Emulator fixtures.
- **Phụ thuộc:** G2-01. Cần Reporting P1 đã có.
- **Kiểm tra chấp nhận:** Given một tuần hoàn tất, when schedule chạy, then tenant nhận danh sách có giới hạn kèm nguồn và ghi chú dữ liệu thiếu. Given nguồn thiếu, when chạy, then mỗi claim có nguồn hoặc nhãn giả thuyết.
- **Tests:** schedule idempotency test; grounding/citation test; missing-data test; timezone test.
- **Bằng chứng:** `aiInsights` fixture; grounding report; traceability cập nhật.

### G2-03 — Hỏi đáp mở theo quyền
- **REQ/NFR:** REQ-AI-003, NFR-AI-001, NFR-PRIV-002, NFR-SEC-003.
- **Mục tiêu:** Owner hỏi bằng ngôn ngữ tự nhiên trong phạm vi dữ liệu được phép; câu trả lời nêu thời điểm cập nhật và nguồn.
- **Module sở hữu:** AI. Các module khác chỉ trả lời query được ủy quyền.
- **Khu vực:** AI query callable; permission filter; masking cho dữ liệu cá nhân; Owner UI; Emulator tests.
- **Phụ thuộc:** G2-01.
- **Kiểm tra chấp nhận:** Given câu hỏi hợp lệ có dữ liệu, when trả lời, then có nguồn và kỳ. Given thiếu dữ liệu, when trả lời, then nêu rõ khoảng trống và không bịa giá trị. Given ngoài quyền, when hỏi, then server từ chối.
- **Tests:** permission matrix Emulator test; masking test; no-invented-value test.
- **Bằng chứng:** Q&A fixture; permission report; traceability cập nhật.

### G2-04 — Customer feedback submit và xác minh
- **REQ/NFR:** REQ-FDB-001, NFR-SEC-001, NFR-PRIV-002.
- **Mục tiêu:** Customer gửi đánh giá hoặc phản hồi; liên kết Order khi xác minh được.
- **Module sở hữu:** Feedback sở hữu `feedback`.
- **Khu vực:** Customer route feedback; Feedback callable; `feedback`; Rules/indexes; `docs/module/feedback.md`.
- **Phụ thuộc:** M1 Ordering và tracking token.
- **Kiểm tra chấp nhận:** Given gửi phản hồi, when lưu, then tenant-scoped và chỉ `verified` khi có Order tham chiếu hợp lệ.
- **Tests:** verification test; cross-tenant deny test; PII minimization test.
- **Bằng chứng:** verified và unverified fixtures; traceability cập nhật.

### G2-05 — AI gom chủ đề phản hồi
- **REQ/NFR:** REQ-FDB-002, NFR-AI-001, NFR-PRIV-002.
- **Mục tiêu:** Gom chủ đề lặp lại, mỗi chủ đề dẫn nguồn phản hồi gốc, loại bỏ thông tin cá nhân không cần thiết.
- **Module sở hữu:** Feedback sở hữu dữ liệu; AI sở hữu phân tích.
- **Khu vực:** AI analysis callable; feedback read; masking; Owner UI; Emulator fixtures.
- **Phụ thuộc:** G2-01, G2-04.
- **Kiểm tra chấp nhận:** Given tập phản hồi, when gom, then mỗi chủ đề có feedback ID nguồn và không chứa PII không cần thiết.
- **Tests:** source-reference test; masking test; adversarial-input test.
- **Bằng chứng:** grouped fixture; traceability cập nhật.

### G2-06 — Bỏ TypeSafe Jev, chỉ dùng Gemini
- **REQ/NFR:** ADR 0020, REQ-AI-004, NFR-AI-002.
- **Mục tiêu:** Gemini là provider model duy nhất. Xoá adapter Jev, feature flag `TYPESAFE_JEV_ENABLED`, secret slot `TYPESAFE_API_KEY`, response schema và cost model. Giữ adapter tất định `rule-based` làm fallback khi không có secret.
- **Module sở hữu:** AI.
- **Khu vực:** `shared/contracts/config.contract.ts` (`aiProviderSchema`); `functions/src/modules/ai/service.ts`; `evaluation.ts`; `evaluation.cli.ts`; fixtures `shared/fixtures/ai.fixture.ts`; tests; docs.
- **Phụ thuộc:** G2-01.
- **Kiểm tra chấp nhận:** Given `ai.provider`, when ghi một giá trị, then chỉ `gemini` và `rule-based` hợp lệ và `jev` bị từ chối; given không có secret, then provider tất định được chọn; given chạy `npm --workspace functions run ai:evaluate`, then báo cáo so Gemini với mốc tất định và không đổi provider đã chọn.
- **Tests:** provider schema test; resolve fallback test; `aiUsage` cost accounting test; evaluation report test.
- **Bằng chứng:** không còn tham chiếu `jev` trong `shared/`, `functions/`, `src/`; typecheck, lint, unit và Emulator pass.
- **Trạng thái:** chưa triển khai — SRS traceability `REQ-AI-004` = PARTIAL.

## M3 / P2 tickets

### G3-01 — Feedback ticket workflow
- **REQ:** REQ-FDB-003. **Sở hữu:** Feedback.
- **Kiểm tra chấp nhận:** Given đổi trạng thái ticket, when lưu, then state, actor, time và reason được ghi.
- **Bằng chứng:** ticket history fixture.

### G3-02 — Lịch ca
- **REQ:** REQ-HRM-001. **Sở hữu:** Workforce.
- **Kiểm tra chấp nhận:** Given hai Shift trùng cho một Staff, when lưu, then server từ chối.
- **Bằng chứng:** overlap reject test.

### G3-03 — Chấm công và sửa công
- **REQ:** REQ-HRM-002, REQ-HRM-003. **Sở hữu:** Workforce.
- **Kiểm tra chấp nhận:** Given giờ sai, when Staff đề nghị sửa, then giữ pending cho tới khi người có quyền duyệt và còn lịch sử. Given dữ liệu ca, when báo cáo chạy, then không tạo số lương.
- **Bằng chứng:** correction approval fixture; no-payroll test.

### G3-04 — Kiểm kê, hủy và điều chỉnh
- **REQ:** REQ-INV-003. **Sở hữu:** Inventory.
- **Kiểm tra chấp nhận:** Given Stock count, when lưu, then hệ thống tính lượng dự kiến từ stock-in, deduction và restoration, và lưu variance kèm audit.
- **Bằng chứng:** variance fixture.

### G3-05 — Rà soát hao hụt
- **REQ:** REQ-INV-004, NFR-AI-001. **Sở hữu:** Inventory và AI.
- **Kiểm tra chấp nhận:** Given kiểm kê đầy đủ, when rà soát, then mỗi phát hiện dẫn count, movement và kỳ; given thiếu kiểm kê, then nêu giới hạn.
- **Bằng chứng:** loss finding fixture.

### G3-06 — Gợi ý chiến dịch Promotion/Loyalty
- **REQ:** REQ-PRO-001, REQ-LOY-001, NFR-SEC-003. **Sở hữu:** Promotion và Loyalty.
- **Kiểm tra chấp nhận:** Given mục tiêu chiến dịch, when AI gợi ý, then Owner duyệt trước khi áp dụng và hệ thống đo tỷ lệ quay lại, giá trị đơn và lãi gộp sau ưu đãi.
- **Bằng chứng:** campaign fixture; measurement report.

## Quy tắc hoàn thành chung

Mỗi ticket phải giữ server-only business writes, Zod validation, tenant-scoped Rules, bounded listeners, UTC, integer VND và REQ traceability. Worker không được mở rộng sang reservation, payroll, hay non-goal. Mọi đề xuất AI cần người duyệt trước khi đổi business state.
