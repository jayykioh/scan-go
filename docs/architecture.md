# ScanGo Lite — Architecture

> Historical prototype architecture. `docs/SRS.md` and `docs/TECH_STACK.md` are authoritative.

## Stack
- React 19 + TypeScript + Vite
- Tailwind CSS v4
- `motion` (framer-motion) for animations
- `lucide-react` for icons
- `@google/genai` for AI assistant (OwnerView)

## State Management
All state lifted to `App.tsx` via `useState`. No router, no state library.

**App.tsx owns:**
- `tenantConfig` — shop name, industry, pricing tier, payment mode, loyalty config, promo rules
- `tables` — table list with names
- `menuItems` — menu items per industry template
- `orders` — all active orders, synced across all views
- `loyaltyMembers` — customer loyalty data
- `staffAccounts` — staff accounts with roles + PINs
- `currentStaff` — logged-in staff member (null = not logged in)
- `viewMode` — `'login' | 'owner' | 'cashier' | 'kitchen' | 'customer' | 'solo' | 'staff' | 'grid'`

## View Switching
No router. `viewMode` state controls which component renders inside `PhoneSimulator`.

## Component Tree
```
App.tsx
├── login portal (viewMode === 'login')
│   └── 6 actor cards: Owner / Cashier / Kitchen / Solo / Customer / Staff
└── main workspace (viewMode !== 'login')
    ├── header (shop name, actor label, toolbar)
    ├── simulation panel (industry switch, order list, auto-order, clear)
    └── PhoneSimulator
        ├── OwnerView (5 tabs: KPI / Menu / QR / Staff / AI)
        ├── CashierView
        ├── KitchenView
        ├── CustomerView
        ├── SoloOperatorView
        └── StaffView (PIN login → adaptive tabs)
```

## File Map
```
src/
├── App.tsx                     Root state + view routing
├── types.ts                    All shared types
├── mockData.ts                 Industry templates + mock menu/loyalty
├── main.tsx                    Vite entry point
├── index.css                   Tailwind + custom utilities
└── components/
    ├── PhoneSimulator.tsx       Phone bezel wrapper
    ├── OwnerView.tsx            Owner dashboard (1300+ lines)
    ├── CashierView.tsx          Cashier POS screen
    ├── KitchenView.tsx          KDS kitchen display
    ├── CustomerView.tsx         Customer ordering/tracking
    ├── SoloOperatorView.tsx     3-in-1 merged view
    └── StaffView.tsx            PIN login + role-based tabs
```

## Industry Templates (5 layouts)
`quan_an`, `quan_cafe`, `nha_hang`, `tiem_banh`, `tra_sua` — each has its own menu items, default payment mode, and shop name. Switching industry auto-loads the matching menu.
