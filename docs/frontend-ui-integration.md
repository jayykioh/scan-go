# Frontend UI integration map

**Purpose:** Map the checked-in React/Vite prototype to approved requirements. UI state uses browser persistence and mock data. Every business write must move to a Cloud Function.

## Status table

| User-facing area | UI status | Frontend route or file | REQ/NFR | Backend integration contract |
|---|---|---|---|---|
| Landing and introduction | DONE | `/`, `/introduce`; `LandingPage`, `IntroducePage` | None | None |
| Operating pages launcher | DONE | `/operation`; `OperationIndex` | REQ-UX-002 | None |
| Owner email sign-in and first Tenant | PARTIAL | `/login`, `/register`; `LoginPage`, `RegisterPage` | REQ-AUTH-001, REQ-TEN-001 | Firebase Auth email/password; `callableAuthRegisterOwner`; `callableTenantBootstrap`; current identity and membership query |
| Tenant switch and Staff access | PARTIAL | `OperationLayout`, `StaffPage`, `StaffView` | REQ-TEN-001, REQ-AUTH-002, REQ-AUTH-005, REQ-ACL-001 | membership query; `tenant-select-active`; Staff PIN command; authorization decision. The Owner of the active Tenant reads their own `members/{uid}` once through `useActiveMembership` and enters the operating tabs without a PIN; a Staff membership keeps the PIN gate |
| Dashboard shell and navigation | PARTIAL | `DashboardLayout`, `RootLayout`, `AuthLayout` | REQ-TEN-001, REQ-AUTH-006, REQ-I18N-001 | authenticated active-Tenant context; locale state; route guards. An active non-Owner membership of the active Tenant is redirected to `/staff` |
| Owner menu | PARTIAL | `/dashboard/menu`; `MenuPage`, `OwnerView` | REQ-CAT-001, REQ-CAT-002 | Catalog create/update/archive/template commands; private menu query; public projection listener |
| Tables, zones, area assignments, reservations, and QR link | IMPLEMENTED (REQ-TBL-004, 009, 010 done 2026-10-16); reservations still pending | `/dashboard/tables`; `TablesPage`, `ZoneEditorDialog`, `TablePlanCanvas`, `OperationTableBoard` | REQ-TBL-001..004, REQ-TBL-009, REQ-TBL-010, NFR-SEC-002 | Table create/rename/archive/regenerate/configure commands; Zone editor that creates several tables, labels tables, and assigns Waiters in one save; `tableAreas` assignment command; tenant table query through the shared `tables` store slice with an `areaWaiterUids` scope for an assigned member; floor plan with drag/keyboard, area filter, list, summary, detail, and an area box per zone with its count and Waiter names; pending: staff-entered time-bounded reservations, reservation lifecycle, and combined Order/reservation state query |
| Owner settings | PARTIAL | `/dashboard/settings`; `SettingsPage` | REQ-CFG-001, REQ-ONB-001 | direct authorized read of `platform/config` and tenant `configOverrides`; resolved Config with source; `callableConfigUpdateTenant` for allowed tenant settings; Tenant query |
| Staff administration | PARTIAL | `/dashboard/staff`; `StaffPage` | REQ-AUTH-002, REQ-ACL-001 | membership create/update/disable command; membership query; PIN set command |
| Shift planning and attendance | IMPLEMENTED (REQ-HRM-004, 005 done 2026-10-17); correction screen still pending | `/dashboard/staff` (tab Ca làm); `StaffPage`, `ShiftSchedulePanel`, `ShiftScheduleDialog`; Staff surface `ShiftClockBar` in `StaffView` | REQ-HRM-001..REQ-HRM-005 | Owner-only schedule command for one interval and several Staff members in one save, cancel command, and a live week listener over `shifts`/`attendance` through `workforce.adapter.ts` (Owner scope, or `staffUid == uid` for a Staff member) joined by `shiftId` for each Shift's state and minutes plus a per-Staff weekly total; the Staff bar shows today's assigned Shift with Nhận ca / Tan ca and counts from the server-stamped clock in. Pending: a correction request/approval screen, and a clock-in window rule |
| Customer menu and cart | PARTIAL | `/menu/:tableId`; `PublicMenuPage`, `CustomerView` | REQ-ORD-001, REQ-ORD-004, NFR-UX-001 | public Table resolver; public menu query; cart validation and Order-create callable |
| Customer Order tracking | PARTIAL | `CustomerView` | REQ-ORD-003, NFR-RT-001 | `publicOrderTracking/{trackingToken}` listener |
| Kitchen | PARTIAL | `KitchenView`, `StaffView`, `InventoryPanel` | REQ-KDS-001, REQ-KDS-002, REQ-ORD-003, REQ-INV-001, REQ-INV-008, REQ-INV-009, REQ-UX-003 | Three tabs: queue plus the per-table floor plan from the `tables` store slice with the cooking/ready command; menu state grouped by category through the availability command; ingredient in/out with a waste reason through the adjust command. The Kho screen pages the ingredient list at ten rows, selects one or many ingredients for one waste submission with a shared reason and note, and has its own "Báo cáo kho" view of the append-only change report with a waste-only filter |
| Waiter | PARTIAL | `StaffView`, `WaiterTableDialog` | REQ-WAI-001, REQ-WAI-002, REQ-ORD-003, REQ-ORD-005, REQ-UX-003 | ready queue query; served command; per-table floor plan that pings a table with ready dishes and opens one table dialog — serve the table's dishes, add dishes through the locked searchable `StaffOrderEntry` (`callableOrderStaffCreate`, now also allowed for the `waiter` role on a dine-in Order), and, for a Waiter that also carries `cashier`, the till's invoice sheet through `CashierView`'s `focusTableId` mode; dishes and tables come from the shared tenant store |
| Cashier | PARTIAL | `CashierView`, `StaffView` | REQ-CAS-001, REQ-CAS-003, REQ-ORD-002, REQ-UX-003, REQ-PAY-006 | unpaid query; VietQR instruction query built from the shop's own stored bank account; cash/VietQR confirmation command; per-table floor plan that opens that table's invoice dialog — open bills first, the returning customer's name resolved from `loyaltyMemberId` through the Loyalty member list, then the settled invoices at five rows a page with their immutable Payment record read directly from `payments`. The PayOS link action is removed (ADR 0022) and a stored pending link is no longer a concept |
| Owner settings | PARTIAL | `SettingsPage` | REQ-CFG-001, REQ-AI-007, REQ-AI-008, REQ-FDB-008, REQ-PAY-005 | threshold form for `revenueDropPercent` and `lowMarginPercent`. Not yet built: the shop's receiving bank account (REQ-PAY-005) and `feedbackTopicAlertCount`/`feedbackTopicWindowHours`. The AI provider and monthly budget are gone from the schema entirely (ADR 0024) |
| Owner onboarding and Inventory form | PARTIAL | `OwnerView` | REQ-ONB-001, REQ-ONB-002, REQ-INV-001 | checklist query/command; ingredient/recipe commands and queries |
| Owner overview | MOCKUP | `/dashboard`; `OverviewPage` | P1 REQ-RPT-001 | Reporting query; no P0 implementation |
| Owner management | MOCKUP | `/dashboard/manage`; `ManagementPage` | P1 REQ-RPT-001 | Reporting query; no P0 implementation |
| Subscription | MOCKUP | `/dashboard/subscription`; `SubscriptionPage` | P2 REQ-SUB-001 | Subscription command/query; no P0 implementation |
| Solo | MOCKUP | `/operation` (not listed); `SoloOperatorView` | P1 REQ-SOLO-001 | Module contracts only; no P0 implementation |
| Owner warnings panel | NOT BUILT | — | REQ-AI-001, REQ-AI-007, REQ-AI-008, REQ-AI-010 | the replacement for the chat: live warnings through `callableAiListWarnings` plus stored `aiInsights` read directly. The floating chat widget and the client AI adapter are deleted (ADR 0024, plan A-01/A-03) |
| Promotion | IMPLEMENTED | `/dashboard/promotions`; `PromotionsPage`; `CustomerView` cart; `SettingsPage` quick discount | P2 REQ-PRO-001…REQ-PRO-006 | Promotion upsert/status/list/evaluate callables, direct `promotions` read, AI campaign suggest/approve/measure |
| Loyalty | PARTIAL | `CustomerView` (mock OTP sheet), `SettingsPage` | P2 REQ-LOY-001, REQ-PRO-004 | Loyalty callables exist and now back `pointsRedemption`; the Customer OTP sheet is still a demo and changes no total |
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

- **Config resolution:** wire `SettingsPage` to direct authorized reads of `platform/config` and tenant `configOverrides`; show resolved values with source; send allowed tenant settings through `callableConfigUpdateTenant`. ADMIN platform command stays P0-001.
- **Firebase email/password and Tenant switch:** wire the register and login forms to Firebase Auth email/password (ADR 0007); UI shows memberships and active Tenant. Backend delivers `callableAuthRegisterOwner`, membership query, and Tenant command.
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
| Rule text versus a model | SRS/TECH_STACK require **no** model at all: analysis is deterministic (ADR 0024). `OwnerView` and `SoloOperatorView` already use local rule text, so they are consistent with the target rather than a mockup of something else. | Keep the local rule text; the Owner warnings panel is the one new surface. |
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
| Auth/Tenant | register Owner; bootstrap Tenant; select active Tenant; verify Staff PIN; change membership | identity, memberships, authorization decision, checklist | `users`, `tenants`, `members`, `audit` | membership-scoped reads; no client business writes |
| Catalog | create, update, archive, template, availability | private menu; public menu | `menuItems`, `publicMenuItems`, Storage metadata | Owner member reads; public projection reads only |
| Table Access | create, rename, archive, regenerate | tenant tables; public Table resolver | `tables`, `publicTableLinks` | member Table reads; token-only public read |
| Ordering | validate cart; create Order; transition request; cancel unpaid | authorized Order queues; public tracking | `orders`, status events, idempotency, public tracking | bounded member reads; tracking-token read; no writes |
| Fulfilment | start cooking; ready; served; availability request | Kitchen queue; Waiter queue | uses Ordering paths only | role-scoped Order reads; no writes |
| Inventory | ingredient/recipe CRUD; stock adjustment; deduction/restoration plan | ingredients; recipes; movements | `ingredients`, `recipes`, `stockMovements` | Owner/Kitchen scoped reads; no writes |
| Payment | create VietQR; confirm cash/VietQR; reversal; refund | unpaid Orders; Payment result | `payments`, idempotency | Cashier scoped reads; no writes |
| ADMIN | delegated Tenant/config operations | Tenant/platform/audit status | audit and owner-module queries | claim-verified reads; no direct cross-module writes |

All callable names must follow `<module>-<action>` when published. Every write validates auth, App Check when public, tenant, role, permission, payload, transition, and idempotency.
