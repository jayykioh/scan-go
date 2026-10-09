import {
  INVENTORY_CONTRACT_VERSION,
  type Ingredient,
  type InventoryDeductionPlan,
  type LossFinding,
  type Recipe,
  type StockCount,
  type StockMovement,
} from '../contracts/inventory.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';
import { MENU_ITEM_ID_FIXTURE } from './catalog.fixture.js';

export const INGREDIENT_NOODLE_ID_FIXTURE = 'ingredient-noodle-001';
export const INGREDIENT_BEEF_ID_FIXTURE = 'ingredient-beef-001';
export const RECIPE_ID_FIXTURE = 'recipe-pho-bo-001';
export const INVENTORY_IDEMPOTENCY_KEY_FIXTURE = 'idem-stock-0001';

const CREATED_AT = '2026-09-12T03:10:00.000Z';
const UPDATED_AT = '2026-09-12T05:00:00.000Z';

export const noodleIngredientFixture: Ingredient = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  name: 'Bánh phở',
  baseUnit: 'g',
  purchaseUnit: 'kg',
  countUnitLabel: null,
  purchasePriceVnd: 40000,
  unitCostVnd: 40,
  stockQuantity: 10000,
  lowStockThreshold: 500,
  isActive: true,
  archivedAt: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const beefIngredientFixture: Ingredient = {
  ...noodleIngredientFixture,
  ingredientId: INGREDIENT_BEEF_ID_FIXTURE,
  name: 'Thịt bò',
  unitCostVnd: 300,
  stockQuantity: 5000,
  lowStockThreshold: 300,
};

export const recipeFixture: Recipe = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  recipeId: RECIPE_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  menuItemId: MENU_ITEM_ID_FIXTURE,
  lines: [
    {
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityBaseUnits: 200,
      wasteBaseUnits: 0,
      unitCostVnd: 40,
      lineCostVnd: 8000,
    },
    {
      ingredientId: INGREDIENT_BEEF_ID_FIXTURE,
      quantityBaseUnits: 100,
      wasteBaseUnits: 0,
      unitCostVnd: 300,
      lineCostVnd: 30000,
    },
  ],
  costVnd: 38000,
  costVersion: 1,
  archivedAt: null,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

export const stockMovementFixture: StockMovement = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  movementId: 'order-pho-001__ingredient-noodle-001',
  tenantId: TENANT_A_FIXTURE,
  ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
  quantityDelta: -400,
  reason: 'order_deduction',
  orderId: 'order-pho-001',
  actorUid: 'uid-kitchen-001',
  idempotencyKey: INVENTORY_IDEMPOTENCY_KEY_FIXTURE,
  lotUnitCostVnd: null,
  note: null,
  createdAt: UPDATED_AT,
};

/**
 * Stock count with expected quantity from stock-in, deduction, and
 * restoration, and a stored variance (REQ-INV-003).
 */
export const stockCountFixture: StockCount = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  countId: 'stock-count-001',
  tenantId: TENANT_A_FIXTURE,
  ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
  countedQuantityBaseUnits: 9400,
  expectedQuantityBaseUnits: 9500,
  varianceBaseUnits: -100,
  reason: 'Kiểm kê sáng',
  actorUid: 'uid-owner-001',
  createdAt: UPDATED_AT,
};

/** Loss finding that cites the count, movements, and period (REQ-INV-004). */
export const lossFindingFixture: LossFinding = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  findingId: 'loss-finding-001',
  tenantId: TENANT_A_FIXTURE,
  ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
  ingredientName: 'Bánh phở',
  countId: stockCountFixture.countId,
  countQuantityBaseUnits: stockCountFixture.countedQuantityBaseUnits,
  expectedQuantityBaseUnits: stockCountFixture.expectedQuantityBaseUnits,
  varianceBaseUnits: stockCountFixture.varianceBaseUnits,
  movementIds: ['order-pho-001__ingredient-noodle-001'],
  periodStart: '20260901',
  periodEnd: '20260907',
  sourceIds: [stockCountFixture.countId, 'order-pho-001__ingredient-noodle-001'],
  missingData: false,
  missingDataNotes: [],
  message: 'Thiếu 100 g so với lượng dự kiến.',
};

/** Two servings of one recipe: noodle 400g and beef 200g. */
export const orderDeductionPlanFixture: InventoryDeductionPlan = {
  schemaVersion: INVENTORY_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  orderId: 'order-pho-001',
  idempotencyKey: INVENTORY_IDEMPOTENCY_KEY_FIXTURE,
  reason: 'order_deduction',
  lines: [
    {
      ingredientId: INGREDIENT_NOODLE_ID_FIXTURE,
      quantityBaseUnits: 400,
      movementId: 'order-pho-001__ingredient-noodle-001',
      previousStockQuantity: 10000,
    },
    {
      ingredientId: INGREDIENT_BEEF_ID_FIXTURE,
      quantityBaseUnits: 200,
      movementId: 'order-pho-001__ingredient-beef-001',
      previousStockQuantity: 5000,
    },
  ],
  createdAt: UPDATED_AT,
};
