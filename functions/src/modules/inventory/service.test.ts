import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  applyIngredientUpdate,
  applyRecipeUpdate,
  assertActiveOwnerMember,
  assertInventoryIdempotencyMatch,
  buildInventoryDeductionPlan,
  buildInventoryRestorationPlan,
  buildNewIngredient,
  buildNewRecipe,
  buildStockMovement,
  computeNextInventoryVersion,
  computeRecipeCost,
  movementIdFor,
  restorationMovementIdFor,
  parseIngredientCreateInput,
  parseStockAdjustInput,
  resolveInitialStockQuantity,
  toIngredient,
  type InventoryIdempotencyRecord,
} from './service.js';
import {
  convertToBaseUnits,
  ingredientCreateInputSchema,
  type Ingredient,
  type Recipe,
} from '../../../../shared/contracts/inventory.contract.js';
import {
  INGREDIENT_BEEF_ID_FIXTURE,
  INGREDIENT_NOODLE_ID_FIXTURE,
  beefIngredientFixture,
  noodleIngredientFixture,
  recipeFixture,
} from '../../../../shared/fixtures/inventory.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';
import { MENU_ITEM_ID_FIXTURE } from '../../../../shared/fixtures/catalog.fixture.js';

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_A_FIXTURE,
    name: 'Bánh phở',
    baseUnit: 'g',
    unitCostVnd: 40,
    lowStockThreshold: 500,
    isActive: true,
    stockInput: { unit: 'kg', quantity: 10 },
    ...overrides,
  };
}

describe('base-unit conversion', () => {
  it('converts kilogram and litre inputs into integer base units', () => {
    expect(convertToBaseUnits(1.5, 'kg')).toEqual({ baseUnit: 'g', quantity: 1500 });
    expect(convertToBaseUnits(2, 'l')).toEqual({ baseUnit: 'ml', quantity: 2000 });
    expect(convertToBaseUnits(3, 'unit')).toEqual({ baseUnit: 'unit', quantity: 3 });
  });

  it('rejects an input that does not convert to an integer base unit', () => {
    expect(() => convertToBaseUnits(0.5, 'g')).toThrow(
      'quantity does not convert to an integer base unit',
    );
  });

  it('accepts only positive quantities', () => {
    expect(() => convertToBaseUnits(0, 'kg')).toThrow();
  });
});

describe('ingredient creation with integer base units and VND Cost', () => {
  it('converts and stores the declared base unit', () => {
    const parsed = parseIngredientCreateInput(createInput());
    expect(resolveInitialStockQuantity(parsed)).toBe(10000);
    const ingredient = buildNewIngredient(
      parsed,
      INGREDIENT_NOODLE_ID_FIXTURE,
      '2026-09-12T05:00:00.000Z',
    );
    expect(ingredient.baseUnit).toBe('g');
    expect(Number.isInteger(ingredient.stockQuantity)).toBe(true);
    expect(Number.isInteger(ingredient.unitCostVnd)).toBe(true);
    expect(ingredient.stockQuantity).toBe(10000);
  });

  it('defaults the opening stock to zero when no stock input is given', () => {
    const parsed = parseIngredientCreateInput(createInput({ stockInput: null }));
    expect(resolveInitialStockQuantity(parsed)).toBe(0);
  });

  it('rejects a unit that does not match the declared base unit', () => {
    const parsed = parseIngredientCreateInput(createInput({ baseUnit: 'ml' }));
    expect(() => resolveInitialStockQuantity(parsed)).toThrow(HttpsError);
  });

  it('rejects a fractional stock and a negative Cost', () => {
    expect(
      ingredientCreateInputSchema.safeParse(
        createInput({ stockInput: { unit: 'g', quantity: 0.5 } }),
      ).success,
    ).toBe(true);
    const parsed = parseIngredientCreateInput(
      createInput({ stockInput: { unit: 'g', quantity: 0.5 } }),
    );
    expect(() => resolveInitialStockQuantity(parsed)).toThrow(HttpsError);

    expect(() =>
      parseIngredientCreateInput(createInput({ unitCostVnd: -1 })),
    ).toThrow(HttpsError);
  });
});

describe('ingredient update and owner gate', () => {
  it('preserves id, timestamps, and stock on metadata update', () => {
    const updated = applyIngredientUpdate(
      noodleIngredientFixture,
      {
        tenantId: TENANT_A_FIXTURE,
        ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
        name: 'Bánh phở mới',
        baseUnit: 'g',
        unitCostVnd: 45,
        lowStockThreshold: 600,
        isActive: true,
      },
      '2026-09-13T00:00:00.000Z',
    );
    expect(updated.ingredientId).toBe(INGREDIENT_NOODLE_ID_FIXTURE);
    expect(updated.stockQuantity).toBe(noodleIngredientFixture.stockQuantity);
    expect(updated.createdAt).toBe(noodleIngredientFixture.createdAt);
    expect(updated.unitCostVnd).toBe(45);
  });

  it('denies a non-owner member', () => {
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff', isActive: true }),
    ).toThrow(HttpsError);
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: false }),
    ).toThrow(HttpsError);
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
  });
});

describe('recipe Cost determination', () => {
  it('sums integer line Cost from current ingredient Cost', () => {
    const ingredients = new Map<string, Ingredient>([
      [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
      [INGREDIENT_BEEF_ID_FIXTURE, beefIngredientFixture],
    ]);
    const recipe = buildNewRecipe(
      {
        tenantId: TENANT_A_FIXTURE,
        menuItemId: MENU_ITEM_ID_FIXTURE,
        lines: [
          { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantityBaseUnits: 200 },
          { ingredientId: INGREDIENT_BEEF_ID_FIXTURE, quantityBaseUnits: 100 },
        ],
      },
      'recipe-new-001',
      '2026-09-12T05:00:00.000Z',
      ingredients,
    );
    expect(recipe.costVnd).toBe(8000 + 30000);
    expect(computeRecipeCost(recipe.lines)).toBe(38000);
    expect(recipe.costVersion).toBe(1);
    expect(Number.isInteger(recipe.costVnd)).toBe(true);
  });

  it('fails when a referenced ingredient is missing', () => {
    expect(() =>
      buildNewRecipe(
        {
          tenantId: TENANT_A_FIXTURE,
          menuItemId: MENU_ITEM_ID_FIXTURE,
          lines: [
            { ingredientId: 'ingredient-missing', quantityBaseUnits: 1 },
          ],
        },
        'recipe-new-001',
        '2026-09-12T05:00:00.000Z',
        new Map(),
      ),
    ).toThrow(HttpsError);
  });

  it('recomputes Cost and increments costVersion on update', () => {
    const ingredients = new Map<string, Ingredient>([
      [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
      [INGREDIENT_BEEF_ID_FIXTURE, beefIngredientFixture],
    ]);
    const updated = applyRecipeUpdate(
      recipeFixture,
      {
        tenantId: TENANT_A_FIXTURE,
        recipeId: recipeFixture.recipeId,
        menuItemId: MENU_ITEM_ID_FIXTURE,
        lines: [
          { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantityBaseUnits: 100 },
        ],
      },
      '2026-09-13T00:00:00.000Z',
      ingredients,
    );
    expect(updated.costVnd).toBe(4000);
    expect(updated.costVersion).toBe(recipeFixture.costVersion + 1);
    expect(updated.recipeId).toBe(recipeFixture.recipeId);
  });
});

describe('deduction plan composition', () => {
  function planFor(stock: number, orderQuantity = 2) {
    const noodle: Ingredient = { ...noodleIngredientFixture, stockQuantity: stock };
    return buildInventoryDeductionPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-pho-001',
      idempotencyKey: 'idem-cook-0001',
      items: [{ menuItemId: MENU_ITEM_ID_FIXTURE, quantity: orderQuantity }],
      recipesByMenuItemId: new Map<string, Recipe>([
        [MENU_ITEM_ID_FIXTURE, recipeFixture],
      ]),
      ingredientsById: new Map<string, Ingredient>([
        [INGREDIENT_NOODLE_ID_FIXTURE, noodle],
        [INGREDIENT_BEEF_ID_FIXTURE, beefIngredientFixture],
      ]),
      now: '2026-09-12T07:05:00.000Z',
    });
  }

  it('aggregates exact quantities once per ingredient', () => {
    const plan = planFor(10000, 2);
    expect(plan.lines).toHaveLength(2);
    const noodle = plan.lines.find(
      (line) => line.ingredientId === INGREDIENT_NOODLE_ID_FIXTURE,
    );
    const beef = plan.lines.find(
      (line) => line.ingredientId === INGREDIENT_BEEF_ID_FIXTURE,
    );
    expect(noodle?.quantityBaseUnits).toBe(400);
    expect(beef?.quantityBaseUnits).toBe(200);
    expect(noodle?.movementId).toBe('order-pho-001__ingredient-noodle-001');
    expect(beef?.movementId).toBe('order-pho-001__ingredient-beef-001');
  });

  it('is deterministic so a transaction retry reuses the same movements', () => {
    const first = planFor(10000, 1);
    const second = planFor(10000, 1);
    expect(second.lines.map((line) => line.movementId)).toEqual(
      first.lines.map((line) => line.movementId),
    );
    expect(movementIdFor('order-x', 'ingredient-y')).toBe(
      movementIdFor('order-x', 'ingredient-y'),
    );
  });

  it('fails the whole plan when stock is insufficient', () => {
    expect(() => planFor(100)).toThrow(HttpsError);
  });

  it('ignores an archived recipe and creates no deduction', () => {
    const plan = buildInventoryDeductionPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-pho-001',
      idempotencyKey: 'idem-cook-0001',
      items: [{ menuItemId: MENU_ITEM_ID_FIXTURE, quantity: 1 }],
      recipesByMenuItemId: new Map<string, Recipe>([
        [
          MENU_ITEM_ID_FIXTURE,
          { ...recipeFixture, archivedAt: '2026-09-12T06:00:00.000Z' },
        ],
      ]),
      ingredientsById: new Map(),
      now: '2026-09-12T07:05:00.000Z',
    });
    expect(plan.lines).toEqual([]);
  });
});

describe('stock movement and idempotency', () => {
  it('builds a signed movement and validates the result', () => {
    const movement = buildStockMovement({
      movementId: movementIdFor('order-pho-001', INGREDIENT_NOODLE_ID_FIXTURE),
      tenantId: TENANT_A_FIXTURE,
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityDelta: -400,
      reason: 'order_deduction',
      orderId: 'order-pho-001',
      actorUid: 'uid-kitchen-001',
      idempotencyKey: 'idem-cook-0001',
      createdAt: '2026-09-12T07:05:00.000Z',
    });
    expect(movement.quantityDelta).toBe(-400);
    expect(movement.reason).toBe('order_deduction');
  });

  it('replays the same key and rejects a different request hash', () => {
    const record: InventoryIdempotencyRecord = {
      command: 'adjustStock',
      requestHash: 'hash-a',
      movementId: 'movement-a',
      status: 'applied',
      createdAt: '2026-09-12T07:05:00.000Z',
    };
    expect(() => assertInventoryIdempotencyMatch(record, 'hash-a')).not.toThrow();
    expect(() => assertInventoryIdempotencyMatch(record, 'hash-b')).toThrow(
      HttpsError,
    );
  });

  it('rejects a zero stock delta', () => {
    expect(() =>
      parseStockAdjustInput({
        tenantId: TENANT_A_FIXTURE,
        ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
        quantityDeltaBaseUnits: 0,
        reason: 'manual_adjustment',
        idempotencyKey: 'idem-stock-0001',
      }),
    ).toThrow(HttpsError);
  });
});

describe('inventory restoration plan', () => {
  const ingredientsById = () =>
    new Map<string, Ingredient>([
      [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
      [INGREDIENT_BEEF_ID_FIXTURE, beefIngredientFixture],
    ]);

  it('builds one restore line per recorded deduction with a deterministic id', () => {
    const plan = buildInventoryRestorationPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-pho-001',
      idempotencyKey: 'idem-cancel-0001',
      deductions: [
        { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantityBaseUnits: 400 },
        { ingredientId: INGREDIENT_BEEF_ID_FIXTURE, quantityBaseUnits: 200 },
      ],
      ingredientsById: ingredientsById(),
      now: '2026-09-12T08:00:00.000Z',
    });

    expect(plan.reason).toBe('order_restore');
    expect(plan.lines).toHaveLength(2);
    expect(plan.lines[0].movementId).toBe(
      restorationMovementIdFor('order-pho-001', INGREDIENT_NOODLE_ID_FIXTURE),
    );
    expect(plan.lines[0].previousStockQuantity).toBe(10000);
    expect(plan.lines[1].previousStockQuantity).toBe(5000);
  });

  it('aggregates repeated deductions for one ingredient exactly once', () => {
    const plan = buildInventoryRestorationPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-pho-002',
      idempotencyKey: 'idem-cancel-0002',
      deductions: [
        { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantityBaseUnits: 200 },
        { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantityBaseUnits: 200 },
      ],
      ingredientsById: ingredientsById(),
      now: '2026-09-12T08:00:00.000Z',
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].quantityBaseUnits).toBe(400);
  });

  it('rejects a missing ingredient before any restore is written', () => {
    expect(() =>
      buildInventoryRestorationPlan({
        tenantId: TENANT_A_FIXTURE,
        orderId: 'order-pho-003',
        idempotencyKey: 'idem-cancel-0003',
        deductions: [{ ingredientId: 'missing', quantityBaseUnits: 10 }],
        ingredientsById: ingredientsById(),
        now: '2026-09-12T08:00:00.000Z',
      }),
    ).toThrow(HttpsError);
  });
});

describe('contract version helpers', () => {
  it('increments a missing or non-integer version to one', () => {
    expect(computeNextInventoryVersion(undefined)).toBe(1);
    expect(computeNextInventoryVersion('x')).toBe(1);
    expect(computeNextInventoryVersion(4)).toBe(5);
  });

  it('rebuilds an ingredient contract from storage', () => {
    const ingredient = toIngredient(INGREDIENT_NOODLE_ID_FIXTURE, {
      ...noodleIngredientFixture,
      version: 3,
    });
    expect(ingredient.ingredientId).toBe(INGREDIENT_NOODLE_ID_FIXTURE);
    expect('version' in ingredient).toBe(false);
  });
});
