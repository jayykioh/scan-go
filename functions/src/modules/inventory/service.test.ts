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
  computeWeightedAverageUnitCost,
  lotPriceIncreasePercent,
  movementIdFor,
  restorationMovementIdFor,
  parseIngredientCreateInput,
  parseIngredientUpdateInput,
  parseStockAdjustInput,
  resolveInitialStockQuantity,
  resolveStockInLotUnitCost,
  toIngredient,
  type InventoryIdempotencyRecord,
} from './service.js';
import {
  convertToBaseUnits,
  convertUnitCostToBase,
  ingredientCreateInputSchema,
  resolveCountUnitLabel,
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
    purchaseUnit: 'kg',
    purchasePriceVnd: 40000,
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

  it('converts a purchase price into integer Cost per base unit', () => {
    expect(convertUnitCostToBase(40000, 'kg')).toBe(40);
    expect(convertUnitCostToBase(2500, 'g')).toBe(2500);
    expect(convertUnitCostToBase(15000, 'l')).toBe(15);
    expect(() => convertUnitCostToBase(-1, 'kg')).toThrow();
  });

  it('rejects a stock unit that does not match the purchase base unit', () => {
    const parsed = parseIngredientCreateInput(createInput({ purchaseUnit: 'l' }));
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
      parseIngredientCreateInput(createInput({ purchasePriceVnd: -1 })),
    ).toThrow(HttpsError);
  });

  it('stores a free-text count unit name and requires it for a count unit', () => {
    expect(() =>
      parseIngredientCreateInput(
        createInput({ purchaseUnit: 'unit', stockInput: null }),
      ),
    ).toThrow(HttpsError);

    const parsed = parseIngredientCreateInput(
      createInput({
        purchaseUnit: 'unit',
        countUnitLabel: 'trái',
        purchasePriceVnd: 5000,
        stockInput: { unit: 'unit', quantity: 10 },
      }),
    );
    const ingredient = buildNewIngredient(
      parsed,
      INGREDIENT_NOODLE_ID_FIXTURE,
      '2026-09-12T05:00:00.000Z',
    );
    expect(ingredient.baseUnit).toBe('unit');
    expect(ingredient.countUnitLabel).toBe('trái');

    const update = applyIngredientUpdate(
      ingredient,
      parseIngredientUpdateInput({
        tenantId: TENANT_A_FIXTURE,
        ingredientId: ingredient.ingredientId,
        name: ingredient.name,
        purchaseUnit: 'unit',
        countUnitLabel: 'hộp',
        purchasePriceVnd: 5000,
        lowStockThreshold: 10,
        isActive: true,
      }),
      '2026-09-12T06:00:00.000Z',
    );
    expect(update.countUnitLabel).toBe('hộp');
  });

  it('clears the count unit name for mass and volume ingredients', () => {
    expect(
      resolveCountUnitLabel({ purchaseUnit: 'kg', countUnitLabel: 'trái' }),
    ).toBeNull();
    expect(resolveCountUnitLabel({ purchaseUnit: 'unit', countUnitLabel: '  ' })).toBeNull();
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
        purchaseUnit: 'kg',
        purchasePriceVnd: 45000,
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
          { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantity: 200, unit: 'g' },
          { ingredientId: INGREDIENT_BEEF_ID_FIXTURE, quantity: 100, unit: 'g' },
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

  it('converts a kilogram line and adds fixed waste to the Cost', () => {
    const ingredients = new Map<string, Ingredient>([
      [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
    ]);
    const recipe = buildNewRecipe(
      {
        tenantId: TENANT_A_FIXTURE,
        menuItemId: MENU_ITEM_ID_FIXTURE,
        lines: [
          {
            ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
            quantity: 0.2,
            unit: 'kg',
            wasteQuantity: 0.02,
          },
        ],
      },
      'recipe-new-002',
      '2026-09-12T05:00:00.000Z',
      ingredients,
    );
    expect(recipe.lines[0].quantityBaseUnits).toBe(200);
    expect(recipe.lines[0].wasteBaseUnits).toBe(20);
    expect(recipe.costVnd).toBe(40 * 220);
  });

  it('rejects a line unit that does not match the ingredient base unit', () => {
    const ingredients = new Map<string, Ingredient>([
      [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
    ]);
    expect(() =>
      buildNewRecipe(
        {
          tenantId: TENANT_A_FIXTURE,
          menuItemId: MENU_ITEM_ID_FIXTURE,
          lines: [
            { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantity: 200, unit: 'ml' },
          ],
        },
        'recipe-new-003',
        '2026-09-12T05:00:00.000Z',
        ingredients,
      ),
    ).toThrow(HttpsError);
  });

  it('fails when a referenced ingredient is missing', () => {
    expect(() =>
      buildNewRecipe(
        {
          tenantId: TENANT_A_FIXTURE,
          menuItemId: MENU_ITEM_ID_FIXTURE,
          lines: [
            { ingredientId: 'ingredient-missing', quantity: 1, unit: 'g' },
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
          { ingredientId: INGREDIENT_NOODLE_ID_FIXTURE, quantity: 100, unit: 'g' },
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

  it('adds fixed waste to the deducted quantity', () => {
    const recipe: Recipe = {
      ...recipeFixture,
      lines: [
        { ...recipeFixture.lines[0], wasteBaseUnits: 50 },
        recipeFixture.lines[1],
      ],
    };
    const plan = buildInventoryDeductionPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-pho-001',
      idempotencyKey: 'idem-cook-0001',
      items: [{ menuItemId: MENU_ITEM_ID_FIXTURE, quantity: 2 }],
      recipesByMenuItemId: new Map<string, Recipe>([
        [MENU_ITEM_ID_FIXTURE, recipe],
      ]),
      ingredientsById: new Map<string, Ingredient>([
        [INGREDIENT_NOODLE_ID_FIXTURE, noodleIngredientFixture],
        [INGREDIENT_BEEF_ID_FIXTURE, beefIngredientFixture],
      ]),
      now: '2026-09-12T07:05:00.000Z',
    });
    const noodle = plan.lines.find(
      (line) => line.ingredientId === INGREDIENT_NOODLE_ID_FIXTURE,
    );
    expect(noodle?.quantityBaseUnits).toBe((200 + 50) * 2);
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
        note: 'Kiểm tra',
      }),
    ).toThrow(HttpsError);
  });

  it('requires a note for waste and manual adjustment', () => {
    const base = {
      tenantId: TENANT_A_FIXTURE,
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityDeltaBaseUnits: -100,
      idempotencyKey: 'idem-stock-note-0001',
    } as const;
    expect(() =>
      parseStockAdjustInput({ ...base, reason: 'waste' }),
    ).toThrow(HttpsError);
    expect(() =>
      parseStockAdjustInput({ ...base, reason: 'manual_adjustment' }),
    ).toThrow(HttpsError);
    expect(
      parseStockAdjustInput({
        ...base,
        reason: 'waste',
        note: 'Hết hạn',
      }).note,
    ).toBe('Hết hạn');
    expect(() =>
      parseStockAdjustInput({
        tenantId: TENANT_A_FIXTURE,
        ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
        quantityDeltaBaseUnits: -100,
        reason: 'order_deduction',
        idempotencyKey: 'idem-stock-note-0002',
      }),
    ).not.toThrow();
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

describe('weighted-average lot Cost (REQ-INV-010, ADR 0014)', () => {
  it('averages quantity on hand and the new lot as integer VND', () => {
    // 1000 g at 100 VND/g plus 1000 g at 200 VND/g -> 150 VND/g.
    expect(
      computeWeightedAverageUnitCost({
        onHandQuantity: 1000,
        currentUnitCostVnd: 100,
        lotQuantity: 1000,
        lotUnitCostVnd: 200,
      }),
    ).toBe(150);
    expect(Number.isInteger(
      computeWeightedAverageUnitCost({
        onHandQuantity: 300,
        currentUnitCostVnd: 33,
        lotQuantity: 700,
        lotUnitCostVnd: 100,
      }),
    )).toBe(true);
  });

  it('uses the new lot price when there is no usable stock on hand', () => {
    expect(
      computeWeightedAverageUnitCost({
        onHandQuantity: 0,
        currentUnitCostVnd: 100,
        lotQuantity: 500,
        lotUnitCostVnd: 220,
      }),
    ).toBe(220);
  });

  it('ignores a negative on-hand quantity instead of lowering the Cost', () => {
    expect(
      computeWeightedAverageUnitCost({
        onHandQuantity: -50,
        currentUnitCostVnd: 50,
        lotQuantity: 100,
        lotUnitCostVnd: 200,
      }),
    ).toBe(200);
  });

  it('requires a price for a positive stock-in lot and rejects one otherwise', () => {
    const priced = parseStockAdjustInput({
      tenantId: TENANT_A_FIXTURE,
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityDeltaBaseUnits: 1000,
      reason: 'stock_in',
      idempotencyKey: 'idem-lot-0001',
      purchaseUnit: 'kg',
      purchasePriceVnd: 200000,
    });
    expect(resolveStockInLotUnitCost(priced)).toBe(200);

    const missing = () =>
      parseStockAdjustInput({
        tenantId: TENANT_A_FIXTURE,
        ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
        quantityDeltaBaseUnits: 1000,
        reason: 'stock_in',
        idempotencyKey: 'idem-lot-0002',
      });
    expect(missing).toThrow(HttpsError);

    // A priced lot is rejected for a non-purchase effect.
    expect(() =>
      parseStockAdjustInput({
        tenantId: TENANT_A_FIXTURE,
        ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
        quantityDeltaBaseUnits: -100,
        reason: 'waste',
        idempotencyKey: 'idem-lot-0003',
        purchaseUnit: 'kg',
        purchasePriceVnd: 200000,
      }),
    ).toThrow(HttpsError);
  });

  it('records the lot price on the movement and defaults others to null', () => {
    const movement = buildStockMovement({
      movementId: 'move-lot-0001',
      tenantId: TENANT_A_FIXTURE,
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityDelta: 1000,
      reason: 'stock_in',
      orderId: null,
      actorUid: null,
      idempotencyKey: 'idem-lot-0001',
      createdAt: '2026-09-12T08:00:00.000Z',
      lotUnitCostVnd: 200,
    });
    expect(movement.lotUnitCostVnd).toBe(200);

    const plain = buildStockMovement({
      movementId: 'move-lot-0002',
      tenantId: TENANT_A_FIXTURE,
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityDelta: -100,
      reason: 'waste',
      orderId: null,
      actorUid: null,
      idempotencyKey: 'idem-lot-0004',
      createdAt: '2026-09-12T08:00:00.000Z',
    });
    expect(plain.lotUnitCostVnd).toBeNull();
  });

  it('reports the increase percent and null when there is no increase', () => {
    expect(lotPriceIncreasePercent({
      previousUnitCostVnd: 100,
      lotUnitCostVnd: 105,
    })).toBeCloseTo(5, 5);
    expect(lotPriceIncreasePercent({
      previousUnitCostVnd: 100,
      lotUnitCostVnd: 115,
    })).toBeCloseTo(15, 5);
    expect(lotPriceIncreasePercent({
      previousUnitCostVnd: 0,
      lotUnitCostVnd: 500,
    })).toBeNull();
    expect(lotPriceIncreasePercent({
      previousUnitCostVnd: 200,
      lotUnitCostVnd: 200,
    })).toBeNull();
    expect(lotPriceIncreasePercent({
      previousUnitCostVnd: 200,
      lotUnitCostVnd: 150,
    })).toBeNull();
  });
});
