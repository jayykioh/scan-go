import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  applyMenuItemAvailability,
  applyMenuItemUpdate,
  assertTenantScopedImagePath,
  buildNewMenuItem,
  computeNextCatalogVersion,
  isPublicProjectionVisible,
  matchesCatalogSearch,
  parseCatalogApplyTemplateInput,
  parseCatalogCreateInput,
  parseCatalogSearchInput,
  parseCatalogUpdateInput,
  toCatalogMenuItem,
  toPublicMenuItem,
} from './service.js';
import { getCatalogTemplate, CATALOG_TEMPLATES } from './templates.js';
import {
  publicMenuItemSchema,
  type CatalogCreateInput,
} from '../../../../shared/contracts/catalog.contract.js';
import {
  MENU_ITEM_ID_FIXTURE,
  privateMenuItemFixture,
} from '../../../../shared/fixtures/catalog.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

function createInput(
  overrides: Partial<CatalogCreateInput> = {},
): CatalogCreateInput {
  return {
    tenantId: TENANT_A_FIXTURE,
    name: 'Phở bò',
    description: 'Phở bò gia truyền',
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 45000,
    costPriceVnd: 22000,
    imagePath: `tenants/${TENANT_A_FIXTURE}/menuItems/${MENU_ITEM_ID_FIXTURE}.jpg`,
    modifierGroups: [],
    recipeId: 'recipe-pho-bo-001',
    isAvailable: true,
    stockCount: 40,
    ...overrides,
  };
}

describe('toPublicMenuItem projection privacy', () => {
  it('drops Cost, recipe, stock, and the private image path', () => {
    const projection = toPublicMenuItem(privateMenuItemFixture);

    expect(publicMenuItemSchema.safeParse(projection).success).toBe(true);
    expect('costPriceVnd' in projection).toBe(false);
    expect('recipeId' in projection).toBe(false);
    expect('stockCount' in projection).toBe(false);
    expect('imagePath' in projection).toBe(false);
    expect(projection.menuItemId).toBe(privateMenuItemFixture.menuItemId);
    expect(projection.priceVnd).toBe(privateMenuItemFixture.priceVnd);
  });

  it('never serializes a Cost or recipe key', () => {
    const serialized = JSON.stringify(toPublicMenuItem(privateMenuItemFixture));
    expect(serialized).not.toContain('costPriceVnd');
    expect(serialized).not.toContain('recipeId');
    expect(serialized).not.toContain('stockCount');
  });
});

describe('isPublicProjectionVisible', () => {
  it('requires an active and available item', () => {
    expect(isPublicProjectionVisible(privateMenuItemFixture)).toBe(true);
    expect(
      isPublicProjectionVisible({
        ...privateMenuItemFixture,
        isAvailable: false,
      }),
    ).toBe(false);
    expect(
      isPublicProjectionVisible({
        ...privateMenuItemFixture,
        archivedAt: '2026-09-12T06:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('buildNewMenuItem / applyMenuItemUpdate', () => {
  it('builds an active item with server timestamps', () => {
    const item = buildNewMenuItem(
      createInput(),
      MENU_ITEM_ID_FIXTURE,
      '2026-09-12T05:00:00.000Z',
    );
    expect(item.menuItemId).toBe(MENU_ITEM_ID_FIXTURE);
    expect(item.archivedAt).toBeNull();
    expect(item.isAvailable).toBe(true);
  });

  it('preserves id, createdAt, and archivedAt on update', () => {
    const updated = applyMenuItemUpdate(
      privateMenuItemFixture,
      { ...createInput(), menuItemId: MENU_ITEM_ID_FIXTURE, name: 'Phở bò mới' },
      '2026-09-13T00:00:00.000Z',
    );
    expect(updated.menuItemId).toBe(privateMenuItemFixture.menuItemId);
    expect(updated.createdAt).toBe(privateMenuItemFixture.createdAt);
    expect(updated.updatedAt).toBe('2026-09-13T00:00:00.000Z');
    expect(updated.name).toBe('Phở bò mới');
  });
});

describe('applyMenuItemAvailability', () => {
  it('stamps the new updatedAt before the public projection is mapped', () => {
    const now = '2026-09-14T00:00:00.000Z';
    const updated = applyMenuItemAvailability(
      privateMenuItemFixture,
      false,
      now,
    );
    expect(updated.isAvailable).toBe(false);
    expect(updated.updatedAt).toBe(now);

    const projection = toPublicMenuItem(updated);
    expect(projection.isAvailable).toBe(false);
    expect(projection.updatedAt).toBe(now);
  });
});

describe('catalog input validation', () => {
  it('rejects a negative price and an unknown key', () => {
    expect(() =>
      parseCatalogCreateInput(createInput({ priceVnd: -1 })),
    ).toThrow(HttpsError);
    expect(() =>
      parseCatalogCreateInput({ ...createInput(), cost: 1 } as unknown),
    ).toThrow(HttpsError);
  });

  it('rejects a missing required field on update', () => {
    expect(() =>
      parseCatalogUpdateInput({
        tenantId: TENANT_A_FIXTURE,
        menuItemId: MENU_ITEM_ID_FIXTURE,
      }),
    ).toThrow(HttpsError);
  });

  it('accepts a bounded search input', () => {
    expect(
      parseCatalogSearchInput({
        tenantId: TENANT_A_FIXTURE,
        query: 'phở',
        category: null,
      }),
    ).toEqual({
      tenantId: TENANT_A_FIXTURE,
      query: 'phở',
      category: null,
    });
  });
});

describe('tenant-scoped image path', () => {
  it('accepts a path under the Tenant prefix', () => {
    expect(() =>
      assertTenantScopedImagePath(
        TENANT_A_FIXTURE,
        `tenants/${TENANT_A_FIXTURE}/menuItems/a.jpg`,
      ),
    ).not.toThrow();
  });

  it('rejects a cross-tenant or absolute URL path', () => {
    expect(() =>
      assertTenantScopedImagePath(
        TENANT_A_FIXTURE,
        'tenants/tenant-bravo/menuItems/a.jpg',
      ),
    ).toThrow(HttpsError);
    expect(() =>
      assertTenantScopedImagePath(TENANT_A_FIXTURE, 'https://cdn/x.jpg'),
    ).toThrow(HttpsError);
  });
});

describe('search matching and version', () => {
  it('filters by category, query, and archives', () => {
    expect(
      matchesCatalogSearch(privateMenuItemFixture, {
        tenantId: TENANT_A_FIXTURE,
        query: 'phở',
        category: 'Món chính',
      }),
    ).toBe(true);
    expect(
      matchesCatalogSearch(privateMenuItemFixture, {
        tenantId: TENANT_A_FIXTURE,
        query: null,
        category: 'Đồ uống',
      }),
    ).toBe(false);
  });

  it('increments the catalog version', () => {
    expect(computeNextCatalogVersion(undefined)).toBe(1);
    expect(computeNextCatalogVersion(3)).toBe(4);
  });
});

describe('industry templates', () => {
  it('exposes five approved templates with categories and items', () => {
    expect(Object.keys(CATALOG_TEMPLATES).length).toBe(5);
    const template = getCatalogTemplate('quan_an');
    expect(template?.categories.length).toBeGreaterThan(0);
    expect(template?.items.length).toBeGreaterThan(0);
    for (const item of template?.items ?? []) {
      expect(template?.categories).toContain(item.category);
    }
  });

  it('returns undefined for an unknown template', () => {
    expect(getCatalogTemplate('unknown')).toBeUndefined();
  });
});

describe('toCatalogMenuItem', () => {
  it('rebuilds the frozen contract from a stored document', () => {
    const item = toCatalogMenuItem(MENU_ITEM_ID_FIXTURE, {
      ...privateMenuItemFixture,
      version: 2,
    });
    expect(item.menuItemId).toBe(MENU_ITEM_ID_FIXTURE);
    expect('version' in item).toBe(false);
  });
});

describe('apply template input', () => {
  it('rejects an empty template id', () => {
    expect(() =>
      parseCatalogApplyTemplateInput({ tenantId: TENANT_A_FIXTURE, templateId: '' }),
    ).toThrow(HttpsError);
  });
});
