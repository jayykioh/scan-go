# ScanGo Lite — Context

> Historical prototype context. `docs/SRS.md` and `docs/TECH_STACK.md` supersede conflicts.

## Purpose
Contactless QR ordering system for Vietnamese F&B. Customers scan QR at table → order via phone → kitchen receives real-time → staff serves → cashier closes. No POS hardware needed.

## Target Users
- **Owner** — revenue reports, menu editor, QR table setup, AI assistant
- **Cashier** — settle/cancel orders, loyalty points
- **Kitchen** — KDS display, accept/cook/ready orders, stock toggle
- **Waiter** — view ready orders, mark as served
- **Customer** — browse menu, place order, track status, loyalty registration
- **Solo** — owner+cashier+kitchen merged for one-person operation

## Pricing Tiers
| Tier | Features |
|------|----------|
| Free | Basic ordering, 1 industry template |
| Lite | Multi-table, loyalty, promos |
| Pro | All features, AI assistant, NFC simulation |

## Payment Modes
- **Pay-First** — customer pays before order goes to kitchen
- **Pay-Later** — order cooks first, cashier settles at end

## Three Pillars
1. **No hardware** — QR code replaces NFC/Bluetooth beacons
2. **Real-time sync** — all actors see same orders instantly via React state lifting
3. **Multi-actor** — owner, cashier, kitchen, waiter, customer, solo operator
