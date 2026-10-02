/**
 * P0-L08 Payment adapter boundary Functions Emulator evidence
 * (REQ-PAY-001, docs/RULES_FIREBASE.md §1).
 *
 * The callable maps a strict provider payload through the registered adapter
 * behind a feature flag. It persists only normalized evidence, so an adapter
 * failure or malformed payload can never change a Payment or an Order.
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
  PAYMENT_PROVIDER_FLAG_KEY,
  type PaymentProviderSettleInput,
  type PaymentProviderSettleResult,
} from '../../../shared/contracts/payment.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const ORDER_ID = 'order-adapter-001';

const REGION = 'us-central1';
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
  functions = getFunctions(clientApp, REGION);
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);
});

afterAll(async () => {
  await deleteClientApp(clientApp).catch(() => undefined);
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await resetEmulators();
  await seedEmulators(true);
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

async function seedEmulators(providerEnabled: boolean): Promise<void> {
  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }

  await db.doc('platform/config').set({
    values: { [PAYMENT_PROVIDER_FLAG_KEY]: providerEnabled },
    configVersion: 1,
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
  await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).set({
    orderId: ORDER_ID,
    tenantId: TENANT_A,
    status: 'pending',
    totalVnd: 100000,
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

function settleCallable() {
  return httpsCallable<PaymentProviderSettleInput, PaymentProviderSettleResult>(
    functions,
    'callablePaymentProviderSettle',
  );
}

function settleInput(
  overrides: Partial<PaymentProviderSettleInput['payload']> = {},
  providerId: PaymentProviderSettleInput['providerId'] = 'manual',
): PaymentProviderSettleInput {
  return {
    tenantId: TENANT_A,
    providerId,
    payload: {
      providerEventId: 'evt-001',
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      amountVnd: 100000,
      outcome: 'settled',
      ...overrides,
    },
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

describe('callablePaymentProviderSettle', () => {
  it('maps a tenant-scoped payload into evidence without a business write', async () => {
    await signInAs('ownerA');
    const response = await settleCallable()(settleInput());

    expect(response.data.status).toBe('mapped');
    expect(response.data.evidence.settlement.providerId).toBe('manual');
    expect(response.data.evidence.settlement.amountVnd).toBe(100000);

    const evidenceId = `provider_${ORDER_ID}__evt-001`;
    const evidence = await db
      .doc(`tenants/${TENANT_A}/paymentAdapterEvidence/${evidenceId}`)
      .get();
    expect(evidence.exists).toBe(true);

    expect(
      (await db.doc(`tenants/${TENANT_A}/payments/payment_${ORDER_ID}`).get())
        .exists,
    ).toBe(false);
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).get()).get(
        'paidAt',
      ),
    ).toBeUndefined();
  });

  it('replays the same provider event without a second evidence record', async () => {
    await signInAs('cashierA');
    const first = await settleCallable()(settleInput());
    const retry = await settleCallable()(settleInput());

    expect(first.data.status).toBe('mapped');
    expect(retry.data.status).toBe('replayed');
    const evidence = await db
      .collection(`tenants/${TENANT_A}/paymentAdapterEvidence`)
      .get();
    expect(evidence.size).toBe(1);
  });

  it('rejects a malformed payload without changing records', async () => {
    await signInAs('ownerA');
    await expectRejection(
      settleCallable()(settleInput({ amountVnd: 1.5 })),
      'invalid-argument',
    );
    await expectRejection(
      settleCallable()({
        ...settleInput(),
        providerId: 'momo' as 'manual',
      }),
      'invalid-argument',
    );
    await expectRejection(
      settleCallable()({
        ...settleInput(),
        payload: { ...settleInput().payload, secretKey: 'x' } as never,
      }),
      'invalid-argument',
    );
    const evidence = await db
      .collection(`tenants/${TENANT_A}/paymentAdapterEvidence`)
      .get();
    expect(evidence.size).toBe(0);
  });

  it('rejects a provider payload for another tenant', async () => {
    await signInAs('ownerA');
    await expectRejection(
      settleCallable()(settleInput({ tenantId: TENANT_B })),
      'invalid-argument',
    );
  });

  it('denies an unauthorized role', async () => {
    await signInAs('kitchenA');
    await expectRejection(settleCallable()(settleInput()), 'permission-denied');
  });

  it('rejects when the provider feature flag is disabled', async () => {
    await db.doc('platform/config').set(
      { values: { [PAYMENT_PROVIDER_FLAG_KEY]: false } },
      { merge: true },
    );
    await signInAs('ownerA');
    await expectRejection(settleCallable()(settleInput()), 'failed-precondition');
  });
});
