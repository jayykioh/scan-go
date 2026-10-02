/**
 * M3/P2 automatic payment confirmation Functions Emulator evidence
 * (REQ-PAY-002, P0-L08 extension).
 *
 * A signed provider event is verified by the adapter, then the matching
 * Payment posts exactly once with the Order mutation, evidence, idempotency,
 * and audit in one transaction.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import {
  afterAll,
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
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import {
  PAYMENT_AUTO_CONFIRM_FLAG_KEY,
  PAYMENT_PROVIDER_FLAG_KEY,
  type PaymentAutoConfirmInput,
  type PaymentAutoConfirmResult,
} from '../../../shared/contracts/payment.contract.js';
import { buildProviderSignature } from '../../src/modules/payment/provider.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-alpha';
const ORDER_ID = 'order-auto-001';
const EMULATOR_SECRET = 'scango-emulator-signing-secret';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;

let adminApp: AdminApp;
let db: Firestore;
let clientApp: FirebaseApp;
let functions: Functions;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);
  clientApp =
    getClientApps().length > 0
      ? getClientApps()[0]
      : initializeClientApp({
          projectId: PROJECT_ID,
          apiKey: 'demo-api-key',
          appId: '1:demo:web:demo',
        });
  functions = getFunctions(clientApp, REGION);
  connectFunctionsEmulator(functions, FUNCTIONS_HOST, FUNCTIONS_PORT);
});

afterAll(async () => {
  await deleteClientApp(clientApp).catch(() => undefined);
  await deleteAdminApp(adminApp).catch(() => undefined);
});

async function seed(flags: {
  provider: boolean;
  automatic: boolean;
}): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.doc('platform/config').set({
    values: {
      [PAYMENT_PROVIDER_FLAG_KEY]: flags.provider,
      [PAYMENT_AUTO_CONFIRM_FLAG_KEY]: flags.automatic,
    },
    configVersion: 1,
  });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).set({
    schemaVersion: 1,
    orderId: ORDER_ID,
    tenantId: TENANT_A,
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
    subtotalVnd: 100000,
    totalVnd: 100000,
    trackingToken: 'track-auto-1',
    idempotencyKey: 'order-idem-auto-1',
    createdAt: '2026-09-12T05:00:00.000Z',
    updatedAt: '2026-09-12T05:00:00.000Z',
  });
}

beforeEach(async () => {
  await seed({ provider: true, automatic: true });
});

function autoInput(overrides: Partial<PaymentAutoConfirmInput['payload']> = {}): PaymentAutoConfirmInput {
  const payload = {
    providerEventId: 'evt-auto-001',
    tenantId: TENANT_A,
    orderId: ORDER_ID,
    amountVnd: 100000,
    outcome: 'settled' as const,
    ...overrides,
  };
  return {
    tenantId: TENANT_A,
    providerId: 'automatic',
    payload,
    signature: buildProviderSignature(payload, EMULATOR_SECRET),
  };
}

function autoCallable() {
  return httpsCallable<PaymentAutoConfirmInput, PaymentAutoConfirmResult>(
    functions,
    'callablePaymentAutoConfirm',
  );
}

describe('callablePaymentAutoConfirm', () => {
  it('confirms a signed event once and replays a retry', async () => {
    const first = await autoCallable()(autoInput());
    expect(first.data.status).toBe('confirmed');
    expect(first.data.payment.status).toBe('confirmed');
    expect(first.data.orderStatus).toBe('paid');

    const retry = await autoCallable()(autoInput());
    expect(retry.data.status).toBe('replayed');

    const payments = await db
      .collection(`tenants/${TENANT_A}/payments`)
      .get();
    expect(payments.size).toBe(1);
    const evidence = await db
      .collection(`tenants/${TENANT_A}/paymentAdapterEvidence`)
      .get();
    expect(evidence.size).toBe(1);
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).get()).get(
        'status',
      ),
    ).toBe('paid');
  });

  it('rejects a forged signature without posting a payment', async () => {
    const input = autoInput();
    await expect(
      autoCallable()({ ...input, signature: 'deadbeef' }),
    ).rejects.toMatchObject({ code: expect.stringContaining('permission-denied') });
    const payments = await db
      .collection(`tenants/${TENANT_A}/payments`)
      .get();
    expect(payments.size).toBe(0);
  });

  it('rejects when the automatic flag is disabled', async () => {
    await seed({ provider: true, automatic: false });
    await expect(autoCallable()(autoInput())).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
  });
});
