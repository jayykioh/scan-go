/**
 * REQ-CAS-003 Functions Emulator evidence: the Cashier reads the settled
 * invoices of one Table to reconcile an old bill.
 *
 * `orders` is not client-readable, so the read is a cashier-gated callable. The
 * table scope and the paid-only filter are what these tests pin: another
 * table's Orders and this table's unpaid Orders never reach the till.
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
import type { OrderTableListInput } from '../../../shared/contracts/order.contract.js';
import type { OrderSnapshot } from '../../../shared/contracts/order.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const TABLE_ID = 'table-01';
const OTHER_TABLE_ID = 'table-02';

const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
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
  functions = getFunctions(clientApp, FUNCTIONS_REGION);
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

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  // One settled bill and one still-open bill on the table under test, plus a
  // settled bill on another table that must never leak into the answer.
  await seedOrder('invoice-older', {
    tableId: TABLE_ID,
    status: 'paid',
    createdAt: '2026-09-10T02:00:00.000Z',
    totalVnd: 90000,
  });
  await seedOrder('invoice-newer', {
    tableId: TABLE_ID,
    status: 'paid',
    createdAt: '2026-09-11T02:00:00.000Z',
    totalVnd: 120000,
  });
  await seedOrder('bill-open', {
    tableId: TABLE_ID,
    status: 'pending',
    createdAt: '2026-09-12T02:00:00.000Z',
    totalVnd: 50000,
  });
  await seedOrder('other-table-paid', {
    tableId: OTHER_TABLE_ID,
    status: 'paid',
    createdAt: '2026-09-11T03:00:00.000Z',
    totalVnd: 70000,
  });
}

/** One stored Order that satisfies the frozen snapshot contract. */
async function seedOrder(
  orderId: string,
  overrides: {
    tableId: string;
    status: string;
    createdAt: string;
    totalVnd: number;
  },
): Promise<void> {
  await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).set({
    schemaVersion: 2,
    tenantId: TENANT_A,
    orderType: 'dineIn',
    tableId: overrides.tableId,
    tableNameSnapshot: 'Bàn 1',
    customerNote: null,
    status: overrides.status,
    paymentMode: 'payLater',
    items: [
      {
        lineId: `${orderId}-line-1`,
        menuItemId: 'item-pho-bo-001',
        name: 'Phở bò',
        modifiers: [],
        unitPriceVnd: overrides.totalVnd,
        quantity: 1,
        lineTotalVnd: overrides.totalVnd,
        lineDiscountVnd: 0,
        isGift: false,
        unitCostVnd: 20000,
        lineCostVnd: 20000,
      },
    ],
    subtotalVnd: overrides.totalVnd,
    discountVnd: 0,
    promotionSnapshot: null,
    loyaltyMemberId: null,
    pointsRedeemed: 0,
    totalVnd: overrides.totalVnd,
    trackingToken: `track-${orderId}`,
    idempotencyKey: `idem-${orderId}`,
    createdAt: overrides.createdAt,
    updatedAt: overrides.createdAt,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function listTableInvoices(
  input: Partial<OrderTableListInput> = {},
): Promise<{ data: { orders: OrderSnapshot[] } }> {
  const callable = httpsCallable<
    OrderTableListInput,
    { orders: OrderSnapshot[] }
  >(functions, 'callableOrderListTableInvoices');
  return callable({ tenantId: TENANT_A, tableId: TABLE_ID, ...input }) as Promise<{
    data: { orders: OrderSnapshot[] };
  }>;
}

describe('callableOrderListTableInvoices', () => {
  it('returns only the paid Orders of that table, newest first', async () => {
    await signInAs('cashierA');
    const result = await listTableInvoices();
    expect(result.data.orders.map((order) => order.orderId)).toEqual([
      'invoice-newer',
      'invoice-older',
    ]);
    expect(result.data.orders.every((order) => order.status === 'paid')).toBe(true);
    expect(result.data.orders[0].tableId).toBe(TABLE_ID);
  });

  it('answers an empty history for a table with no settled bill', async () => {
    await signInAs('cashierA');
    const result = await listTableInvoices({ tableId: 'table-without-bills' });
    expect(result.data.orders).toEqual([]);
  });

  it('lets the Owner read the table history', async () => {
    await signInAs('ownerA');
    const result = await listTableInvoices();
    expect(result.data.orders).toHaveLength(2);
  });

  it('denies a Kitchen member and an anonymous caller', async () => {
    await signInAs('kitchenA');
    await expect(listTableInvoices()).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    await signOut(auth);
    await expect(listTableInvoices()).rejects.toMatchObject({
      code: 'functions/unauthenticated',
    });
  });

  it('denies a member of another Tenant', async () => {
    await signInAs('ownerB');
    await expect(
      listTableInvoices({ tenantId: TENANT_A, tableId: TABLE_ID }),
    ).rejects.toMatchObject({ code: 'functions/permission-denied' });
  });

  it('rejects a request without a tableId', async () => {
    await signInAs('cashierA');
    const callable = httpsCallable(functions, 'callableOrderListTableInvoices');
    await expect(
      callable({ tenantId: TENANT_A }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
});
