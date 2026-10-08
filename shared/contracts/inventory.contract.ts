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

/** One Owner input unit mapped to its stored base unit and integer factor. */
export const UNIT_BASE_FACTOR: Record<
  UnitInput,
  { baseUnit: BaseUnit; factor: number }
> = {
  g: { baseUnit: 'g', factor: 1 },
  kg: { baseUnit: 'g', factor: 1000 },
  ml: { baseUnit: 'ml', factor: 1 },
  l: { baseUnit: 'ml', factor: 1000 },
  unit: { baseUnit: 'unit', factor: 1 },
};

/**
 * Convert one Owner input unit into its stored base unit and integer factor.
 * The server calls this before persistence so only integer base units reach
 * Firestore (docs/module/inventory.md, REQ-INV-001, REQ-INV-006).
 */
export function convertToBaseUnits(
  quantity: number,
  unit: UnitInput,
): { baseUnit: BaseUnit; quantity: number } {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be a positive number');
  }
  const { baseUnit, factor } = UNIT_BASE_FACTOR[unit];
  const converted = quantity * factor;
  if (!Number.isInteger(converted)) {
    throw new Error('quantity does not convert to an integer base unit');
  }
  return { baseUnit, quantity: converted };
}

/** Return the stored base unit for one Owner input unit. */
export function baseUnitForUnit(unit: UnitInput): BaseUnit {
  return UNIT_BASE_FACTOR[unit].baseUnit;
}

/**
 * Convert one Owner purchase price in the chosen unit into integer VND per
 * stored base unit. A price of 100000 VND per kilogram becomes 100 VND per
 * gram (REQ-INV-005).
 */
export function convertUnitCostToBase(
  priceVnd: number,
  unit: UnitInput,
): number {
  if (!Number.isFinite(priceVnd) || priceVnd < 0) {
    throw new Error('price must be a non-negative number');
  }
  return Math.round(priceVnd / UNIT_BASE_FACTOR[unit].factor);
}

export const ingredientSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  ingredientId: z.string().min(1),
  tenantId: z.string().min(1),
  name: z.string().min(1).max(200),
  baseUnit: baseUnitSchema,
  /** Owner purchase entry, kept so the edit form shows the original unit. */
  purchaseUnit: unitInputSchema.nullable(),
  /**
   * Free-text name for a count ingredient, for example "trái" or "hộp". It is
   * null for mass and volume ingredients (REQ-INV-012).
   */
  countUnitLabel: z.string().min(1).max(40).nullable(),
  purchasePriceVnd: vndSchema.nullable(),
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
  /** Fixed waste quantity in base units; added to the deduction. */
  wasteBaseUnits: nonNegativeIntSchema,
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
  /**
   * Integer VND per base unit for one `stock_in` lot, so purchase prices stay
   * auditable over time (REQ-INV-010, ADR 0014). Null for non-purchase effects.
   */
  lotUnitCostVnd: vndSchema.nullable().default(null),
  /**
   * Free-text note for a `waste` or `manual_adjustment` effect. It explains the
   * loss, for example expiry or breakage (REQ-INV-009). Null for other effects.
   */
  note: z.string().min(1).max(500).nullable().default(null),
  createdAt: isoUtcTimestampSchema,
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

export const stockInputSchema = z.strictObject({
  unit: unitInputSchema,
  quantity: z.number().positive(),
});

export type StockInput = z.infer<typeof stockInputSchema>;

export const ingredientCreateInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    name: z.string().min(1).max(200),
    /** Purchase entry: base unit and Cost are derived from these two fields. */
    purchaseUnit: unitInputSchema,
    /** Required free-text count unit when `purchaseUnit` is `unit` (REQ-INV-012). */
    countUnitLabel: z.string().trim().max(40).nullable().optional(),
    purchasePriceVnd: vndSchema,
    lowStockThreshold: nonNegativeIntSchema,
    isActive: z.boolean(),
    stockInput: stockInputSchema.nullable(),
  })
  .refine(
    (input) =>
      input.purchaseUnit !== 'unit' ||
      (typeof input.countUnitLabel === 'string' &&
        input.countUnitLabel.trim().length > 0),
    { message: 'countUnitLabel is required for a count unit', path: ['countUnitLabel'] },
  );

export type IngredientCreateInput = z.infer<typeof ingredientCreateInputSchema>;

export const ingredientUpdateInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    ingredientId: z.string().min(1),
    name: z.string().min(1).max(200),
    purchaseUnit: unitInputSchema,
    countUnitLabel: z.string().trim().max(40).nullable().optional(),
    purchasePriceVnd: vndSchema,
    lowStockThreshold: nonNegativeIntSchema,
    isActive: z.boolean(),
  })
  .refine(
    (input) =>
      input.purchaseUnit !== 'unit' ||
      (typeof input.countUnitLabel === 'string' &&
        input.countUnitLabel.trim().length > 0),
    { message: 'countUnitLabel is required for a count unit', path: ['countUnitLabel'] },
  );

export type IngredientUpdateInput = z.infer<typeof ingredientUpdateInputSchema>;

/**
 * Store the count unit name only for a count ingredient. Mass and volume
 * ingredients keep a null label (REQ-INV-012).
 */
export function resolveCountUnitLabel(input: {
  purchaseUnit: UnitInput;
  countUnitLabel?: string | null;
}): string | null {
  if (input.purchaseUnit !== 'unit') {
    return null;
  }
  const label = input.countUnitLabel?.trim() ?? '';
  return label.length > 0 ? label : null;
}

export const ingredientArchiveInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  ingredientId: z.string().min(1),
  reason: z.string().min(1).max(500).nullable(),
});

export type IngredientArchiveInput = z.infer<typeof ingredientArchiveInputSchema>;

/**
 * True when an adjust command is a purchase lot that needs a price. A positive
 * `stock_in` records a new lot; a negative `stock_in` corrects a prior mistake
 * and keeps the existing Cost (REQ-INV-010).
 */
export function isPricedStockIn(input: {
  reason: StockMovementReason;
  quantityDeltaBaseUnits: number;
}): boolean {
  return input.reason === 'stock_in' && input.quantityDeltaBaseUnits > 0;
}

export const stockAdjustInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    ingredientId: z.string().min(1),
    quantityDeltaBaseUnits: z
      .number()
      .int()
      .refine((value) => value !== 0, 'delta must be non-zero'),
    reason: stockMovementReasonSchema,
    idempotencyKey: z.string().min(8).max(128),
    /**
     * Purchase cost for one `stock_in` lot, in a chosen purchase unit. The server
     * converts it to integer VND per base unit, records it on the movement, and
     * recomputes the weighted-average Cost (REQ-INV-010, ADR 0014). It is required
     * for a positive-`stock_in` lot and ignored for any other effect.
     */
    purchaseUnit: unitInputSchema.optional(),
    purchasePriceVnd: vndSchema.optional(),
    /**
     * Free-text note for a `waste` or `manual_adjustment` effect. It is required
     * for those reasons so every loss is explainable (REQ-INV-009).
     */
    note: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (input) =>
      (input.reason !== 'waste' && input.reason !== 'manual_adjustment') ||
      (typeof input.note === 'string' && input.note.trim().length > 0),
    {
      message: 'note is required for waste and manual adjustment',
      path: ['note'],
    },
  )
  .refine(
    (input) => {
      const hasPrice =
        input.purchaseUnit !== undefined && input.purchasePriceVnd !== undefined;
      const priced = isPricedStockIn(input);
      // A positive stock-in lot needs a price; any other effect must omit it.
      return priced ? hasPrice : !hasPrice;
    },
    {
      message: 'a purchase price is required only for a positive stock-in lot',
      path: ['purchasePriceVnd'],
    },
  );

export type StockAdjustInput = z.infer<typeof stockAdjustInputSchema>;

/**
 * One Owner recipe line entered in a chosen unit. The server converts the
 * quantity and the fixed waste to integer base units and resolves Cost from
 * the current ingredient (REQ-INV-006, REQ-INV-007).
 */
export const recipeLineInputSchema = z.strictObject({
  ingredientId: z.string().min(1),
  quantity: z.number().positive(),
  unit: unitInputSchema,
  wasteQuantity: z.number().nonnegative().default(0),
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

/**
 * Inventory change report (REQ-INV-008). Returns the append-only ingredient and
 * recipe audit entries so the Owner or Kitchen can review every add, edit, and
 * archive with its actor and time. It reads the audit ledger and mutates nothing.
 */
export const inventoryChangeReportInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    limit: z.number().int().min(1).max(200).optional(),
  });
export type InventoryChangeReportInput = z.infer<
  typeof inventoryChangeReportInputSchema
>;

export const inventoryChangeEntrySchema = z.strictObject({
  eventId: z.string().min(1),
  action: z.string().min(1),
  targetType: z.string().min(1).nullable(),
  targetId: z.string().min(1).nullable(),
  targetName: z.string().min(1).nullable(),
  command: z.string().min(1).nullable(),
  actorType: z.string().min(1),
  role: z.string().min(1).nullable(),
  actorUid: z.string().min(1).nullable(),
  reason: z.string().min(1).nullable(),
  note: z.string().min(1).nullable(),
  quantityDelta: z.number().int().nullable(),
  createdAt: isoUtcTimestampSchema,
});
export type InventoryChangeEntry = z.infer<typeof inventoryChangeEntrySchema>;

export const inventoryChangeReportResultSchema = z.strictObject({
  schemaVersion: z.literal(INVENTORY_CONTRACT_VERSION),
  tenantId: z.string().min(1),
  entries: z.array(inventoryChangeEntrySchema).max(200),
});
export type InventoryChangeReportResult = z.infer<
  typeof inventoryChangeReportResultSchema
>;

/** The audit actions that describe an ingredient, recipe, or stock change. */
export const INVENTORY_CHANGE_ACTIONS: readonly string[] = [
  'IngredientChanged',
  'RecipeChanged',
  'StockAdjusted',
  'StockCountRecorded',
];
