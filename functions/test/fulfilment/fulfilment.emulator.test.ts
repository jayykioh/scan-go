/**
 * P0-008 Fulfilment Functions Emulator evidence (REQ-INV-001, REQ-KDS-001,
 * REQ-ORD-003, CON-002, CON-004, NFR-RT-001).
 *
 * These tests call the real Fulfilment, Inventory, and Catalog callables
 * through the Functions emulator. They prove one-transaction cooking
 * deduction, retry dedupe, the pending → cooking → ready flow, Kitchen role
 * denial, and the two-second Kitchen/Customer update bound.
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
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  type Firestore as ClientFirestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  FulfilmentCommandResult,
  FulfilmentMarkReadyInput,
  FulfilmentStartCookingInput,
} from '../../../shared/contracts/fulfilment.contract.js';
import type { CatalogCommandResult } from '../../../shared/contracts/catalog.contract.js';
import { KITCHEN_UPDATE_BOUND_MS } from '../../../shared/fixtures/fulfilment.fixture.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const MENU_ITEM_ID = 'item-pho-bo-001';
const INGREDIENT_NOODLE = 'ingredient-noodle-001';
const INGREDIENT_BEEF = 'ingredient-beef-001';
const RECIPE_ID = 'recipe-pho-bo-001';
const ORDER_ID = 'order-pho-001';
const ORDER_ID_SECOND = 'order-pho-002';
const TRACKING_TOKEN = 'track-fulfil-001';
const TRACKING_TOKEN_SECOND = 'track-fulfil-002';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  waiterA: { uid: 'uid-waiter-a', email: 'waiter-a@example.com' },
  inactiveA: { uid: 'uid-inactive-a', email: 'inactive-a@example.com' },
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
} as const;

type UserKey = keyof typeof USERS;

let adminApp: AdminApp;
let db: Firestore;
let adminAuth: AdminAuth;

let clientApp: FirebaseApp;
let auth: Auth;
let clientDb: ClientFirestore;
let functions: Functions;

let activeSubscriptions: Unsubscribe[] = [];

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
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
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
  for (const unsubscribe of activeSubscriptions) {
    unsubscribe();
  }
  activeSubscriptions = [];
  await signOut(auth).catch(() => undefined);
});

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('publicOrderTracking'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

const now = () => new Date().toISOString();

function orderData(orderId: string, trackingToken: string) {
  const timestamp = now();
  const item = {
    lineId: `${orderId}-line-1`,
    menuItemId: MENU_ITEM_ID,
    name: 'Phở bò',
    modifiers: [],
    unitPriceVnd: 45000,
    quantity: 2,
    lineTotalVnd: 90000,
    unitCostVnd: 22000,
    lineCostVnd: 44000,
  };
  return {
    schemaVersion: 1,
    orderId,
    tenantId: TENANT_A,
    tableId: 'table-01',
    tableNameSnapshot: 'Bàn 1',
    status: 'pending',
    paymentMode: 'payLater',
    items: [item],
    subtotalVnd: 90000,
    totalVnd: 90000,
    trackingToken,
    idempotencyKey: `idem-customer-${orderId}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function trackingData(orderId: string, trackingToken: string) {
  return {
    schemaVersion: 1,
    trackingToken,
    tenantId: TENANT_A,
    orderId,
    tableName: 'Bàn 1',
    itemSummary: '2x Phở bò',
    totalVnd: 90000,
    status: 'pending',
    createdAt: now(),
    updatedAt: now(),
  };
}

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
  await db.doc(`tenants/${TENANT_A}/members/${USERS.waiterA.uid}`).set({
    membershipType: 'staff',
    roles: ['waiter'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.inactiveA.uid}`).set({
    membershipType: 'staff',
    roles: ['kitchen'],
    isActive: false,
  });

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`)
    .set(orderData(ORDER_ID, TRACKING_TOKEN));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_ID_SECOND}`)
    .set(orderData(ORDER_ID_SECOND, TRACKING_TOKEN_SECOND));
  await db
    .doc(`publicOrderTracking/${TRACKING_TOKEN}`)
    .set(trackingData(ORDER_ID, TRACKING_TOKEN));
  await db
    .doc(`publicOrderTracking/${TRACKING_TOKEN_SECOND}`)
    .set(trackingData(ORDER_ID_SECOND, TRACKING_TOKEN_SECOND));

  const ingredient = (ingredientId: string, name: string, cost: number, stock: number) => ({
    schemaVersion: 1,
    ingredientId,
    tenantId: TENANT_A,
    name,
    baseUnit: 'g',
    unitCostVnd: cost,
    stockQuantity: stock,
    lowStockThreshold: 100,
    isActive: true,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    version: 1,
  });
  await db
    .doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_NOODLE}`)
    .set(ingredient(INGREDIENT_NOODLE, 'Bánh phở', 40, 10000));
  await db
    .doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_BEEF}`)
    .set(ingredient(INGREDIENT_BEEF, 'Thịt bò', 300, 5000));

  const timestamp = now();
  await db.doc(`tenants/${TENANT_A}/recipes/${RECIPE_ID}`).set({
    schemaVersion: 1,
    recipeId: RECIPE_ID,
    tenantId: TENANT_A,
    menuItemId: MENU_ITEM_ID,
    lines: [
      { ingredientId: INGREDIENT_NOODLE, quantityBaseUnits: 200, unitCostVnd: 40, lineCostVnd: 8000 },
      { ingredientId: INGREDIENT_BEEF, quantityBaseUnits: 100, unitCostVnd: 300, lineCostVnd: 30000 },
    ],
    costVnd: 38000,
    costVersion: 1,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });

  // Catalog private source and public projection for the availability board.
  await db.doc(`tenants/${TENANT_A}/menuItems/${MENU_ITEM_ID}`).set({
    schemaVersion: 1,
    menuItemId: MENU_ITEM_ID,
    tenantId: TENANT_A,
    name: 'Phở bò',
    description: null,
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 45000,
    costPriceVnd: 22000,
    imagePath: null,
    modifierGroups: [],
    recipeId: RECIPE_ID,
    isAvailable: true,
    stockCount: null,
    archivedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
  await db.doc(`tenants/${TENANT_A}/publicMenuItems/${MENU_ITEM_ID}`).set({
    schemaVersion: 1,
    menuItemId: MENU_ITEM_ID,
    tenantId: TENANT_A,
    name: 'Phở bò',
    description: null,
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 45000,
    imageUrl: null,
    modifierGroups: [],
    isAvailable: true,
    updatedAt: timestamp,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function startCookingCallable() {
  return httpsCallable<FulfilmentStartCookingInput, FulfilmentCommandResult>(
    functions,
    'callableFulfilmentStartCooking',
  );
}

function markReadyCallable() {
  return httpsCallable<FulfilmentMarkReadyInput, FulfilmentCommandResult>(
    functions,
    'callableFulfilmentMarkReady',
  );
}

function setAvailabilityCallable() {
  return httpsCallable<
    { tenantId: string; menuItemId: string; isAvailable: boolean },
    CatalogCommandResult
  >(functions, 'callableCatalogSetAvailability');
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
    (await db.doc(`tenants/${TENANT_A}/ingredients/${ingredientId}`).get()).get(
      'stockQuantity',
    ) ?? -1
  );
}

async function movementCount(): Promise<number> {
  return (await db.collection(`tenants/${TENANT_A}/stockMovements`).get()).size;
}

async function orderStatus(orderId = ORDER_ID): Promise<unknown> {
  return (await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).get()).get(
    'status',
  );
}

/** Bounded Customer listener for one public tracking document. */
function waitForTrackingStatus(
  trackingToken: string,
  predicate: (status: unknown) => boolean,
  timeoutMs = KITCHEN_UPDATE_BOUND_MS,
): Promise<{ status: unknown; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Tracking listener timed out.'));
    }, timeoutMs);
    const unsubscribe = onSnapshot(
      doc(clientDb, 'publicOrderTracking', trackingToken),
      (snap) => {
        const status = snap.get('status');
        if (predicate(status)) {
          clearTimeout(timer);
          unsubscribe();
          resolve({ status, elapsedMs: Date.now() - started });
        }
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      },
    );
    activeSubscriptions.push(unsubscribe);
  });
}

/** Bounded Kitchen/Customer availability listener for the public menu. */
function waitForAvailability(
  menuItemId: string,
  expected: boolean,
  timeoutMs = KITCHEN_UPDATE_BOUND_MS,
): Promise<{ elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Availability listener timed out.'));
    }, timeoutMs);
    const unsubscribe = onSnapshot(
      doc(clientDb, 'tenants', TENANT_A, 'publicMenuItems', menuItemId),
      (snap) => {
        // An unavailable item is removed from the public projection, so the
        // Kitchen listener observes either an explicit false or a deletion.
        const isUnavailable = !snap.exists() || snap.get('isAvailable') === false;
        const matches = expected
          ? snap.get('isAvailable') === true
          : isUnavailable;
        if (matches) {
          clearTimeout(timer);
          unsubscribe();
          resolve({ elapsedMs: Date.now() - started });
        }
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      },
    );
    activeSubscriptions.push(unsubscribe);
  });
}

describe('callableFulfilmentStartCooking: one-transaction deduction', () => {
  it('moves pending to cooking and deducts each ingredient exactly once', async () => {
    await signInAs('kitchenA');
    const response = await startCookingCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-cook-0001',
    });

    expect(response.data.status).toBe('applied');
    expect(response.data.command).toBe('startCooking');
    expect(response.data.order.status).toBe('cooking');
    expect(response.data.deduction).not.toBeNull();
    expect(response.data.movementIds).toHaveLength(2);

    expect(await orderStatus()).toBe('cooking');
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(9600);
    expect(await stockOf(INGREDIENT_BEEF)).toBe(4800);
    expect(await movementCount()).toBe(2);

    const movements = await db
      .collection(`tenants/${TENANT_A}/stockMovements`)
      .get();
    for (const movement of movements.docs) {
      expect(movement.get('reason')).toBe('order_deduction');
      expect(movement.get('orderId')).toBe(ORDER_ID);
      expect(movement.get('quantityDelta')).toBeLessThan(0);
    }

    // Ordering snapshots the recipe Cost onto the Order lines.
    const orderSnap = await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).get();
    expect(orderSnap.get('items')[0].unitCostVnd).toBe(38000);
    expect(orderSnap.get('items')[0].lineCostVnd).toBe(76000);

    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${ORDER_ID}/statusEvents`)
      .get();
    expect(events.size).toBe(1);
    expect(events.docs[0]?.get('newStatus')).toBe('cooking');
    expect(events.docs[0]?.get('actorUid')).toBe(USERS.kitchenA.uid);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.docs.some((event) => event.get('action') === 'CookingStarted')).toBe(
      true,
    );
  });

  it('replays a retried command with no duplicate deduction', async () => {
    await signInAs('kitchenA');
    const input = {
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-cook-retry-0001',
    };
    await startCookingCallable()(input);
    const retry = await startCookingCallable()(input);

    expect(retry.data.status).toBe('replayed');
    expect(retry.data.order.status).toBe('cooking');
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(9600);
    expect(await stockOf(INGREDIENT_BEEF)).toBe(4800);
    expect(await movementCount()).toBe(2);
  });

  it('rejects a second cooking command without another deduction', async () => {
    await signInAs('kitchenA');
    await startCookingCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-cook-0002',
    });
    await expectRejection(
      startCookingCallable()({
        tenantId: TENANT_A,
        orderId: ORDER_ID,
        idempotencyKey: 'idem-cook-0003',
      }),
      'failed-precondition',
    );
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(9600);
    expect(await movementCount()).toBe(2);
  });
});

describe('callableFulfilmentStartCooking: more than 30 menu items', () => {
  it('reads every recipe chunk and deducts all lines', async () => {
    const orderId = 'order-bulk-001';
    const trackingToken = 'track-bulk-001';
    const ingredientId = 'ingredient-bulk-001';
    const itemCount = 31;
    const unitsPerItem = 10;
    const timestamp = now();

    await db.doc(`tenants/${TENANT_A}/ingredients/${ingredientId}`).set({
      schemaVersion: 1,
      ingredientId,
      tenantId: TENANT_A,
      name: 'Nguyên liệu gộp',
      baseUnit: 'g',
      unitCostVnd: 1,
      stockQuantity: 10000,
      lowStockThreshold: 100,
      isActive: true,
      archivedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
    });

    const items = [];
    for (let index = 0; index < itemCount; index += 1) {
      const menuItemId = `bulk-item-${index}`;
      const recipeId = `bulk-recipe-${index}`;
      items.push({
        lineId: `${orderId}-line-${index}`,
        menuItemId,
        name: `Món gộp ${index}`,
        modifiers: [],
        unitPriceVnd: 1000,
        quantity: 1,
        lineTotalVnd: 1000,
        unitCostVnd: 0,
        lineCostVnd: 0,
      });
      await db.doc(`tenants/${TENANT_A}/recipes/${recipeId}`).set({
        schemaVersion: 1,
        recipeId,
        tenantId: TENANT_A,
        menuItemId,
        lines: [
          {
            ingredientId,
            quantityBaseUnits: unitsPerItem,
            unitCostVnd: 1,
            lineCostVnd: unitsPerItem,
          },
        ],
        costVnd: unitsPerItem,
        costVersion: 1,
        archivedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
        version: 1,
      });
    }

    await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).set({
      schemaVersion: 1,
      orderId,
      tenantId: TENANT_A,
      tableId: 'table-01',
      tableNameSnapshot: 'Bàn 1',
      status: 'pending',
      paymentMode: 'payLater',
      items,
      subtotalVnd: itemCount * 1000,
      totalVnd: itemCount * 1000,
      trackingToken,
      idempotencyKey: `idem-customer-${orderId}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    await signInAs('kitchenA');
    const response = await startCookingCallable()({
      tenantId: TENANT_A,
      orderId,
      idempotencyKey: 'idem-bulk-cook-0001',
    });

    expect(response.data.status).toBe('applied');
    expect(await orderStatus(orderId)).toBe('cooking');
    // 31 recipes must all be read even though Firestore `in` allows only 30.
    expect(await stockOf(ingredientId)).toBe(
      10000 - itemCount * unitsPerItem,
    );
    expect(await movementCount()).toBe(1);
  });
});

describe('callableFulfilmentMarkReady', () => {
  it('moves cooking to ready with no new deduction', async () => {
    await signInAs('kitchenA');
    await startCookingCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-cook-0004',
    });
    const ready = await markReadyCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-ready-0001',
    });

    expect(ready.data.status).toBe('applied');
    expect(ready.data.command).toBe('markReady');
    expect(ready.data.order.status).toBe('ready');
    expect(ready.data.deduction).toBeNull();
    expect(await orderStatus()).toBe('ready');
    expect(await movementCount()).toBe(2);
  });

  it('rejects a direct pending to ready transition', async () => {
    await signInAs('kitchenA');
    await expectRejection(
      markReadyCallable()({
        tenantId: TENANT_A,
        orderId: ORDER_ID_SECOND,
        idempotencyKey: 'idem-ready-0002',
      }),
      'failed-precondition',
    );
    expect(await orderStatus(ORDER_ID_SECOND)).toBe('pending');
    expect(await movementCount()).toBe(0);
  });
});

describe('Kitchen callable authorization', () => {
  it('denies Cashier, Waiter, inactive Staff, and cross-tenant Owner', async () => {
    for (const key of ['cashierA', 'waiterA', 'inactiveA', 'ownerB'] as const) {
      await signInAs(key);
      await expectRejection(
        startCookingCallable()({
          tenantId: TENANT_A,
          orderId: ORDER_ID,
          idempotencyKey: `idem-cook-${key}`,
        }),
        'permission-denied',
      );
    }
    expect(await orderStatus()).toBe('pending');
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(10000);
    expect(await movementCount()).toBe(0);
  });
});

describe('Kitchen availability through the Catalog contract', () => {
  it('lets Kitchen change availability and denies Cashier', async () => {
    await signInAs('kitchenA');
    const applied = await setAvailabilityCallable()({
      tenantId: TENANT_A,
      menuItemId: MENU_ITEM_ID,
      isAvailable: false,
    });
    expect(applied.data.status).toBe('applied');

    const publicSnap = await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${MENU_ITEM_ID}`)
      .get();
    expect(publicSnap.exists).toBe(false);

    await signInAs('cashierA');
    await expectRejection(
      setAvailabilityCallable()({
        tenantId: TENANT_A,
        menuItemId: MENU_ITEM_ID,
        isAvailable: true,
      }),
      'permission-denied',
    );
  });
});

describe('two-second update harness', () => {
  it('reaches a Customer tracking listener within two seconds', async () => {
    await signInAs('kitchenA');
    const pending = waitForTrackingStatus(
      TRACKING_TOKEN,
      (status) => status === 'cooking',
    );
    await startCookingCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-cook-timing',
    });
    const result = await pending;
    expect(result.status).toBe('cooking');
    expect(result.elapsedMs).toBeLessThan(KITCHEN_UPDATE_BOUND_MS);
  });

  it('reaches a Kitchen availability listener within two seconds', async () => {
    await signInAs('kitchenA');
    const pending = waitForAvailability(MENU_ITEM_ID, false);
    await setAvailabilityCallable()({
      tenantId: TENANT_A,
      menuItemId: MENU_ITEM_ID,
      isAvailable: false,
    });
    const result = await pending;
    expect(result.elapsedMs).toBeLessThan(KITCHEN_UPDATE_BOUND_MS);
  });
});
