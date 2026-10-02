# ScanGo MVP

ScanGo là bản MVP mô phỏng quy trình gọi món bằng QR cho quán ăn nhỏ. Một nguồn dữ liệu dùng chung kết nối trải nghiệm của khách hàng, bếp, thu ngân, chủ quán và chế độ vận hành một người.

## Phạm vi MVP

- Khách chọn bàn, nhận diện số điện thoại, chọn món/tùy chọn, áp dụng ưu đãi và theo dõi đơn.
- Bếp nhận đơn, chuyển trạng thái `Chờ → Đang nấu → Sẵn sàng` và cập nhật món hết hàng.
- Thu ngân xem đơn theo bàn, hủy hoặc hoàn tất thanh toán và cộng điểm thành viên.
- Chủ quán quản lý thực đơn, tồn món, bàn/QR, khuyến mãi và báo cáo tổng quan.
- Chế độ Solo hợp nhất nhận đơn, chế biến, thanh toán, kho nguyên liệu và giá vốn.
- Dữ liệu demo được lưu trong `localStorage`, vì vậy tải lại trang không làm mất phiên làm việc.

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

Phát hành deny-by-default Security Rules:

```bash
npm run deploy:rules
```

## Chạy Functions cục bộ (Emulator)

Chạy Cloud Functions trên máy. Firebase Auth và Firestore vẫn dùng project thật.

```bash
npm run emulators
```

Sau đó bật cờ trong `.env.local` và khởi động lại Vite:

```text
VITE_USE_FUNCTIONS_EMULATOR=true
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

```bash
npm run lint
npm run lint:functions
npm run typecheck
npm run typecheck:functions
npm run test
npm run build:functions
npm run build
npm run preview
```

## Cấu trúc

```text
public/                  Metadata, favicon và web app manifest
src/
  components/            Màn hình theo vai trò và error boundary
  hooks/                 Trạng thái bền vững trên trình duyệt
  App.tsx                 App shell và dữ liệu dùng chung
  mockData.ts             Mẫu ngành hàng, menu và thành viên
  types.ts                Hợp đồng dữ liệu MVP
```

## Giới hạn hiện tại

Đây là frontend MVP dùng dữ liệu cục bộ, chưa phải hệ thống production đa thiết bị. Xác thực PIN, QR/NFC, thanh toán, realtime và AI hiện được mô phỏng. Bước tiếp theo để triển khai thực tế là bổ sung API, cơ sở dữ liệu, phân quyền tenant, cổng thanh toán và kênh realtime.
