/**
 * P0-L07 Unpaid cancellation and Inventory restoration Functions Emulator
 * evidence (REQ-CAS-002, REQ-INV-002, NFR-SEC-001, NFR-DATA-001).
 *
 * These tests call the real Ordering cancellation callable through the
 * Functions emulator. They prove unpaid eligibility, mandatory reason, one
 * restoration movement per recorded deduction, idempotent retry, paid
 * rejection, and the Cashier authorization matrix.
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
  OrderCancelInput,
  OrderCancellationResult,
} from '../../../shared/contracts/order.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const ORDER_COOKING = 'order-cooking-001';
const ORDER_PAID = 'order-paid-001';
const ORDER_UNDEDUCTED = 'order-pending-001';
const INGREDIENT_NOODLE = 'ingredient-noodle-001';
const INGREDIENT_BEEF = 'ingredient-beef-001';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
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

function orderData(
  orderId: string,
  status: 'pending' | 'cooking' | 'paid',
) {
  const timestamp = now();
  return {
    schemaVersion: 1,
    orderId,
    tenantId: TENANT_A,
    tableId: 'table-01',
    tableNameSnapshot: 'Bàn 1',
    status,
    paymentMode: 'payLater' as const,
    items: [
      {
        lineId: `${orderId}-line-1`,
        menuItemId: 'item-pho-bo-001',
        name: 'Phở bò',
        modifiers: [],
        unitPriceVnd: 50000,
        quantity: 2,
        lineTotalVnd: 100000,
        unitCostVnd: 22000,
        lineCostVnd: 44000,
      },
    ],
    subtotalVnd: 100000,
    totalVnd: 100000,
    trackingToken: `track-${orderId}`,
    idempotencyKey: `idem-customer-${orderId}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...(status === 'paid' ? { paidAt: timestamp } : {}),
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
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashierA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.kitchenA.uid}`).set({
    membershipType: 'staff',
    roles: ['kitchen'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.waiterA.uid}`).set({
    membershipType: 'staff',
    roles: ['waiter'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.inactiveA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: false,
  });

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  // Ingredient stock already reflects the two recorded deductions below.
  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_NOODLE}`).set({
    schemaVersion: 1,
    ingredientId: INGREDIENT_NOODLE,
    tenantId: TENANT_A,
    name: 'Bánh phở',
    baseUnit: 'g',
    unitCostVnd: 40,
    stockQuantity: 9600,
    lowStockThreshold: 500,
    isActive: true,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    version: 2,
  });
  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_BEEF}`).set({
    schemaVersion: 1,
    ingredientId: INGREDIENT_BEEF,
    tenantId: TENANT_A,
    name: 'Thịt bò',
    baseUnit: 'g',
    unitCostVnd: 300,
    stockQuantity: 4800,
    lowStockThreshold: 300,
    isActive: true,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
    version: 2,
  });

  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_COOKING}`)
    .set(orderData(ORDER_COOKING, 'cooking'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_PAID}`)
    .set(orderData(ORDER_PAID, 'paid'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_UNDEDUCTED}`)
    .set(orderData(ORDER_UNDEDUCTED, 'pending'));

  await db
    .doc(`tenants/${TENANT_A}/stockMovements/${ORDER_COOKING}__${INGREDIENT_NOODLE}`)
    .set({
      schemaVersion: 1,
      movementId: `${ORDER_COOKING}__${INGREDIENT_NOODLE}`,
      tenantId: TENANT_A,
      ingredientId: INGREDIENT_NOODLE,
      quantityDelta: -400,
      reason: 'order_deduction',
      orderId: ORDER_COOKING,
      actorUid: USERS.kitchenA.uid,
      idempotencyKey: 'idem-cook-0001',
      createdAt: now(),
    });
  await db
    .doc(`tenants/${TENANT_A}/stockMovements/${ORDER_COOKING}__${INGREDIENT_BEEF}`)
    .set({
      schemaVersion: 1,
      movementId: `${ORDER_COOKING}__${INGREDIENT_BEEF}`,
      tenantId: TENANT_A,
      ingredientId: INGREDIENT_BEEF,
      quantityDelta: -200,
      reason: 'order_deduction',
      orderId: ORDER_COOKING,
      actorUid: USERS.kitchenA.uid,
      idempotencyKey: 'idem-cook-0001',
      createdAt: now(),
    });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function cancelCallable() {
  return httpsCallable<OrderCancelInput, OrderCancellationResult>(
    functions,
    'callableOrderCancelUnpaid',
  );
}

function cancelInput(
  orderId: string,
  idempotencyKey: string,
  reason = 'Khách đổi ý',
): OrderCancelInput {
  return { tenantId: TENANT_A, orderId, reason, idempotencyKey };
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

async function orderStatus(orderId: string): Promise<unknown> {
  return (await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).get()).get(
    'status',
  );
}

async function stockOf(ingredientId: string): Promise<number> {
  return (
    (await db.doc(`tenants/${TENANT_A}/ingredients/${ingredientId}`).get())
      .get('stockQuantity') ?? -1
  );
}

async function restoreMovementCount(): Promise<number> {
  const snap = await db.collection(`tenants/${TENANT_A}/stockMovements`).get();
  return snap.docs.filter((docSnap) => docSnap.get('reason') === 'order_restore')
    .length;
}

describe('callableOrderCancelUnpaid', () => {
  it('cancels once, restores each deduction, and records the reason', async () => {
    await signInAs('cashierA');
    const response = await cancelCallable()(
      cancelInput(ORDER_COOKING, 'idem-cancel-0001'),
    );

    expect(response.data.status).toBe('cancelled');
    expect(response.data.order.status).toBe('cancelled');
    expect(response.data.restoredMovementIds).toHaveLength(2);
    expect(await orderStatus(ORDER_COOKING)).toBe('cancelled');

    const orderSnap = await db
      .doc(`tenants/${TENANT_A}/orders/${ORDER_COOKING}`)
      .get();
    expect(orderSnap.get('cancellationReason')).toBe('Khách đổi ý');

    expect(await stockOf(INGREDIENT_NOODLE)).toBe(10000);
    expect(await stockOf(INGREDIENT_BEEF)).toBe(5000);
    expect(await restoreMovementCount()).toBe(2);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    const cancelEvent = audit.docs.find(
      (event) => event.get('action') === 'OrderCancelled',
    );
    expect(cancelEvent?.get('reason')).toBe('Khách đổi ý');
    expect(cancelEvent?.get('actorUid')).toBe(USERS.cashierA.uid);
  });

  it('replays the same idempotency key without a second restoration', async () => {
    await signInAs('cashierA');
    const first = await cancelCallable()(
      cancelInput(ORDER_COOKING, 'idem-cancel-retry-0001'),
    );
    const retry = await cancelCallable()(
      cancelInput(ORDER_COOKING, 'idem-cancel-retry-0001'),
    );

    expect(first.data.status).toBe('cancelled');
    expect(retry.data.status).toBe('replayed');
    expect(await restoreMovementCount()).toBe(2);
    expect(await stockOf(INGREDIENT_NOODLE)).toBe(10000);
  });

  it('cancels an undeducted Order without any restoration movement', async () => {
    await signInAs('cashierA');
    const response = await cancelCallable()(
      cancelInput(ORDER_UNDEDUCTED, 'idem-cancel-undeducted-0001'),
    );
    expect(response.data.status).toBe('cancelled');
    expect(response.data.restoredMovementIds).toHaveLength(0);
    expect(await restoreMovementCount()).toBe(0);
  });
});

describe('callableOrderCancelUnpaid rejections', () => {
  it('rejects a paid Order without restoring inventory', async () => {
    await signInAs('cashierA');
    await expectRejection(
      cancelCallable()(cancelInput(ORDER_PAID, 'idem-cancel-paid-0001')),
      'failed-precondition',
    );
    expect(await orderStatus(ORDER_PAID)).toBe('paid');
    expect(await restoreMovementCount()).toBe(0);
  });

  it('rejects a missing reason without changing the Order', async () => {
    await signInAs('cashierA');
    await expectRejection(
      cancelCallable()({
        ...cancelInput(ORDER_COOKING, 'idem-cancel-bad-0001'),
        reason: '   ',
      }),
      'invalid-argument',
    );
    expect(await orderStatus(ORDER_COOKING)).toBe('cooking');
    expect(await restoreMovementCount()).toBe(0);
  });

  it('denies Kitchen, Waiter, inactive Staff, and cross-tenant Owner', async () => {
    for (const key of ['kitchenA', 'waiterA', 'inactiveA', 'ownerB'] as const) {
      await signInAs(key);
      await expectRejection(
        cancelCallable()(cancelInput(ORDER_COOKING, `idem-cancel-${key}`)),
        'permission-denied',
      );
    }
    expect(await orderStatus(ORDER_COOKING)).toBe('cooking');
    expect(await restoreMovementCount()).toBe(0);
  });
});
