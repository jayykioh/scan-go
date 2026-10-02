import { describe, expect, it } from 'vitest';
import {
  catalogCommandResultSchema,
  catalogMenuItemSchema,
  publicMenuItemSchema,
} from './catalog.contract.js';
import {
  archivedCatalogCommandResultFixture,
  createdCatalogCommandResultFixture,
  privateMenuItemFixture,
  publicMenuItemFixture,
  rejectedCatalogCommandResultFixture,
  templateCatalogCommandResultFixture,
  unavailablePublicMenuItemFixture,
} from '../fixtures/catalog.fixture.js';

describe('PublicMenuItem contract', () => {
  it('accepts the public menu fixtures', () => {
    expect(publicMenuItemSchema.safeParse(publicMenuItemFixture).success).toBe(
      true,
    );
    expect(
      publicMenuItemSchema.safeParse(unavailablePublicMenuItemFixture).success,
    ).toBe(true);
  });

  it('accepts the private menu item fixture', () => {
    expect(catalogMenuItemSchema.safeParse(privateMenuItemFixture).success).toBe(
      true,
    );
  });

  it('rejects private Cost, recipe, and stock fields in the public projection', () => {
    expect(
      publicMenuItemSchema.safeParse({
        ...publicMenuItemFixture,
        costPriceVnd: 22000,
      }).success,
    ).toBe(false);
    expect(
      publicMenuItemSchema.safeParse({
        ...publicMenuItemFixture,
        recipeId: 'recipe-pho-bo-001',
      }).success,
    ).toBe(false);
    expect(
      publicMenuItemSchema.safeParse({
        ...publicMenuItemFixture,
        stockCount: 40,
      }).success,
    ).toBe(false);
  });

  it('rejects a negative price', () => {
    expect(
      publicMenuItemSchema.safeParse({
        ...publicMenuItemFixture,
        priceVnd: -1,
      }).success,
    ).toBe(false);
  });
});

describe('CatalogCommandResult contract', () => {
  it('accepts the command result fixtures', () => {
    for (const fixture of [
      createdCatalogCommandResultFixture,
      archivedCatalogCommandResultFixture,
      rejectedCatalogCommandResultFixture,
      templateCatalogCommandResultFixture,
    ]) {
      expect(catalogCommandResultSchema.safeParse(fixture).success).toBe(true);
    }
  });

  it('rejects an unknown command', () => {
    expect(
      catalogCommandResultSchema.safeParse({
        ...createdCatalogCommandResultFixture,
        command: 'delete',
      }).success,
    ).toBe(false);
  });
});
