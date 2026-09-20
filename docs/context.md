# ScanGo Lite — Product Context

> Cập nhật: 2026-09-15. Trạng thái kỹ thuật hiện tại xem tại [`../STATUS.md`](../STATUS.md).

## Mục tiêu sản phẩm

ScanGo là hệ thống self-service ordering cho quán F&B nhỏ tại Việt Nam. Khách mở menu theo bàn bằng QR/NFC, gửi order, bếp xử lý, nhân viên phục vụ và thu ngân đóng hóa đơn.

## Đối tượng sử dụng

- **Owner:** báo cáo, menu, bàn, nhân sự, promotion, kho và cấu hình.
- **Manager/Cashier:** quản lý order và xác nhận thanh toán.
- **Kitchen:** Kitchen Display, cập nhật tiến độ và tình trạng món.
- **Waiter:** nhận món ready và đánh dấu đã phục vụ.
- **Customer:** xem menu, gọi món, theo dõi và loyalty.
- **Solo Operator:** giao diện hợp nhất cho quán một người vận hành.

## Trạng thái sản phẩm

Hiện tại là React/Vite frontend MVP dùng `mockData` và `localStorage`. UI thể hiện được hầu hết các actor và luồng nghiệp vụ, nhưng chưa có backend, database, xác thực, payment, NFC hoặc realtime đa thiết bị.

## Kiến trúc đã thống nhất

- Frontend: React/Vite PWA.
- Backend dự kiến: Firebase Auth, Firestore, Cloud Functions, Security Rules và Cloud Scheduler.
- Không migrate sang Next.js trong giai đoạn kết nối backend hiện tại.

## Product tiers

Product blueprint hiện định nghĩa `Free / Lite / Pro`, trong khi frontend đang dùng `Lite / Pro / Enterprise`. Đây là quyết định sản phẩm chưa chốt; backend không nên enforce entitlement cho đến khi bảng tier được thống nhất.

## Payment modes

- **Pay-Later:** order vào bếp trước, thanh toán sau.
- **Pay-First:** phải xác nhận thanh toán trước khi order vào bếp.

Frontend hiện mới mô phỏng hai mode; Pay-First chưa có logic chặn order trước thanh toán.

## Ba trụ cột kỹ thuật mục tiêu

1. **Zero-hardware:** QR là đường dẫn mặc định; NFC sticker là lựa chọn bổ sung.
2. **Realtime đa thiết bị:** Customer, Kitchen, Waiter và Cashier đồng bộ qua Firestore.
3. **Multi-tenant và secure-by-default:** mọi dữ liệu/permission gắn với tenant, logic tiền/kho/điểm chạy phía server.

## Nguồn tài liệu

- [`../README.md`](../README.md): cách chạy frontend mockup.
- [`architecture.md`](architecture.md): kiến trúc hiện tại và mục tiêu.
- [`features.md`](features.md): feature matrix.
- [`../STATUS.md`](../STATUS.md): trạng thái audit mới nhất và roadmap kỹ thuật.
- [`../../specs/blueprint.md`](../../specs/blueprint.md): đặc tả backend MVP.
