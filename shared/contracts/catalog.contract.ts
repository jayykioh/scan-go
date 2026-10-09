import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';

export const CATALOG_CONTRACT_VERSION = 1;

export const catalogModifierOptionSchema = z.strictObject({
  optionId: z.string().min(1),
  name: z.string().min(1),
  priceDeltaVnd: nonNegativeIntSchema,
});

export type CatalogModifierOption = z.infer<typeof catalogModifierOptionSchema>;

export const catalogModifierGroupSchema = z.strictObject({
  groupId: z.string().min(1),
  name: z.string().min(1),
  selectionType: z.enum(['single', 'multiple']),
  isRequired: z.boolean(),
  minSelections: nonNegativeIntSchema,
  maxSelections: positiveIntSchema.nullable(),
  options: z.array(catalogModifierOptionSchema).min(1),
});

export type CatalogModifierGroup = z.infer<typeof catalogModifierGroupSchema>;

/**
 * Integer VND of the selected modifier options on one menu item. It sums only
 * option ids that exist on the item, so the same selection always resolves to
 * the same price whether Ordering or Promotion asks (REQ-ORD-001,
 * REQ-PRO-001). Ordering still owns the required/min/max group validation.
 */
export function sumModifierDeltaVnd(
  modifierGroups: readonly CatalogModifierGroup[],
  selectedOptionIds: readonly string[],
): number {
  const requested = new Set(selectedOptionIds);
  let total = 0;
  for (const group of modifierGroups) {
    for (const option of group.options) {
      if (requested.has(option.optionId)) {
        total += option.priceDeltaVnd;
      }
    }
  }
  return total;
}

export const catalogMenuItemSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_CONTRACT_VERSION),
  menuItemId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().min(1),
  type: z.string().min(1).nullable(),
  priceVnd: vndSchema,
  costPriceVnd: vndSchema.nullable(),
  imagePath: z.string().min(1).nullable(),
  modifierGroups: z.array(catalogModifierGroupSchema),
  recipeId: z.string().min(1).nullable(),
  isAvailable: z.boolean(),
  stockCount: nonNegativeIntSchema.nullable(),
  archivedAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type CatalogMenuItem = z.infer<typeof catalogMenuItemSchema>;

export const publicMenuItemSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_CONTRACT_VERSION),
  menuItemId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  category: z.string().min(1),
  type: z.string().min(1).nullable(),
  priceVnd: vndSchema,
  imageUrl: z.string().min(1).nullable(),
  modifierGroups: z.array(catalogModifierGroupSchema),
  isAvailable: z.boolean(),
  updatedAt: isoUtcTimestampSchema,
});

export type PublicMenuItem = z.infer<typeof publicMenuItemSchema>;

export const catalogCommandSchema = z.enum([
  'create',
  'update',
  'archive',
  'restore',
  'setAvailability',
  'setCategoryAvailability',
  'applyTemplate',
]);

export type CatalogCommand = z.infer<typeof catalogCommandSchema>;

export const catalogCommandStatusSchema = z.enum(['applied', 'rejected', 'noop']);

export type CatalogCommandStatus = z.infer<typeof catalogCommandStatusSchema>;

export const catalogCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_CONTRACT_VERSION),
  command: catalogCommandSchema,
  status: catalogCommandStatusSchema,
  menuItemId: z.string().min(1).nullable(),
  publicProjection: publicMenuItemSchema.nullable(),
  version: nonNegativeIntSchema,
  templateId: z.string().min(1).nullable(),
  affectedItemCount: nonNegativeIntSchema,
  reason: z.string().min(1).nullable(),
  appliedAt: isoUtcTimestampSchema,
});

export type CatalogCommandResult = z.infer<typeof catalogCommandResultSchema>;

/** Bounded upper page size for the private Owner menu query. */
export const CATALOG_SEARCH_LIMIT = 100;

/** Bounded upper count of items one Category availability command may touch. */
export const CATALOG_CATEGORY_LIMIT = 200;

const catalogItemFields = {
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable(),
  category: z.string().min(1).max(100),
  type: z.string().min(1).max(100).nullable(),
  priceVnd: vndSchema,
  costPriceVnd: vndSchema.nullable(),
  imagePath: z.string().min(1).max(1024).nullable(),
  modifierGroups: z.array(catalogModifierGroupSchema),
  recipeId: z.string().min(1).max(128).nullable(),
  isAvailable: z.boolean(),
  stockCount: nonNegativeIntSchema.nullable(),
} as const;

export const catalogCreateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ...catalogItemFields,
});

export type CatalogCreateInput = z.infer<typeof catalogCreateInputSchema>;

export const catalogUpdateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  menuItemId: z.string().min(1),
  ...catalogItemFields,
});

export type CatalogUpdateInput = z.infer<typeof catalogUpdateInputSchema>;

export const catalogArchiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  menuItemId: z.string().min(1),
  reason: z.string().max(500).nullable(),
});

export type CatalogArchiveInput = z.infer<typeof catalogArchiveInputSchema>;

export const catalogSetAvailabilityInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  menuItemId: z.string().min(1),
  isAvailable: z.boolean(),
});

export type CatalogSetAvailabilityInput = z.infer<
  typeof catalogSetAvailabilityInputSchema
>;

export const catalogSetCategoryAvailabilityInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  category: z.string().min(1).max(100),
  isAvailable: z.boolean(),
});

export type CatalogSetCategoryAvailabilityInput = z.infer<
  typeof catalogSetCategoryAvailabilityInputSchema
>;

/**
 * A public-safe availability row for the Kitchen board. It carries no Cost,
 * recipe, or stock field, so a Kitchen device can list every active item and
 * toggle both directions (REQ-KDS-002, NFR-DATA-001).
 */
export const catalogAvailabilityItemSchema = z.strictObject({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  isAvailable: z.boolean(),
});

export type CatalogAvailabilityItem = z.infer<
  typeof catalogAvailabilityItemSchema
>;

export const catalogAvailabilityListInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type CatalogAvailabilityListInput = z.infer<
  typeof catalogAvailabilityListInputSchema
>;

export const catalogAvailabilityListResultSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_CONTRACT_VERSION),
  items: z.array(catalogAvailabilityItemSchema),
});

export type CatalogAvailabilityListResult = z.infer<
  typeof catalogAvailabilityListResultSchema
>;

export const catalogSearchInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  query: z.string().max(200).nullable(),
  category: z.string().max(100).nullable(),
});

export type CatalogSearchInput = z.infer<typeof catalogSearchInputSchema>;

export const catalogApplyTemplateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  templateId: z.string().min(1).max(64),
});

export type CatalogApplyTemplateInput = z.infer<
  typeof catalogApplyTemplateInputSchema
>;

export const catalogSearchResultSchema = z.strictObject({
  schemaVersion: z.literal(CATALOG_CONTRACT_VERSION),
  items: z.array(catalogMenuItemSchema),
  total: nonNegativeIntSchema,
});

export type CatalogSearchResult = z.infer<typeof catalogSearchResultSchema>;
