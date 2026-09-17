# P0 parallel skeleton

**Purpose:** give four Developers one shared frame. The frame defines where code goes, who owns each file, and how modules meet. It prevents merge conflicts and integration surprises during parallel work.

**Source of truth:** `SRS.md`, `TECH_STACK.md`, `RULES.md`, `RULES_FIREBASE.md`, `data-model.md`, and the four `p0-developer-*.md` plans. This document adds no new requirement.

## 1. Frame rules

1. One file has exactly one owner.
2. A module exposes only its `index.ts`. Other modules import nothing else.
3. Contracts live in `shared/contracts/`. Both the web client and Functions import them.
4. Cross-module calls use a contract type plus a fixture. Never import another module's internals.
5. Business writes happen only in Cloud Functions. The client never writes business collections.
6. Change a frozen contract only with consumer notification and review.

## 2. Directory tree and owner

### Shared contract layer

| Path | Owner | Freezes |
|---|---|---|
| `shared/contracts/config.contract.ts` | Developer 1 | `ResolvedConfig` |
| `shared/contracts/identity.contract.ts` | Developer 1 | `FirebaseIdentity`, `Membership`, `StaffSession` |
| `shared/contracts/authorization.contract.ts` | Developer 1 | `AuthorizationDecision` |
| `shared/contracts/onboarding.contract.ts` | Developer 1 | `OnboardingChecklist` |
| `shared/contracts/admin.contract.ts` | Developer 2 | `AdminAuditEvent` |
| `shared/contracts/i18n.contract.ts` | Developer 2 | locale and label catalog shapes |
| `shared/contracts/catalog.contract.ts` | Developer 2 | `PublicMenuItem`, `CatalogCommandResult` |
| `shared/contracts/table.contract.ts` | Developer 2 | `TableLinkContext`, `TableTokenRotation` |
| `shared/contracts/order.contract.ts` | Developer 3 | `CartValidation`, `OrderSnapshot`, `StatusEvent` |
| `shared/contracts/fulfilment.contract.ts` | Developer 3 | queue and transition shapes |
| `shared/contracts/notification.contract.ts` | Developer 3 | `NotificationEvent` |
| `shared/contracts/inventory.contract.ts` | Developer 4 | `RecipeCost`, `InventoryMutationPlan`, `StockMovement` |
| `shared/contracts/payment.contract.ts` | Developer 4 | `VietQrInstruction`, `PaymentResult`, `ArchiveStatus` |
| `shared/contracts/correction.contract.ts` | Developer 4 | `CancellationResult`, `CompensatingPayment` |
| `shared/contracts/index.ts` | Developer 1 | barrel export |
| `shared/fixtures/*.fixture.ts` | contract owner | test data for each contract |
| `shared/config/defaults.ts` | Developer 1 | typed runtime defaults |
| `shared/errors.ts` | Developer 1 | error codes |
| `shared/validation.ts` | Developer 1 | Zod base schemas |
| `shared/money.ts` | Developer 4 | integer VND helpers |
| `shared/time.ts` | Developer 1 | UTC store and `Asia/Ho_Chi_Minh` render |

### Functions layer

| Path | Owner |
|---|---|
| `functions/src/index.ts` | Developer 1 |
| `functions/src/shared/firestore.ts` | Developer 1 |
| `functions/src/shared/audit.ts` | Developer 1 |
| `functions/src/shared/idempotency.ts` | Developer 3 |
| `functions/src/shared/appCheck.ts` | Developer 3 |
| `functions/src/shared/rateLimit.ts` | Developer 3 |
| `functions/src/modules/config/` | Developer 1 |
| `functions/src/modules/tenant/` | Developer 1 |
| `functions/src/modules/auth/` | Developer 1 |
| `functions/src/modules/catalog/` | Developer 2 |
| `functions/src/modules/table-access/` | Developer 2 |
| `functions/src/modules/admin/` | Developer 2 |
| `functions/src/modules/i18n/` | Developer 2 |
| `functions/src/modules/ordering/` | Developer 3 |
| `functions/src/modules/fulfilment/` | Developer 3 |
| `functions/src/modules/inventory/` | Developer 4 |
| `functions/src/modules/payment/` | Developer 4 |
| `functions/src/integrations/cooking.ts` | Developer 3 and 4 |
| `functions/src/integrations/payment-confirmation.ts` | Developer 3 and 4 |
| `functions/src/integrations/cancellation.ts` | Developer 3 and 4 |
| `functions/src/integrations/correction.ts` | Developer 4 and 3 |
| `functions/test/rules/*.rules.test.ts` | section owner |

A module folder may grow `schema.ts`, `handlers.ts`, and `repo.ts`. The public surface stays `index.ts`.

### Client layer

| Path | Owner |
|---|---|
| `src/data/adapters/config.adapter.ts` | Developer 1 |
| `src/data/adapters/auth.adapter.ts` | Developer 1 |
| `src/data/adapters/catalog.adapter.ts` | Developer 2 |
| `src/data/adapters/table.adapter.ts` | Developer 2 |
| `src/data/adapters/admin.adapter.ts` | Developer 2 |
| `src/data/adapters/i18n.adapter.ts` | Developer 2 |
| `src/data/adapters/ordering.adapter.ts` | Developer 3 |
| `src/data/adapters/fulfilment.adapter.ts` | Developer 3 |
| `src/data/adapters/inventory.adapter.ts` | Developer 4 |
| `src/data/adapters/payment.adapter.ts` | Developer 4 |
| `src/locales/vi.ts`, `src/locales/en.ts` | Developer 2 |

Adapters are the only client files that touch Firestore or callable functions. Pages and components call adapters.

## 3. Contract freeze zone

A contract file moves through two states.

- `DRAFT` — the owner edits freely.
- `FROZEN` — consumers depend on it. Changes need a consumer review.

Freeze steps for each contract owner:

1. Write the type and the Zod schema in the contract file.
2. Add a fixture in `shared/fixtures/`.
3. Add a consumer test that imports the fixture, not Firestore.
4. Announce the freeze in the team channel.

Consumers start immediately after the freeze announcement. They do not wait for the real implementation.

## 4. Dependency map

| Contract | Owner | Consumer | Before freeze | After freeze |
|---|---|---|---|---|
| `ResolvedConfig` | Developer 1 | Developer 1 PIN policy, Developer 3 rate limit, Developer 4 retention | fixture | real callable |
| `AuthorizationDecision` | Developer 1 | Developer 2, 3, 4 | fixture | real guard |
| `Identity`, `Membership` | Developer 1 | all | fixture | real session |
| `PublicMenuItem` | Developer 2 | Developer 3, 4 | fixture | real projection |
| `TableLinkContext` | Developer 2 | Developer 3 | fixture | real resolver |
| `OrderSnapshot` | Developer 3 | Developer 4 | fixture | real order |
| `InventoryMutationPlan` | Developer 4 | Developer 3 | fixture | atomic gate |
| `PaymentResult` | Developer 4 | Developer 3 | fixture | atomic gate |
| `CancellationResult` | Developer 4 | Developer 3 | fixture | atomic gate |
| `CompensatingPayment` | Developer 4 | Developer 3 | fixture | real correction |

No item blocks another Developer from starting. Only the four integration gates in section 5 need a pair.

## 5. Atomic integration gates

Firestore needs one transaction. All reads happen before all writes. These four gates cannot be split.

| Gate | File | Owners | Order |
|---|---|---|---|
| Cooking | `functions/src/integrations/cooking.ts` | Developer 3 and 4 | Week 2, first |
| Payment confirmation | `functions/src/integrations/payment-confirmation.ts` | Developer 3 and 4 | Week 2, second |
| Cancellation | `functions/src/integrations/cancellation.ts` | Developer 3 and 4 | Week 2, third |
| Correction | `functions/src/integrations/correction.ts` | Developer 4 and 3 | Week 2, fourth |

Gate protocol:

1. Both owners open one shared branch.
2. Both owners agree the transaction read set and write set first.
3. One owner writes the transaction. The other owner writes the failure and retry tests.
4. Both owners approve the pull request.
5. The reviewing partner is the second approver.

## 6. Shared file conflict policy

These files are hot spots. Only one open pull request may touch them at a time.

| File | Section owner |
|---|---|
| `firestore.rules` | Developer 1 for user, Tenant, membership, config; Developer 2 for catalog, table, public token, ADMIN; Developer 3 for order, tracking, idempotency; Developer 4 for inventory, payment, correction |
| `storage.rules` | Developer 2 |
| `firestore.indexes.json` | Developer 1 |
| `firebase.json` | Developer 1 |
| `functions/package.json` | Developer 1 |
| `docs/traceability.md` | each Developer updates own rows; Developer 1 resolves conflicts |
| `AGENTS.md`, `docs/README.md` | Developer 1 |

Announce a rules change in the team channel before the pull request. Every rules change needs a cross-Tenant Emulator test.

## 7. Naming conventions

| Artifact | Pattern | Example |
|---|---|---|
| Contract file | `<module>.contract.ts` | `order.contract.ts` |
| Fixture | `<module>.fixture.ts` | `order.fixture.ts` |
| Client adapter | `<module>.adapter.ts` | `ordering.adapter.ts` |
| Callable function | `callable<Module><Action>` | `callableOrderSubmit` |
| Provider webhook | `http<Provider>Webhook` | `httpVietQrWebhook` |
| Rules test | `<module>.rules.test.ts` | `ordering.rules.test.ts` |

## 8. Test convention

| Test kind | Location | Runs in |
|---|---|---|
| Contract test | beside the contract file | Node |
| Module unit test | `functions/src/modules/<module>/index.test.ts` | Node |
| Rules test | `functions/test/rules/` | Emulator with Rules |
| Client test | beside the adapter file | Vitest |
| End-to-end | `functions/test/e2e/` | Emulator Suite |

A test uses a fixture or a test double. A test never calls a live service.

## 9. What W1-01 must create

The skeleton holds code folders only. Developer 1 adds these in W1-01:

- `firebase.json` and `.firebaserc`
- `firestore.rules` with deny-by-default
- `firestore.indexes.json`
- `storage.rules` with deny-by-default
- `functions/package.json` and `functions/tsconfig.json` for Node.js 22
- `functions/.eslintrc` or `eslint.config.mjs`
- `firebase.json` Emulator Suite block
- `.github/workflows/ci.yml` with lint, typecheck, and Rules tests
- Path alias `@contracts/*` to `shared/contracts/*` in `tsconfig.json` and `vite.config.ts`

## 10. Pull request checklist

Before review, confirm each line:

- The pull request touches only owned files.
- Every new contract has a fixture and a consumer test.
- No direct client business write exists.
- Rules changes include a cross-Tenant Emulator test.
- Money is integer VND.
- Time is stored in UTC and rendered in `Asia/Ho_Chi_Minh`.
- The traceability row is updated.
- `npm run lint`, `npm run typecheck`, and the Rules tests pass.
