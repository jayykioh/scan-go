import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  CATALOG_CONTRACT_VERSION,
  catalogApplyTemplateInputSchema,
  catalogArchiveInputSchema,
  catalogAvailabilityListInputSchema,
  catalogCreateInputSchema,
  catalogMenuItemSchema,
  catalogSearchInputSchema,
  catalogSetAvailabilityInputSchema,
  catalogSetCategoryAvailabilityInputSchema,
  catalogUpdateInputSchema,
  publicMenuItemSchema,
  type CatalogApplyTemplateInput,
  type CatalogArchiveInput,
  type CatalogAvailabilityItem,
  type CatalogAvailabilityListInput,
  type CatalogCreateInput,
  type CatalogMenuItem,
  type CatalogSearchInput,
  type CatalogSetAvailabilityInput,
  type CatalogSetCategoryAvailabilityInput,
  type CatalogUpdateInput,
  type PublicMenuItem,
} from '../../../../shared/contracts/catalog.contract.js';

export const CATALOG_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được thực đơn.';
export const CATALOG_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
export const CATALOG_INVALID_MESSAGE = 'Dữ liệu món ăn không hợp lệ.';
export const CATALOG_IMAGE_PATH_MESSAGE =
  'Đường dẫn ảnh phải nằm trong thư mục của cửa hàng.';
export const CATALOG_ITEM_NOT_FOUND_MESSAGE = 'Không tìm thấy món ăn.';
export const CATALOG_TEMPLATE_NOT_FOUND_MESSAGE = 'Không tìm thấy mẫu thực đơn.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', CATALOG_MEMBER_DENIED_MESSAGE);
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', CATALOG_OWNER_DENIED_MESSAGE);
  }
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', CATALOG_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseCatalogCreateInput(data: unknown): CatalogCreateInput {
  return parseOrInvalid<CatalogCreateInput>(catalogCreateInputSchema, data);
}

export function parseCatalogUpdateInput(data: unknown): CatalogUpdateInput {
  return parseOrInvalid<CatalogUpdateInput>(catalogUpdateInputSchema, data);
}

export function parseCatalogArchiveInput(data: unknown): CatalogArchiveInput {
  return parseOrInvalid<CatalogArchiveInput>(catalogArchiveInputSchema, data);
}

export function parseCatalogSetAvailabilityInput(
  data: unknown,
): CatalogSetAvailabilityInput {
  return parseOrInvalid<CatalogSetAvailabilityInput>(
    catalogSetAvailabilityInputSchema,
    data,
  );
}

export function parseCatalogSetCategoryAvailabilityInput(
  data: unknown,
): CatalogSetCategoryAvailabilityInput {
  return parseOrInvalid<CatalogSetCategoryAvailabilityInput>(
    catalogSetCategoryAvailabilityInputSchema,
    data,
  );
}

export function parseCatalogAvailabilityListInput(
  data: unknown,
): CatalogAvailabilityListInput {
  return parseOrInvalid<CatalogAvailabilityListInput>(
    catalogAvailabilityListInputSchema,
    data,
  );
}

export function parseCatalogSearchInput(data: unknown): CatalogSearchInput {
  return parseOrInvalid<CatalogSearchInput>(catalogSearchInputSchema, data);
}

export function parseCatalogApplyTemplateInput(
  data: unknown,
): CatalogApplyTemplateInput {
  return parseOrInvalid<CatalogApplyTemplateInput>(
    catalogApplyTemplateInputSchema,
    data,
  );
}

/** An image path must stay under the owning Tenant's Storage prefix. */
export function assertTenantScopedImagePath(
  tenantId: string,
  imagePath: string | null,
): void {
  if (imagePath === null) {
    return;
  }
  if (!imagePath.startsWith(`tenants/${tenantId}/`)) {
    throw new HttpsError('invalid-argument', CATALOG_IMAGE_PATH_MESSAGE);
  }
}

/** Rebuild the frozen private-item contract from a stored document. */
export function toCatalogMenuItem(
  menuItemId: string,
  data: DocumentData,
): CatalogMenuItem {
  return catalogMenuItemSchema.parse({
    schemaVersion: data.schemaVersion ?? CATALOG_CONTRACT_VERSION,
    menuItemId,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description ?? null,
    category: data.category,
    type: data.type ?? null,
    priceVnd: data.priceVnd,
    costPriceVnd: data.costPriceVnd ?? null,
    imagePath: data.imagePath ?? null,
    modifierGroups: data.modifierGroups ?? [],
    recipeId: data.recipeId ?? null,
    isAvailable: data.isAvailable ?? false,
    stockCount: data.stockCount ?? null,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/**
 * Map a private item to its public-safe projection. Cost, recipe, stock, and
 * internal IDs are never copied (REQ-CAT-001, NFR-DATA-001).
 */
export function toPublicMenuItem(item: CatalogMenuItem): PublicMenuItem {
  return publicMenuItemSchema.parse({
    schemaVersion: CATALOG_CONTRACT_VERSION,
    menuItemId: item.menuItemId,
    tenantId: item.tenantId,
    name: item.name,
    description: item.description,
    category: item.category,
    type: item.type,
    priceVnd: item.priceVnd,
    imageUrl: item.imagePath,
    modifierGroups: item.modifierGroups,
    isAvailable: item.isAvailable,
    updatedAt: item.updatedAt,
  });
}

/** Only active and available items exist in the public projection. */
export function isPublicProjectionVisible(item: CatalogMenuItem): boolean {
  return item.archivedAt === null && item.isAvailable;
}

/** Strip an item to the Kitchen-safe availability fields (no Cost or stock). */
export function toCatalogAvailabilityItem(
  item: CatalogMenuItem,
): CatalogAvailabilityItem {
  return {
    menuItemId: item.menuItemId,
    name: item.name,
    category: item.category,
    isAvailable: item.isAvailable,
  };
}

export function buildNewMenuItem(
  input: CatalogCreateInput,
  menuItemId: string,
  now: string,
): CatalogMenuItem {
  return catalogMenuItemSchema.parse({
    schemaVersion: CATALOG_CONTRACT_VERSION,
    menuItemId,
    tenantId: input.tenantId,
    name: input.name,
    description: input.description,
    category: input.category,
    type: input.type,
    priceVnd: input.priceVnd,
    costPriceVnd: input.costPriceVnd,
    imagePath: input.imagePath,
    modifierGroups: input.modifierGroups,
    recipeId: input.recipeId,
    isAvailable: input.isAvailable,
    stockCount: input.stockCount,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function applyMenuItemUpdate(
  current: CatalogMenuItem,
  input: CatalogUpdateInput,
  now: string,
): CatalogMenuItem {
  return catalogMenuItemSchema.parse({
    ...current,
    name: input.name,
    description: input.description,
    category: input.category,
    type: input.type,
    priceVnd: input.priceVnd,
    costPriceVnd: input.costPriceVnd,
    imagePath: input.imagePath,
    modifierGroups: input.modifierGroups,
    recipeId: input.recipeId,
    isAvailable: input.isAvailable,
    stockCount: input.stockCount,
    archivedAt: current.archivedAt,
    updatedAt: now,
  });
}

/**
 * Apply a Kitchen/Owner availability change and stamp the new `updatedAt` on
 * the item before it is mapped to the private document or the public
 * projection. This keeps the projection timestamp from going stale
 * (REQ-CAT-001).
 */
export function applyMenuItemAvailability(
  current: CatalogMenuItem,
  isAvailable: boolean,
  now: string,
): CatalogMenuItem {
  return catalogMenuItemSchema.parse({
    ...current,
    isAvailable,
    updatedAt: now,
  });
}

/**
 * Pick the active items in one category that still need the target
 * availability. An item already at the target is skipped, so a retried
 * Category availability command changes nothing and writes no audit event
 * (REQ-CAT-003).
 */
export function isCategoryAvailabilityTarget(
  item: CatalogMenuItem,
  category: string,
  isAvailable: boolean,
): boolean {
  return (
    item.archivedAt === null &&
    item.category === category &&
    item.isAvailable !== isAvailable
  );
}

export function matchesCatalogSearch(
  item: CatalogMenuItem,
  input: CatalogSearchInput,
): boolean {
  if (item.archivedAt !== null) {
    return false;
  }
  if (input.category !== null && item.category !== input.category) {
    return false;
  }
  if (input.query !== null && input.query.trim().length > 0) {
    return item.name
      .toLowerCase()
      .includes(input.query.trim().toLowerCase());
  }
  return true;
}

export function computeNextCatalogVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0
    ? current + 1
    : 1;
}
