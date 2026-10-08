# ScanGo MVP

ScanGo là nền tảng gọi món bằng QR và vận hành quán ăn nhỏ. Khách quét mã tại bàn để tự gọi món; bếp, thu ngân, phục vụ và chủ quán dùng chung một nguồn dữ liệu realtime.

Ứng dụng chạy trên Firebase: Auth cho tài khoản nội bộ, Firestore cho dữ liệu tenant, Cloud Functions (2nd gen) cho toàn bộ nghiệp vụ tin cậy, và Security Rules chặn mọi ghi trực tiếp từ client. Xem `docs/SRS.md` cho yêu cầu đã duyệt và `STATUS.md` cho trạng thái hiện tại.

## Phạm vi MVP

- Khách quét QR tại bàn, xem thực đơn, chọn món/tùy chọn, áp dụng ưu đãi, gửi đơn và theo dõi trạng thái.
- Bếp nhận đơn, chuyển `Chờ → Đang nấu → Sẵn sàng` và tắt/mở món theo danh mục.
- Phục vụ giao món (`Sẵn sàng → Đã phục vụ`); thu ngân xác nhận tiền mặt/VietQR, hủy hoặc hoàn tiền.
- Chủ quán quản lý thực đơn, tồn kho và giá vốn, bàn/QR, nhân viên, khuyến mãi, báo cáo doanh thu và trợ lý AI.
- Mọi người dùng đã đăng nhập gửi phản hồi về ScanGo kèm ảnh chụp màn hình; chủ quán xử lý trong hộp thư phản hồi.
- Chế độ Solo hợp nhất nhận đơn, chế biến, thanh toán, kho nguyên liệu và giá vốn.

Chế độ `/simulator` là bề mặt demo dùng dữ liệu mẫu trong `src/mockData.ts`; mọi luồng thật đi qua `/dashboard`, `/staff` và `/menu/:tableId`.

## Chạy dự án

Yêu cầu Node.js 22 trở lên. Repo dùng npm workspaces, gồm app web và workspace `functions`.

```bash
npm install
npm run dev
```

Ứng dụng mặc định chạy tại `http://localhost:3000`.

## Cấu hình Firebase

Firebase project: `scango-8f0e9`. Sao chép `.env.example` sang `.env.local` và điền sáu giá trị `VITE_FIREBASE_*` (Firebase Console → Project settings → Your apps → Web app). `.env.local` không được commit.

Khi chưa có `.env.local`, app vẫn build bình thường; Firebase chỉ không khởi tạo.

Phát hành lên project `scango-8f0e9`. Bốn lệnh này độc lập; một môi trường mới cần đủ cả bốn, nếu thiếu `deploy:indexes` thì query sẽ lỗi `FAILED_PRECONDITION`:

```bash
npm run deploy:rules      # Firestore Security Rules
npm run deploy:storage    # Storage Security Rules
npm run deploy:indexes    # composite indexes
npm run deploy:functions  # Cloud Functions
```

Hiện chưa có pipeline phân tầng staging/production: cả bốn lệnh đều nhắm thẳng project production trong `package.json`, nên chỉ chạy từ nhánh đã được duyệt.

## Chạy Functions cục bộ (Emulator)

Chạy Cloud Functions trên máy. Firebase Auth và Firestore vẫn dùng project thật.

```bash
npm run emulators
```

`npm run emulators` chỉ chạy Functions (Auth và Firestore dùng project thật). Khi bạn cần
**Storage emulator** — ví dụ để thử tải ảnh phản hồi — phải chạy kèm Firestore emulator, vì
`storage.rules` gọi `firestore.exists(...)`; thiếu nó thì tiến trình `firebase` sẽ sập:

```bash
npm run build:functions
npx firebase emulators:start --only firestore,functions,storage --project scango-8f0e9
```

Nếu `~/.cache` chỉ đọc (máy CI, sandbox), trỏ cache jar của emulator vào repo:

```bash
export FIREBASE_EMULATORS_PATH="$PWD/.emu-cache"
```

Sau đó bật cờ trong `.env.local` và khởi động lại Vite:

```text
VITE_USE_FUNCTIONS_EMULATOR=true
# Chỉ bật khi Storage emulator cũng đang chạy:
VITE_USE_STORAGE_EMULATOR=true
```

Login page hiển thị badge `Local emulator` khi bật. Đăng nhập vẫn qua Firebase Auth thật.

Bật cờ mà chưa chạy emulator sẽ khiến UI báo lỗi kết nối. Tắt cờ để dùng Functions đã deploy.

Cảnh báo: Functions emulator đọc/ghi Firestore thật bằng Application Default Credentials.

## Tạo tài khoản ADMIN

ADMIN không tự đăng ký. Đó là một người dùng Firebase Auth có claim `admin: true`. Rules và Cloud Functions kiểm tra claim này.

1. Tạo người dùng trong Firebase Console (Authentication → Users) hoặc đăng ký trong app để lấy UID.
2. Cấp claim bằng script:

```bash
npm run admin:grant -- --email owner@shop.vn
```

Lệnh khác:

```bash
npm run admin:grant -- --uid <uid> --project scango-8f0e9
npm run admin:grant -- --email owner@shop.vn --revoke
```

Bật cờ `--revoke` để thu hồi quyền. Dự án lấy từ `FIREBASE_PROJECT_ID`, mặc định `scango-8f0e9`. Với Auth emulator, đặt `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099`.

Lệnh dùng Application Default Credentials. Nếu chưa có, chạy `gcloud auth application-default login`. Script tự đặt quota project bằng project đích, nên ADC người dùng không cần cấu hình thêm.

Lưu ý: tài khoản gọi lệnh cần quyền quản lý người dùng Firebase Auth trên project đó.

Sau khi đổi claim, đăng xuất rồi đăng nhập lại, và mở `/dashboard/manage`.

## Kiểm tra trước khi phát hành

Các lệnh tĩnh và unit test (nhanh, không cần Java):

```bash
npm run lint
npm run lint:functions
npm run typecheck
npm run typecheck:functions
npm run test
npm --workspace functions run test
npm run build:functions
npm run build
npm run preview
```

Hai bộ test còn lại là bằng chứng độ đúng chính của dự án và cần **Java 21+** cho Firestore emulator:

```bash
npm run test:rules      # Security Rules cho Firestore và Storage
npm run test:emulator   # gọi thật mọi Cloud Function qua Functions emulator
```

Cả hai bộ chạy trong CI (`.github/workflows/ci.yml`, job `emulator`). Chúng phải hermetic: không bộ nào được phụ thuộc secret thật. Test AI ghim provider tất định ngay trong seed, nên một `GEMINI_API_KEY` trên máy không làm đổi kết quả và không phát sinh chi phí.

## Cấu trúc

```text
public/                  favicon, web app manifest, robots
src/
  pages/                 trang đã định tuyến: dashboard/*, menu công khai, đăng nhập
  layouts/               khung Owner, khung vai trò, khung xác thực
  components/            màn hình theo vai trò và panel nghiệp vụ
  data/adapters/         lớp gọi callable + đọc Firestore đã được cấp quyền
  data/firestoreRead.ts  đọc trực tiếp có kiểm quyền (ADR 0015)
  locales/               catalog i18n có kiểu cho vi/en
  services/firebase/     khởi tạo Firebase client
  mockData.ts            dữ liệu mẫu CHỈ cho /simulator
shared/                  contracts, config, fixtures dùng chung web + functions
functions/src/modules/   mỗi thư mục là một module sản phẩm độc lập
functions/test/          bộ test Security Rules và Functions Emulator
functions/src/scripts/   seed dữ liệu demo và seed phản hồi sản phẩm
docs/                    SRS, ADR, tài liệu module, runbook demo
docs/feedback/           bằng chứng đánh giá Playwright + khảo sát đối thủ
docs/feedback/harness/   script Playwright chạy lại mọi workflow và thu ảnh chụp
```

### Seed phản hồi sản phẩm

`/dashboard/feedback` cần dữ liệu để xem thử. Script seed ghi 16 phản hồi lấy từ chính đợt
đánh giá 2026-10 (không có dữ liệu khách) và tải ảnh mẫu lên Storage:

```bash
npm run seed:feedback -- --owner-uid <uid> --with-images --confirm   # Firestore thật
npm run seed:feedback -- --tenant-id demo --dry-run                  # chỉ xem kế hoạch
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed:feedback:emulator -- --tenant-id demo
```

## Giới hạn hiện tại

Những phần dưới đây đã có trên server nhưng chưa nối tới nhà cung cấp thật, hoặc chưa làm:

| Khu vực | Đã có | Còn thiếu |
|---|---|---|
| NFC | Cấp/thu hồi/giải mã token phía server | Ghi và đọc NDEF trên thiết bị thật |
| Loyalty | Tích/đổi/thu hồi điểm, xác minh SĐT phía server | Kênh gửi mã qua SMS/Zalo |
| Payment | Adapter có chữ ký và webhook | Secret nhà cung cấp thật và transport HTTP |
| i18n | Catalog vi/en, hồ sơ locale phía server | Chuỗi cứng còn lại trong OwnerView, InventoryPanel, MenuPage |
| PWA | Web app manifest | Service worker và cache offline |
| AI | Adapter, ngân sách, câu trả lời có trích nguồn | Secret nhà cung cấp thật (mặc định vẫn tất định khi thiếu secret) |
| Bằng chứng | Test tự động cho mọi module | Artifact nghiên cứu usability có bấm giờ riêng |

Ngoài phạm vi v1: đặt bàn (ADR 0009), tính lương, mua nguyên liệu như hệ thống procurement, giao hàng, máy in, hóa đơn thuế, ứng dụng native.
