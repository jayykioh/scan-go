/**
 * PayOS settlement Functions Emulator evidence (REQ-PAY-003, REQ-PAY-004).
 *
 * The provider call itself is unit-tested with an injected `fetch`; here the
 * inbound half is driven end to end. `payosWebhookV1` is a public HTTP endpoint,
 * so these tests prove the boundary: a correctly signed event settles exactly one
 * Payment and marks the Order paid, a retry replays, and a forged signature or an
 * unknown `orderCode` never reaches the ledger.
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
  PayosLinkInput,
  PayosLinkResult,
} from '../../../shared/contracts/payment.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';
import {
  PAYOS_EMULATOR_CONFIG,
  signPayosPayload,
} from '../../src/modules/payment/payos.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_ID = 'tenant-payos';
const ORDER_ID = 'order-payos-001';
const ORDER_CODE = 4242;
const AMOUNT_VND = 100000;

const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
const WEBHOOK_URL = `http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/${FUNCTIONS_REGION}/payosWebhookV1`;

const USERS = {
  owner: { uid: 'uid-payos-owner', email: 'payos-owner@example.com' },
  cashier: { uid: 'uid-payos-cashier', email: 'payos-cashier@example.com' },
  kitchen: { uid: 'uid-payos-kitchen', email: 'payos-kitchen@example.com' },
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
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }

  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }

  await db.doc(`tenants/${TENANT_ID}`).set({
    shopName: 'PayOS Shop',
    configOverrides: {},
  });
  await db.doc(`tenants/${TENANT_ID}/members/${USERS.owner.uid}`).set({
    uid: USERS.owner.uid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });
  await db.doc(`tenants/${TENANT_ID}/members/${USERS.cashier.uid}`).set({
    uid: USERS.cashier.uid,
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });
  await db.doc(`tenants/${TENANT_ID}/members/${USERS.kitchen.uid}`).set({
    uid: USERS.kitchen.uid,
    membershipType: 'staff',
    roles: ['kitchen'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });

  await db.doc(`tenants/${TENANT_ID}/orders/${ORDER_ID}`).set({
    schemaVersion: 1,
    orderId: ORDER_ID,
    tenantId: TENANT_ID,
    tableId: 'table-1',
    tableNameSnapshot: 'Bàn 1',
    status: 'pending',
    paymentMode: 'payLater',
    items: [
      {
        lineId: 'line-1',
        menuItemId: 'item-1',
        name: 'Phở',
        modifiers: [],
        unitPriceVnd: 50000,
        quantity: 2,
        lineTotalVnd: 100000,
        unitCostVnd: 20000,
        lineCostVnd: 40000,
      },
    ],
    subtotalVnd: AMOUNT_VND,
    totalVnd: AMOUNT_VND,
    trackingToken: 'track-payos-1',
    idempotencyKey: 'order-idem-payos-1',
    createdAt: '2026-10-20T05:00:00.000Z',
    updatedAt: '2026-10-20T05:00:00.000Z',
  });

  // The link the webhook resolves `orderCode` back through.
  await db
    .doc(`tenants/${TENANT_ID}/payosPaymentLinks/${ORDER_ID}`)
    .set({
      schemaVersion: 1,
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      orderCode: ORDER_CODE,
      amountVnd: AMOUNT_VND,
      status: 'pending',
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      qrCode: '00020101021238',
      paymentLinkId: 'link-abc',
      createdAt: '2026-10-20T05:00:00.000Z',
      updatedAt: '2026-10-20T05:00:00.000Z',
    });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

interface PayosWebhookOptions {
  orderCode?: number;
  amount?: number;
  reference?: string;
  code?: string;
  success?: boolean;
  /** Sign with a foreign key to forge the event. */
  signingKey?: string;
  /** Sign the data, then tamper with it after signing. */
  tamperAmount?: number;
  /** An extra envelope key the provider added; it must not refuse the event. */
  extraEnvelopeKey?: boolean;
}

function payosWebhookBody(options: PayosWebhookOptions = {}): unknown {
  const data: Record<string, unknown> = {
    orderCode: options.orderCode ?? ORDER_CODE,
    amount: options.amount ?? AMOUNT_VND,
    description: 'SCANGO order-payos-001',
    reference: options.reference ?? 'PAYOS-REF-001',
    paymentLinkId: 'link-abc',
    transactionDateTime: '2026-10-20 12:00:00',
    currency: 'VND',
    accountNumber: '0011002233445',
    // PayOS sends empty optional fields as null and omits them from the
    // signature, so the test payload keeps one to prove the skip.
    counterAccountBankId: null,
    code: '00',
    desc: 'Thành công',
  };
  const signature = signPayosPayload(
    data,
    options.signingKey ?? PAYOS_EMULATOR_CONFIG.checksumKey,
  );
  if (options.tamperAmount !== undefined) {
    data.amount = options.tamperAmount;
  }
  return {
    code: options.code ?? '00',
    desc: 'success',
    success: options.success ?? true,
    data,
    signature,
    ...(options.extraEnvelopeKey ? { providerVersion: 'v3' } : {}),
  };
}

async function postWebhook(body: unknown): Promise<Response> {
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function readPayments(): Promise<Array<Record<string, unknown>>> {
  const snap = await db.collection(`tenants/${TENANT_ID}/payments`).get();
  return snap.docs.map((doc) => ({ paymentId: doc.id, ...doc.data() }));
}

async function readOrder(): Promise<Record<string, unknown>> {
  const snap = await db.doc(`tenants/${TENANT_ID}/orders/${ORDER_ID}`).get();
  return snap.data() ?? {};
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function createPayosLinkCallable() {
  return httpsCallable<PayosLinkInput, PayosLinkResult>(
    functions,
    'callablePaymentCreatePayosLink',
  );
}

async function captureFailure(
  promise: Promise<unknown>,
): Promise<{ code: string }> {
  try {
    await promise;
  } catch (error) {
    return { code: (error as { code?: string }).code ?? '' };
  }
  throw new Error('Expected the callable to reject.');
}

describe('payosWebhookV1 settles exactly once', () => {
  it('posts one PayOS payment, marks the order paid, and replays a retry', async () => {
    const first = await postWebhook(payosWebhookBody());
    expect(first.status).toBe(200);
    expect((await first.json()) as { status: string }).toMatchObject({
      status: 'confirmed',
    });

    const retry = await postWebhook(payosWebhookBody());
    expect(retry.status).toBe(200);
    expect((await retry.json()) as { status: string }).toMatchObject({
      status: 'replayed',
    });

    const payments = await readPayments();
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      method: 'payos',
      status: 'confirmed',
      providerId: 'payos',
      providerRef: 'PAYOS-REF-001',
      amountVnd: AMOUNT_VND,
      vietQrInstruction: null,
    });

    expect(await readOrder()).toMatchObject({
      status: 'paid',
      paymentMethod: 'payos',
    });

    const evidence = await db
      .collection(`tenants/${TENANT_ID}/paymentAdapterEvidence`)
      .get();
    expect(evidence.size).toBe(1);
    expect(evidence.docs[0].get('settlement')).toMatchObject({
      providerId: 'payos',
      outcome: 'settled',
    });

    const link = await db
      .doc(`tenants/${TENANT_ID}/payosPaymentLinks/${ORDER_ID}`)
      .get();
    expect(link.get('status')).toBe('paid');
  });

  it('settles a notification that carries an extra envelope field', async () => {
    const response = await postWebhook(payosWebhookBody({ extraEnvelopeKey: true }));
    expect(response.status).toBe(200);
    expect(await readPayments()).toHaveLength(1);
  });
});

describe('payosWebhookV1 refuses what it cannot trust', () => {
  it('rejects a forged signature without posting a payment', async () => {
    const response = await postWebhook(
      payosWebhookBody({ signingKey: 'not-the-checksum-key' }),
    );
    expect(response.status).toBe(401);
    expect(await readPayments()).toEqual([]);
    expect(await readOrder()).toMatchObject({ status: 'pending' });
  });

  it('rejects an amount changed after signing', async () => {
    const response = await postWebhook(
      payosWebhookBody({ tamperAmount: 1 }),
    );
    expect(response.status).toBe(401);
    expect(await readPayments()).toEqual([]);
  });

  it('rejects a malformed body before the settlement path', async () => {
    expect((await postWebhook('{not-json')).status).toBe(400);
    expect((await postWebhook({ code: '00' })).status).toBe(400);
    expect(await readPayments()).toEqual([]);
  });

  it('answers 404 for an order code no link maps to', async () => {
    const response = await postWebhook(payosWebhookBody({ orderCode: 999999 }));
    expect(response.status).toBe(404);
    expect(await readPayments()).toEqual([]);
  });

  it('acknowledges a non-settled event without posting a payment', async () => {
    const response = await postWebhook(payosWebhookBody({ code: '01' }));
    expect(response.status).toBe(200);
    expect((await response.json()) as { status: string }).toMatchObject({
      status: 'ignored',
    });
    expect(await readPayments()).toEqual([]);
  });

  it('refuses a mismatched amount for the mapped order', async () => {
    const response = await postWebhook(payosWebhookBody({ amount: 1 }));
    expect(response.status).toBe(400);
    expect(await readPayments()).toEqual([]);
  });
});

describe('callablePaymentCreatePayosLink gate', () => {
  it('denies a staff member without the cashier role and writes no link', async () => {
    await db
      .doc(`tenants/${TENANT_ID}/payosPaymentLinks/${ORDER_ID}`)
      .delete();
    await signInAs('kitchen');

    const failure = await captureFailure(
      createPayosLinkCallable()({
        tenantId: TENANT_ID,
        orderId: ORDER_ID,
        returnUrl: 'https://shop.example/staff',
      }),
    );
    expect(failure.code).toContain('permission-denied');

    const links = await db
      .collection(`tenants/${TENANT_ID}/payosPaymentLinks`)
      .get();
    expect(links.size).toBe(0);
  });

  it('answers not-found for an unknown order before calling PayOS', async () => {
    await signInAs('cashier');

    const failure = await captureFailure(
      createPayosLinkCallable()({
        tenantId: TENANT_ID,
        orderId: 'order-does-not-exist',
        returnUrl: 'https://shop.example/staff',
      }),
    );
    expect(failure.code).toContain('not-found');
  });
});
