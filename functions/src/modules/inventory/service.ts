import { HttpsError } from 'firebase-functions/v2/https';
import type {
  DocumentData,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  INVENTORY_CONTRACT_VERSION,
  convertToBaseUnits,
  ingredientArchiveInputSchema,
  ingredientCreateInputSchema,
  ingredientSchema,
  ingredientUpdateInputSchema,
  inventoryDeductionPlanSchema,
  inventoryRestorationPlanSchema,
  recipeArchiveInputSchema,
  recipeCreateInputSchema,
  recipeLineInputSchema,
  recipeSchema,
  recipeUpdateInputSchema,
  stockAdjustInputSchema,
  stockMovementSchema,
  type Ingredient,
  type IngredientArchiveInput,
  type IngredientCreateInput,
  type IngredientUpdateInput,
  type InventoryDeductionPlan,
  type InventoryRestorationPlan,
  type Recipe,
  type RecipeArchiveInput,
  type RecipeCreateInput,
  type RecipeLineInput,
  type RecipeUpdateInput,
  type StockAdjustInput,
  type StockMovement,
} from '../../../../shared/contracts/inventory.contract.js';

export const INVENTORY_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được kho.';
export const INVENTORY_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const INVENTORY_INVALID_MESSAGE = 'Dữ liệu kho không hợp lệ.';
export const INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE =
  'Không tìm thấy nguyên liệu.';
export const INVENTORY_RECIPE_NOT_FOUND_MESSAGE = 'Không tìm thấy công thức.';
export const INVENTORY_INSUFFICIENT_STOCK_MESSAGE =
  'Không đủ nguyên liệu để bắt đầu nấu.';
export const INVENTORY_UNIT_MISMATCH_MESSAGE =
  'Đơn vị nhập không khớp với đơn vị gốc.';

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
    throw new HttpsError('permission-denied', INVENTORY_MEMBER_DENIED_MESSAGE);
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', INVENTORY_OWNER_DENIED_MESSAGE);
  }
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', INVENTORY_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseIngredientCreateInput(
  data: unknown,
): IngredientCreateInput {
  return parseOrInvalid<IngredientCreateInput>(ingredientCreateInputSchema, data);
}

export function parseIngredientUpdateInput(
  data: unknown,
): IngredientUpdateInput {
  return parseOrInvalid<IngredientUpdateInput>(ingredientUpdateInputSchema, data);
}

export function parseIngredientArchiveInput(
  data: unknown,
): IngredientArchiveInput {
  return parseOrInvalid<IngredientArchiveInput>(
    ingredientArchiveInputSchema,
    data,
  );
}

export function parseStockAdjustInput(data: unknown): StockAdjustInput {
  return parseOrInvalid<StockAdjustInput>(stockAdjustInputSchema, data);
}

export function parseRecipeCreateInput(data: unknown): RecipeCreateInput {
  return parseOrInvalid<RecipeCreateInput>(recipeCreateInputSchema, data);
}

export function parseRecipeUpdateInput(data: unknown): RecipeUpdateInput {
  return parseOrInvalid<RecipeUpdateInput>(recipeUpdateInputSchema, data);
}

export function parseRecipeArchiveInput(data: unknown): RecipeArchiveInput {
  return parseOrInvalid<RecipeArchiveInput>(recipeArchiveInputSchema, data);
}

/** Rebuild the frozen ingredient contract from a stored document. */
export function toIngredient(
  ingredientId: string,
  data: DocumentData,
): Ingredient {
  return ingredientSchema.parse({
    schemaVersion: data.schemaVersion ?? INVENTORY_CONTRACT_VERSION,
    ingredientId,
    tenantId: data.tenantId,
    name: data.name,
    baseUnit: data.baseUnit,
    unitCostVnd: data.unitCostVnd,
    stockQuantity: data.stockQuantity ?? 0,
    lowStockThreshold: data.lowStockThreshold ?? 0,
    isActive: data.isActive ?? false,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/** Rebuild the frozen recipe contract from a stored document. */
export function toRecipe(recipeId: string, data: DocumentData): Recipe {
  return recipeSchema.parse({
    schemaVersion: data.schemaVersion ?? INVENTORY_CONTRACT_VERSION,
    recipeId,
    tenantId: data.tenantId,
    menuItemId: data.menuItemId,
    lines: data.lines ?? [],
    costVnd: data.costVnd,
    costVersion: data.costVersion,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/**
 * Resolve the initial stock quantity. A kilogram or litre input is converted
 * to its integer base unit and must match the declared base unit
 * (docs/module/inventory.md).
 */
export function resolveInitialStockQuantity(
  input: IngredientCreateInput,
): number {
  if (input.stockInput === null) {
    return 0;
  }
  let converted: { baseUnit: string; quantity: number };
  try {
    converted = convertToBaseUnits(input.stockInput.quantity, input.stockInput.unit);
  } catch {
    throw new HttpsError('invalid-argument', INVENTORY_INVALID_MESSAGE);
  }
  if (converted.baseUnit !== input.baseUnit) {
    throw new HttpsError('invalid-argument', INVENTORY_UNIT_MISMATCH_MESSAGE);
  }
  return converted.quantity;
}

export function buildNewIngredient(
  input: IngredientCreateInput,
  ingredientId: string,
  now: string,
): Ingredient {
  return ingredientSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    ingredientId,
    tenantId: input.tenantId,
    name: input.name,
    baseUnit: input.baseUnit,
    unitCostVnd: input.unitCostVnd,
    stockQuantity: resolveInitialStockQuantity(input),
    lowStockThreshold: input.lowStockThreshold,
    isActive: input.isActive,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function applyIngredientUpdate(
  current: Ingredient,
  input: IngredientUpdateInput,
  now: string,
): Ingredient {
  return ingredientSchema.parse({
    ...current,
    name: input.name,
    baseUnit: input.baseUnit,
    unitCostVnd: input.unitCostVnd,
    lowStockThreshold: input.lowStockThreshold,
    isActive: input.isActive,
    archivedAt: current.archivedAt,
    updatedAt: now,
  });
}

export function computeNextInventoryVersion(current: unknown): number {
  return typeof current === 'number' &&
    Number.isInteger(current) &&
    current >= 0
    ? current + 1
    : 1;
}

/** Resolve one recipe line against the current ingredient Cost. */
export function resolveRecipeLine(
  line: RecipeLineInput,
  ingredient: Ingredient | undefined,
): Recipe['lines'][number] {
  if (!ingredient) {
    throw new HttpsError(
      'failed-precondition',
      INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
    );
  }
  const parsedLine = recipeLineInputSchema.safeParse(line);
  if (!parsedLine.success) {
    throw new HttpsError('invalid-argument', INVENTORY_INVALID_MESSAGE);
  }
  return {
    ingredientId: ingredient.ingredientId,
    quantityBaseUnits: parsedLine.data.quantityBaseUnits,
    unitCostVnd: ingredient.unitCostVnd,
    lineCostVnd: ingredient.unitCostVnd * parsedLine.data.quantityBaseUnits,
  };
}

/** Deterministic Cost is the integer sum of every resolved line Cost. */
export function computeRecipeCost(lines: Recipe['lines']): number {
  return lines.reduce((sum, line) => sum + line.lineCostVnd, 0);
}

export function buildNewRecipe(
  input: RecipeCreateInput,
  recipeId: string,
  now: string,
  ingredientsById: Map<string, Ingredient>,
): Recipe {
  const lines = input.lines.map((line) =>
    resolveRecipeLine(line, ingredientsById.get(line.ingredientId)),
  );
  return recipeSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    recipeId,
    tenantId: input.tenantId,
    menuItemId: input.menuItemId,
    lines,
    costVnd: computeRecipeCost(lines),
    costVersion: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });
}

export function applyRecipeUpdate(
  current: Recipe,
  input: RecipeUpdateInput,
  now: string,
  ingredientsById: Map<string, Ingredient>,
): Recipe {
  const lines = input.lines.map((line) =>
    resolveRecipeLine(line, ingredientsById.get(line.ingredientId)),
  );
  return recipeSchema.parse({
    ...current,
    menuItemId: input.menuItemId,
    lines,
    costVnd: computeRecipeCost(lines),
    costVersion: computeNextInventoryVersion(current.costVersion),
    archivedAt: current.archivedAt,
    updatedAt: now,
  });
}

/** Deterministic stock-movement id: one deduction per Order and ingredient. */
export function movementIdFor(
  orderId: string,
  ingredientId: string,
): string {
  return `${orderId}__${ingredientId}`;
}

export function buildStockMovement(
  args: {
    movementId: string;
    tenantId: string;
    ingredientId: string;
    quantityDelta: number;
    reason: StockMovement['reason'];
    orderId: string | null;
    actorUid: string | null;
    idempotencyKey: string;
    createdAt: string;
  },
): StockMovement {
  return stockMovementSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    ...args,
  });
}

export interface DeductionOrderItem {
  menuItemId: string;
  quantity: number;
}

export interface BuildDeductionPlanInput {
  tenantId: string;
  orderId: string;
  idempotencyKey: string;
  items: DeductionOrderItem[];
  recipesByMenuItemId: Map<string, Recipe>;
  ingredientsById: Map<string, Ingredient>;
  now: string;
}

/**
 * Compose the immutable deduction plan. Quantities aggregate per ingredient
 * across every Order line. The plan fails when stock is insufficient so the
 * whole cooking transaction aborts (REQ-INV-001, CON-004).
 */
export function buildInventoryDeductionPlan(
  input: BuildDeductionPlanInput,
): InventoryDeductionPlan {
  const required = new Map<string, number>();
  for (const item of input.items) {
    const recipe = input.recipesByMenuItemId.get(item.menuItemId);
    if (!recipe || recipe.archivedAt !== null) {
      continue;
    }
    for (const line of recipe.lines) {
      const current = required.get(line.ingredientId) ?? 0;
      required.set(
        line.ingredientId,
        current + line.quantityBaseUnits * item.quantity,
      );
    }
  }

  const lines: InventoryDeductionPlan['lines'] = [];
  for (const [ingredientId, quantityBaseUnits] of required) {
    const ingredient = input.ingredientsById.get(ingredientId);
    if (!ingredient || ingredient.archivedAt !== null) {
      throw new HttpsError(
        'failed-precondition',
        INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
      );
    }
    if (ingredient.stockQuantity < quantityBaseUnits) {
      throw new HttpsError(
        'failed-precondition',
        INVENTORY_INSUFFICIENT_STOCK_MESSAGE,
      );
    }
    lines.push({
      ingredientId,
      quantityBaseUnits,
      movementId: movementIdFor(input.orderId, ingredientId),
      previousStockQuantity: ingredient.stockQuantity,
    });
  }

  return inventoryDeductionPlanSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    tenantId: input.tenantId,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    reason: 'order_deduction',
    lines,
    createdAt: input.now,
  });
}

export interface InventoryIdempotencyRecord {
  command: string;
  requestHash: string;
  movementId: string;
  status: 'applied';
  createdAt: string;
}

/**
 * Compare a stored inventory idempotency record with the incoming request
 * hash. The same key with the same hash replays; a different hash fails.
 */
export function assertInventoryIdempotencyMatch(
  record: InventoryIdempotencyRecord,
  requestHash: string,
): void {
  if (record.requestHash !== requestHash) {
    throw new HttpsError('already-exists', INVENTORY_INVALID_MESSAGE);
  }
}

export function ingredientCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/ingredients`;
}

export function recipeCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/recipes`;
}

export function stockMovementCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/stockMovements`;
}

/**
 * Apply the plan inside the shared cooking transaction. Movement documents use
 * deterministic IDs so a Firestore transaction retry never duplicates a
 * deduction (docs/RULES_FIREBASE.md §4).
 */
export function applyInventoryDeductionPlan(
  transaction: Transaction,
  db: Firestore,
  plan: InventoryDeductionPlan,
  actorUid: string | null,
): void {
  for (const line of plan.lines) {
    transaction.set(
      db.doc(`${ingredientCollectionPath(plan.tenantId)}/${line.ingredientId}`),
      {
        stockQuantity: line.previousStockQuantity - line.quantityBaseUnits,
        updatedAt: plan.createdAt,
      },
      { merge: true },
    );
    transaction.set(
      db.doc(
        `${stockMovementCollectionPath(plan.tenantId)}/${line.movementId}`,
      ),
      buildStockMovement({
        movementId: line.movementId,
        tenantId: plan.tenantId,
        ingredientId: line.ingredientId,
        quantityDelta: -line.quantityBaseUnits,
        reason: 'order_deduction',
        orderId: plan.orderId,
        actorUid,
        idempotencyKey: plan.idempotencyKey,
        createdAt: plan.createdAt,
      }),
    );
  }
}

/** Deterministic restoration movement id: one restore per Order and ingredient. */
export function restorationMovementIdFor(
  orderId: string,
  ingredientId: string,
): string {
  return `${orderId}__restore__${ingredientId}`;
}

export interface RecordedDeduction {
  ingredientId: string;
  quantityBaseUnits: number;
}

export interface BuildRestorationPlanInput {
  tenantId: string;
  orderId: string;
  idempotencyKey: string;
  /** Recorded `order_deduction` movements for the Order. */
  deductions: RecordedDeduction[];
  ingredientsById: Map<string, Ingredient>;
  now: string;
}

/**
 * Compose the restitution plan from the recorded deduction movements. Quantities
 * aggregate per ingredient so a repeated restore attempt yields the same
 * deterministic movement id and never restores twice (REQ-INV-002).
 */
export function buildInventoryRestorationPlan(
  input: BuildRestorationPlanInput,
): InventoryRestorationPlan {
  const required = new Map<string, number>();
  for (const deduction of input.deductions) {
    if (
      !Number.isInteger(deduction.quantityBaseUnits) ||
      deduction.quantityBaseUnits <= 0
    ) {
      continue;
    }
    const current = required.get(deduction.ingredientId) ?? 0;
    required.set(
      deduction.ingredientId,
      current + deduction.quantityBaseUnits,
    );
  }

  const lines: InventoryRestorationPlan['lines'] = [];
  for (const [ingredientId, quantityBaseUnits] of required) {
    const ingredient = input.ingredientsById.get(ingredientId);
    if (!ingredient) {
      throw new HttpsError(
        'failed-precondition',
        INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
      );
    }
    lines.push({
      ingredientId,
      quantityBaseUnits,
      movementId: restorationMovementIdFor(input.orderId, ingredientId),
      previousStockQuantity: ingredient.stockQuantity,
    });
  }

  return inventoryRestorationPlanSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    tenantId: input.tenantId,
    orderId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    reason: 'order_restore',
    lines,
    createdAt: input.now,
  });
}

/**
 * Apply the restoration plan inside the shared cancellation transaction. The
 * deterministic movement id makes a Firestore retry safe (docs/RULES_FIREBASE
 * §4, REQ-INV-002).
 */
export function applyInventoryRestorationPlan(
  transaction: Transaction,
  db: Firestore,
  plan: InventoryRestorationPlan,
  actorUid: string | null,
): void {
  for (const line of plan.lines) {
    transaction.set(
      db.doc(`${ingredientCollectionPath(plan.tenantId)}/${line.ingredientId}`),
      {
        stockQuantity: line.previousStockQuantity + line.quantityBaseUnits,
        updatedAt: plan.createdAt,
      },
      { merge: true },
    );
    transaction.set(
      db.doc(
        `${stockMovementCollectionPath(plan.tenantId)}/${line.movementId}`,
      ),
      buildStockMovement({
        movementId: line.movementId,
        tenantId: plan.tenantId,
        ingredientId: line.ingredientId,
        quantityDelta: line.quantityBaseUnits,
        reason: 'order_restore',
        orderId: plan.orderId,
        actorUid,
        idempotencyKey: plan.idempotencyKey,
        createdAt: plan.createdAt,
      }),
    );
  }
}
