# ScanGo Lite — Architecture

> Historical prototype architecture. `docs/SRS.md` and `docs/TECH_STACK.md` are authoritative.
> Cập nhật: 2026-09-15. Trạng thái triển khai chi tiết xem tại [`../STATUS.md`](../STATUS.md).

## Kiến trúc hiện tại

ScanGo hiện là một frontend SPA mô phỏng, chưa có backend hoặc database production.

### Stack đang chạy

- React 19 + TypeScript 5
- Vite 6
- React Router 7
- Tailwind CSS 4
- `motion` / `framer-motion` cho animation
- `lucide-react` cho icon
- Vercel SPA rewrite
- `localStorage` làm nơi lưu dữ liệu demo

`@google/genai` và `express` đang có trong dependencies nhưng chưa được sử dụng trong source code.

### Routing

`src/App.tsx` khai báo route bằng `createBrowserRouter`:

```text
/
├── /introduce
├── /login
├── /register
├── /dashboard
│   ├── /manage
│   ├── /menu
│   ├── /tables
│   ├── /staff
│   ├── /settings
│   └── /subscription
├── /simulator
│   └── /simulator/:role
└── /menu/:tableId
```

Dashboard và simulator là hai shell riêng. `DashboardLayout` chứa navigation quản trị; `SimulatorLayout` cung cấp state dùng chung cho các actor trong simulator.

### State hiện tại

`SimulatorLayout` quản lý và lưu các nhóm dữ liệu sau bằng `usePersistentState`:

- `tenantConfig`
- `tables`
- `menuItems`
- `ingredients`
- `orders`
- `staffAccounts`
- `currentStaff`
- `loyaltyMembers`
- trạng thái onboarding của từng actor

`usePersistentState` lưu JSON vào `localStorage` và nghe `storage` event. Cơ chế này chỉ tạo cảm giác realtime giữa các tab cùng browser/origin; nó không đồng bộ giữa điện thoại khách, tablet bếp và máy thu ngân khác nhau.

### Component tree chính

```text
App.tsx
├── RootLayout
│   ├── Landing / Introduce
│   ├── DashboardLayout
│   │   └── Overview / Management / Menu / Tables / Staff / Settings / Subscription
│   └── SimulatorLayout
│       ├── SimulatorIndex
│       └── SimulatorRole
│           └── PhoneSimulator
│               ├── OwnerView
│               ├── CashierView
│               ├── KitchenView
│               ├── CustomerView
│               ├── SoloOperatorView
│               └── StaffView
├── AuthLayout
│   └── Login / Register
└── PublicMenuPage (/menu/:tableId)
```

## Kiến trúc mục tiêu đã thống nhất

Không migrate sang Next.js ở giai đoạn này. Giữ React/Vite làm frontend PWA và bổ sung Firebase làm backend:

```text
React/Vite PWA
├── Firebase Auth
├── Firestore realtime listeners
└── HTTPS callable functions
        ↓
Firebase Cloud Functions 2nd gen
├── tenant authorization
├── table session và NFC/QR verification
├── server-side pricing và order state machine
├── payment confirmation
├── inventory và Auto-86
├── loyalty/OTP
└── scheduled reports/fraud checks
        ↓
Firestore + Security Rules
```

Mọi thao tác nhạy cảm như tính tiền, đổi trạng thái thanh toán, trừ kho và cộng/trừ điểm phải chạy qua Cloud Functions. Client không được ghi trực tiếp các số dư này.

## Cấu trúc thư mục mục tiêu

```text
src/
├── routes/                     Route composition và guards
├── features/                   auth, menu, orders, kitchen, payment, loyalty, inventory
├── components/                 shared UI components
├── services/firebase/          Firebase client, listeners và callable wrappers
├── hooks/
└── types/
functions/
├── src/
│   ├── auth/
│   ├── tables/
│   ├── orders/
│   ├── payments/
│   ├── inventory/
│   ├── loyalty/
│   └── shared/
└── package.json
firestore.rules
firestore.indexes.json
firebase.json
```

## Các điểm cần refactor trước khi backend mở rộng

- `OwnerView.tsx` và `SoloOperatorView.tsx` quá lớn, cần tách theo feature/use-case.
- `SoloOperatorView` có model và state kho riêng, không đồng nhất với `src/types.ts`.
- Dashboard và simulator đang khởi tạo default state ở nhiều nơi.
- Pricing tier trong code (`Lite/Pro/Enterprise`) chưa khớp product blueprint (`Free/Lite/Pro`).
- Order hiện chỉ có status cấp order; technical blueprint dự kiến trạng thái theo từng `order_item`.

## PWA

Manifest đã có. Service worker, cache strategy, offline fallback và update flow chưa được triển khai, vì vậy hiện chưa thể coi là PWA production hoàn chỉnh.
