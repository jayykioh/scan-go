# P0 master index — five parallel UI, backend, and QA tracks

Founder is final acceptance reviewer only. Founder has no implementation task or effort point.

| Developer | Effort | Primary ownership | UI and backend workload |
|---|---:|---|---|
| [Developer 1](p0-developer-1.md) | 23 | Config, Firebase Auth, Tenant, authorization | Five PARTIAL areas and one MISSING evidence surface |
| [Developer 2](p0-developer-2.md) | 13 | Catalog, Table Access, ADMIN | Two PARTIAL areas and ADMIN/i18n MISSING areas |
| [Developer 3](p0-developer-3.md) | 21 | Ordering and Fulfilment | Four PARTIAL areas and notification MISSING area |
| [Developer 4](p0-developer-4.md) | 21 | Inventory and Payment | Two PARTIAL areas and four MISSING durable-work/correction areas |
| Developer 5 | 14 | Rules QA, E2E, CI, Performance harness | Cross-cutting Firestore Rules tests, E2E suite, p95 harness, CI hardening |

All tracks start with frozen contracts, Emulator fixtures, and test doubles.
Developer 5 owns all cross-cutting Rules tests, E2E evidence, CI pipeline, and performance harness.

The shared frame is `docs/plan/p0-parallel-skeleton.md`. It lists the directory tree, the owner of each file, the contract freeze zone, and the four atomic gates.

## Integration sequence
1. Validate Config/Auth/Tenant, Catalog, and Table Access contract compatibility.
2. Compose one cooking transaction from Developer 3 Order mutation and Developer 4 Inventory plan.
3. Compose one Payment transaction from Developer 3 Order mutation and Developer 4 Payment result.
4. Compose cancellation, reversal, and refund with their owner-module mutation plans.
5. Run Rules, E2E, p95, archive, backup/restore, and Founder acceptance evidence (Developer 5 owns steps 5).

The UI map remains `docs/frontend-ui-integration.md`: DONE 2, PARTIAL 12, MOCKUP 6, MISSING 4.
