# ScanGo Lite — Features

## Order Lifecycle
`pending → cooking → ready → served → paid`

## Actor Views

### Owner (`src/components/OwnerView.tsx`)
| Tab | Feature |
|-----|---------|
| Báo cáo | Revenue, net profit, cost ratio, order/table stats |
| Món ăn | Add/edit/delete menu items, categories, pricing |
| Bàn QR | Add/edit/delete tables, simulate NFC tag scan |
| Nhân viên | Add/list/toggle/delete staff accounts with role checkboxes (Bếp/Phục vụ/Thu ngân) |
| Trợ lý AI | Chat with Gemini via `@google/genai`, context-aware business Q&A |

### Cashier (`src/components/CashierView.tsx`)
- PIN login screen
- List unpaid orders grouped by table
- Settle order → accumulates loyalty points (1pt/10k VND)
- Cancel order
- View loyalty member list with points/visits

### Kitchen (`src/components/KitchenView.tsx`)
- PIN login screen
- Cooking queue sorted by time (oldest first)
- Accept order (`pending → cooking`)
- Mark as ready (`cooking → ready`) with call-waiter notification
- Toggle item stock (inStock)

### Staff (`src/components/StaffView.tsx`)
- PIN login matching `StaffAccount.pin`
- Adaptive tab bar — only shows tabs matching staff's assigned roles
- **Bếp tab** — embedded KitchenView (skip login)
- **Phục vụ tab** — list ready orders grouped, "Đã phục vụ" button → `served` status
- **Thu ngân tab** — embedded CashierView (skip login)
- Single role → no tab bar, just the content
- Logout button in header

### Solo (`src/components/SoloOperatorView.tsx`)
- Merges owner+cashier+kitchen in one screen
- Accept/cook/ready orders, settle/cancel, stock toggle

### Customer (`src/components/CustomerView.tsx`)
- Select table (simulated)
- Browse menu by category, add modifiers, add to cart
- Cart review, apply promo code, place order
- Track order via 4-step progress: Nhận đơn → Đang nấu → Bưng lên → Đã phục vụ
- Loyalty registration by phone number

## Key Flows

### Order Flow (Pay-Later)
1. Customer orders via phone → `pending`
2. Kitchen accepts → `cooking`
3. Kitchen marks ready → `ready`
4. Waiter serves → `served`
5. Cashier settles → `paid`

### Staff Account Flow
1. Owner creates staff in "Nhân viên" tab (name, PIN, roles)
2. Staff logs in via StaffView with PIN
3. View adapts to roles automatically
4. Owner can toggle active/inactive or delete

## Type Definitions (`src/types.ts`)
- `OrderStatus` — `'pending' | 'cooking' | 'ready' | 'served' | 'paid'`
- `Order` — id, tableId, items, total, status, timestamp, customerPhone, paymentMode
- `MenuItem` — id, name, price, costPrice, category, description, inStock
- `StaffAccount` — id, name, pin, roles, isActive
- `TableConfig` — id, name
- `LoyaltyMember` — phone, name, points, totalSpent, visits
- `TenantConfig` — shopName, industry, pricingTier, paymentMode, loyalty*, discount*
