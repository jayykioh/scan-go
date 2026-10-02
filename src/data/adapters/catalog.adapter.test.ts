import { describe, expect, it } from 'vitest';
import {
  mapStoredMenuItem,
  mapStoredPublicMenuItem,
} from './catalog.adapter';
import {
  MENU_ITEM_ID_FIXTURE,
  privateMenuItemFixture,
  publicMenuItemFixture,
} from '@shared/fixtures/catalog.fixture';

describe('mapStoredMenuItem', () => {
  it('rebuilds the private contract from a stored document', () => {
    const item = mapStoredMenuItem(MENU_ITEM_ID_FIXTURE, {
      ...privateMenuItemFixture,
      version: 2,
    });
    expect(item.menuItemId).toBe(MENU_ITEM_ID_FIXTURE);
    expect(item.costPriceVnd).toBe(22000);
  });
});

describe('mapStoredPublicMenuItem projection privacy', () => {
  it('drops Cost, recipe, and stock even when the raw document has them', () => {
    const item = mapStoredPublicMenuItem(publicMenuItemFixture.menuItemId, {
      ...publicMenuItemFixture,
      costPriceVnd: 22000,
      recipeId: 'recipe-pho-bo-001',
      stockCount: 40,
      imagePath: 'tenants/tenant-alpha/menuItems/x.jpg',
    });
    expect(item).not.toHaveProperty('costPriceVnd');
    expect(item).not.toHaveProperty('recipeId');
    expect(item).not.toHaveProperty('stockCount');
    expect(item).not.toHaveProperty('imagePath');
  });
});
