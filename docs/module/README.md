# ScanGo Module Index

Each module owns its writes and exposes explicit commands, queries, and events. UI views compose modules but never bypass module rules.

| Module | Document | Primary data owner |
|---|---|---|
| Auth | [auth.md](auth.md) | Authentication and Staff sessions |
| Tenant | [tenant.md](tenant.md) | Tenants and memberships |
| Config | [config.md](config.md) | Resolved product settings |
| Catalog | [catalog.md](catalog.md) | Menu and public menu projection |
| Inventory | [inventory.md](inventory.md) | Ingredients, recipes, stock movements |
| Table Access | [table-access.md](table-access.md) | Tables, QR, NFC, and tokens |
| Ordering | [ordering.md](ordering.md) | Orders and Customer tracking |
| Fulfilment | [fulfilment.md](fulfilment.md) | Kitchen and Waiter transitions |
| Payment | [payment.md](payment.md) | Settlement, reversal, and refund |
| Promotion | [promotion.md](promotion.md) | Promotion eligibility and selection |
| Loyalty | [loyalty.md](loyalty.md) | Members and point ledger |
| Reporting | [reporting.md](reporting.md) | Rebuildable daily stats |
| AI | [ai.md](ai.md) | Read-only warnings and explanations |
| Subscription | [subscription.md](subscription.md) | Free, Lite, and Pro entitlements |
| ADMIN | [admin.md](admin.md) | Platform operations and unrestricted access |

Shared data rules are in `docs/data-model.md`. Technology rules are in `docs/TECH_STACK.md` and `docs/RULES_FIREBASE.md`.

## Default access matrix

| Capability | ADMIN | Owner | Cashier | Kitchen | Waiter | Solo | Customer |
|---|---|---|---|---|---|---|---|
| Any tenant and platform setting | Full | Own tenants | No | No | No | Own tenant | No |
| Menu and Inventory management | Full | Full | No | Availability only | No | Full | Public active items only |
| Order creation | Full | Full | No | No | No | Full | Valid table token |
| Kitchen transitions | Full | Full | No | Yes | No | Yes | No |
| Served transition | Full | Full | No | No | Yes | Yes | No |
| Confirm or cancel unpaid Orders | Full | Full | Yes | No | No | Yes | No |
| Reversal or refund | Full | Full | Optional permission | No | No | Full | No |
| Loyalty | Full | Full | Yes | No | No | Full | Own verified profile |
| Reports and AI | Full | Full | No | No | No | Full | No |
| Customer phone | Full | Configured | Configured | Configured | Configured | Configured | Own value |

Owner may reduce Staff defaults. Owner may add only permissions marked optional for that role by ADMIN configuration.
