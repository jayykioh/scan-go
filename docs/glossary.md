# ScanGo Glossary

This glossary follows `docs/context.md` and the approved SRS.

| Term | Meaning |
|---|---|
| ADMIN | The ScanGo system owner with unrestricted platform and tenant access. |
| AI assistant | A read-only assistant that explains Cost, gross profit, stock, feedback, and priority findings from tenant data. |
| AI provider adapter | The one replaceable interface the AI module calls. Default provider is Gemini; TypeSafe Jev is an evaluation candidate. |
| Jev | TypeSafe AI's System One model. It returns typed decisions with confidence and does not generate prose. |
| Insight | One weekly finding with department, priority, period, source data, confidence, and suggested action. |
| Weekly analysis | A scheduled per-tenant AI run that ranks operational findings. |
| Feedback ticket | A Customer review or issue tracked from `received` to `resolved`. |
| Shift | A scheduled work period for one Staff member on one date. |
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
| Table service state | One state per table derived from live Orders: `free` (trống), `occupied` (có khách), `foodReady` (món sẵn sàng), or `awaitingPayment` (chờ thanh toán), in that order of urgency. |
| Awaiting payment | A table whose Order is `served` but not settled. The most urgent state on the floor plan. |
| Tenant | One isolated shop workspace and its data. |
| Tracking token | An opaque Order-specific token that lets Customer read only one tracking projection. |
| VietQR | The QR payment payload used for bank-transfer instructions. |
| Waiter | A Staff role that views ready orders and marks them served. |
| Fulfilment | The Kitchen and Waiter work that moves an order toward service. |
