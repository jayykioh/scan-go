/**
 * Functions Emulator evidence for the two bounded server reads of Orders.
 *
 * REQ-CAS-003: the Cashier reads the settled invoices of one Table to reconcile
 * an old bill; another table's Orders and this table's unpaid Orders never
 * reach the till.
 *
 * REQ-ORD-007: the Owner reads the tenant-wide history in pages of fifteen for
 * a tenant-local day range, with the payment facts and status history.
 *
 * `orders` is not client-readable, so both reads are gated callables.
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
  OrderHistoryListInput,
  OrderHistoryPage,
  OrderTableListInput,
  OrderSnapshot,
} from '../../../shared/contracts/order.contract.js';
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

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    timezone: 'Asia/Ho_Chi_Minh',
  });
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
    paidAt: '2026-09-10T02:05:00.000Z',
    paymentMethod: 'cash',
  });
  await seedOrder('invoice-newer', {
    tableId: TABLE_ID,
    status: 'paid',
    createdAt: '2026-09-11T02:00:00.000Z',
    totalVnd: 120000,
    paidAt: '2026-09-11T02:05:00.000Z',
    paymentMethod: 'vietQr',
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
    paidAt: '2026-09-11T03:05:00.000Z',
    paymentMethod: 'cash',
  });
  // 2026-09-09 23:30 and 2026-09-10 00:30 in Asia/Ho_Chi_Minh: the day range
  // must cut between them, not at UTC midnight.
  await seedOrder('before-local-day', {
    tableId: TABLE_ID,
    status: 'pending',
    createdAt: '2026-09-09T16:30:00.000Z',
    totalVnd: 10000,
  });
  await seedOrder('after-local-midnight', {
    tableId: TABLE_ID,
    status: 'pending',
    createdAt: '2026-09-09T17:30:00.000Z',
    totalVnd: 20000,
  });
  await db
    .doc(`tenants/${TENANT_A}/orders/invoice-newer/statusEvents/event-paid`)
    .set({
      schemaVersion: 2,
      eventId: 'event-paid',
      previousStatus: 'served',
      newStatus: 'paid',
      actorType: 'staff',
      actorUid: USERS.cashierA.uid,
      reason: null,
      createdAt: '2026-09-11T02:05:00.000Z',
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
    paidAt?: string;
    paymentMethod?: 'cash' | 'vietQr';
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
    ...(overrides.paidAt
      ? {
          paidAt: overrides.paidAt,
          paymentMethod: overrides.paymentMethod ?? 'cash',
        }
      : {}),
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

function listOrderHistory(
  input: Partial<OrderHistoryListInput> = {},
): Promise<{ data: OrderHistoryPage }> {
  const callable = httpsCallable<OrderHistoryListInput, OrderHistoryPage>(
    functions,
    'callableOrderListHistory',
  );
  return callable({
    tenantId: TENANT_A,
    fromDay: '20260901',
    toDay: '20260930',
    status: 'all',
    page: 1,
    ...input,
  }) as Promise<{ data: OrderHistoryPage }>;
}

describe('callableOrderListHistory (REQ-ORD-007)', () => {
  it('returns the tenant history newest first with payment facts', async () => {
    await signInAs('cashierA');
    const result = await listOrderHistory();

    expect(result.data.rows.map((row) => row.order.orderId)).toEqual([
      'bill-open',
      'other-table-paid',
      'invoice-newer',
      'invoice-older',
      'after-local-midnight',
      'before-local-day',
    ]);
    expect(result.data.hasMore).toBe(false);
    expect(result.data.pageSize).toBe(15);

    const paid = result.data.rows.find(
      (row) => row.order.orderId === 'invoice-newer',
    );
    expect(paid?.paidAt).toBe('2026-09-11T02:05:00.000Z');
    expect(paid?.paymentMethod).toBe('vietQr');
    expect(paid?.statusEvents.map((event) => event.newStatus)).toEqual(['paid']);
    expect(result.data.rows[0].paidAt).toBeNull();
  });

  it('cuts the day range at tenant-local midnight', async () => {
    await signInAs('cashierA');
    const result = await listOrderHistory({
      fromDay: '20260910',
      toDay: '20260910',
    });
    expect(result.data.rows.map((row) => row.order.orderId)).toEqual([
      'invoice-older',
      'after-local-midnight',
    ]);
  });

  it('filters by the status the till uses', async () => {
    await signInAs('cashierA');
    const unpaid = await listOrderHistory({ status: 'unpaid' });
    expect(unpaid.data.rows.map((row) => row.order.orderId)).toEqual([
      'bill-open',
      'after-local-midnight',
      'before-local-day',
    ]);

    const paid = await listOrderHistory({ status: 'paid' });
    expect(paid.data.rows.map((row) => row.order.orderId)).toEqual([
      'other-table-paid',
      'invoice-newer',
      'invoice-older',
    ]);
  });

  it('returns fifteen Orders a page and the rest on the next page', async () => {
    for (let index = 0; index < 16; index += 1) {
      await seedOrder(`paged-${String(index).padStart(2, '0')}`, {
        tableId: TABLE_ID,
        status: 'pending',
        createdAt: `2026-10-01T00:${String(index).padStart(2, '0')}:00.000Z`,
        totalVnd: 10000,
      });
    }
    await signInAs('ownerA');

    const first = await listOrderHistory({
      fromDay: '20261001',
      toDay: '20261001',
      page: 1,
    });
    expect(first.data.rows).toHaveLength(15);
    expect(first.data.hasMore).toBe(true);
    expect(first.data.rows[0].order.orderId).toBe('paged-15');

    const second = await listOrderHistory({
      fromDay: '20261001',
      toDay: '20261001',
      page: 2,
    });
    expect(second.data.rows.map((row) => row.order.orderId)).toEqual([
      'paged-00',
    ]);
    expect(second.data.hasMore).toBe(false);
  });

  it('denies a Kitchen member and a member of another Tenant', async () => {
    await signInAs('kitchenA');
    await expect(listOrderHistory()).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
    await signInAs('ownerB');
    await expect(listOrderHistory()).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });

  it('rejects a reversed day range', async () => {
    await signInAs('ownerA');
    await expect(
      listOrderHistory({ fromDay: '20260930', toDay: '20260901' }),
    ).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  });
});
