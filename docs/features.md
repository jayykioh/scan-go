# ScanGo Lite — Feature Status

<<<<<<< HEAD
> Cập nhật: 2026-09-15. `Implemented` bên dưới nghĩa là đã chạy trong frontend mockup; không đồng nghĩa đã sẵn sàng production.
=======
> Historical frontend inventory. `docs/SRS.md` defines approved production behavior and replaces simulations.

## Order Lifecycle
`pending → cooking → ready → served → paid`
>>>>>>> a79a18245a4502697374756514c2f5171b49e107

## Tổng quan

| Feature | UI | Logic mock | Backend/production |
|---|---:|---:|---:|
| Landing, giới thiệu | Implemented | N/A | N/A |
| Login/Register | Implemented | Navigate-only | Not implemented |
| Dashboard Owner | Implemented | Partial | Not implemented |
| Menu management | Implemented | localStorage CRUD | Not implemented |
| Table management | Implemented | localStorage CRUD | Not implemented |
| QR public menu | Implemented | Route theo table ID | Security/session chưa có |
| NFC | Implemented dạng mô phỏng | Alert/flag | Not implemented |
| Customer ordering | Implemented | localStorage order | Not implemented |
| Kitchen Display | Implemented | Local order state | Not implemented |
| Waiter flow | Implemented | Local order state | Not implemented |
| Cashier/payment | Implemented | Mark paid local | Not implemented |
| Staff roles/PIN | Implemented | Partial | Auth/RBAC chưa có |
| Inventory/recipe/COGS | Implemented | Partial, chưa thống nhất | Not implemented |
| Loyalty | Implemented | Partial | Ledger/OTP chưa có |
| AI assistant | Implemented | Rule-based responses | Gemini/LLM chưa có |
| Subscription | Implemented | Đổi flag local | Billing/enforcement chưa có |
| Realtime | UI mô phỏng | Cùng browser | Multi-device chưa có |

## Order lifecycle hiện tại

```text
pending → cooking → ready → served → paid
```

- Customer tạo order `pending`.
- Kitchen chuyển `pending → cooking → ready`.
- Waiter chuyển `ready → served`.
- Cashier chuyển order sang `paid` hoặc xóa order.

Đây là state machine phía client. Chưa có server validation, transaction, authorization hoặc audit log.

## Actor views đã có

### Owner

- KPI doanh thu, chi phí và lợi nhuận dựa trên dữ liệu local.
- CRUD menu, topping, recipe, nguyên liệu, bàn và nhân sự.
- Cấu hình promotion, payment mode và pricing tier.
- Quản lý stock thủ công.
- Quản lý QR/NFC dạng mô phỏng.
- AI assistant rule-based dựng sẵn; chưa gọi Gemini.

### Customer

- Chọn bàn hoặc mở thẳng `/menu/:tableId`.
- Lọc/tìm món, chọn modifier/topping, quản lý cart.
- Áp dụng promotion theo điều kiện local.
- Tạo loyalty profile, nhập OTP mock và đổi điểm.
- Gửi order và theo dõi tiến độ.

### Kitchen / Waiter / Cashier / Staff

- Kitchen queue và thao tác trạng thái.
- Waiter xem order ready và đánh dấu served.
- Cashier đóng/hủy order và cộng loyalty point.
- Staff login bằng PIN local và chỉ thấy tab theo role được gán.

### Solo Operator

- Gộp nhận order, chế biến, thu tiền, kho, COGS và subscription.
- Có logic trừ/hoàn kho mock riêng trong component.
- State kho này chưa dùng chung model `Ingredient` của ứng dụng.

## Logic chưa hoàn chỉnh

### Pay-First

Pay-First hiện chỉ thay đổi nội dung hiển thị. Order vẫn vào `pending` và Kitchen vẫn nhận ngay, chưa có `payment_status` hoặc bước xác nhận thanh toán.

### Promotion

Các điều kiện amount/quantity đã có. Chế độ `manual` và việc xác minh code khách nhập chưa được thực thi đầy đủ.

### Loyalty/OTP

- OTP chấp nhận bất kỳ chuỗi đủ bốn số.
- Điểm được cộng trực tiếp ở client.
- Tỷ lệ điểm ở một số flow đang hard-code.
- Chưa có transaction ledger, idempotency, rate limit hoặc fraud detection.

### NFC/QR

- `tableSecret` được sinh local nhưng không có trong link và không được server xác minh.
- Không có Web NFC API, NDEF read/write, `openTableSession` hoặc `session_token`.
- Print QR mới là placeholder.

### AI

Package `@google/genai` chưa được sử dụng. Assistant hiện trả lời bằng rule/keyword và `setTimeout`.

## Chưa triển khai

- Firebase Auth và protected routes.
- Firestore schema, realtime listener, indexes và Security Rules.
- Cloud Functions/API.
- Multi-tenancy và tenant isolation.
- Server-side pricing và validation.
- Payment gateway/webhook/refund.
- Inventory transaction và Auto-86 production.
- OTP provider, encryption/hashing số điện thoại.
- Feature entitlement/billing production.
- Service worker/offline strategy.
- Automated unit, integration và E2E tests.
- CI, monitoring và analytics production.
