# P0 master index — four parallel UI and backend tracks

Founder is final acceptance reviewer only. Founder has no implementation task or effort point.

| Developer | Effort | Primary ownership | UI and backend workload |
|---|---:|---|---|
| [Developer 1](p0-developer-1.md) | 21 | Config, Firebase Auth, Tenant, authorization | Five PARTIAL areas and one MISSING evidence surface |
| [Developer 2](p0-developer-2.md) | 22 | Catalog, Table Access, ADMIN | Two PARTIAL areas and ADMIN/i18n MISSING areas |
| [Developer 3](p0-developer-3.md) | 20 | Ordering and Fulfilment | Four PARTIAL areas and notification MISSING area |
| [Developer 4](p0-developer-4.md) | 21 | Inventory and Payment | Two PARTIAL areas and four MISSING durable-work/correction areas |

All tracks start with frozen contracts, Emulator fixtures, and test doubles.

## Integration sequence
1. Validate Config/Auth/Tenant, Catalog, and Table Access contract compatibility.
2. Compose one cooking transaction from Developer 3 Order mutation and Developer 4 Inventory plan.
3. Compose one Payment transaction from Developer 3 Order mutation and Developer 4 Payment result.
4. Compose cancellation, reversal, and refund with their owner-module mutation plans.
5. Run Rules, E2E, p95, archive, backup/restore, and Founder acceptance evidence.

The UI map remains `docs/frontend-ui-integration.md`: DONE 2, PARTIAL 12, MOCKUP 6, MISSING 4.
