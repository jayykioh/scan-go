# Table Access Module

- Serves: REQ-TBL-001, REQ-TBL-002, REQ-NFC-001, NFR-SEC-002
- Owns: Tables, floor-plan layout, QR and NFC links, token issue and revocation
- Does not own: Menu content, Orders, or table service state (Ordering derives that from Orders)

## Commands
- Create, rename, and archive a table.
- Configure the floor-plan layout of a table: area, seat count, and grid position.
- Generate or regenerate a table token.
- Record that an NFC tag was written.

## Queries
- List active tenant tables.
- Resolve one active public token to tenant and table context.

## Screens
- `/dashboard/tables` (Sơ đồ bàn) reads the `tables` slice of the shared tenant store
  (`src/data/tenantStore.ts`), never its own listener: the store waits for the restored Auth
  session and the resolved active Tenant before it subscribes, so opening or reloading the page by
  URL shows the real tables. The screen paints four separate states through the pure rule in
  `src/pages/dashboard/tableListView.ts` — loading, error, empty, list — and a command failure is
  shown beside the list instead of replacing it.
- The plan view draws every table on a scaled 12×10 grid: drag a tile or move it with the arrow
  keys, filter by area, and read each table's service state (see REQ-TBL-003 below). The list view
  groups the same tables by area.
- Evidence: `docs/feedback/harness/verify-tables-page.mjs` (27 checks, real Firestore).

## Rules
- QR and NFC use the same opaque random table link.
- Tokens have no default expiry.
- Regeneration atomically revokes the old token.
- Public token data contains no Cost, Staff, payment, or private tenant data.
- Order submission revalidates the current token version.
- A layout position is a grid cell inside `TABLE_FLOOR_COLUMNS` × `TABLE_FLOOR_ROWS`, validated in
  the contract. The server rejects anything outside it, and a rejected command never touches the
  stored layout.
- The layout is presentation only. It does not affect the public link, the token, or any price.

## Table service state (REQ-TBL-003)

The state of a table is derived from Orders, so Ordering owns the read:
`callableOrderListTableStatus` folds the tenant's open Orders into one entry per busy table.
Table Access draws it; it never computes it from its own data.

- Precedence, most urgent first: `awaitingPayment` (a `served` Order with no settled payment) →
  `foodReady` (a `ready` Order) → `occupied` (any open Order) → `free`.
- The projection carries only `tableId`, `state`, three counts, and `oldestActiveOrderAt`: no
  money, no Customer identity, no Order line. Any active member may read it, so a Waiter board can
  show the same room without widening a reduced Staff role's view (NFR-SEC-001).
- The screen polls it every ten seconds and pauses while the tab is hidden. A snapshot computed
  from source was chosen over a server-maintained projection so it cannot drift when a transition
  path is missed (ADR 0018).

## Contracts
- Emits `TableCreated`, `TableRenamed`, `TableConfigured`, `TableArchived`, and
  `TableTokenRegenerated`.
