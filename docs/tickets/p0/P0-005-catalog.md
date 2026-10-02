# P0-005 — Catalog and public menu projection

## Requirement links

REQ-CAT-001, REQ-CAT-002, CON-002, NFR-SEC-001, NFR-DATA-001, NFR-MOD-001.

## Owning module

Catalog owns private menu items and the public-safe menu projection.

## Allowed file paths

- `functions/src/modules/catalog/**`
- `functions/src/shared/audit.ts`
- `functions/src/index.ts`
- `shared/contracts/catalog.contract.ts`
- `shared/contracts/catalog.contract.test.ts`
- `shared/fixtures/catalog.fixture.ts`
- `src/data/adapters/catalog.adapter.ts`
- `src/pages/dashboard/MenuPage.tsx`
- `src/components/OwnerView.tsx`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- `functions/test/rules/catalog.rules.test.ts`
- `functions/test/catalog/**`
- `functions/vitest.rules.config.mts`
- `functions/vitest.emulator.config.mts`

Do not change Inventory quantities, Table Access tokens, or Ordering records.

## Dependencies

P0-001, P0-003, and P0-004.

## Atomic acceptance checklist

- Given authorized Owner input, when a menu item is created, edited, archived, searched, or categorized, then the server validates it and writes only through a callable.
- Given a saved active available item, when its command commits, then its public-safe projection updates in the same command and is visible within two seconds.
- Given a public projection, when Customer reads it, then it excludes Cost, recipe, stock quantity, and private metadata.
- Given one approved industry template, when Owner initializes it, then editable categories and items appear only in that Tenant.
- Given an image input, when the item updates, then its storage metadata uses a tenant-scoped path and validated type and size.
- Given another Tenant or an unauthorized role, when it reads or commands Catalog data, then Rules and Cloud Functions deny it.

## Test plan

- Unit: schema validation, VND integer validation, template initialization, and projection mapping.
- Functions Emulator: Owner allow; Staff and cross-tenant deny; projection atomicity and template isolation.
- Rules: member private-read boundary, public projection boundary, direct-write denial, and projection privacy.
- Add this ticket's Rules and callable test paths to the two Functions Vitest include lists.

## Required evidence

- Passing unit, Functions Emulator, and Rules results.
- Owner-to-Customer projection fixture.
- Two-Tenant template fixture.
- Bounded public-menu listener timing sample.

## Out of scope

Ingredient recipes, Kitchen availability command integration, promotions, and Order snapshots.
