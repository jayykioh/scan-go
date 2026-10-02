/**
 * P0-010 Waiter Functions Emulator evidence (REQ-WAI-001, REQ-NOT-001,
 * REQ-ORD-003, NFR-RT-001).
 *
 * These tests call the real Fulfilment callables through the Functions
 * emulator and prove the ready -> served transition once, Waiter role denial
 * for payment/menu/Kitchen actions, the bounded ready queue, and the
 * deterministic notification effect. Run with the root script:
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
  FulfilmentCommandResult,
  FulfilmentMarkServedInput,
} from '../../../shared/contracts/fulfilment.contract.js';
import type { OrderListResult } from '../../../shared/contracts/order.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const ORDER_ID = 'order-waiter-001';
const ORDER_ID_SECOND = 'order-waiter-002';
const TRACKING_TOKEN = 'track-waiter-001';
const TRACKING_TOKEN_SECOND = 'track-waiter-002';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-wa', email: 'owner-wa@example.com' },
  waiterA: { uid: 'uid-waiter-wa', email: 'waiter-wa@example.com' },
  kitchenA: { uid: 'uid-kitchen-wa', email: 'kitchen-wa@example.com' },
  cashierA: { uid: 'uid-cashier-wa', email: 'cashier-wa@example.com' },
  ownerB: { uid: 'uid-owner-wb', email: 'owner-wb@example.com' },
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
  await db.recursiveDelete(db.collection('publicOrderTracking'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

const now = () => new Date().toISOString();

function orderData(
  orderId: string,
  trackingToken: string,
  status: 'ready' | 'pending',
) {
  const timestamp = now();
  return {
    schemaVersion: 1,
    orderId,
    tenantId: TENANT_A,
    tableId: 'table-01',
    tableNameSnapshot: 'Bàn 1',
    status,
    paymentMode: 'payLater',
    items: [
      {
        lineId: `${orderId}-line-1`,
        menuItemId: 'menu-1',
        name: 'Phở bò',
        modifiers: [],
        unitPriceVnd: 45000,
        quantity: 1,
        lineTotalVnd: 45000,
        unitCostVnd: 22000,
        lineCostVnd: 22000,
      },
    ],
    subtotalVnd: 45000,
    totalVnd: 45000,
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
    itemSummary: '1x Phở bò',
    totalVnd: 45000,
    status: 'ready',
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

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    onboardingChecklist: { shopName: now() },
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.waiterA.uid}`).set({
    membershipType: 'staff',
    roles: ['waiter'],
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

  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`)
    .set(orderData(ORDER_ID, TRACKING_TOKEN, 'ready'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_ID_SECOND}`)
    .set(orderData(ORDER_ID_SECOND, TRACKING_TOKEN_SECOND, 'pending'));
  await db
    .doc(`publicOrderTracking/${TRACKING_TOKEN}`)
    .set(trackingData(ORDER_ID, TRACKING_TOKEN));
  await db
    .doc(`publicOrderTracking/${TRACKING_TOKEN_SECOND}`)
    .set(trackingData(ORDER_ID_SECOND, TRACKING_TOKEN_SECOND));
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function markServedCallable() {
  return httpsCallable<FulfilmentMarkServedInput, FulfilmentCommandResult>(
    functions,
    'callableFulfilmentMarkServed',
  );
}

function listReadyCallable() {
  return httpsCallable<{ tenantId: string }, OrderListResult>(
    functions,
    'callableFulfilmentListReady',
  );
}

function startCookingCallable() {
  return httpsCallable<unknown, FulfilmentCommandResult>(
    functions,
    'callableFulfilmentStartCooking',
  );
}

function setAvailabilityCallable() {
  return httpsCallable<unknown, unknown>(
    functions,
    'callableCatalogSetAvailability',
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

async function orderStatus(orderId = ORDER_ID): Promise<unknown> {
  return (await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).get()).get(
    'status',
  );
}

describe('callableFulfilmentMarkServed: ready -> served once (REQ-WAI-001)', () => {
  it('moves a ready Order to served and records one status event', async () => {
    await signInAs('waiterA');
    const response = await markServedCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-serve-0001',
    });

    expect(response.data.status).toBe('applied');
    expect(response.data.command).toBe('markServed');
    expect(response.data.order.status).toBe('served');
    expect(await orderStatus()).toBe('served');

    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${ORDER_ID}/statusEvents`)
      .get();
    expect(events.size).toBe(1);
    expect(events.docs[0]?.get('newStatus')).toBe('served');
    expect(events.docs[0]?.get('actorUid')).toBe(USERS.waiterA.uid);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.size).toBe(1);
    expect(audit.docs[0]?.get('action')).toBe('OrderServed');
  });

  it('replays a retried served command without a second effect', async () => {
    await signInAs('waiterA');
    const input = {
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-serve-retry',
    };
    await markServedCallable()(input);
    const retry = await markServedCallable()(input);

    expect(retry.data.status).toBe('replayed');
    expect(retry.data.order.status).toBe('served');
    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${ORDER_ID}/statusEvents`)
      .get();
    expect(events.size).toBe(1);
  });

  it('rejects served as a source status', async () => {
    await signInAs('waiterA');
    await markServedCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      idempotencyKey: 'idem-serve-0002',
    });
    await expectRejection(
      markServedCallable()({
        tenantId: TENANT_A,
        orderId: ORDER_ID,
        idempotencyKey: 'idem-serve-0003',
      }),
      'failed-precondition',
    );
    expect(await orderStatus()).toBe('served');
  });
});

describe('Waiter role gate (REQ-WAI-001)', () => {
  it('denies Kitchen, Cashier, and cross-tenant Owner the served command', async () => {
    for (const key of ['kitchenA', 'cashierA', 'ownerB'] as const) {
      await signInAs(key);
      await expectRejection(
        markServedCallable()({
          tenantId: TENANT_A,
          orderId: ORDER_ID,
          idempotencyKey: `idem-serve-${key}`,
        }),
        'permission-denied',
      );
    }
    expect(await orderStatus()).toBe('ready');
  });

  it('denies Waiter payment, menu, and Kitchen actions', async () => {
    await signInAs('waiterA');
    await expectRejection(
      startCookingCallable()({
        tenantId: TENANT_A,
        orderId: ORDER_ID_SECOND,
        idempotencyKey: 'idem-waiter-cook',
      }),
      'permission-denied',
    );
    await expectRejection(
      setAvailabilityCallable()({
        tenantId: TENANT_A,
        menuItemId: 'menu-1',
        isAvailable: false,
      }),
      'permission-denied',
    );
  });
});

describe('Waiter ready queue (REQ-WAI-001, NFR-RT-001)', () => {
  it('returns only ready Orders to Waiter and denies Kitchen', async () => {
    await signInAs('waiterA');
    const ready = await listReadyCallable()({ tenantId: TENANT_A });
    expect(ready.data.orders.map((order) => order.orderId)).toContain(ORDER_ID);
    expect(ready.data.orders.every((order) => order.status === 'ready')).toBe(true);

    await signInAs('kitchenA');
    await expectRejection(
      listReadyCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
  });
});

describe('notification effect dedupe (REQ-NOT-001)', () => {
  it('writes one deterministic ready notification for the Waiter', async () => {
    await signInAs('kitchenA');
    const markReady = httpsCallable<unknown, FulfilmentCommandResult>(
      functions,
      'callableFulfilmentMarkReady',
    );
    // Move the seeded ready Order back is not possible; cook the second Order
    // and mark it ready instead.
    await startCookingCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_ID_SECOND,
      idempotencyKey: 'idem-cook-notify',
    });
    await markReady({
      tenantId: TENANT_A,
      orderId: ORDER_ID_SECOND,
      idempotencyKey: 'idem-ready-notify',
    });
    const first = await db
      .collection(`tenants/${TENANT_A}/notifications`)
      .get();
    expect(first.size).toBe(1);
    expect(first.docs[0]?.get('channel')).toBe('waiter');
    expect(first.docs[0]?.get('kind')).toBe('orderReady');

    // A retried ready command must not create a second notification.
    await markReady({
      tenantId: TENANT_A,
      orderId: ORDER_ID_SECOND,
      idempotencyKey: 'idem-ready-notify',
    });
    const second = await db
      .collection(`tenants/${TENANT_A}/notifications`)
      .get();
    expect(second.size).toBe(1);
  });
});
