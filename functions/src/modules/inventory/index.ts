import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  INVENTORY_CONTRACT_VERSION,
  ingredientCommandResultSchema,
  lossReviewInputSchema,
  lossReviewResultSchema,
  recipeCommandResultSchema,
  stockAdjustResultSchema,
  stockCountResultSchema,
  type Ingredient,
  type IngredientCommandResult,
  type LossFinding,
  type Recipe,
  type RecipeCommandResult,
  type StockAdjustResult,
  type StockMovement,
} from '../../../../shared/contracts/inventory.contract.js';
import {
  INVENTORY_COUNT_INVALID_MESSAGE,
  buildLossFindings,
  buildStockCount,
  computeExpectedQuantity,
  parseRecordStockCountInput,
  stockCountCollectionPath,
  toStockCount,
  type LossMovementInput,
} from './count.service.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { stableRequestHash } from '../../shared/idempotency.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  applyIngredientUpdate,
  applyRecipeUpdate,
  assertActiveOwnerMember,
  assertInventoryIdempotencyMatch,
  buildNewIngredient,
  buildNewRecipe,
  buildStockMovement,
  computeNextInventoryVersion,
  ingredientCollectionPath,
  INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
  INVENTORY_INSUFFICIENT_STOCK_MESSAGE,
  INVENTORY_INVALID_MESSAGE,
  INVENTORY_RECIPE_NOT_FOUND_MESSAGE,
  movementIdFor,
  nowIso,
  parseIngredientArchiveInput,
  parseIngredientCreateInput,
  parseIngredientUpdateInput,
  parseRecipeArchiveInput,
  parseRecipeCreateInput,
  parseRecipeUpdateInput,
  parseStockAdjustInput,
  recipeCollectionPath,
  requireUid,
  stockMovementCollectionPath,
  toIngredient,
  toRecipe,
  type InventoryIdempotencyRecord,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const INGREDIENT_CHANGED_ACTION = 'IngredientChanged';
const STOCK_ADJUSTED_ACTION = 'StockAdjusted';
const RECIPE_CHANGED_ACTION = 'RecipeChanged';

function ingredientResult(
  command: IngredientCommandResult['command'],
  ingredient: Ingredient | null,
  version: number,
): IngredientCommandResult {
  return ingredientCommandResultSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    command,
    status: 'applied',
    ingredient,
    version,
  });
}

function recipeResult(
  command: RecipeCommandResult['command'],
  recipe: Recipe | null,
  version: number,
): RecipeCommandResult {
  return recipeCommandResultSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    command,
    status: 'applied',
    recipe,
    version,
  });
}

/** Owner command: create one ingredient with an integer base-unit stock. */
export const callableInventoryCreateIngredient = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseIngredientCreateInput(request.data);

    const db = getDb();
    const ingredientRef = db.collection(ingredientCollectionPath(input.tenantId)).doc();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveOwnerMember(memberSnap.data());

      const ingredient = buildNewIngredient(input, ingredientRef.id, nowIso());
      transaction.set(ingredientRef, { ...ingredient, version: 1 });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: INGREDIENT_CHANGED_ACTION,
        targetType: 'ingredient',
        targetId: ingredientRef.id,
        detail: { command: 'create', baseUnit: ingredient.baseUnit },
      });
      return { ingredient, version: 1 };
    });

    return ingredientResult('create', outcome.ingredient, outcome.version);
  },
);

/** Owner command: replace ingredient metadata. Stock changes use adjustStock. */
export const callableInventoryUpdateIngredient = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseIngredientUpdateInput(request.data);

    const db = getDb();
    const ingredientRef = db.doc(
      `${ingredientCollectionPath(input.tenantId)}/${input.ingredientId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const ingredientSnap = await transaction.get(ingredientRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!ingredientSnap.exists) {
        throw new HttpsError(
          'not-found',
          INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
        );
      }

      const current = toIngredient(input.ingredientId, ingredientSnap.data() ?? {});
      const updated = applyIngredientUpdate(current, input, nowIso());
      const version = computeNextInventoryVersion(ingredientSnap.get('version'));
      transaction.set(ingredientRef, { ...updated, version });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: INGREDIENT_CHANGED_ACTION,
        targetType: 'ingredient',
        targetId: input.ingredientId,
        detail: { command: 'update', baseUnit: updated.baseUnit },
      });
      return { ingredient: updated, version };
    });

    return ingredientResult('update', outcome.ingredient, outcome.version);
  },
);

/** Owner command: archive an ingredient instead of deleting it. */
export const callableInventoryArchiveIngredient = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseIngredientArchiveInput(request.data);

    const db = getDb();
    const ingredientRef = db.doc(
      `${ingredientCollectionPath(input.tenantId)}/${input.ingredientId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const version = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const ingredientSnap = await transaction.get(ingredientRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!ingredientSnap.exists) {
        throw new HttpsError(
          'not-found',
          INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
        );
      }

      const current = toIngredient(input.ingredientId, ingredientSnap.data() ?? {});
      const now = nowIso();
      const nextVersion = computeNextInventoryVersion(ingredientSnap.get('version'));
      transaction.set(ingredientRef, {
        ...current,
        isActive: false,
        archivedAt: now,
        updatedAt: now,
        version: nextVersion,
      });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: INGREDIENT_CHANGED_ACTION,
        targetType: 'ingredient',
        targetId: input.ingredientId,
        reason: input.reason,
        detail: { command: 'archive' },
      });
      return nextVersion;
    });

    return ingredientResult('archive', null, version);
  },
);

/**
 * Owner command: apply one signed integer stock effect and write exactly one
 * stock movement. The idempotency key makes a retry safe (REQ-INV-001).
 */
export const callableInventoryAdjustStock = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseStockAdjustInput(request.data);
    const requestHash = stableRequestHash({
      command: 'adjustStock',
      tenantId: input.tenantId,
      ingredientId: input.ingredientId,
      delta: input.quantityDeltaBaseUnits,
      reason: input.reason,
    });

    const db = getDb();
    const ingredientRef = db.doc(
      `${ingredientCollectionPath(input.tenantId)}/${input.ingredientId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const movementRef = db.doc(`${stockMovementCollectionPath(input.tenantId)}/${movementIdFor(input.idempotencyKey, input.ingredientId)}`);
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );

    const outcome = await db.runTransaction<{
      replayed: boolean;
      ingredient: Ingredient;
      movement: StockMovement;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const ingredientSnap = await transaction.get(ingredientRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!ingredientSnap.exists) {
        throw new HttpsError(
          'not-found',
          INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
        );
      }

      const existing = idempotencySnap.data() as
        | InventoryIdempotencyRecord
        | undefined;
      const current = toIngredient(input.ingredientId, ingredientSnap.data() ?? {});
      if (existing) {
        assertInventoryIdempotencyMatch(existing, requestHash);
        const movementSnap = await transaction.get(movementRef);
        if (!movementSnap.exists) {
          throw new HttpsError('internal', INVENTORY_INVALID_MESSAGE);
        }
        return {
          replayed: true,
          ingredient: current,
          movement: movementSnap.data() as StockMovement,
        };
      }

      const nextStock = current.stockQuantity + input.quantityDeltaBaseUnits;
      if (nextStock < 0) {
        throw new HttpsError(
          'failed-precondition',
          INVENTORY_INSUFFICIENT_STOCK_MESSAGE,
        );
      }

      const now = nowIso();
      const updated: Ingredient = {
        ...current,
        stockQuantity: nextStock,
        updatedAt: now,
      };
      const movement = buildStockMovement({
        movementId: movementRef.id,
        tenantId: input.tenantId,
        ingredientId: input.ingredientId,
        quantityDelta: input.quantityDeltaBaseUnits,
        reason: input.reason,
        orderId: null,
        actorUid: uid,
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      });

      transaction.set(ingredientRef, { ...updated, version: computeNextInventoryVersion(ingredientSnap.get('version')) });
      transaction.set(movementRef, movement);
      transaction.set(idempotencyRef, {
        command: 'adjustStock',
        requestHash,
        movementId: movement.movementId,
        status: 'applied',
        createdAt: now,
      } satisfies InventoryIdempotencyRecord);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: STOCK_ADJUSTED_ACTION,
        targetType: 'ingredient',
        targetId: input.ingredientId,
        detail: {
          command: 'adjustStock',
          quantityDelta: input.quantityDeltaBaseUnits,
          reason: input.reason,
        },
      });
      return { replayed: false, ingredient: updated, movement };
    });

    const result: StockAdjustResult = stockAdjustResultSchema.parse({
      schemaVersion: INVENTORY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'applied',
      ingredient: outcome.ingredient,
      movement: outcome.movement,
    });
    return result;
  },
);

/**
 * Owner command: create a recipe whose Cost is resolved from the current
 * ingredient Cost. Reads every referenced ingredient before any write.
 */
export const callableInventoryCreateRecipe = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseRecipeCreateInput(request.data);

    const db = getDb();
    const recipeRef = db.collection(recipeCollectionPath(input.tenantId)).doc();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const ingredientRefs = input.lines.map((line) =>
      db.doc(`${ingredientCollectionPath(input.tenantId)}/${line.ingredientId}`),
    );

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const snaps = await transaction.getAll(...ingredientRefs);
      assertActiveOwnerMember(memberSnap.data());

      const ingredientsById = new Map<string, Ingredient>();
      snaps.forEach((snap, index) => {
        const ingredientId = input.lines[index]?.ingredientId;
        if (snap.exists && ingredientId) {
          ingredientsById.set(
            ingredientId,
            toIngredient(ingredientId, snap.data() ?? {}),
          );
        }
      });

      const recipe = buildNewRecipe(input, recipeRef.id, nowIso(), ingredientsById);
      transaction.set(recipeRef, { ...recipe, version: 1 });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: RECIPE_CHANGED_ACTION,
        targetType: 'recipe',
        targetId: recipeRef.id,
        detail: { command: 'create', costVnd: recipe.costVnd },
      });
      return { recipe, version: 1 };
    });

    return recipeResult('create', outcome.recipe, outcome.version);
  },
);

/** Owner command: replace a recipe and recompute its Cost. */
export const callableInventoryUpdateRecipe = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseRecipeUpdateInput(request.data);

    const db = getDb();
    const recipeRef = db.doc(
      `${recipeCollectionPath(input.tenantId)}/${input.recipeId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const ingredientRefs = input.lines.map((line) =>
      db.doc(`${ingredientCollectionPath(input.tenantId)}/${line.ingredientId}`),
    );

    const outcome = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const recipeSnap = await transaction.get(recipeRef);
      const snaps = await transaction.getAll(...ingredientRefs);
      assertActiveOwnerMember(memberSnap.data());
      if (!recipeSnap.exists) {
        throw new HttpsError('not-found', INVENTORY_RECIPE_NOT_FOUND_MESSAGE);
      }

      const ingredientsById = new Map<string, Ingredient>();
      snaps.forEach((snap, index) => {
        const ingredientId = input.lines[index]?.ingredientId;
        if (snap.exists && ingredientId) {
          ingredientsById.set(
            ingredientId,
            toIngredient(ingredientId, snap.data() ?? {}),
          );
        }
      });

      const current = toRecipe(input.recipeId, recipeSnap.data() ?? {});
      const updated = applyRecipeUpdate(current, input, nowIso(), ingredientsById);
      const version = computeNextInventoryVersion(recipeSnap.get('version'));
      transaction.set(recipeRef, { ...updated, version });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: RECIPE_CHANGED_ACTION,
        targetType: 'recipe',
        targetId: input.recipeId,
        detail: { command: 'update', costVnd: updated.costVnd },
      });
      return { recipe: updated, version };
    });

    return recipeResult('update', outcome.recipe, outcome.version);
  },
);

/** Owner command: archive a recipe instead of deleting it. */
export const callableInventoryArchiveRecipe = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseRecipeArchiveInput(request.data);

    const db = getDb();
    const recipeRef = db.doc(
      `${recipeCollectionPath(input.tenantId)}/${input.recipeId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const version = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const recipeSnap = await transaction.get(recipeRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!recipeSnap.exists) {
        throw new HttpsError('not-found', INVENTORY_RECIPE_NOT_FOUND_MESSAGE);
      }

      const current = toRecipe(input.recipeId, recipeSnap.data() ?? {});
      const now = nowIso();
      const nextVersion = computeNextInventoryVersion(recipeSnap.get('version'));
      transaction.set(recipeRef, {
        ...current,
        archivedAt: now,
        updatedAt: now,
        version: nextVersion,
      });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: RECIPE_CHANGED_ACTION,
        targetType: 'recipe',
        targetId: input.recipeId,
        reason: input.reason,
        detail: { command: 'archive' },
      });
      return nextVersion;
    });

    return recipeResult('archive', null, version);
  },
);

const MAX_COUNT_MOVEMENTS = 500;
const MAX_LOSS_COUNTS = 200;
const MAX_LOSS_MOVEMENTS = 500;
const MAX_LOSS_INGREDIENTS = 200;

function countDocId(idempotencyKey: string, ingredientId: string): string {
  return `${idempotencyKey}__${ingredientId}`;
}

function dayBounds(fromDay: string, toDay: string): { from: string; to: string } {
  const iso = (day: string): string =>
    `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z`;
  return { from: iso(fromDay), to: `${iso(toDay).slice(0, 11)}23:59:59.999Z` };
}

/**
 * Owner command: record a Stock count. The server computes the expected
 * quantity from the recorded stock-in, deduction, and restoration movements,
 * then stores the counted quantity, expected quantity, and variance with audit
 * (REQ-INV-003). It never rewrites a paid record.
 */
export const callableInventoryRecordStockCount = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseRecordStockCountInput(request.data);

    const db = getDb();
    const ingredientRef = db.doc(
      `${ingredientCollectionPath(input.tenantId)}/${input.ingredientId}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const countRef = db.doc(
      `${stockCountCollectionPath(input.tenantId)}/${countDocId(
        input.idempotencyKey,
        input.ingredientId,
      )}`,
    );
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );
    const movementsQuery = db
      .collection(stockMovementCollectionPath(input.tenantId))
      .where('ingredientId', '==', input.ingredientId)
      .limit(MAX_COUNT_MOVEMENTS);

    const outcome = await db.runTransaction<{
      replayed: boolean;
      stockCount: ReturnType<typeof buildStockCount>;
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const ingredientSnap = await transaction.get(ingredientRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const countSnap = await transaction.get(countRef);
      const movementsSnap = await transaction.get(movementsQuery);
      assertActiveOwnerMember(memberSnap.data());
      if (!ingredientSnap.exists) {
        throw new HttpsError(
          'not-found',
          INVENTORY_INGREDIENT_NOT_FOUND_MESSAGE,
        );
      }
      if (idempotencySnap.exists || countSnap.exists) {
        const stored = countSnap.exists
          ? toStockCount(countRef.id, countSnap.data() ?? {})
          : null;
        if (!stored) {
          throw new HttpsError('already-exists', INVENTORY_COUNT_INVALID_MESSAGE);
        }
        return { replayed: true, stockCount: stored };
      }

      const expectedQuantityBaseUnits = computeExpectedQuantity(
        movementsSnap.docs.map((docSnap) => ({
          quantityDelta: Number(docSnap.get('quantityDelta') ?? 0),
        })),
      );
      const now = nowIso();
      const stockCount = buildStockCount({
        countId: countRef.id,
        tenantId: input.tenantId,
        ingredientId: input.ingredientId,
        countedQuantityBaseUnits: input.countedQuantityBaseUnits,
        expectedQuantityBaseUnits,
        reason: input.reason ?? null,
        actorUid: uid,
        now,
      });
      transaction.set(countRef, stockCount);
      transaction.set(idempotencyRef, {
        command: 'recordStockCount',
        requestHash: `${input.ingredientId}:${input.countedQuantityBaseUnits}`,
        countId: stockCount.countId,
        status: 'applied',
        createdAt: now,
      });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'StockCountRecorded',
        targetType: 'ingredient',
        targetId: input.ingredientId,
        reason: input.reason ?? null,
        detail: {
          countId: stockCount.countId,
          counted: stockCount.countedQuantityBaseUnits,
          expected: stockCount.expectedQuantityBaseUnits,
          variance: stockCount.varianceBaseUnits,
        },
      });
      return { replayed: false, stockCount };
    });

    return stockCountResultSchema.parse({
      schemaVersion: INVENTORY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'applied',
      stockCount: outcome.stockCount,
    });
  },
);

/**
 * Owner query: grounded loss review. Each finding cites the count, movements,
 * and period; a missing count states the limitation and invents no value
 * (REQ-INV-004, NFR-AI-001). This command mutates no business state.
 */
export const callableInventoryReviewLoss = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const parsed = lossReviewInputSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', INVENTORY_COUNT_INVALID_MESSAGE);
    }
    const input = parsed.data;

    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveOwnerMember(memberSnap.data());

    const bounds = dayBounds(input.fromDay, input.toDay);
    // Firestore Query objects are immutable: each filter must be reassigned.
    let countsQuery = db
      .collection(stockCountCollectionPath(input.tenantId))
      .where('createdAt', '>=', bounds.from)
      .where('createdAt', '<=', bounds.to);
    let movementsQuery = db
      .collection(stockMovementCollectionPath(input.tenantId))
      .where('createdAt', '>=', bounds.from)
      .where('createdAt', '<=', bounds.to);
    if (input.ingredientId) {
      countsQuery = countsQuery.where('ingredientId', '==', input.ingredientId);
      movementsQuery = movementsQuery.where(
        'ingredientId',
        '==',
        input.ingredientId,
      );
    }
    countsQuery = countsQuery.limit(MAX_LOSS_COUNTS);
    movementsQuery = movementsQuery.limit(MAX_LOSS_MOVEMENTS);

    const [countsSnap, movementsSnap, ingredientsSnap] = await Promise.all([
      countsQuery.get(),
      movementsQuery.get(),
      db
        .collection(ingredientCollectionPath(input.tenantId))
        .limit(MAX_LOSS_INGREDIENTS)
        .get(),
    ]);

    const counts = countsSnap.docs.map((docSnap) =>
      toStockCount(docSnap.id, docSnap.data()),
    );
    const movements: LossMovementInput[] = movementsSnap.docs.map((docSnap) => ({
      movementId: docSnap.id,
      ingredientId: String(docSnap.get('ingredientId') ?? ''),
      quantityDelta: Number(docSnap.get('quantityDelta') ?? 0),
      createdAt: String(docSnap.get('createdAt') ?? ''),
    }));
    const ingredients = ingredientsSnap.docs.map((docSnap) => ({
      ingredientId: docSnap.id,
      name: String(docSnap.get('name') ?? docSnap.id),
    }));

    const findings: LossFinding[] = buildLossFindings({
      tenantId: input.tenantId,
      periodStart: input.fromDay,
      periodEnd: input.toDay,
      ingredients,
      movements,
      counts,
    });
    const limited = findings.slice(0, input.limit ?? MAX_LOSS_COUNTS);
    const missingDataNotes = [
      ...new Set(
        limited
          .filter((finding) => finding.missingData)
          .flatMap((finding) => finding.missingDataNotes),
      ),
    ].slice(0, 5);

    return lossReviewResultSchema.parse({
      schemaVersion: INVENTORY_CONTRACT_VERSION,
      tenantId: input.tenantId,
      periodStart: input.fromDay,
      periodEnd: input.toDay,
      findings: limited,
      missingData: missingDataNotes.length > 0,
      missingDataNotes,
      generatedAt: nowIso(),
    });
  },
);
