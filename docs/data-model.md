# ScanGo Firestore Data Model

| Field | Value |
|---|---|
| Version | 1.0 |
| Date | 2026-09-12 |
| Status | Approved |
| Database | Firestore Native mode |

## 1. Invariants
- Every business document belongs to one tenant.
- `activeTenantId` selects UI context but never proves authorization.
- Clients read through Security Rules and write business data only through Cloud Functions.
- Money uses integer VND fields ending in `Vnd`.
- Timestamps use server UTC values ending in `At`.
- IDs are random Firestore IDs unless a stable key is specified.
- Mutable documents carry `version`, `createdAt`, and `updatedAt`.
- Referenced records use `archivedAt`; paid records use compensating entries.
- Each retryable write uses a tenant-scoped idempotency key.

## 2. Global collections

### `users/{uid}` — Tenant
| Field | Type | Rule |
|---|---|---|
| `email` | string | Firebase Auth email; Owner identity |
| `displayName` | string or null | User display name |
| `locale` | `vi | en` | User preference |
| `activeTenantId` | string or null | Navigation only |
| `createdAt`, `updatedAt` | timestamp | Server values |

### `platform/config` — Config
Stores versioned PIN, retry, schedule, retention, Loyalty, feature, and plan defaults. It also stores allowed tenant override keys. It never stores memory, timeout, region, concurrency, or secrets.

### `publicTableLinks/{token}` — Table Access
| Field | Type | Rule |
|---|---|---|
| `tenantId`, `tableId` | string | Table context only |
| `tableName` | string | Public label |
| `tokenVersion` | integer | Rotation check |
| `isActive` | boolean | Revocation gate |
| `createdAt`, `revokedAt` | timestamp | Server values |

The token is an opaque random value. It has no default expiry. Regeneration revokes the old document.

### `publicOrderTracking/{trackingToken}` — Ordering
Contains only `tenantId`, `orderId`, table label, item summary, total, status, and status timestamps. Customer never reads the tenant orders collection. Each order gets a separate opaque token.

## 3. Tenant root

### `tenants/{tenantId}` — Tenant and Config
| Field | Type |
|---|---|
| `shopName` | string |
| `industry` | approved industry enum |
| `timezone` | IANA timezone; default `Asia/Ho_Chi_Minh` |
| `pricingTier` | `free | lite | pro` |
| `paymentMode` | `payFirst | payLater` |
| `onboardingChecklist` | map of approved steps and completion timestamps |
| `configOverrides` | validated allowed override map |
| `archivedAt` | timestamp or null |

### `tenants/{tenantId}/members/{uid}` — Auth and Tenant
| Field | Type |
|---|---|
| `membershipType` | `owner | staff` |
| `roles` | array of named roles |
| `permissions` | reduced named permission set |
| `isActive` | boolean |
| `staffPinHash` | string or null; never plaintext |
| `pinFailedAttempts` | integer |
| `pinLockedUntil` | timestamp or null |
| `sessionVersion` | integer for revocation |
| `lastLoginAt` | timestamp or null |

ADMIN identity is a server-verified platform claim. ADMIN is not copied into each membership.

## 4. Catalog and Inventory

### `tenants/{tenantId}/menuItems/{itemId}` — Catalog private source
| Field | Type |
|---|---|
| `name`, `description`, `category`, `type` | string |
| `priceVnd`, `costPriceVnd` | integer |
| `imagePath` | string or null |
| `modifierGroups` | validated array |
| `recipeId` | string or null |
| `isAvailable` | boolean |
| `stockCount` | integer or null |
| `archivedAt` | timestamp or null |

### `tenants/{tenantId}/publicMenuItems/{itemId}` — Catalog public projection
Contains only public-safe name, description, category, type, `priceVnd`, image URL, modifiers, and availability metadata. Cost, recipe, stock quantity, and internal IDs are excluded. Only active and available items exist here. Catalog updates this projection through Cloud Functions.

### `tenants/{tenantId}/ingredients/{ingredientId}` — Inventory
| Field | Type |
|---|---|
| `name` | string |
| `baseUnit` | `g | ml | unit` |
| `unitCostVnd` | integer per base unit |
| `stockQuantity` | integer base units |
| `lowStockThreshold` | integer base units |
| `isActive` | boolean |
| `archivedAt` | timestamp or null |

Kilogram and litre are input conveniences. The server converts them to gram and millilitre before storage.

### `tenants/{tenantId}/recipes/{recipeId}` — Inventory
Stores `menuItemId`, ingredient IDs, base-unit quantities, calculated Cost, Cost version, and archive metadata.

### `tenants/{tenantId}/stockMovements/{movementId}` — Inventory ledger
Stores ingredient, signed base-unit quantity, reason, order reference, actor, idempotency key, and server timestamp. It supports exact deduction, restoration, and reconciliation. Recorded stock-in, waste, and manual adjustments are movements with a reason.

### `tenants/{tenantId}/stockCounts/{countId}` — Inventory count
Stores ingredient, counted base-unit quantity, expected quantity from stock-in, deduction, and restoration, computed variance, reason, actor, and server timestamp. It supports loss review without changing paid records.

## 5. Table Access and Ordering

### `tenants/{tenantId}/tables/{tableId}` — Table Access
Stores name, active state, token version, active token reference, QR payload metadata, NFC written state, and archive metadata. Secrets do not appear in public tenant reads.

### `tenants/{tenantId}/orders/{orderId}` — Ordering source
| Field | Type |
|---|---|
| `tableId`, `tableNameSnapshot` | string |
| `status` | `pending | cooking | ready | served | paid | cancelled` |
| `paymentMode` | `payFirst | payLater` |
| `paymentMethod` | `cash | vietQr` or null |
| `items` | immutable item snapshots |
| `subtotalVnd`, `totalVnd` | integer |
| `promotionSnapshot` | map or null |
| `loyaltyMemberId` | string or null |
| `trackingTokenHash` | string |
| `idempotencyKey` | string |
| lifecycle timestamps | server timestamps |
| `cancellationReason` | string or null |

Each item stores `lineId`, `menuItemId`, name, modifiers, `unitPriceVnd`, quantity, `lineTotalVnd`, `unitCostVnd`, and `lineCostVnd`. Order documents never store raw Customer phone values.

### `tenants/{tenantId}/orders/{orderId}/statusEvents/{eventId}`
Append-only status history with actor, previous status, new status, reason, request ID, and timestamp.

### `tenants/{tenantId}/idempotency/{key}`
Stores command, request hash, result reference, status, and expiry. Reusing a key with another request hash fails.

## 6. Payment and Loyalty

### `tenants/{tenantId}/payments/{paymentId}` — Payment
Stores order, amount, method, status, VietQR payload snapshot, provider reference, external event ID, linked payment, actor, idempotency key, and lifecycle timestamps. Confirmed records are immutable. Reversal and refund use linked compensating records.

### `tenants/{tenantId}/loyaltyMembers/{memberId}` — Loyalty
Stores normalized `+84` phone, display name, verified state, point balance, paid total, visit count, and timestamps. Orders reference `memberId` only. Server permission filters phone visibility.

### `tenants/{tenantId}/loyaltyTransactions/{transactionId}`
Append-only earn, redeem, reverse, and configurable welcome-point entries. Welcome points default to zero and Owner can change the allowed tenant setting.

### `tenants/{tenantId}/promotions/{promotionId}` — Promotion
Stores active period, eligibility rule, benefit rule, priority, and archive metadata. The server selects one best eligible promotion. v1 never stacks promotions.

## 7. Reporting and Audit

### `tenants/{tenantId}/dailyStats/{yyyymmdd}` — Reporting
| Field | Update source |
|---|---|
| `createdOrderCount` | Order created |
| `cancelledOrderCount` | Unpaid order cancelled |
| `paidOrderCount` | Payment confirmed |
| `reversedOrderCount`, `refundedOrderCount` | Compensating payment |
| `revenueVnd`, `costVnd`, `grossProfitVnd` | Paid financial events only |
| `version`, `updatedAt` | Server transaction |

The ID uses tenant-local `yyyymmdd`, such as `20260912`. Source timestamps remain UTC.

### `tenants/{tenantId}/dailyStats/{yyyymmdd}/items/{itemId}`
Stores paid quantity, revenue, Cost, gross profit, reversal, and refund totals for one item.

### `tenants/{tenantId}/dailyStats/{yyyymmdd}/tables/{tableId}`
Stores created, cancelled, paid, revenue, Cost, and gross profit totals for one table.

Daily stats update in the same authoritative command transaction where practical. Each source effect has an idempotency key. Rebuild tooling can replace a day from immutable orders and payments.

The initiating command composes mutation plans from each owning module before one atomic commit. A module never writes another module's document directly.

### `tenants/{tenantId}/audit/{eventId}` — ADMIN and module audit
Append-only actor, actor type, role, action, target, request ID, optional reason, metadata, and server timestamp. Audit stores create, update, and delete events only. ADMIN changes require no approval prompt but always create an application audit event; ADMIN reads are not audited (ADR 0010).

### `tenants/{tenantId}/aiInsights/{insightId}` — AI
Stores department, priority, period start and end, source references, confidence, missing-data notes, status (`new`, `acknowledged`, `done`), and timestamps. It never stores raw model text.

### `tenants/{tenantId}/aiUsage/{usageId}` — AI and Config
Stores provider, model, token counts, estimated cost, budget reference, call purpose, and server timestamp. It supports per-tenant budget enforcement and provider evaluation.

### `tenants/{tenantId}/feedback/{feedbackId}` — Feedback
Stores rating or issue text, optional Order reference, verification state, masked analysis input, topic tags, actor, and timestamps. Raw text is permission-controlled.

### `tenants/{tenantId}/feedbackTickets/{ticketId}` — Feedback
Stores state (`received`, `in_progress`, `resolved`), owner, priority, linked feedback IDs, and an append-only history of state, actor, time, and reason.

### `tenants/{tenantId}/shifts/{shiftId}` — Workforce
Stores Staff member, date, start and end time, role, and audit metadata. Times store as UTC and render in tenant time. Two overlapping Shifts for one Staff are rejected.

### `tenants/{tenantId}/attendance/{recordId}` — Workforce
Stores Staff member, clock in and clock out, source, correction state (`none`, `pending`, `approved`), requested values, approver, and history. It never stores payroll values.

## 8. Required indexes
| Collection | Composite order or filter |
|---|---|
| `orders` | `status`, `createdAt desc` |
| `orders` | `tableId`, `createdAt desc` |
| `orders` | `paidAt desc` |
| `payments` | `orderId`, `createdAt desc` |
| `payments` | `status`, `createdAt desc` |
| `audit` | `actorUid`, `createdAt desc` |
| `loyaltyMembers` | normalized phone equality |
| `promotions` | `isActive`, `startsAt`, `endsAt` |
| `dailyStats` | document ID `yyyymmdd` range for week and month reads |
| `aiInsights` | `status`, `periodStart desc` |
| `aiUsage` | `tenantId`, `createdAt desc` |
| `feedback` | `createdAt desc`, `verificationState` |
| `feedbackTickets` | `state`, `updatedAt desc` |
| `shifts` | `staffUid`, `date` |
| `attendance` | `staffUid`, `clockInAt desc` |
| `stockCounts` | `ingredientId`, `createdAt desc` |

All queries remain tenant-scoped. Public listeners read only one table link, one tracking token, or bounded public menu items.

## 9. Transaction boundaries
- Order creation validates table token, current menu snapshots, Promotion, and idempotency before writes.
- Cooking transition deducts Inventory and creates stock movements once.
- Cancellation restores eligible Inventory and updates daily counters once.
- Payment confirmation writes immutable Payment, marks Order paid, updates Loyalty, and updates financial daily stats once.
- Reversal or refund writes a compensating Payment and adjusts Loyalty and daily stats once.
- Table token regeneration creates the new token and revokes the old token atomically.
- AI analysis writes `aiInsights` and `aiUsage` without changing any business state.
- Attendance correction approval records the new state and its history in one transaction.
- Stock count computes variance from recorded movements and never rewrites paid records.

## 10. Retention and migration
- Configuration defaults to five years for eligible product data.
- Paid orders and payment records move to archive storage instead of automatic deletion.
- Daily backups retain 30 days by default.
- AI usage, Insight, feedback, and attendance records are eligible product data. Raw model responses are not stored.
- Production starts with new authenticated tenant data.
- Demo localStorage data is not imported.
- Legacy `Enterprise`, plaintext PIN, conflicting Ingredient shapes, and simulated tokens are not migrated.
