import {
  CATALOG_CONTRACT_VERSION,
  type CatalogCommandResult,
  type CatalogMenuItem,
  type PublicMenuItem,
} from '../contracts/catalog.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const MENU_ITEM_ID_FIXTURE = 'item-pho-bo-001';

const CREATED_AT = '2026-09-12T03:10:00.000Z';
const UPDATED_AT = '2026-09-12T05:00:00.000Z';

const modifierGroups = [
  {
    groupId: 'group-topping',
    name: 'Topping',
    selectionType: 'multiple' as const,
    isRequired: false,
    minSelections: 0,
    maxSelections: 3,
    options: [
      { optionId: 'opt-trung', name: 'Trứng', priceDeltaVnd: 5000 },
      { optionId: 'opt-thit', name: 'Thêm thịt', priceDeltaVnd: 15000 },
    ],
  },
];

export const privateMenuItemFixture: CatalogMenuItem = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  menuItemId: MENU_ITEM_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  name: 'Phở bò',
  description: 'Phở bò gia truyền',
  category: 'Món chính',
  type: 'Đồ ăn',
  priceVnd: 45000,
  costPriceVnd: 22000,
  imagePath: `tenants/${TENANT_A_FIXTURE}/menuItems/${MENU_ITEM_ID_FIXTURE}.jpg`,
  modifierGroups,
  recipeId: 'recipe-pho-bo-001',
  isAvailable: true,
  stockCount: 40,
  archivedAt: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const publicMenuItemFixture: PublicMenuItem = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  menuItemId: MENU_ITEM_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  name: 'Phở bò',
  description: 'Phở bò gia truyền',
  category: 'Món chính',
  type: 'Đồ ăn',
  priceVnd: 45000,
  imageUrl: 'https://cdn.scango.app/tenant-alpha/pho-bo.jpg',
  modifierGroups,
  isAvailable: true,
  updatedAt: UPDATED_AT,
};

export const unavailablePublicMenuItemFixture: PublicMenuItem = {
  ...publicMenuItemFixture,
  isAvailable: false,
};

export const createdCatalogCommandResultFixture: CatalogCommandResult = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  command: 'create',
  status: 'applied',
  menuItemId: MENU_ITEM_ID_FIXTURE,
  publicProjection: publicMenuItemFixture,
  version: 1,
  templateId: null,
  affectedItemCount: 1,
  reason: null,
  appliedAt: UPDATED_AT,
};

export const archivedCatalogCommandResultFixture: CatalogCommandResult = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  command: 'archive',
  status: 'applied',
  menuItemId: MENU_ITEM_ID_FIXTURE,
  publicProjection: null,
  version: 2,
  templateId: null,
  affectedItemCount: 1,
  reason: null,
  appliedAt: UPDATED_AT,
};

export const rejectedCatalogCommandResultFixture: CatalogCommandResult = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  command: 'update',
  status: 'rejected',
  menuItemId: MENU_ITEM_ID_FIXTURE,
  publicProjection: null,
  version: 2,
  templateId: null,
  affectedItemCount: 0,
  reason: 'Giá món không hợp lệ',
  appliedAt: UPDATED_AT,
};

export const templateCatalogCommandResultFixture: CatalogCommandResult = {
  schemaVersion: CATALOG_CONTRACT_VERSION,
  command: 'applyTemplate',
  status: 'applied',
  menuItemId: null,
  publicProjection: null,
  version: 1,
  templateId: 'quan_an',
  affectedItemCount: 12,
  reason: null,
  appliedAt: UPDATED_AT,
};
