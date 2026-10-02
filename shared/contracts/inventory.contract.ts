import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  positiveIntSchema,
  vndSchema,
} from '../validation.js';

export const INVENTORY_CONTRACT_VERSION = 1;

/** Stored base units. Mass is grams, volume is millilitres, count is units. */
export const baseUnitSchema = z.enum(['g', 'ml', 'unit']);

export type BaseUnit = z.infer<typeof baseUnitSchema>;

/** Owner input units. Kilogram and litre are conveniences only. */
export const unitInputSchema = z.enum(['g', 'kg', 'ml', 'l', 'unit']);

export type UnitInput = z.infer<typeof unitInputSchema>;

/**
 * Convert one Owner input unit into its stored base unit and integer factor.
 * The server calls this before persistence so only integer base units reach
 * Firestore (docs/module/inventory.md, REQ-INV-001).
 */
export function convertToBaseUnits(
  quantity: number,
  unit: UnitInput,
): { baseUnit: BaseUnit; quantity: number } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive number');
  }
  const conversion: Record<UnitInput, { baseUnit: BaseUnit; factor: number }> = {
    g: { baseUnit: 'g', factor: 1 },
    kg: { baseUnit: 'g', factor: 1000 },
    ml: { baseUnit: 'ml', factor: 1 },
    l: { baseUnit: 'ml', factor: 1000 },
    unit: { baseUnit: 'unit', factor: 1 },
  };
  const { baseUnit, factor } = conversion[unit];
  const converted = quantity * factor;
  if (!Number.isInteger(converted)) {
    throw new Error('quantity does not convert to an integer base unit');
  }
  return { baseUnit, quantity: converted };
}

export const ingredientSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  ingredientId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  baseUnit: baseUnitSchema,
  unitCostVnd: vndSchema,
  stockQuantity: nonNegativeIntSchema,
  lowStockThreshold: nonNegativeIntSchema,
  isActive: z.boolean(),
  archivedAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type Ingredient = z.infer<typeof ingredientSchema>;

export const recipeLineSchema = z.strictObject({
  ingredientId: z.string().min(1),
  quantityBaseUnits: positiveIntSchema,
  unitCostVnd: vndSchema,
  lineCostVnd: vndSchema,
});

export type RecipeLine = z.infer<typeof recipeLineSchema>;

export const recipeSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  recipeId: z.string().min(1),
  tenantId: z.string().min(1),
  menuItemId: z.string().min(1),
  lines: z.array(recipeLineSchema).min(1),
  costVnd: vndSchema,
  costVersion: positiveIntSchema,
  archivedAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});

export type Recipe = z.infer<typeof recipeSchema>;

/** One auditable stock effect. Quantity is signed base units. */
export const stockMovementReasonSchema = z.enum([
  'stock_in',
  'order_deduction',
  'order_restore',
  'waste',
  'manual_adjustment',
]);

export type StockMovementReason = z.infer<typeof stockMovementReasonSchema>;

export const stockMovementSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  movementId: z.string().min(1),
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityDelta: z.number().int(),
  reason: stockMovementReasonSchema,
  orderId: z.string().min(1).nullable(),
  actorUid: z.string().min(1).nullable(),
  idempotencyKey: z.string().min(1),
  createdAt: isoUtcTimestampSchema,
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

export const stockInputSchema = z.strictObject({
  unit: unitInputSchema,
  quantity: z.number().positive(),
});

export type StockInput = z.infer<typeof stockInputSchema>;

export const ingredientCreateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  baseUnit: baseUnitSchema,
  unitCostVnd: vndSchema,
  lowStockThreshold: nonNegativeIntSchema,
  isActive: z.boolean(),
  stockInput: stockInputSchema.nullable(),
});

export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;

export const ingredientUpdateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  name: z.string().min(1).max(200),
  baseUnit: baseUnitSchema,
  unitCostVnd: vndSchema,
  lowStockThreshold: nonNegativeIntSchema,
  isActive: z.boolean(),
});

export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;

export const ingredientArchiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  reason: z.string().min(1).max(500).nullable(),
});

export type IngredientArchiveInput = z.infer<typeof ingredientArchiveInputSchema>;

export const stockAdjustInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantityDeltaBaseUnits: z
    .number()
    .int()
    .refine((value) => value !== 0, 'delta must be non-zero'),
  reason: stockMovementReasonSchema,
  idempotencyKey: z.string().min(8).max(128),
});

export type StockAdjustInput = z.infer<typeof stockAdjustInputSchema>;

/** One Owner recipe line. Cost is resolved from the current ingredients. */
export const recipeLineInputSchema = z.strictObject({
  ingredientId: z.string().min(1),
  quantityBaseUnits: positiveIntSchema,
});

export type RecipeLineInput = z.infer<typeof recipeLineInputSchema>;

export const recipeCreateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  menuItemId: z.string().min(1),
  lines: z.array(recipeLineInputSchema).min(1).max(100),
});

export type RecipeCreateInput = z.infer<typeof recipeCreateInputSchema>;

export const recipeUpdateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  recipeId: z.string().min(1),
  menuItemId: z.string().min(1),
  lines: z.array(recipeLineInputSchema).min(1).max(100),
});

export type RecipeUpdateInput = z.infer<typeof recipeUpdateInputSchema>;

export const recipeArchiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  recipeId: z.string().min(1),
  reason: z.string().min(1).max(500).nullable(),
});

export type RecipeArchiveInput = z.infer<typeof recipeArchiveInputSchema>;

export const ingredientCommandSchema = z.enum(['create', 'update', 'archive']);

export const ingredientCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  command: ingredientCommandSchema,
  status: z.literal('applied'),
  ingredient: ingredientSchema.nullable(),
  version: nonNegativeIntSchema,
});

export type IngredientCommandResult = z.infer<
  typeof ingredientCommandResultSchema
>;

export const recipeCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  command: z.enum(['create', 'update', 'archive']),
  status: z.literal('applied'),
  recipe: recipeSchema.nullable(),
  version: nonNegativeIntSchema,
});

export type RecipeCommandResult = z.infer<typeof recipeCommandResultSchema>;

export const stockAdjustResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  status: z.enum(['applied', 'replayed']),
  ingredient: ingredientSchema,
  movement: stockMovementSchema,
});

export type StockAdjustResult = z.infer<typeof stockAdjustResultSchema>;

/** One planned ingredient deduction for a cooking command. */
export const inventoryDeductionLineSchema = z.strictObject({
  ingredientId: z.string().min(1),
  quantityBaseUnits: positiveIntSchema,
  movementId: z.string().min(1),
  previousStockQuantity: nonNegativeIntSchema,
});

export type InventoryDeductionLine = z.infer<
  typeof inventoryDeductionLineSchema
>;

/**
 * Immutable deduction plan composed by Inventory and committed by Fulfilment in
 * the Order cooking transaction. It never mutates an Order (REQ-INV-001).
 */
export const inventoryDeductionPlanSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  reason: z.literal('order_deduction'),
  lines: z.array(inventoryDeductionLineSchema),
  createdAt: isoUtcTimestampSchema,
});

export type InventoryDeductionPlan = z.infer<
  typeof inventoryDeductionPlanSchema
>;

/** One planned ingredient restoration for an unpaid Order cancellation. */
export const inventoryRestorationLineSchema = z.strictObject({
  ingredientId: z.string().min(1),
  quantityBaseUnits: positiveIntSchema,
  movementId: z.string().min(1),
  previousStockQuantity: nonNegativeIntSchema,
});

export type InventoryRestorationLine = z.infer<
  typeof inventoryRestorationLineSchema
>;

/**
 * Immutable restoration plan composed by Inventory from recorded deductions and
 * committed by the cancelling transaction. Deterministic movement ids make a
 * retry restore each ingredient exactly once (REQ-INV-002).
 */
export const inventoryRestorationPlanSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  orderId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  reason: z.literal('order_restore'),
  lines: z.array(inventoryRestorationLineSchema),
  createdAt: isoUtcTimestampSchema,
});

export type InventoryRestorationPlan = z.infer<
  typeof inventoryRestorationPlanSchema
>;

/**
 * Stock count (REQ-INV-003). The server computes the expected quantity from
 * recorded stock-in, deduction, and restoration movements, then stores the
 * counted quantity, the expected quantity, and the variance with audit.
 */
export const stockCountSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  countId: z.string().min(1),
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  countedQuantityBaseUnits: nonNegativeIntSchema,
  expectedQuantityBaseUnits: z.number().int(),
  varianceBaseUnits: z.number().int(),
  reason: z.string().min(1).max(500).nullable(),
  actorUid: z.string().min(1).nullable(),
  createdAt: isoUtcTimestampSchema,
});
export type StockCount = z.infer<typeof stockCountSchema>;

export const recordStockCountInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  countedQuantityBaseUnits: nonNegativeIntSchema,
  reason: z.string().trim().min(1).max(500).nullable().optional(),
  idempotencyKey: z.string().min(8).max(128),
});
export type RecordStockCountInput = z.infer<
  typeof recordStockCountInputSchema
>;

export const stockCountResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  status: z.enum(['applied', 'replayed']),
  stockCount: stockCountSchema,
});
export type StockCountResult = z.infer<typeof stockCountResultSchema>;

/**
 * Expected base-unit quantity from the signed movement ledger. Stock-in and
 * order restoration are positive; deduction, waste, and manual adjustment are
 * signed effects. This never rewrites a paid record (REQ-INV-003).
 */
export function computeExpectedQuantity(
  movements: ReadonlyArray<Pick<StockMovement, 'quantityDelta'>>,
): number {
  return movements.reduce((sum, movement) => sum + movement.quantityDelta, 0);
}

export const lossFindingSchema = z
  .strictObject({
    schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
    findingId: z.string().min(1),
    tenantId: z.string().min(1),
    ingredientId: z.string().min(1),
    ingredientName: z.string().min(1).max(200),
    countId: z.string().min(1).nullable(),
    countQuantityBaseUnits: nonNegativeIntSchema.nullable(),
    expectedQuantityBaseUnits: z.number().int().nullable(),
    varianceBaseUnits: z.number().int().nullable(),
    movementIds: z.array(z.string().min(1)).max(200),
    periodStart: z.string().regex(/^\d{8}$/),
    periodEnd: z.string().regex(/^\d{8}$/),
    sourceIds: z.array(z.string().min(1)).max(200),
    missingData: z.boolean(),
    missingDataNotes: z.array(z.string().min(1).max(200)).max(5),
    message: z.string().min(1).max(500),
  })
  .refine(
    (finding) => finding.missingData || finding.sourceIds.length > 0,
    'A grounded loss finding needs at least one cited source.',
  );
export type LossFinding = z.infer<typeof lossFindingSchema>;

export const lossReviewInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1).nullable().optional(),
  fromDay: z.string().regex(/^\d{8}$/),
  toDay: z.string().regex(/^\d{8}$/),
  limit: z.number().int().min(1).max(200).optional(),
});
export type LossReviewInput = z.infer<typeof lossReviewInputSchema>;

export const lossReviewResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  periodStart: z.string().regex(/^\d{8}$/),
  periodEnd: z.string().regex(/^\d{8}$/),
  findings: z.array(lossFindingSchema).max(200),
  missingData: z.boolean(),
  missingDataNotes: z.array(z.string().min(1).max(200)).max(5),
  generatedAt: isoUtcTimestampSchema,
});
export type LossReviewResult = z.infer<typeof lossReviewResultSchema>;
