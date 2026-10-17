# ScanGo Glossary

This glossary follows `docs/context.md` and the approved SRS.

| Term | Meaning |
|---|---|
| ADMIN | The ScanGo system owner with unrestricted platform and tenant access. |
| Warning | One deterministic finding computed in code, with a severity, a Vietnamese message, the source ids it cites, and the arithmetic formula behind it. Shown on the Owner warnings panel (ADR 0024). |
| Insight | One weekly finding with department, priority, period, source data, confidence, and suggested action. |
| Weekly analysis | A scheduled per-tenant run that ranks operational findings in deterministic code. It calls no model (ADR 0024). |
| AI module | The module that computes warnings, weekly insights, and feedback topic classification. It keeps the `ai` name for stability although no model is involved (ADR 0024). |
| Feedback ticket | A Customer review or issue tracked from `received` to `resolved`. |
| Shift (Ca làm) | A scheduled work period for one Staff member on one date, planned by the Owner. Several Staff members on one interval are several Shifts; a Staff member never chooses their own. |
| Nhận ca | The Staff member's explicit acceptance of an assigned Shift. It is the clock in, the store stamps the instant, and worked time counts from there (ADR 0026). |
| Attendance record | One clock in/out record, keyed to the accepted Shift, with correction state and history. It holds minutes, never a wage. |
| Stock count | A recorded physical quantity used to find variance and support loss review. |
| Cashier | A Staff role that settles or cancels orders and handles Loyalty operations. |
| Cost | Deterministic ingredient cost calculated from recipe quantities and ingredient unit values. |
| Customer | A person who opens a table menu, submits an order, and tracks its status. |
| Daily stats | Rebuildable tenant totals stored by local `yyyymmdd` for fast reports. |
| Gross profit | Paid revenue minus Cost for the selected period. |
| Kitchen | A Staff role that processes pending and cooking orders and controls item availability. |
| Loyalty | Verified-phone points, visits, and redemption behavior configured by Owner. |
| Order lifecycle | `pending → cooking → ready → served → paid`. |
| Owner | A user who owns or manages one or more tenants. |
| Pay-First | Payment confirmation is required before Kitchen receives the order. |
| Pay-Later | Kitchen receives the order before Cashier settles payment. |
| Promotion | A configured rule that changes an eligible cart total deterministically, or gives a free item. |
| Promotion benefit | What a Promotion gives: `percentOff`, `fixedAmount`, `buyXGetY`, `freeItem`, `bundlePrice`, or `pointsRedemption`. |
| Buy X get Y | A Promotion that charges `buyQuantity` units normally and rewards `getQuantity` units. Mua 1 tặng 1 is the same-item case. |
| Bundle price | A Promotion that charges every group of N units from a set at one fixed price (combo). |
| Gift line | An Order line a Promotion rewarded: zero line total, the menu price recorded, and a real Cost. |
| Happy hour | A Promotion condition that applies only inside a tenant-local time window, which may cross midnight. |
| Quick discount | The single reserved Promotion (`quick-discount`, `source: quick`) that the Settings page edits as a one-field shortcut. |
| Public menu item | A public-safe active menu projection without Cost, recipe, or private metadata. |
| Public table link | The minimal public token projection that resolves one active tenant table. |
| Reversal | A linked compensating record that corrects a paid transaction without deleting it. |
| Solo | A combined Owner, Cashier, and Kitchen workflow. |
| Staff | A tenant user with assigned Cashier, Kitchen, or Waiter roles and reduced permissions. |
| Subscription | The Free, Lite, or Pro plan that controls tenant feature access. |
| Table Access | The module that issues, validates, revokes, and regenerates table links. |
| Table link | A revocable public link used by QR and NFC for one tenant table. |
| Floor plan (sơ đồ bàn) | The Owner screen that places every table on a 12×10 grid, grouped and filtered by area, and shows each table's service state. |
| Area (khu vực) | A free-text room label on a table, such as `Tầng 1` or `Sân vườn`. A label for grouping and filtering, not a container the table is trapped in. |
| Seats (số ghế) | The seat count the Owner sets on a table. Presentation only; it never affects pricing or capacity limits. |
| Table position | A table's cell on the floor grid, stored as integer `x`/`y` rather than pixels, so the same arrangement renders the same on every screen. |
| Table service state | A table's display state combines live Order state with effective reservations: `reserved` means a future booking, not current occupancy; an arrived booking or open Order shows current occupancy, while `foodReady` and `awaitingPayment` keep their existing urgency. |
| Reservation | A staff-entered booking for one table and a tenant-local time interval, separate from Order, Payment, and preparation; Customer self-service, deposits, and pre-orders remain deferred. |
| Waiter area assignment | One or more active Waiter UIDs assigned by the Owner to an area; it helps show service responsibility but does not grant or change permissions. Stored in `tableAreas` and projected onto the table and the member (ADR 0025). |
| Zone (khu vực) | A named area of the shop — `Sân vườn`, `Tầng 2`. It is the `area` label of its tables plus one assignment document; the plan draws it as the region its own tables occupy, with the table count and assigned Waiters. |
| Virtual table (bàn ảo) | A table authored inside the zone dialog that exists only on screen until the Owner saves; saving creates it in a free floor cell with the zone's label. |
| Area scope | The restriction that a Staff member assigned to areas reads only those areas' tables, ready dishes, and new dine-in Orders. A member with no assignment keeps the tenant-wide view; Owners and ADMIN are never restricted (REQ-TBL-010). |
| Awaiting payment | A table whose Order is `served` but not settled. The most urgent state on the floor plan. |
| Tenant | One isolated shop workspace and its data. |
| Tracking token | An opaque Order-specific token that lets Customer read only one tracking projection. |
| VietQR | The QR payment payload used for bank-transfer instructions. It is built from the receiving bank account the Owner stores on the Tenant, so the money reaches the shop's own account; the Cashier confirms the transfer manually (ADR 0022). |
| Waiter | A Staff role that views ready orders and marks them served. |
| Fulfilment | The Kitchen and Waiter work that moves an order toward service. |
