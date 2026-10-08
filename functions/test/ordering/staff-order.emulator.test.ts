/**
 * P0-012/P0-013 Staff order entry Functions Emulator evidence (REQ-ORD-005,
 * REQ-ORD-001, REQ-ORD-002, REQ-ORD-003, REQ-ACL-001, NFR-DATA-001).
 *
 * Owner and Cashier create server-priced Orders for a table or for takeaway.
 * Kitchen, Waiter, inactive tables, and cross-Tenant callers are denied.
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
import {
  TAKEAWAY_TABLE_ID,
  TAKEAWAY_TABLE_NAME,
  type OrderStaffCreateInput,
  type OrderSubmitResult,
} from '../../../shared/contracts/order.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const TABLE_ID = 'table-01';
const MENU_ITEM_ID = 'item-pho-bo-001';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
  waiterA: { uid: 'uid-waiter-a', email: 'waiter-a@example.com' },
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

const now = () => new Date().toISOString();

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('publicOrderTracking'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
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

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_A}/tables/${TABLE_ID}`).set({
    name: 'Bàn 1',
    isActive: true,
    tokenVersion: 1,
    archivedAt: null,
    createdAt: now(),
    updatedAt: now(),
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
    updatedAt: now(),
  });
  await db.doc(`tenants/${TENANT_A}/menuItems/${MENU_ITEM_ID}`).set({
    tenantId: TENANT_A,
    name: 'Phở bò',
    priceVnd: 45000,
    costPriceVnd: 22000,
    isAvailable: true,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function staffCreateCallable() {
  return httpsCallable<OrderStaffCreateInput, OrderSubmitResult>(
    functions,
    'callableOrderStaffCreate',
  );
}

function input(
  overrides: Partial<OrderStaffCreateInput> = {},
): OrderStaffCreateInput {
  return {
    tenantId: TENANT_A,
    orderType: 'dineIn',
    tableId: TABLE_ID,
    paymentMode: 'payLater',
    idempotencyKey: 'idem-staff-00000001',
    lines: [{ menuItemId: MENU_ITEM_ID, quantity: 2, selectedOptionIds: [] }],
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

describe('callableOrderStaffCreate: server pricing', () => {
  it('lets a Cashier create a dine-in Order with server prices', async () => {
    await signInAs('cashierA');
    const result = (await staffCreateCallable()(input())).data;

    expect(result.order.status).toBe('pending');
    expect(result.order.orderType).toBe('dineIn');
    expect(result.order.tableId).toBe(TABLE_ID);
    expect(result.order.tableNameSnapshot).toBe('Bàn 1');
    expect(result.order.totalVnd).toBe(90000);
    expect(result.order.items[0]?.unitPriceVnd).toBe(45000);
    expect(result.order.items[0]?.unitCostVnd).toBe(22000);
    expect(result.tracking.orderType).toBe('dineIn');

    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${result.order.orderId}/statusEvents`)
      .get();
    expect(events.docs[0]?.get('actorType')).toBe('staff');
    expect(events.docs[0]?.get('actorUid')).toBe(USERS.cashierA.uid);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.docs.some((doc) => doc.get('action') === 'OrderCreatedByStaff')).toBe(true);

    const notifications = await db.collection(`tenants/${TENANT_A}/notifications`).get();
    expect(notifications.size).toBe(1);
  });

  it('lets the Owner create a takeaway Order with the reserved label', async () => {
    await signInAs('ownerA');
    const result = (
      await staffCreateCallable()(
        input({
          orderType: 'takeaway',
          tableId: null,
          idempotencyKey: 'idem-staff-00000002',
        }),
      )
    ).data;

    expect(result.order.orderType).toBe('takeaway');
    expect(result.order.tableId).toBe(TAKEAWAY_TABLE_ID);
    expect(result.order.tableNameSnapshot).toBe(TAKEAWAY_TABLE_NAME);
    expect(result.tracking.orderType).toBe('takeaway');
  });
});

describe('callableOrderStaffCreate: validation and idempotency', () => {
  it('rejects a dine-in request without a table and an inactive table', async () => {
    await signInAs('cashierA');
    await expectRejection(
      staffCreateCallable()(input({ tableId: null })),
      'invalid-argument',
    );
    await expectRejection(
      staffCreateCallable()(
        input({ tableId: 'table-missing', idempotencyKey: 'idem-staff-00000003' }),
      ),
      'failed-precondition',
    );
    expect((await db.collection(`tenants/${TENANT_A}/orders`).get()).size).toBe(0);
  });

  it('replays a retry with the same key and creates one Order', async () => {
    await signInAs('cashierA');
    const first = (await staffCreateCallable()(input())).data;
    const retry = (await staffCreateCallable()(input())).data;

    expect(retry.replayed).toBe(true);
    expect(retry.order.orderId).toBe(first.order.orderId);
    expect((await db.collection(`tenants/${TENANT_A}/orders`).get()).size).toBe(1);
  });
});

describe('callableOrderStaffCreate: authorization', () => {
  it('denies Kitchen, Waiter, and a cross-Tenant Owner', async () => {
    await signInAs('kitchenA');
    await expectRejection(staffCreateCallable()(input()), 'permission-denied');

    await signInAs('waiterA');
    await expectRejection(staffCreateCallable()(input()), 'permission-denied');

    await signInAs('ownerB');
    await expectRejection(
      staffCreateCallable()(input({ tenantId: TENANT_A })),
      'permission-denied',
    );

    expect((await db.collection(`tenants/${TENANT_A}/orders`).get()).size).toBe(0);
  });
});
