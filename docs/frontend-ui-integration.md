# Frontend UI integration map

**Purpose:** Map the checked-in React/Vite prototype to approved requirements. UI state uses browser persistence and mock data. Every business write must move to a Cloud Function.

## Status table

| User-facing area | UI status | Frontend route or file | REQ/NFR | Backend integration contract |
|---|---|---|---|---|
| Landing and introduction | DONE | `/`, `/introduce`; `LandingPage`, `IntroducePage` | None | None |
| Simulator launcher | DONE | `/simulator`; `SimulatorIndex` | None | None |
| Owner phone sign-in and first Tenant | PARTIAL | `/login`, `/register`; `LoginPage`, `RegisterPage` | REQ-AUTH-001, REQ-TEN-001 | Firebase Auth OTP; `tenant-create`; current identity and membership query |
| Tenant switch and Staff access | PARTIAL | `SimulatorLayout`, `StaffPage`, `StaffView` | REQ-TEN-001, REQ-AUTH-002, REQ-ACL-001 | membership query; `tenant-select-active`; Staff PIN command; authorization decision |
| Dashboard shell and navigation | PARTIAL | `DashboardLayout`, `RootLayout`, `AuthLayout` | REQ-TEN-001, REQ-I18N-001 | authenticated active-Tenant context; locale state; route guards |
| Owner menu | PARTIAL | `/dashboard/menu`; `MenuPage`, `OwnerView` | REQ-CAT-001, REQ-CAT-002 | Catalog create/update/archive/template commands; private menu query; public projection listener |
| Tables and QR Table link | PARTIAL | `/dashboard/tables`; `TablesPage`, `OwnerView` | REQ-TBL-001, NFR-SEC-002 | Table create/update/archive/regenerate commands; tenant table query; public-token resolver |
| Owner settings | PARTIAL | `/dashboard/settings`; `SettingsPage` | REQ-CFG-001, REQ-ONB-001 | resolved Config query; allowed Tenant-settings command; Tenant query |
| Staff administration | PARTIAL | `/dashboard/staff`; `StaffPage` | REQ-AUTH-002, REQ-ACL-001 | membership create/update/disable command; membership query; PIN set command |
| Customer menu and cart | PARTIAL | `/menu/:tableId`; `PublicMenuPage`, `CustomerView` | REQ-ORD-001, REQ-ORD-004, NFR-UX-001 | public Table resolver; public menu query; cart validation and Order-create callable |
| Customer Order tracking | PARTIAL | `CustomerView` | REQ-ORD-003, NFR-RT-001 | `publicOrderTracking/{trackingToken}` listener |
| Kitchen | PARTIAL | `KitchenView`, `StaffView` | REQ-KDS-001, REQ-ORD-003 | Kitchen queue query; cooking/ready command; availability command |
| Waiter | PARTIAL | `StaffView` | REQ-WAI-001, REQ-ORD-003 | ready queue query; served command |
| Cashier | PARTIAL | `CashierView`, `StaffView` | REQ-CAS-001, REQ-ORD-002 | unpaid query; VietQR instruction query; cash/VietQR confirmation command |
| Owner onboarding and Inventory form | PARTIAL | `OwnerView` | REQ-ONB-001, REQ-ONB-002, REQ-INV-001 | checklist query/command; ingredient/recipe commands and queries |
| Owner overview | MOCKUP | `/dashboard`; `OverviewPage` | P1 REQ-RPT-001 | Reporting query; no P0 implementation |
| Owner management | MOCKUP | `/dashboard/manage`; `ManagementPage` | P1 REQ-RPT-001 | Reporting query; no P0 implementation |
| Subscription | MOCKUP | `/dashboard/subscription`; `SubscriptionPage` | P2 REQ-SUB-001 | Subscription command/query; no P0 implementation |
| Solo | MOCKUP | `/simulator/solo`; `SoloOperatorView` | P1 REQ-SOLO-001 | Module contracts only; no P0 implementation |
| AI assistant | MOCKUP | `OwnerView`, `SoloOperatorView` | P1 REQ-AI-001 | server-side read-only AI query; no P0 implementation |
| Loyalty and Promotion | MOCKUP | `CustomerView`, `CashierView`, `SettingsPage`, `SoloOperatorView` | P2 REQ-LOY-001, REQ-PRO-001 | Loyalty/Promotion commands and queries; no P0 implementation |
| ADMIN | MISSING | No route or component | REQ-ADM-001, NFR-PRIV-001 | ADMIN delegated commands/queries; audited Tenant access |
| Vietnamese and English UI | MISSING | No locale provider or catalogs | REQ-I18N-001 | user locale query/command; locale catalog loader |
| Kitchen and Waiter notification | MISSING | No notification component | REQ-NOT-001, NFR-RT-001 | bounded Order event listener; mute preference query/command |
| Retention and backup status | MISSING | No route or component | NFR-RET-001, NFR-REL-001 | archive status query; backup/restore evidence query |

**Counts:** DONE 2, PARTIAL 12, MOCKUP 6, MISSING 4.

## UI already complete — integrate only

These views need adapter replacement, not a visual rebuild.

- **MenuPage:** call Catalog private-menu query; send create, update, archive, template, and availability commands. Receive public-projection result.
- **TablesPage:** call tenant-table query; send create, rename, archive, regenerate commands; use returned Table link for QR and copy actions.
- **CustomerView/PublicMenuPage:** resolve public Table token; query public menu; call cart validation and Order creation; listen to public tracking. Replace local `setOrders`.
- **KitchenView:** query Kitchen queue; call cooking and ready commands; use Catalog availability command. Replace local `setOrders`.
- **StaffView Waiter area:** query ready queue; call served command. Replace local `setOrders`.
- **CashierView:** query unpaid Orders and VietQR instructions; call cash/VietQR confirmation. Replace local `setOrders` and deletion.
- **OwnerView onboarding and Inventory forms:** call checklist, ingredient, recipe, and stock-adjustment commands; query resulting Tenant and Inventory state.

## Needs UI + BE

Each entry requires both a UI deliverable and a backend deliverable.

- **Firebase phone OTP and Tenant switch:** replace email/password mock forms; UI shows OTP, memberships, and active Tenant. Backend delivers Firebase Auth integration, membership query, and Tenant command.
- **Staff PIN policy:** replace plaintext and four-digit demo PIN flows. UI shows configurable lock state. Backend hashes PIN, enforces lockout, session version, and Rules.
- **ADMIN:** build ADMIN route and screens. Backend delivers delegated server commands, claim verification, and automatic audit.
- **i18n:** build locale provider, switch, and `vi`/`en` labels. Backend persists authenticated user locale.
- **Notification:** build visible notification and mute control. Backend provides bounded event input; web audio starts only after interaction.
- **Retention and backup:** build ADMIN status evidence UI. Backend provides archive job/status and deployment backup/restore evidence.
- **Cancellation, reversal, and refund:** build Cashier/Owner reason and correction UI. Backend composes idempotent cancellation, restoration, and compensating Payment commands.

## Document and code inconsistencies to fix

| Inconsistency | Checked-in evidence | Required correction |
|---|---|---|
| Router versus no router | `App.tsx` uses React Router; `docs/architecture.md` says no router. | Treat React Router as current implementation; mark architecture text historical. |
| Gemini claim versus rule-based AI | SRS/TECH_STACK require server Gemini adapter; `OwnerView` and `SoloOperatorView` use local rule text. | Keep UI as mockup; implement server AI only in P1. |
| Next.js blueprint versus React/Vite | TECH_STACK selects React/Vite; old blueprint references can conflict. | Keep React 19, Vite, React Router, and `vercel.json` SPA rewrite. |
| Free/Lite/Pro versus Lite/Pro/Enterprise | SRS/data model use `free|lite|pro`; `types.ts` and SubscriptionPage use Lite/Pro/Enterprise. | Use approved Free/Lite/Pro only; Enterprise remains out of scope. |
| Plaintext Staff PIN | `types.ts`, `mockData.ts`, StaffPage, and SimulatorLayout store/display PIN. | Remove browser PIN persistence; keep only server `staffPinHash`. |
| Pay-First creates pending immediately | CustomerView writes `pending` for all modes; KitchenView reads `pending`. | Keep Pay-First out of Kitchen until Payment confirms. |
| Solo Ingredient shape divergence | Solo uses `costPerUnit`/`stockAmount`; shared type uses `costPrice`/`stock`. | Use approved Inventory base-unit data model; Solo is P1. |
| Hardcoded Loyalty rates | Settings, SimulatorLayout, and Solo use local rates. | Use Config only in P2 Loyalty work. |

## Backend contract checklist

| Module | Commands | Queries | Firestore paths | Rules needed by UI |
|---|---|---|---|---|
| Config | update allowed Tenant setting; ADMIN product setting | resolved Config with source | `platform/config`, Tenant overrides | deny client writes; authorized config reads |
| Auth/Tenant | bootstrap Tenant; select active Tenant; verify Staff PIN; change membership | identity, memberships, authorization decision, checklist | `users`, `tenants`, `members`, `audit` | membership-scoped reads; no client business writes |
| Catalog | create, update, archive, template, availability | private menu; public menu | `menuItems`, `publicMenuItems`, Storage metadata | Owner member reads; public projection reads only |
| Table Access | create, rename, archive, regenerate | tenant tables; public Table resolver | `tables`, `publicTableLinks` | member Table reads; token-only public read |
| Ordering | validate cart; create Order; transition request; cancel unpaid | authorized Order queues; public tracking | `orders`, status events, idempotency, public tracking | bounded member reads; tracking-token read; no writes |
| Fulfilment | start cooking; ready; served; availability request | Kitchen queue; Waiter queue | uses Ordering paths only | role-scoped Order reads; no writes |
| Inventory | ingredient/recipe CRUD; stock adjustment; deduction/restoration plan | ingredients; recipes; movements | `ingredients`, `recipes`, `stockMovements` | Owner/Kitchen scoped reads; no writes |
| Payment | create VietQR; confirm cash/VietQR; reversal; refund | unpaid Orders; Payment result | `payments`, idempotency | Cashier scoped reads; no writes |
| ADMIN | delegated Tenant/config operations | Tenant/platform/audit status | audit and owner-module queries | claim-verified reads; no direct cross-module writes |

All callable names must follow `<module>-<action>` when published. Every write validates auth, App Check when public, tenant, role, permission, payload, transition, and idempotency.
