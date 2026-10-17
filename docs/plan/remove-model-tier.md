# Kế hoạch bỏ tầng model, giữ phân tích tất định

**Nguồn:** ADR 0024, SRS 1.5. **Thay thế:** G2-06 trong `docs/plan/insight-growth-plan.md` (bỏ TypeSafe Jev) — G2-06 trở thành một phần của A-02.
**Phạm vi:** P1. P0 không đổi.
**Điều kiện vào:** không có. Việc này độc lập với kế hoạch `scale-15-50-tables.md`.

**Nguyên tắc thứ tự:** A-01 làm **trước** A-02. Ô chat hiện là **nơi duy nhất** hiển thị `computeWarnings` (`grep` trong `src/` không tìm thấy chỗ render `warnings` nào khác). Xoá nó trước khi có panel là xoá mất tầm nhìn duy nhất của chủ quán về chính dữ liệu của mình.

---

### A-01 — Panel cảnh báo cho Owner (làm trước)
- **REQ/NFR:** REQ-AI-001, REQ-AI-007, REQ-AI-008, REQ-AI-010, NFR-DATA-002. **ADR 0024.**
- **Mục tiêu:** Chủ quán thấy cảnh báo mà không phải hỏi. Hai nguồn, hai đường đọc khác nhau:
  - cảnh báo sống → `callableAiListWarnings` mới, chạy `computeWarnings` trên dữ liệu hiện tại, **không** gọi provider, **không** ghi `aiUsage`;
  - insight tuần đã lưu → đọc trực tiếp `aiInsights` từ Firestore, vì rules đã cho Owner đọc (ADR 0015). Không cần callable.
- **Khu vực:** `functions/src/modules/ai/index.ts` (callable mới, dùng lại `assertAiOwnerMember`); `shared/contracts/ai.contract.ts` (result schema cho warnings-only, tái dùng `aiWarningSchema`); `src/data/firestoreRead.ts` (reader `aiInsights` — hiện **chưa có**); `src/data/adapters/ai.adapter.ts`; một khối UI trong `src/pages/dashboard/OverviewPage.tsx` hoặc trang mới, hiển thị theo `severity`, kèm công thức, nguồn, kỳ, thời điểm cập nhật.
- **Kiểm tra chấp nhận:** Given một quán có món lỗ, when Owner mở dashboard, then cảnh báo hiện mà không cần thao tác nào; given cảnh báo, then nó in công thức và mã nguồn; given một topic vượt ngưỡng, then cảnh báo surge hiện ở đây; given Staff, then server từ chối; given không có dữ liệu, then hiện cảnh báo thiếu dữ liệu chứ không im lặng.
- **Tests:** unit cho result schema mới; unit cho reader `aiInsights` (đọc được, không lộ tenant khác); Emulator cho `callableAiListWarnings` (Owner được, Staff bị từ chối, không ghi `aiUsage`); Rules test cho `aiInsights` giữ nguyên Owner-only.
- **Bằng chứng:** ảnh chụp màn hình theo `AGENTS.md` (Playwright) ở 1440×900 và 390×844; unit + Rules + Emulator pass; khẳng định không có bản ghi `aiUsage` nào được ghi.

### A-02 — Xoá tầng provider ở server
- **REQ/NFR:** REQ-AI-004, REQ-AI-005 (withdrawn), NFR-AI-002 (withdrawn). **ADR 0024.** Gộp luôn G2-06.
- **Mục tiêu:** Không còn đường gọi model nào trong `functions/`.
- **Khu vực xoá trong `functions/src/modules/ai/service.ts`:** `createGeminiProvider`, `createJevProvider`, `createRuleBasedProvider`, `geminiResponseSchema`, `jevResponseSchema`, `GeminiResponse`, `JevResponse`, `estimateGeminiCostVnd`, `estimateJevCostVnd`, `estimateTokens`, `resolveAiProvider`, `AiProviderRegistry`, `buildProviderPrompt`, `AiProviderAdapter`, `AiProviderRequest`, `AiProviderResponse`, `AI_PROVIDER_MALFORMED_MESSAGE`, `DEFAULT_GEMINI_MODEL`, `DEFAULT_JEV_MODEL`, `GEMINI_INPUT_VND_PER_1K`, `GEMINI_OUTPUT_VND_PER_1K`, `JEV_INPUT_VND_PER_1K`, `isJevEnabled`, `AI_MAX_OUTPUT_TOKENS`, `AI_BUDGET_EXCEEDED_MESSAGE`, `assertQuestionInPermission`, `AI_PERMISSION_DENIED_MESSAGE`, và toàn bộ khối ngân sách/usage (`reserveAiBudget`, `settleAiBudget`, `estimateAiReservationVnd`, `isAiBudgetExhausted`, `sumAiUsageCostVnd`, `aiBudgetPath`, `monthKeyFromDayKey`, `AI_BUDGET_COLLECTION`, `AiBudgetState`, `AiBudgetReservation`, `ReserveAiBudgetInput`, `SettleAiBudgetInput`, `buildAiUsageRecord`, `BuildAiUsageInput`).
- **Khu vực xoá khác:** `callableAiAsk` trong `index.ts`; `geminiApiKeySecret` và mọi tham chiếu trong `functions/src/shared/secrets.ts`; export trong `functions/src/index.ts`.
- **Giữ nguyên:** `assembleSafeContext`, `readMenuItems`, `readIngredients`, `readIngredientLotPrices`, `readFeedbackTopics`, `mapDailyStats`, `mapDailyItemStats`, `computeWarnings`, `latestDataUpdatedAt`, `assertAiOwnerMember`, `hasSecretMaterial`, `assertNoSecretMaterial`, `RULE_BASED_PROVIDER`, `RULE_BASED_MODEL`, và mọi hằng số ngưỡng/giới hạn.
- **Kiểm tra chấp nhận:** Given toàn bộ repo, when `grep -rn "gemini\|GEMINI\|jev\|resolveAiProvider\|aiUsage\|aiBudget" functions/src/ src/ shared/`, then không còn kết quả nào ngoài doc comment giải thích lịch sử; given chạy weekly analysis và feedback grouping, then vẫn hoạt động y như trước và vẫn không ghi `aiUsage`.
- **Tests:** xoá phần provider/budget trong `functions/src/modules/ai/service.test.ts`; giữ và chạy phần `computeWarnings`/`assembleSafeContext`; xoá `functions/test/ai/ai-budget.emulator.test.ts` (252 dòng); xoá 9 test `callableAiAsk` trong `functions/test/ai/ai.emulator.test.ts` (giữ 4 test weekly + 3 test grouping).
- **Bằng chứng:** unit + Emulator pass; `npm run typecheck:functions` và `lint:functions` pass; `service.ts` giảm khoảng 600 dòng trên 1315.

### A-03 — Xoá bề mặt AI ở client, trỏ về panel
- **REQ/NFR:** REQ-AI-003, REQ-AI-009 (withdrawn). **ADR 0024.**
- **Khu vực xoá:** `src/components/AiChatWidget.tsx` (357 dòng); `src/data/adapters/ai.adapter.ts` và `ai.adapter.test.ts` (phần `askAiQuestion`, `AI_ASK_CALLABLE`, `parseAiAskResult`; giữ phần adapter mà A-01 cần); `showAiAssistant` và `<AiChatWidget />` trong `src/layouts/DashboardLayout.tsx`.
- **Kiểm tra chấp nhận:** Given mở dashboard bằng Owner, when trang tải, then không còn nút chat nổi; given panel ở A-01, then vẫn vào được từ dashboard; given Staff, then không thấy panel.
- **Tests:** xoá test của `AiChatWidget` nếu có; unit cho adapter còn lại.
- **Bằng chứng:** ảnh chụp dashboard trước/sau; `npm run typecheck` và `lint` pass.

### A-04 — Xoá harness đánh giá provider
- **REQ/NFR:** NFR-AI-002 (withdrawn). **ADR 0024.**
- **Lý do:** cả mục đích của nó là so sánh model. Không còn model thì không còn gì để so.
- **Khu vực xoá:** `functions/src/modules/ai/evaluation.ts`, `evaluation.cli.ts`, `evaluation.test.ts`; script `ai:evaluate` trong `functions/package.json`; các schema `aiEvaluation*` trong `shared/contracts/ai.contract.ts`; `aiEvaluationReportFixture` trong `shared/fixtures/ai.fixture.ts`; describe `aiEvaluationReportSchema` trong `shared/contracts/ai.contract.test.ts`.
- **Kiểm tra chấp nhận:** Given `functions/package.json`, when đọc scripts, then không còn `ai:evaluate`; given `grep -rn "aiEvaluation\|vietnameseQualityScore"`, then rỗng.
- **Bằng chứng:** unit pass sau khi xoá.

### A-05 — Config chỉ còn ngưỡng
- **REQ/NFR:** REQ-AI-007, REQ-AI-008, REQ-FDB-008, REQ-CFG-001. **ADR 0024.**
- **Khu vực:** `shared/contracts/config.contract.ts` — bỏ `provider` và `monthlyBudgetVnd` khỏi `aiConfigSchema` và `aiOverrideInputSchema`; bỏ `aiProviderSchema` và type `AiProviderName`; **giữ** `revenueDropPercent`, `lowMarginPercent`, `feedbackTopicAlertCount`, `feedbackTopicWindowHours`. `shared/config/defaults.ts` — bỏ default provider/budget. `shared/contracts/ai.contract.ts` — bỏ schema `aiUsageRecordSchema` nếu chỉ dùng cho usage.
- **Lưu ý:** màn Cài đặt **chưa từng** hiển thị `provider`/`monthlyBudgetVnd` (mới chỉ có `revenueDropPercent` và `lowMarginPercent`), nên không phải gỡ gì ở UI. Nhân dịp này thêm 2 ô còn thiếu: `feedbackTopicAlertCount` và `feedbackTopicWindowHours`.
- **Kiểm tra chấp nhận:** Given `ai` override, when ghi `provider` hoặc `monthlyBudgetVnd`, then schema từ chối; given ghi ngưỡng, then nhận và có hiệu lực; given Settings, then có 4 ô ngưỡng.
- **Tests:** contract test cho `aiOverrideInputSchema` (từ chối 2 khoá đã bỏ, nhận 4 khoá ngưỡng); `shared/config/resolve.test.ts` cập nhật.
- **Bằng chứng:** contract + resolve test pass; ảnh chụp khối ngưỡng trong Settings.

### A-06 — Rules: bỏ `aiUsage` và `aiBudget`
- **REQ/NFR:** NFR-SEC-001. **ADR 0024.**
- **Khu vực:** `firestore.rules` — xoá block `aiUsage/{usageId}` và `aiBudget/{monthKey}`; **giữ** `aiInsights/{insightId}` với `isActiveOwner(tenantId) || isAdmin()`, `write: false`.
- **Kiểm tra chấp nhận:** Given một read vào `aiUsage` hoặc `aiBudget`, when chạy, then bị từ chối vì không còn rule nào cấp quyền; given `aiInsights`, then Owner đọc được như trước.
- **Tests:** xoá `functions/test/rules/ai-usage.rules.test.ts` (179 dòng); giữ/chạy test rules cho `aiInsights`.
- **Bằng chứng:** `npm run test:rules` pass.

### A-07 — Cảnh báo nói rõ khi mẫu bị chặn
- **REQ/NFR:** REQ-AI-010, NFR-DATA-002.
- **Mục tiêu:** Mỗi cảnh báo tính từ một read bị `limit()` phải nói đã xét bao nhiêu và còn bao nhiêu chưa xét.
- **Bối cảnh:** `MAX_AI_MENU_ITEMS = 200`, `MAX_AI_INGREDIENTS = 200`, `MAX_AI_FEEDBACK_TOPICS = 50` gọi `.limit()` **không `orderBy`** — 200 doc giữ lại là lát cắt bất kỳ theo document id. `MAX_AI_ITEM_STATS = 100` chặn mẫu món bán ra mà `lowProfit` quét.
- **Hướng làm:** thêm `orderBy` có ý nghĩa cho từng read, và mang số lượng đã đọc trên tổng vào `computeWarnings` để cảnh báo in ra ghi chú đó. Không bỏ trần.
- **Khu vực:** `functions/src/modules/ai/service.ts` (`read*`, `computeWarnings`, `assembleSafeContext`); `shared/contracts/ai.contract.ts` (trường mô tả mẫu bị chặn); `docs/module/ai.md`; UI panel ở A-01.
- **Kiểm tra chấp nhận:** Given quán vượt trần, when cảnh báo được tính, then nó ghi rõ tập nào bị chặn và đã xét bao nhiêu; given mẫu bị chặn, then không cảnh báo nào tự nhận đã xét mọi món và không con số nào được trình bày như tổng của quán; given trong trần, then không hiện ghi chú.
- **Tests:** unit cho từng `read*` trả đúng số lượng + cờ bị chặn; unit cho `computeWarnings` khi mẫu món bị chặn (không được khẳng định "không có món lỗ"); contract test cho trường mới.
- **Bằng chứng:** unit pass; một lần chạy thật trên tenant >200 món cho thấy ghi chú xuất hiện.

### A-08 — Dọn secret và xác nhận cuối
- **REQ/NFR:** NFR-REL-001, NFR-SEC-001. **ADR 0024.**
- **Việc:** quyết định xoá hay giữ `GEMINI_API_KEY` trong Secret Manager (không hàm nào đọc nó nữa, nên deploy không phụ thuộc); chạy `npm run deploy:rules` và `npm run deploy:indexes`; xác nhận production không còn bản ghi nào được ghi vào `aiUsage`/`aiBudget`.
- **Kiểm tra chấp nhận:** Given deploy functions, when chạy, then không cần secret nào của AI; given production, when đọc, then `aiInsights` vẫn còn nguyên và `aiUsage`/`aiBudget` không phát sinh bản ghi mới.
- **Bằng chứng:** log deploy; `gcloud secrets list` sau quyết định; ảnh chụp panel cảnh báo trên production với dữ liệu thật của `demo-nha-hang` (đang có insight "Món biên lợi nhuận thấp").

---

## Ngoài phạm vi
- **Đổi tên module `ai`, collection `aiInsights`, khoá config `ai`, hằng số `AI_*`.** Cố ý không làm; ADR 0024 ghi lý do. Nếu sau này muốn đổi thì là một việc riêng, có migration.
- **Đưa model trở lại.** Cần ADR mới, và ngưỡng bằng chứng nên là mức dùng thật của panel và của insight tuần, không phải một demo.
- **Nén lịch sử `aiUsage`.** Bảng ghi cũ không bị xoá dữ liệu; chỉ collection và rules biến mất. Nếu muốn giữ số liệu chi phí lịch sử thì export trước khi xoá.
