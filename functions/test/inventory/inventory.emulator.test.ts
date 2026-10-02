/**
 * P0-008 Inventory Functions Emulator evidence (REQ-INV-001, CON-002, CON-004,
 * NFR-DATA-001).
 *
 * These tests call the real Inventory callables through the Functions
 * emulator. They prove Owner-only ingredient, stock, and recipe commands, Zod
 * integer base-unit and integer VND validation, one stock movement per effect,
 * and idempotent retries.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  deleteApp as deleteAdminApp,
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  type App as AdminApp,
} from 'firebase-admin/app';
import {
  getAuth as getAdminAuth,
  type Auth as AdminAuth,
} from 'firebase-admin/auth';
import {
  getFirestore as getAdminFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  deleteApp as deleteClientApp,
  getApps as getClientApps,
  initializeApp as initializeClientApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  IngredientCommandResult,
  IngredientCreateInput,
  RecipeCommandResult,
  RecipeCreateInput,
  StockAdjustInput,
  StockAdjustResult,
} from '../../../shared/contracts/inventory.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const MENU_ITEM_ID = 'item-pho-bo-001';
const INGREDIENT_NOODLE = 'ingredient-noodle-001';
const INGREDIENT_BEEF = 'ingredient-beef-001';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
} as const;

type UserKey = keyof typeof USERS;

let adminApp: AdminApp;
let db: Firestore;
let adminAuth: AdminAuth;

let clientApp: FirebaseApp;
let auth: Auth;
let functions: Functions;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);
  adminAuth = getAdminAuth(adminApp);

  clientApp =
    getClientApps().length > 0
      ? getClientApps()[0]
      : initializeClientApp({
          projectId: PROJECT_ID,
          apiKey: 'demo-api-key',
          appId: '1:demo:web:demo',
        });
  auth = getAuth(clientApp);
  connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  functions = getFunctions(clientApp, REGION);
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);
});

afterAll(async () => {
  await deleteClientApp(clientApp).catch(() => undefined);
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await resetEmulators();
  await seedEmulators();
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

const now = () => new Date().toISOString();

async function seedEmulators(): Promise<void> {
  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }

  await db.doc('platform/config').set({
    values: { rateLimit: { publicOrderPerMinute: 60 } },
    allowedTenantOverrideKeys: ['locale'],
    configVersion: 1,
    updatedAt: now(),
  });

  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.kitchenA.uid}`).set({
    membershipType: 'staff',
    roles: ['kitchen'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashierA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_NOODLE}`).set({
    schemaVersion: 1,
    ingredientId: INGREDIENT_NOODLE,
    tenantId: TENANT_A,
    name: 'Bánh phở',
    baseUnit: 'g',
    unitCostVnd: 40,
    stockQuantity: 10000,
    lowStockThreshold: 500,
    isActive: true,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  });
  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_BEEF}`).set({
    schemaVersion: 1,
    ingredientId: INGREDIENT_BEEF,
    tenantId: TENANT_A,
    name: 'Thịt bò',
    baseUnit: 'g',
    unitCostVnd: 300,
    stockQuantity: 5000,
    lowStockThreshold: 300,
    isActive: true,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function createIngredientCallable() {
  return httpsCallable<IngredientCreateInput, IngredientCommandResult>(
    functions,
    'callableInventoryCreateIngredient',
  );
}

function createRecipeCallable() {
  return httpsCallable<RecipeCreateInput, RecipeCommandResult>(
    functions,
    'callableInventoryCreateRecipe',
  );
}

function adjustStockCallable() {
  return httpsCallable<StockAdjustInput, StockAdjustResult>(
    functions,
    'callableInventoryAdjustStock',
  );
}

function ingredientInput(
  overrides: Partial<IngredientCreateInput> = {},
): IngredientCreateInput {
  return {
    tenantId: TENANT_A,
    name: 'Trứng gà',
    purchaseUnit: 'kg',
    purchasePriceVnd: 2500000,
    lowStockThreshold: 100,
    isActive: true,
    stockInput: { unit: 'kg', quantity: 2 },
    ...overrides,
  };
}

function recipeInput(
  overrides: Partial<RecipeCreateInput> = {},
): RecipeCreateInput {
  return {
    tenantId: TENANT_A,
    menuItemId: MENU_ITEM_ID,
    lines: [
      { ingredientId: INGREDIENT_NOODLE, quantity: 200, unit: 'g' },
      { ingredientId: INGREDIENT_BEEF, quantity: 100, unit: 'g' },
    ],
    ...overrides,
  };
}

async function expectRejection(
  promise: Promise<unknown>,
  codeFragment: string,
): Promise<void> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error(`Expected the callable to reject with "${codeFragment}".`);
  }
  const code = (caught as { code?: string }).code ?? '';
  expect(code).toContain(codeFragment);
}

async function stockOf(ingredientId: string): Promise<number> {
  return (
    (await db.doc(`tenants/${TENANT_A}/ingredients/${ingredientId}`).get())
      .get('stockQuantity') ?? -1
  );
}

async function movementCount(): Promise<number> {
  return (await db.collection(`tenants/${TENANT_A}/stockMovements`).get()).size;
}

describe('callableInventoryCreateIngredient', () => {
  it('converts kilogram input into integer base units with integer VND Cost', async () => {
    await signInAs('ownerA');
    const response = await createIngredientCallable()(ingredientInput());
    const ingredient = response.data.ingredient;

    expect(ingredient).not.toBeNull();
    expect(ingredient?.baseUnit).toBe('g');
    expect(ingredient?.stockQuantity).toBe(2000);
    expect(ingredient?.unitCostVnd).toBe(2500);
    expect(Number.isInteger(ingredient?.stockQuantity)).toBe(true);
    expect(Number.isInteger(ingredient?.unitCostVnd)).toBe(true);

    const stored = await db
      .doc(`tenants/${TENANT_A}/ingredients/${ingredient?.ingredientId}`)
      .get();
    expect(stored.get('stockQuantity')).toBe(2000);
    expect(stored.get('version')).toBe(1);
    expect(stored.get('tenantId')).toBe(TENANT_A);
  });

  it('rejects a negative Cost and a bad unit without a write', async () => {
    await signInAs('ownerA');
    await expectRejection(
      createIngredientCallable()(ingredientInput({ purchasePriceVnd: -1 })),
      'invalid-argument',
    );
    await expectRejection(
      createIngredientCallable()(
        ingredientInput({ purchaseUnit: 'l', stockInput: { unit: 'kg', quantity: 2 } }),
      ),
      'invalid-argument',
    );
    expect(
      (await db.collection(`tenants/${TENANT_A}/ingredients`).get()).size,
    ).toBe(2);
  });
});

describe('callableInventoryCreateRecipe', () => {
  it('computes deterministic integer Cost from current ingredient Cost', async () => {
    await signInAs('ownerA');
    const response = await createRecipeCallable()(recipeInput());
    const recipe = response.data.recipe;

    expect(recipe?.costVnd).toBe(38000);
    expect(Number.isInteger(recipe?.costVnd)).toBe(true);
    expect(recipe?.costVersion).toBe(1);

    const stored = await db
      .doc(`tenants/${TENANT_A}/recipes/${recipe?.recipeId}`)
      .get();
    expect(stored.get('costVnd')).toBe(38000);
    expect(stored.get('lines')).toHaveLength(2);
  });

  it('rejects an empty recipe and a missing ingredient without a write', async () => {
    await signInAs('ownerA');
    await expectRejection(
      createRecipeCallable()(recipeInput({ lines: [] })),
      'invalid-argument',
    );
    await expectRejection(
      createRecipeCallable()(
        recipeInput({
          lines: [{ ingredientId: 'ingredient-missing', quantity: 1, unit: 'g' }],
        }),
      ),
      'failed-precondition',
    );
    expect((await db.collection(`tenants/${TENANT_A}/recipes`).get()).size).toBe(0);
  });
});

describe('callableInventoryAdjustStock', () => {
  it('writes exactly one movement and replays a retry idempotently', async () => {
    await signInAs('ownerA');
    const input: StockAdjustInput = {
      tenantId: TENANT_A,
      ingredientId: INGREDIENT_NOODLE,
      quantityDeltaBaseUnits: -400,
      reason: 'order_deduction',
      idempotencyKey: 'idem-stock-0001',
    };

    const first = await adjustStockCallable()(input);
    expect(first.data.status).toBe('applied');
    expect(first.data.ingredient.stockQuantity).toBe(9600);
    expect(first.data.movement.quantityDelta).toBe(-400);
    expect(await movementCount()).toBe(1);

    const retry = await adjustStockCallable()(input);
    expect(retry.data.status).toBe('replayed');
    expect(retry.data.ingredient.stockQuantity).toBe(9600);
    expect(await movementCount()).toBe(1);
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(9600);
  });

  it('rejects a deduction below zero', async () => {
    await signInAs('ownerA');
    await expectRejection(
      adjustStockCallable()({
        tenantId: TENANT_A,
        ingredientId: INGREDIENT_NOODLE,
        quantityDeltaBaseUnits: -999999,
        reason: 'manual_adjustment',
        idempotencyKey: 'idem-stock-0002',
      }),
      'failed-precondition',
    );
    expect(await movementCount()).toBe(0);
  });
});

describe('Inventory callable authorization', () => {
  it('denies Kitchen, Cashier, and cross-tenant Owner writes', async () => {
    await signInAs('kitchenA');
    await expectRejection(createIngredientCallable()(ingredientInput()), 'permission-denied');

    await signInAs('cashierA');
    await expectRejection(
      adjustStockCallable()({
        tenantId: TENANT_A,
        ingredientId: INGREDIENT_NOODLE,
        quantityDeltaBaseUnits: 1,
        reason: 'manual_adjustment',
        idempotencyKey: 'idem-stock-0003',
      }),
      'permission-denied',
    );

    await signInAs('ownerB');
    await expectRejection(createIngredientCallable()(ingredientInput()), 'permission-denied');

    expect(
      (await db.collection(`tenants/${TENANT_A}/ingredients`).get()).size,
    ).toBe(2);
    expect(await movementCount()).toBe(0);
  });
});
