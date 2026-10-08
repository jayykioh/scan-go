import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ingredientSchema,
  inventoryChangeReportResultSchema,
  recipeSchema,
  type Ingredient,
  type IngredientArchiveInput,
  type IngredientCommandResult,
  type IngredientCreateInput,
  type IngredientUpdateInput,
  type InventoryChangeReportResult,
  type Recipe,
  type RecipeCommandResult,
  type RecipeCreateInput,
  type RecipeUpdateInput,
  type StockAdjustInput,
  type StockAdjustResult,
} from '@contracts/inventory.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

export const INGREDIENT_LISTENER_LIMIT = 100;
export const RECIPE_LISTENER_LIMIT = 100;

export type IngredientCreateFields = Omit<IngredientCreateInput, 'tenantId'>;
export type IngredientUpdateFields = Omit<
  IngredientUpdateInput,
  'tenantId' | 'ingredientId'
>;
export type RecipeCreateFields = Omit<RecipeCreateInput, 'tenantId'>;
export type RecipeUpdateFields = Omit<
  RecipeUpdateInput,
  'tenantId' | 'recipeId'
>;

async function readActiveTenantId(
  db: Firestore,
  uid: string,
): Promise<string | null> {
  const userSnap = await getDoc(doc(db, 'users', uid));
  if (!userSnap.exists()) {
    return null;
  }
  const activeTenantId = userSnap.get('activeTenantId');
  return typeof activeTenantId === 'string' ? activeTenantId : null;
}

async function currentTenantContext(): Promise<{
  db: Firestore;
  tenantId: string;
}> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  const tenantId = await readActiveTenantId(db, uid);
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return { db, tenantId };
}

/** Rebuild the frozen ingredient contract from a stored document. */
export function mapStoredIngredient(
  ingredientId: string,
  data: DocumentData,
): Ingredient {
  return ingredientSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    ingredientId,
    tenantId: data.tenantId,
    name: data.name,
    baseUnit: data.baseUnit,
    purchaseUnit: data.purchaseUnit ?? null,
    countUnitLabel: data.countUnitLabel ?? null,
    purchasePriceVnd: data.purchasePriceVnd ?? null,
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
export function mapStoredRecipe(
  recipeId: string,
  data: DocumentData,
): Recipe {
  return recipeSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    recipeId,
    tenantId: data.tenantId,
    menuItemId: data.menuItemId,
    lines: (data.lines ?? []).map((line: DocumentData) => ({
      ingredientId: line.ingredientId,
      quantityBaseUnits: line.quantityBaseUnits,
      wasteBaseUnits: line.wasteBaseUnits ?? 0,
      unitCostVnd: line.unitCostVnd,
      lineCostVnd: line.lineCostVnd,
    })),
    costVnd: data.costVnd,
    costVersion: data.costVersion,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

export async function createIngredient(
  fields: IngredientCreateFields,
): Promise<IngredientCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    IngredientCreateInput,
    IngredientCommandResult
  >(functions, 'callableInventoryCreateIngredient');
  return (await callable({ ...fields, tenantId })).data;
}

export async function updateIngredient(
  ingredientId: string,
  fields: IngredientUpdateFields,
): Promise<IngredientCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    IngredientUpdateInput,
    IngredientCommandResult
  >(functions, 'callableInventoryUpdateIngredient');
  return (await callable({ ...fields, tenantId, ingredientId })).data;
}

/** Apply one integer base-unit stock effect through the server command. A
 *  purchase lot carries its own price so the server can record it and move the
 *  ingredient Cost to the weighted average (REQ-INV-010, ADR 0014). */
export async function adjustStock(
  ingredientId: string,
  quantityDeltaBaseUnits: number,
  reason: StockAdjustInput['reason'],
  idempotencyKey: string,
  note?: string | null,
  lot?: { purchaseUnit: StockAdjustInput['purchaseUnit']; purchasePriceVnd: number },
): Promise<StockAdjustResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<StockAdjustInput, StockAdjustResult>(
    functions,
    'callableInventoryAdjustStock',
  );
  return (
    await callable({
      tenantId,
      ingredientId,
      quantityDeltaBaseUnits,
      reason,
      idempotencyKey,
      note: note ?? null,
      ...(lot ? { purchaseUnit: lot.purchaseUnit, purchasePriceVnd: lot.purchasePriceVnd } : {}),
    })
  ).data;
}

export async function createRecipe(
  fields: RecipeCreateFields,
): Promise<RecipeCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<RecipeCreateInput, RecipeCommandResult>(
    functions,
    'callableInventoryCreateRecipe',
  );
  return (await callable({ ...fields, tenantId })).data;
}

export async function updateRecipe(
  recipeId: string,
  fields: RecipeUpdateFields,
): Promise<RecipeCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<RecipeUpdateInput, RecipeCommandResult>(
    functions,
    'callableInventoryUpdateRecipe',
  );
  return (await callable({ ...fields, tenantId, recipeId })).data;
}

/** Owner or Kitchen command: archive an ingredient instead of deleting it. */
export async function archiveIngredient(
  ingredientId: string,
  reason: string | null,
): Promise<IngredientCommandResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    IngredientArchiveInput,
    IngredientCommandResult
  >(functions, 'callableInventoryArchiveIngredient');
  return (await callable({ tenantId, ingredientId, reason })).data;
}

/**
 * Read the append-only inventory change report (REQ-INV-008). Owner and Kitchen
 * review every add, edit, and archive with its actor and time.
 */
export async function getInventoryChangeReport(
  limit = 50,
): Promise<InventoryChangeReportResult> {
  const functions = getFirebaseFunctions();
  const { tenantId } = await currentTenantContext();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable<
    { tenantId: string; limit: number },
    InventoryChangeReportResult
  >(functions, 'callableInventoryChangeReport');
  const result = await callable({ tenantId, limit });
  return inventoryChangeReportResultSchema.parse(result.data);
}

/** Bounded ingredient listener for the Owner stock page. */
export function subscribeIngredients(
  onChange: (ingredients: Ingredient[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    onChange([]);
    return () => undefined;
  }

  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;

  void readActiveTenantId(db, uid).then((tenantId) => {
    if (cancelled || !tenantId) {
      return;
    }
    const ingredientQuery = query(
      collection(db, 'tenants', tenantId, 'ingredients'),
      orderBy('name'),
      limit(INGREDIENT_LISTENER_LIMIT),
    );
    unsubscribe = onSnapshot(
      ingredientQuery,
      (snap) => {
        onChange(
          snap.docs.map((docSnap) =>
            mapStoredIngredient(docSnap.id, docSnap.data()),
          ),
        );
      },
      (error) => onError?.(error),
    );
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** Bounded recipe listener for the Owner recipe page. */
export function subscribeRecipes(
  onChange: (recipes: Recipe[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    onChange([]);
    return () => undefined;
  }

  let unsubscribe: Unsubscribe | null = null;
  let cancelled = false;

  void readActiveTenantId(db, uid).then((tenantId) => {
    if (cancelled || !tenantId) {
      return;
    }
    const recipeQuery = query(
      collection(db, 'tenants', tenantId, 'recipes'),
      orderBy('menuItemId'),
      limit(RECIPE_LISTENER_LIMIT),
    );
    unsubscribe = onSnapshot(
      recipeQuery,
      (snap) => {
        onChange(
          snap.docs.map((docSnap) => mapStoredRecipe(docSnap.id, docSnap.data())),
        );
      },
      (error) => onError?.(error),
    );
  });

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
