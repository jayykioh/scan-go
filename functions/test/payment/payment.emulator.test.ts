/**
 * P0-009 Payment Functions Emulator evidence (REQ-CAS-001, REQ-ORD-002,
 * REQ-ORD-003, NFR-SEC-001, NFR-DATA-001).
 *
 * These tests call the real Payment and Ordering callables through the
 * Functions emulator. They prove cash and VietQR settlement, one immutable
 * Payment per Order, retry dedupe, the Cashier authorization matrix, and the
 * Pay-First Kitchen gate before a confirmed Payment.
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
  getFirestore,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  PaymentConfirmationResult,
  PaymentConfirmInput,
  PaymentInstructionResult,
  VietQrInstruction,
} from '../../../shared/contracts/payment.contract.js';
import type {
  OrderListResult,
} from '../../../shared/contracts/order.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const ORDER_PAY_LATER = 'order-pay-later-001';
const ORDER_PAY_FIRST = 'order-pay-first-001';
const ORDER_MISMATCH = 'order-pay-later-002';
const TRACKING_PAY_LATER = 'track-pay-later-001';
const TRACKING_PAY_FIRST = 'track-pay-first-001';
const TRACKING_MISMATCH = 'track-pay-later-002';

const REGION = FUNCTIONS_REGION;
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
let clientDb: ClientFirestore;
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

function orderData(
  orderId: string,
  trackingToken: string,
  paymentMode: 'payFirst' | 'payLater',
  totalVnd = 100000,
) {
  const timestamp = now();
  const item = {
    lineId: `${orderId}-line-1`,
    menuItemId: 'item-pho-bo-001',
    name: 'Phở bò',
    modifiers: [],
    unitPriceVnd: 50000,
    quantity: 2,
    lineTotalVnd: 100000,
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
    paymentMode,
    items: [item],
    subtotalVnd: totalVnd,
    totalVnd,
    trackingToken,
    idempotencyKey: `idem-customer-${orderId}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function trackingData(
  orderId: string,
  trackingToken: string,
  totalVnd = 100000,
) {
  return {
    schemaVersion: 1,
    trackingToken,
    tenantId: TENANT_A,
    orderId,
    tableName: 'Bàn 1',
    itemSummary: '2x Phở bò',
    totalVnd,
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

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    vietQr: {
      bankBin: '970436',
      accountNo: '1234567890',
      accountName: 'SCANGO CAFE',
      template: 'compact2',
    },
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

  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_PAY_LATER}`)
    .set(orderData(ORDER_PAY_LATER, TRACKING_PAY_LATER, 'payLater'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_PAY_FIRST}`)
    .set(orderData(ORDER_PAY_FIRST, TRACKING_PAY_FIRST, 'payFirst'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_MISMATCH}`)
    .set(orderData(ORDER_MISMATCH, TRACKING_MISMATCH, 'payLater', 100000));

  await db
    .doc(`publicOrderTracking/${TRACKING_PAY_LATER}`)
    .set(trackingData(ORDER_PAY_LATER, TRACKING_PAY_LATER));
  await db
    .doc(`publicOrderTracking/${TRACKING_PAY_FIRST}`)
    .set(trackingData(ORDER_PAY_FIRST, TRACKING_PAY_FIRST));
  await db
    .doc(`publicOrderTracking/${TRACKING_MISMATCH}`)
    .set(trackingData(ORDER_MISMATCH, TRACKING_MISMATCH));
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function confirmCallable() {
  return httpsCallable<PaymentConfirmInput, PaymentConfirmationResult>(
    functions,
    'callablePaymentConfirm',
  );
}

function instructionCallable() {
  return httpsCallable<
    { tenantId: string; orderId: string },
    PaymentInstructionResult
  >(functions, 'callablePaymentGetVietQrInstruction');
}

function unpaidCallable() {
  return httpsCallable<{ tenantId: string }, OrderListResult>(
    functions,
    'callableOrderListUnpaid',
  );
}

function kitchenCallable() {
  return httpsCallable<{ tenantId: string }, OrderListResult>(
    functions,
    'callableOrderListKitchen',
  );
}

function cashInput(
  orderId: string,
  idempotencyKey: string,
  amountVnd = 100000,
): PaymentConfirmInput {
  return {
    tenantId: TENANT_A,
    orderId,
    method: 'cash',
    amountVnd,
    idempotencyKey,
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

async function paymentCount(orderId?: string): Promise<number> {
  const snap = await db.collection(`tenants/${TENANT_A}/payments`).get();
  return orderId
    ? snap.docs.filter((docSnap) => docSnap.get('orderId') === orderId).length
    : snap.size;
}

async function orderStatus(orderId: string): Promise<unknown> {
  return (await db.doc(`tenants/${TENANT_A}/orders/${orderId}`).get()).get(
    'status',
  );
}

describe('callablePaymentConfirm: Cash settlement', () => {
  it('creates one immutable Payment and marks the Pay-Later Order paid', async () => {
    await signInAs('cashierA');
    const response = await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-cash-0001'));
    const result = response.data;

    expect(result.status).toBe('confirmed');
    expect(result.payment.method).toBe('cash');
    expect(result.payment.amountVnd).toBe(100000);
    expect(Number.isInteger(result.payment.amountVnd)).toBe(true);
    expect(result.payment.status).toBe('confirmed');
    expect(result.payment.vietQrInstruction).toBeNull();
    expect(result.orderStatus).toBe('paid');
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('paid');
    expect(await paymentCount(ORDER_PAY_LATER)).toBe(1);

    const orderSnap = await db.doc(`tenants/${TENANT_A}/orders/${ORDER_PAY_LATER}`).get();
    expect(orderSnap.get('paymentMethod')).toBe('cash');
    expect(typeof orderSnap.get('paidAt')).toBe('string');

    const paymentSnap = await db
      .doc(`tenants/${TENANT_A}/payments/${result.payment.paymentId}`)
      .get();
    expect(paymentSnap.get('amountVnd')).toBe(100000);
    expect(paymentSnap.get('actorUid')).toBe(USERS.cashierA.uid);

    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${ORDER_PAY_LATER}/statusEvents`)
      .get();
    expect(events.docs.some((event) => event.get('newStatus') === 'paid')).toBe(true);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.docs.some((event) => event.get('action') === 'PaymentConfirmed')).toBe(
      true,
    );
  });
});

describe('callablePaymentConfirm: VietQR settlement and instruction', () => {
  it('builds a dynamic VietQR instruction without writing a Payment', async () => {
    await signInAs('cashierA');
    const response = await instructionCallable()({
      tenantId: TENANT_A,
      orderId: ORDER_PAY_LATER,
    });
    const instruction: VietQrInstruction = response.data.instruction;
    expect(instruction.method).toBe('vietQr');
    expect(instruction.amountVnd).toBe(100000);
    expect(instruction.bankBin).toBe('970436');
    expect(instruction.addInfo).toBe(`SCANGO ${ORDER_PAY_LATER}`);
    expect(instruction.qrPayload).toContain('amount=100000');
    expect(await paymentCount()).toBe(0);
  });

  it('snapshots the VietQR instruction into the confirmed Payment', async () => {
    await signInAs('cashierA');
    const response = await confirmCallable()({
      ...cashInput(ORDER_PAY_LATER, 'idem-pay-qr-0001'),
      method: 'vietQr',
    });

    expect(response.data.payment.method).toBe('vietQr');
    expect(response.data.payment.vietQrInstruction).not.toBeNull();
    expect(response.data.payment.vietQrInstruction?.amountVnd).toBe(100000);
    expect(response.data.orderStatus).toBe('paid');
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('paid');
    expect(await paymentCount(ORDER_PAY_LATER)).toBe(1);
  });

  it('rejects a VietQR settlement when the tenant has no merchant config', async () => {
    await db.doc(`tenants/${TENANT_A}`).set({ vietQr: null }, { merge: true });
    await signInAs('cashierA');
    await expectRejection(
      confirmCallable()({
        ...cashInput(ORDER_PAY_LATER, 'idem-pay-qr-0002'),
        method: 'vietQr',
      }),
      'failed-precondition',
    );
    expect(await paymentCount()).toBe(0);
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('pending');
  });
});

describe('callablePaymentConfirm: idempotency and immutability', () => {
  it('replays the same key and request without a second Payment', async () => {
    await signInAs('cashierA');
    const first = await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-retry-0001'));
    const retry = await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-retry-0001'));

    expect(retry.data.status).toBe('replayed');
    expect(retry.data.payment.paymentId).toBe(first.data.payment.paymentId);
    expect(await paymentCount(ORDER_PAY_LATER)).toBe(1);
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('paid');
  });

  it('rejects a reused key with a changed request', async () => {
    await signInAs('cashierA');
    await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-retry-0002'));
    await expectRejection(
      confirmCallable()({
        ...cashInput(ORDER_MISMATCH, 'idem-pay-retry-0002'),
      }),
      'already-exists',
    );
    expect(await paymentCount()).toBe(1);
    expect(await orderStatus(ORDER_MISMATCH)).toBe('pending');
  });

  it('rejects a second settlement for an already paid Order', async () => {
    await signInAs('cashierA');
    await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-once-0001'));
    await expectRejection(
      confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-once-0002')),
      'already-exists',
    );
    expect(await paymentCount(ORDER_PAY_LATER)).toBe(1);
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('paid');
  });

  it('keeps the first Payment unchanged after a later retry', async () => {
    await signInAs('cashierA');
    const first = await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-frozen-0001'));
    const paymentSnap = await db
      .doc(`tenants/${TENANT_A}/payments/${first.data.payment.paymentId}`)
      .get();
    const original = paymentSnap.data();

    await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-frozen-0001'));
    const after = (
      await db
        .doc(`tenants/${TENANT_A}/payments/${first.data.payment.paymentId}`)
        .get()
    ).data();

    expect(after).toEqual(original);
  });
});

describe('Pay-First gate', () => {
  it('keeps the Order out of the Kitchen queue until Payment confirms', async () => {
    await signInAs('kitchenA');
    const before = await kitchenCallable()({ tenantId: TENANT_A });
    const beforeIds = before.data.orders.map((order) => order.orderId);
    expect(beforeIds).toContain(ORDER_PAY_LATER);
    expect(beforeIds).not.toContain(ORDER_PAY_FIRST);

    await signInAs('cashierA');
    const confirmed = await confirmCallable()(
      cashInput(ORDER_PAY_FIRST, 'idem-pay-payfirst-0001'),
    );
    expect(confirmed.data.orderStatus).toBe('pending');

    await signInAs('kitchenA');
    const after = await kitchenCallable()({ tenantId: TENANT_A });
    const afterIds = after.data.orders.map((order) => order.orderId);
    expect(afterIds).toContain(ORDER_PAY_LATER);
    expect(afterIds).toContain(ORDER_PAY_FIRST);
    expect(await orderStatus(ORDER_PAY_FIRST)).toBe('pending');
  });
});

describe('Cashier authorization matrix', () => {
  it('allows Owner and Cashier to confirm settlement', async () => {
    await signInAs('ownerA');
    const owner = await confirmCallable()(cashInput(ORDER_PAY_LATER, 'idem-pay-owner-0001'));
    expect(owner.data.orderStatus).toBe('paid');
  });

  it('denies Kitchen, Waiter, inactive Staff, and cross-tenant Owner', async () => {
    for (const key of ['kitchenA', 'waiterA', 'inactiveA', 'ownerB'] as const) {
      await signInAs(key);
      await expectRejection(
        confirmCallable()(cashInput(ORDER_PAY_LATER, `idem-pay-${key}`)),
        'permission-denied',
      );
    }
    expect(await paymentCount()).toBe(0);
    expect(await orderStatus(ORDER_PAY_LATER)).toBe('pending');
  });

  it('denies the unpaid queue to Kitchen and the Kitchen queue to Cashier', async () => {
    await signInAs('kitchenA');
    await expectRejection(unpaidCallable()({ tenantId: TENANT_A }), 'permission-denied');
    await signInAs('cashierA');
    await expectRejection(kitchenCallable()({ tenantId: TENANT_A }), 'permission-denied');
  });
});

describe('invalid settlement input', () => {
  it('rejects an amount mismatch without a Payment or Order change', async () => {
    await signInAs('cashierA');
    await expectRejection(
      confirmCallable()(cashInput(ORDER_MISMATCH, 'idem-pay-bad-amount', 99000)),
      'invalid-argument',
    );
    expect(await paymentCount(ORDER_MISMATCH)).toBe(0);
    expect(await orderStatus(ORDER_MISMATCH)).toBe('pending');
  });

  it('rejects a malformed request without a Payment', async () => {
    await signInAs('cashierA');
    await expectRejection(
      confirmCallable()({
        tenantId: TENANT_A,
        orderId: ORDER_PAY_LATER,
        method: 'momo',
        amountVnd: 100000,
        idempotencyKey: 'idem-pay-malformed',
      } as unknown as PaymentConfirmInput),
      'invalid-argument',
    );
    await expectRejection(
      confirmCallable()(cashInput('order-does-not-exist', 'idem-pay-missing')),
      'not-found',
    );
    expect(await paymentCount()).toBe(0);
  });
});
