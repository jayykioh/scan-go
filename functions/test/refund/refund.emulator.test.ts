/**
 * P0-L09 Paid-order reversal and refund Functions Emulator evidence
 * (REQ-PAY-001, NFR-SEC-001, docs/RULES_FIREBASE.md §4).
 *
 * The correction callable writes one linked compensating Payment and one linked
 * Order correction instant. The original Payment stays immutable. Deterministic
 * compensating ids and the idempotency record make a retry a replay, and the
 * audit event records actor, reason, target, and server UTC time.
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
  PaymentCorrectionInput,
  PaymentCorrectionResult,
} from '../../../shared/contracts/correction.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const ORDER_PAID = 'order-paid-001';
const ORDER_UNPAID = 'order-unpaid-001';
const PAYMENT_ID = `payment_${ORDER_PAID}`;

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  cashierA: { uid: 'uid-cashier-a', email: 'cashier-a@example.com' },
  cashierNoPerm: { uid: 'uid-cashier-noperm', email: 'cashier-noperm@example.com' },
  kitchenA: { uid: 'uid-kitchen-a', email: 'kitchen-a@example.com' },
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
  admin: { uid: 'uid-admin', email: 'admin@example.com' },
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

function orderData(orderId: string, status: 'paid' | 'pending') {
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
        menuItemId: 'item-pho-bo-001',
        name: 'Phở bò',
        modifiers: [],
        unitPriceVnd: 100000,
        quantity: 1,
        lineTotalVnd: 100000,
        unitCostVnd: 22000,
        lineCostVnd: 22000,
      },
    ],
    subtotalVnd: 100000,
    totalVnd: 100000,
    trackingToken: `track-${orderId}`,
    idempotencyKey: `idem-${orderId}`,
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
  await adminAuth.setCustomUserClaims(USERS.admin.uid, { admin: true });

  await db.doc('platform/config').set({ values: {}, configVersion: 1 });

  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashierA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: ['payment.correct'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashierNoPerm.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.kitchenA.uid}`).set({
    membershipType: 'staff',
    roles: ['kitchen'],
    isActive: true,
  });

  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_PAID}`)
    .set(orderData(ORDER_PAID, 'paid'));
  await db
    .doc(`tenants/${TENANT_A}/orders/${ORDER_UNPAID}`)
    .set(orderData(ORDER_UNPAID, 'pending'));

  const timestamp = now();
  await db.doc(`tenants/${TENANT_A}/payments/${PAYMENT_ID}`).set({
    schemaVersion: 1,
    paymentId: PAYMENT_ID,
    tenantId: TENANT_A,
    orderId: ORDER_PAID,
    amountVnd: 100000,
    method: 'cash',
    status: 'confirmed',
    vietQrInstruction: null,
    actorUid: USERS.cashierA.uid,
    idempotencyKey: 'idem-confirm-0001',
    linkedPaymentId: null,
    correctionKind: null,
    reason: null,
    providerId: null,
    providerRef: null,
    confirmedAt: timestamp,
    createdAt: timestamp,
  });

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function correctCallable() {
  return httpsCallable<PaymentCorrectionInput, PaymentCorrectionResult>(
    functions,
    'callablePaymentCorrect',
  );
}

function correctInput(
  overrides: Partial<PaymentCorrectionInput> = {},
): PaymentCorrectionInput {
  return {
    tenantId: TENANT_A,
    orderId: ORDER_PAID,
    kind: 'reversal',
    reason: 'Khách báo sai',
    idempotencyKey: 'idem-correct-0001',
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
  expect((caught as { code?: string }).code ?? '').toContain(codeFragment);
}

async function compensatingDoc(kind: 'reversal' | 'refund') {
  return db
    .doc(`tenants/${TENANT_A}/payments/payment_${ORDER_PAID}__${kind}`)
    .get();
}

describe('callablePaymentCorrect reversal', () => {
  it('keeps the original immutable and writes one linked compensating record', async () => {
    await signInAs('ownerA');
    const response = await correctCallable()(correctInput());

    expect(response.data.status).toBe('corrected');
    expect(response.data.originalPayment.status).toBe('confirmed');
    expect(response.data.compensatingPayment.status).toBe('reversed');
    expect(response.data.compensatingPayment.linkedPaymentId).toBe(PAYMENT_ID);

    const original = await db
      .doc(`tenants/${TENANT_A}/payments/${PAYMENT_ID}`)
      .get();
    expect(original.get('status')).toBe('confirmed');
    expect(original.get('linkedPaymentId')).toBeNull();

    const compensating = await compensatingDoc('reversal');
    expect(compensating.exists).toBe(true);
    expect(compensating.get('correctionKind')).toBe('reversal');
    expect(compensating.get('reason')).toBe('Khách báo sai');

    const order = await db.doc(`tenants/${TENANT_A}/orders/${ORDER_PAID}`).get();
    expect(order.get('status')).toBe('paid');
    expect(typeof order.get('reversalAt')).toBe('string');

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    const event = audit.docs.find(
      (docSnap) => docSnap.get('action') === 'PaymentReversed',
    );
    expect(event?.get('actorUid')).toBe(USERS.ownerA.uid);
    expect(event?.get('reason')).toBe('Khách báo sai');
    expect(event?.get('targetId')).toBe(PAYMENT_ID);
    expect(typeof event?.get('createdAt')).toBe('string');
  });

  it('records a linked refund and its order instant', async () => {
    await signInAs('cashierA');
    const response = await correctCallable()(
      correctInput({
        kind: 'refund',
        amountVnd: 40000,
        reason: 'Hoàn một phần',
        idempotencyKey: 'idem-refund-0001',
      }),
    );

    expect(response.data.kind).toBe('refund');
    expect(response.data.compensatingPayment.status).toBe('refunded');
    expect(response.data.compensatingPayment.amountVnd).toBe(40000);
    const order = await db.doc(`tenants/${TENANT_A}/orders/${ORDER_PAID}`).get();
    expect(typeof order.get('refundAt')).toBe('string');
  });

  it('replays a retry and a repeated kind without a second record', async () => {
    await signInAs('ownerA');
    const first = await correctCallable()(correctInput());
    const retry = await correctCallable()(correctInput());
    const secondKind = await correctCallable()(
      correctInput({ idempotencyKey: 'idem-correct-0002' }),
    );

    expect(first.data.status).toBe('corrected');
    expect(retry.data.status).toBe('replayed');
    expect(secondKind.data.status).toBe('replayed');

    const records = await db
      .collection(`tenants/${TENANT_A}/payments`)
      .get();
    const compensating = records.docs.filter(
      (docSnap) => docSnap.get('correctionKind') !== null,
    );
    expect(compensating).toHaveLength(1);
  });

  it('allows a server-verified ADMIN without a membership', async () => {
    await signInAs('admin');
    const response = await correctCallable()(correctInput());
    expect(response.data.status).toBe('corrected');
  });
});

describe('callablePaymentCorrect rejections', () => {
  it('rejects an unpaid Order without a compensating record', async () => {
    await signInAs('ownerA');
    await expectRejection(
      correctCallable()(
        correctInput({ orderId: ORDER_UNPAID, idempotencyKey: 'idem-unpaid-1' }),
      ),
      'failed-precondition',
    );
    const records = await db.collection(`tenants/${TENANT_A}/payments`).get();
    expect(records.size).toBe(1);
  });

  it('denies an unauthorized Cashier and a cross-tenant Owner', async () => {
    for (const key of ['cashierNoPerm', 'kitchenA', 'ownerB'] as const) {
      await signInAs(key);
      await expectRejection(
        correctCallable()(correctInput({ idempotencyKey: `idem-${key}` })),
        'permission-denied',
      );
    }
    expect((await compensatingDoc('reversal')).exists).toBe(false);
  });

  it('rejects a malformed amount without changing records', async () => {
    await signInAs('ownerA');
    await expectRejection(
      correctCallable()(correctInput({ amountVnd: 0 })),
      'invalid-argument',
    );
    await expectRejection(
      correctCallable()(correctInput({ amountVnd: 100001 })),
      'invalid-argument',
    );
    await expectRejection(
      correctCallable()(correctInput({ reason: '   ' })),
      'invalid-argument',
    );
    expect((await compensatingDoc('reversal')).exists).toBe(false);
  });
});
