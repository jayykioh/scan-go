/**
 * Reporting Functions Emulator evidence (REQ-RPT-001, REQ-RPT-002, ADR 0005).
 *
 * These tests call the real Reporting callables through the Functions emulator.
 * They prove the Owner summary reads the tenant-local day materialization and
 * that the rebuild command regenerates it from immutable Orders and Payments.
 * Staff and cross-tenant callers are denied, so stats stay tenant-scoped.
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
  ReportingRebuildInput,
  ReportingRebuildResult,
  ReportingSummaryInput,
  ReportingSummaryResult,
} from '../../../shared/contracts/reporting.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const DAY_KEY = '20260912';
const ORDER_PAID = 'order-paid-001';
const PAYMENT_PAID = 'payment-order-paid-001';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  staffA: { uid: 'uid-staff-a', email: 'staff-a@example.com' },
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

const PAID_AT = '2026-09-12T02:00:00.000Z';

function paidOrderData() {
  return {
    schemaVersion: 1,
    orderId: ORDER_PAID,
    tenantId: TENANT_A,
    tableId: 'table-01',
    tableNameSnapshot: 'Bàn 1',
    status: 'paid',
    paymentMode: 'payLater',
    items: [
      {
        lineId: `${ORDER_PAID}-line-1`,
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
    paidAt: PAID_AT,
    createdAt: PAID_AT,
    updatedAt: PAID_AT,
  };
}

function confirmedPaymentData() {
  return {
    schemaVersion: 1,
    paymentId: PAYMENT_PAID,
    tenantId: TENANT_A,
    orderId: ORDER_PAID,
    amountVnd: 100000,
    method: 'cash',
    status: 'confirmed',
    confirmedAt: PAID_AT,
    createdAt: PAID_AT,
  };
}

function dailyStatsData() {
  return {
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: DAY_KEY,
    createdOrderCount: 1,
    cancelledOrderCount: 0,
    paidOrderCount: 1,
    reversedOrderCount: 0,
    refundedOrderCount: 0,
    revenueVnd: 100000,
    costVnd: 44000,
    grossProfitVnd: 56000,
    reversedVnd: 0,
    refundedVnd: 0,
    version: 1,
    updatedAt: PAID_AT,
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

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_B}`).set({
    shopName: 'Tenant B',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_A}/orders/${ORDER_PAID}`).set(paidOrderData());
  await db
    .doc(`tenants/${TENANT_A}/payments/${PAYMENT_PAID}`)
    .set(confirmedPaymentData());

  // A pre-materialized day for the read path. The rebuild test replaces it.
  const dayRef = db.doc(`tenants/${TENANT_A}/dailyStats/${DAY_KEY}`);
  await dayRef.set(dailyStatsData());
  await dayRef.collection('items').doc('item-pho-bo-001').set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: DAY_KEY,
    itemId: 'item-pho-bo-001',
    itemName: 'Phở bò',
    paidQuantity: 2,
    revenueVnd: 100000,
    costVnd: 44000,
    grossProfitVnd: 56000,
    reversedVnd: 0,
    refundedVnd: 0,
  });
  await dayRef.collection('tables').doc('table-01').set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: DAY_KEY,
    tableId: 'table-01',
    tableName: 'Bàn 1',
    createdOrderCount: 1,
    cancelledOrderCount: 0,
    paidOrderCount: 1,
    revenueVnd: 100000,
    costVnd: 44000,
    grossProfitVnd: 56000,
    reversedVnd: 0,
    refundedVnd: 0,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function summaryCallable() {
  return httpsCallable<ReportingSummaryInput, ReportingSummaryResult>(
    functions,
    'callableReportingGetSummary',
  );
}

function rebuildCallable() {
  return httpsCallable<ReportingRebuildInput, ReportingRebuildResult>(
    functions,
    'callableReportingRebuildDailyStats',
  );
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

describe('callableReportingGetSummary (REQ-RPT-001)', () => {
  it('returns paid revenue, COGS, gross profit, items, and tables', async () => {
    await signInAs('ownerA');
    const response = await summaryCallable()({
      tenantId: TENANT_A,
      period: 'day',
      anchorDay: DAY_KEY,
    });
    const result = response.data;

    expect(result.dayCount).toBe(1);
    expect(result.totals.revenueVnd).toBe(100000);
    expect(result.totals.costVnd).toBe(44000);
    expect(result.totals.grossProfitVnd).toBe(56000);
    expect(Number.isInteger(result.totals.revenueVnd)).toBe(true);
    expect(result.popularItems[0]?.itemName).toBe('Phở bò');
    expect(result.tables[0]?.tableId).toBe('table-01');
  });

  it('aggregates a week range and allows an active Staff member to read', async () => {
    await signInAs('staffA');
    const response = await summaryCallable()({
      tenantId: TENANT_A,
      period: 'week',
      anchorDay: DAY_KEY,
    });
    expect(response.data.fromDay).toBe('20260907');
    expect(response.data.toDay).toBe('20260913');
    expect(response.data.totals.revenueVnd).toBe(100000);
  });

  it('denies a cross-tenant Owner', async () => {
    await signInAs('ownerB');
    await expectRejection(
      summaryCallable()({ tenantId: TENANT_A, period: 'day' }),
      'permission-denied',
    );
  });

  it('rejects a malformed input', async () => {
    await signInAs('ownerA');
    await expectRejection(
      summaryCallable()({ tenantId: TENANT_A, period: 'year' } as unknown as ReportingSummaryInput),
      'invalid-argument',
    );
  });
});

describe('callableReportingRebuildDailyStats (REQ-RPT-002)', () => {
  it('rebuilds a day from immutable Orders and Payments', async () => {
    await signInAs('ownerA');
    const response = await rebuildCallable()({
      tenantId: TENANT_A,
      fromDay: DAY_KEY,
      toDay: DAY_KEY,
    });

    expect(response.data.rebuiltDayCount).toBe(1);
    expect(response.data.orderCount).toBeGreaterThanOrEqual(1);
    expect(response.data.truncated).toBe(false);

    const daySnap = await db
      .doc(`tenants/${TENANT_A}/dailyStats/${DAY_KEY}`)
      .get();
    expect(daySnap.get('revenueVnd')).toBe(100000);
    expect(daySnap.get('costVnd')).toBe(44000);
    expect(daySnap.get('grossProfitVnd')).toBe(56000);
    expect(daySnap.get('paidOrderCount')).toBe(1);
    expect(daySnap.get('createdOrderCount')).toBe(1);

    const itemSnap = await db
      .doc(`tenants/${TENANT_A}/dailyStats/${DAY_KEY}/items/item-pho-bo-001`)
      .get();
    expect(itemSnap.get('revenueVnd')).toBe(100000);
    expect(itemSnap.get('costVnd')).toBe(44000);
  });

  it('is idempotent and leaves another tenant untouched', async () => {
    await signInAs('ownerA');
    await rebuildCallable()({
      tenantId: TENANT_A,
      fromDay: DAY_KEY,
      toDay: DAY_KEY,
    });
    const readCounters = async () => {
      const data = (
        await db.doc(`tenants/${TENANT_A}/dailyStats/${DAY_KEY}`).get()
      ).data() ?? {};
      return {
        createdOrderCount: data.createdOrderCount,
        paidOrderCount: data.paidOrderCount,
        revenueVnd: data.revenueVnd,
        costVnd: data.costVnd,
        grossProfitVnd: data.grossProfitVnd,
      };
    };
    const first = await readCounters();

    await rebuildCallable()({
      tenantId: TENANT_A,
      fromDay: DAY_KEY,
      toDay: DAY_KEY,
    });
    const second = await readCounters();

    expect(second).toEqual(first);
    const tenantBStats = await db
      .collection(`tenants/${TENANT_B}/dailyStats`)
      .get();
    expect(tenantBStats.size).toBe(0);
  });

  it('denies Staff and a cross-tenant Owner', async () => {
    await signInAs('staffA');
    await expectRejection(
      rebuildCallable()({ tenantId: TENANT_A, fromDay: DAY_KEY, toDay: DAY_KEY }),
      'permission-denied',
    );

    await signInAs('ownerB');
    await expectRejection(
      rebuildCallable()({ tenantId: TENANT_A, fromDay: DAY_KEY, toDay: DAY_KEY }),
      'permission-denied',
    );
  });

  it('rejects a malformed day range', async () => {
    await signInAs('ownerA');
    await expectRejection(
      rebuildCallable()({
        tenantId: TENANT_A,
        fromDay: DAY_KEY,
      } as unknown as ReportingRebuildInput),
      'invalid-argument',
    );
  });
});
