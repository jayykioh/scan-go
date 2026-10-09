# Feedback — đánh giá sản phẩm và đối thủ

Thư mục này giữ bằng chứng đánh giá ScanGo từ góc nhìn người dùng, kênh thu phản hồi trong
ứng dụng, và cách chạy lại tất cả.

## Đọc gì trước

| Tài liệu | Nội dung |
|---|---|
| [improvement-backlog-2026-10.md](improvement-backlog-2026-10.md) | **Bộ tổng hợp cần cải thiện — đọc cái này trước.** Gom cả ba nguồn thành 40 việc có mã `IMP-01…IMP-40`, xếp theo thứ tự nên làm, kèm Top 10 làm trước, việc KHÔNG nên làm, điểm mạnh phải giữ, và bảng truy vết về nguồn |
| [feature-audit-2026-10/](feature-audit-2026-10/README.md) | **Đợt 2 — báo cáo tính năng, tách theo từng phát hiện.** Mở [README.md](feature-audit-2026-10/README.md) để xem mục lục; mỗi lỗi (F-01…F-19) nằm trong một file riêng, kèm [điểm mạnh](feature-audit-2026-10/strengths.md), [bản đồ yêu cầu "Done nhưng không tới được người dùng"](feature-audit-2026-10/reachability.md), [khuyến nghị](feature-audit-2026-10/recommendations.md) và [phụ lục](feature-audit-2026-10/appendix.md) |
| [comparative-review-2026-10.md](comparative-review-2026-10.md) | **Đợt 1 — báo cáo chính.** 11 lỗi theo mức độ (kèm cách tái hiện, nguyên nhân gốc, hướng sửa), điểm mạnh, so sánh đối thủ, 18 khuyến nghị ưu tiên |
| [competitor-report-2026-10.md](competitor-report-2026-10.md) | Khảo sát 8 đối thủ × 11 tiêu chí với URL nguồn, bảng so sánh, danh sách "không nên sao chép", ghi rõ chỗ `chưa xác minh` |
| [artifacts/](artifacts/) | Ảnh chụp, snapshot ARIA và các file JSON kết quả của mọi bước chạy, kể cả `promotion-verification-report.json`, `promotion-server-verification-report.json`, `tables-page-verification-report.json` và `table-plan-server-verification-report.json` |

## Kênh phản hồi trong ứng dụng (REQ-FDB-004..006)

- Người dùng đã đăng nhập bấm nút nổi **Gửi phản hồi** ở góc dưới bên trái.
- Chọn loại (lỗi / trải nghiệm / tính năng / hiệu năng / khác), mức độ, nội dung, và tối đa
  3 ảnh chụp màn hình.
- Ảnh đi thẳng lên `tenants/{tenantId}/feedbackAttachments/{uid}/{fileName}` trong Firebase
  Storage; bản ghi do máy chủ ghi vào `tenants/{tenantId}/productFeedback/{feedbackId}`.
- Owner/ADMIN đọc và xử lý tại `/dashboard/feedback`; mỗi lần đổi trạng thái ghi thêm actor,
  thời gian và lý do.

## Bộ harness

| Script | Việc nó làm |
|---|---|
| `harness/discover-surface.mjs` | Dump toàn bộ phần tử tương tác (nút, ô nhập, tiêu đề, trạng thái chọn) của 9 trang dashboard + 6 vai trò simulator; dùng để thiết kế luồng theo nhãn UI thật |
| `harness/run-feature-audit.mjs` | 16 luồng tính năng: Thực đơn, Kho (bình quân gia quyền, hao hụt, báo cáo thay đổi), Bàn + QR công khai, Nhân sự (tạo tài khoản và đăng nhập thật), Cấu hình, Gói cước, Doanh thu, Trợ lý AI, tenant, ADMIN, offline, quét tải cứng |
| `harness/run-simulator-audit.mjs` | 7 luồng simulator: khách gọi món, KDS, thu ngân, cổng PIN nhân viên, 6 tab Owner, Solo onboarding, và đo độ phủ nút đổi ngôn ngữ |
| `harness/run-workflows.mjs` | Khảo sát 24 trang: ảnh chụp, snapshot ARIA, lỗi console/mạng, số đo thời gian, audit a11y nhẹ |
| `harness/run-workflows-interactive.mjs` | 7 workflow tương tác: khách gọi món, bếp, thu ngân, chủ quán tạo bàn, tạo món, đăng xuất/đăng nhập, **đặt món thật qua `/menu/<token>`** |
| `harness/run-feedback-feature.mjs` | Kiểm tra tính năng phản hồi: mở widget, đính kèm ảnh, gửi, mở hộp thư, đổi trạng thái |
| `harness/run-promotion-verification.mjs` | 5 luồng kiểm chứng khuyến mãi: trang riêng + hộp thoại + tên nút cho trình đọc màn hình, tạo và bật khuyến mãi, cổng giới hạn gói Free, mục AI gợi ý/duyệt/đo lường, và giỏ khách hiện đúng số tiền giảm do máy chủ tính |
| `harness/verify-promotion-server.mjs` | 21 phép kiểm ở tầng máy chủ trên Firestore thật: số tiền giảm là số nguyên VND, đơn ghi `discountVnd` + `promotionSnapshot`, gửi lại không tạo đơn thứ hai, cổng gói và cổng loại nâng cao bị máy chủ chặn, huỷ đơn giữ nguyên số tiền giảm, và dọn sạch fixture |
| `harness/cleanup-promotions.mjs` | Lưu trữ mọi khuyến mãi chưa lưu trữ của tenant QA và xoá gợi ý chiến dịch do harness tạo, để lần chạy sau bắt đầu từ trạng thái sạch |
| `harness/inspect-firestore.mjs` | Chỉ đọc Firestore thật để đối chiếu "UI nói gì" với "dữ liệu thật có gì" |
| `harness/seed-emulator.mjs` | Ghi tenant + member vào Firestore emulator để Storage Rules đánh giá được |
| `harness/verify-table-plan-server.mjs` | 12 phép kiểm ở tầng máy chủ trên Firestore thật: lệnh `configure` ghi khu vực/số ghế/ô lưới và ghi audit, máy chủ từ chối ô ngoài lưới 12×10 mà không làm hỏng vị trí đang lưu, người chưa đăng nhập bị từ chối, và trạng thái bàn đi đúng vòng đời một đơn thật `pending → ready → served → cancelled` (trống → có khách → món sẵn sàng → chờ thanh toán → trống) |
| `harness/verify-tables-page.mjs` | 16 phép kiểm cho Sơ đồ bàn: mở bằng URL và F5 phải hiện đủ bàn đọc từ Firestore thật, không được hiện màn "trống" giả, thẻ hướng dẫn phải nằm trong khung nhìn và không che nút "Thêm Bàn" (đo diện tích chồng + hit test), nút chỉ-icon phải có tên và vùng bấm ≥44 px, và vòng thêm/đổi tên/lưu trữ bàn phải cập nhật ngay không cần tải lại (tự dọn fixture `[QA]`) |
| `harness/run-feature-verification.sh` | Bọc `seed-emulator` + `run-feedback-feature` cho `firebase emulators:exec` |
| `harness/fixture-screenshot.png` | Ảnh 64×64 dùng cho bước upload |

```bash
export PLAYWRIGHT_CORE=/đường/dẫn/tới/playwright-core/index.mjs   # nếu không nằm ở mặc định
node docs/feedback/harness/run-workflows.mjs
node docs/feedback/harness/run-workflows-interactive.mjs --only=w7-public-order-real

# Đợt 2 — cần dev server ở :3000 và functions emulator ở :5001
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-feature-audit.mjs
XDG_CACHE_HOME="$PWD/.pw-cache" node docs/feedback/harness/run-simulator-audit.mjs --only=s2
```

### Dữ liệu test do harness tạo ra

`run-feature-audit.mjs` **ghi dữ liệu thật** vào tenant QA: món ăn, nguyên liệu, phiếu kho, bàn và
tài khoản nhân sự. Mọi bản ghi đều mang tiền tố `[AUDIT]`, và các luồng Thực đơn/Bàn/Kho tự dọn qua
chính giao diện ở cuối luồng. Nếu một lần chạy bị ngắt giữa đường, xoá thủ công mọi tài liệu có
tiền tố `[AUDIT]` trong `tenants/<tenantId>/{menuItems,ingredients,tables,stockMovements}` và
`publicMenuItems`, cùng các member/tài khoản Auth `audit.*@example.com`.

`run-simulator-audit.mjs` chỉ đọc và ghi vào localStorage, trừ luồng `s7-i18n` đổi ngôn ngữ giao
diện (được lưu lên máy chủ theo REQ-I18N-001).

`run-workflows.mjs` và `run-workflows-interactive.mjs` cần một tài khoản Owner trong
`artifacts/workflow-report.json`; `run-workflows.mjs` tự tạo tài khoản đó ở bước
`owner-register-flow` và **ghi dữ liệu thật** vào Firestore. Chỉ chạy khi bạn chấp nhận điều
đó, hoặc trỏ `SCANGO_BASE_URL` vào một môi trường khác.

## Seed phản hồi mẫu

`functions/src/scripts/seed-feedback-data.ts` chứa 16 phản hồi lấy từ chính đợt đánh giá
này (không có tên, số điện thoại hay email — đây là dữ liệu demo, không phải dữ liệu khách).

```bash
npm run seed:feedback -- --tenant-id <tenantId> --with-images --confirm
npm run seed:feedback -- --owner-uid <uid> --dry-run
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:feedback:emulator -- --tenant-id demo
```

Ảnh cần một bucket Storage: script mặc định `<projectId>.firebasestorage.app` và nhận
`--bucket` hoặc `FIREBASE_STORAGE_BUCKET`. Trên emulator, bucket nào cũng được chấp nhận:

```
Đã seed phản hồi vào emulator.
  Tenant: demo-nha-hang
  Phản hồi: 16
  Ảnh đã tải lên Storage: 2
```

Trên Firestore thật script **từ chối chạy nếu thiếu `--confirm`**; id bản ghi luôn có tiền tố
`seed-` nên chạy lại chỉ cập nhật bản ghi của chính nó.

## Ghi chú môi trường

- Storage Rules gọi `firestore.exists(...)`, nên **phải chạy kèm Firestore emulator**:
  `npx firebase emulators:start --only firestore,functions,storage`. Chạy thiếu Firestore sẽ
  làm sập tiến trình `firebase` (xem BUG-11 trong báo cáo chính).
- Nếu `~/.cache` chỉ đọc, đặt `FIREBASE_EMULATORS_PATH="$PWD/.emu-cache"` (đã có trong
  `.gitignore`).
- Upload ảnh cục bộ cần `VITE_USE_STORAGE_EMULATOR=true` trong `.env.local` và Storage
  emulator đang chạy; không bật thì ảnh đi lên bucket thật và cần Storage Rules đã deploy.
