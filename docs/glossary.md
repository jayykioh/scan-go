# ScanGo Glossary

This glossary follows `docs/context.md` and the approved SRS.

| Term | Meaning |
|---|---|
| ADMIN | The ScanGo system owner with unrestricted platform and tenant access. |
| AI assistant | A read-only assistant that explains Cost, gross profit, and stock warnings from tenant data. |
| Cashier | A Staff role that settles or cancels orders and handles Loyalty operations. |
| Cost | Deterministic ingredient cost calculated from recipe quantities and ingredient unit values. |
| Customer | A person who opens a table menu, submits an order, and tracks its status. |
| Gross profit | Paid revenue minus Cost for the selected period. |
| Kitchen | A Staff role that processes pending and cooking orders and controls item availability. |
| Loyalty | Verified-phone points, visits, and redemption behavior configured by Owner. |
| Order lifecycle | `pending → cooking → ready → served → paid`. |
| Owner | A user who owns or manages one or more tenants. |
| Pay-First | Payment confirmation is required before Kitchen receives the order. |
| Pay-Later | Kitchen receives the order before Cashier settles payment. |
| Promotion | A configured rule that changes an eligible cart total deterministically. |
| Reversal | A linked compensating record that corrects a paid transaction without deleting it. |
| Solo | A combined Owner, Cashier, and Kitchen workflow. |
| Staff | A tenant user with assigned Cashier, Kitchen, or Waiter roles and reduced permissions. |
| Subscription | The Free, Lite, or Pro plan that controls tenant feature access. |
| Table Access | The module that issues, validates, revokes, and regenerates table links. |
| Table link | A revocable public link used by QR and NFC for one tenant table. |
| Tenant | One isolated shop workspace and its data. |
| VietQR | The QR payment payload used for bank-transfer instructions. |
| Waiter | A Staff role that views ready orders and marks them served. |
| Fulfilment | The Kitchen and Waiter work that moves an order toward service. |
