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

Yêu cầu Node.js 20 trở lên.

```bash
npm install
npm run dev
```

Ứng dụng mặc định chạy tại `http://localhost:3000`.

## Kiểm tra trước khi phát hành

```bash
npm run typecheck
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
