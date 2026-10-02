# P0-010 — Waiter, notifications, and onboarding completion

## Requirement links

REQ-WAI-001, REQ-NOT-001, REQ-ONB-001, REQ-ONB-002, REQ-ORD-003, NFR-RT-001, NFR-UX-001, NFR-MOD-001.

## Owning module

Fulfilment owns Waiter workflow coordination and notification effects. Tenant owns onboarding checklist state. Ordering owns Order mutations.

## Allowed file paths

- `functions/src/modules/fulfilment/**`
- `functions/src/modules/tenant/service.ts`
- `functions/src/modules/ordering/index.ts`
- `functions/src/index.ts`
- `shared/contracts/fulfilment.contract.ts`
- `shared/contracts/notification.contract.ts`
- `shared/contracts/onboarding.contract.ts`
- `shared/contracts/onboarding.contract.test.ts`
- `shared/fixtures/fulfilment.fixture.ts`
- `shared/fixtures/onboarding.fixture.ts`
- `src/data/adapters/fulfilment.adapter.ts`
- `src/hooks/usePersistentState.ts`
- `src/components/StaffView.tsx`
- `src/components/KitchenView.tsx`
- `src/components/OwnerView.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `functions/test/rules/ordering.rules.test.ts`
- `functions/test/fulfilment/**`
- `functions/test/onboarding/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not change payment, inventory, Catalog, or Tenant membership administration.

## Dependencies

P0-003, P0-004, P0-005, P0-006, P0-008, and P0-009.

## Atomic acceptance checklist

- Given a ready Order and authorized Waiter, when Waiter confirms service, then Ordering changes it to `served` once.
- Given Waiter attempts payment, menu, or Kitchen actions, when the server authorizes the request, then it denies them.
- Given sound is enabled after user interaction, when a relevant new Order or ready event arrives, then one visible and audible notification occurs.
- Given a duplicate event or mute enabled, when notification processing runs, then no duplicate sound occurs or sound remains muted.
- Given a new Tenant, when shop name, industry, plan, payment mode, tables, and menu complete, then the checklist records completion and shows the next incomplete step.
- Given a prepared Owner follows the standard flow, when the usability study runs, then all required onboarding steps finish within 15 minutes.

## Test plan

- Unit: notification dedupe, mute persistence, checklist progression, and next-step selection.
- Functions Emulator: ready-to-served transition, Waiter role denial, Tenant checklist update, and cross-tenant denial.
- Rules: no direct Order or onboarding business writes and tenant-scoped reads only.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Served-Order and denied-operation fixtures.
- Muted and unmuted notification capture.
- Checklist end-to-end result and timed onboarding study.

## Out of scope

Solo workflow, ADMIN, i18n, cancellation, reversal, refund, and performance-load testing.
