/**
 * Signed payment webhook transport boundary Functions Emulator evidence
 * (REQ-PAY-002).
 *
 * The stack requires HTTP for signed provider events, so this test drives the
 * versioned `paymentWebhookV1` endpoint directly: a valid HMAC signature posts
 * exactly one Payment, a retry replays, a forged signature is rejected, and a
 * malformed body never reaches the ledger.
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
  PAYMENT_AUTO_CONFIRM_FLAG_KEY,
  PAYMENT_PROVIDER_FLAG_KEY,
  type PaymentProviderPayload,
} from '../../../shared/contracts/payment.contract.js';
import { buildProviderSignature } from '../../src/modules/payment/provider.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-webhook-alpha';
const ORDER_ID = 'order-webhook-001';
const EMULATOR_SECRET = 'scango-emulator-signing-secret';

const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const WEBHOOK_URL = `http://${FUNCTIONS_HOST}:${FUNCTIONS_PORT}/${PROJECT_ID}/us-central1/paymentWebhookV1`;

let adminApp: AdminApp;
let db: Firestore;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);
});

afterAll(async () => {
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.doc('platform/config').set({
    values: {
      [PAYMENT_PROVIDER_FLAG_KEY]: true,
      [PAYMENT_AUTO_CONFIRM_FLAG_KEY]: true,
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
    trackingToken: 'track-webhook-1',
    idempotencyKey: 'order-idem-webhook-1',
    createdAt: '2026-09-12T05:00:00.000Z',
    updatedAt: '2026-09-12T05:00:00.000Z',
  });
});

function payload(
  overrides: Partial<PaymentProviderPayload> = {},
): PaymentProviderPayload {
  return {
    providerEventId: 'evt-webhook-001',
    tenantId: TENANT_A,
    orderId: ORDER_ID,
    amountVnd: 100000,
    outcome: 'settled',
    ...overrides,
  };
}

async function postWebhook(
  body: unknown,
  signature?: string,
): Promise<Response> {
  return fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-scango-signature': signature } : {}),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('paymentWebhookV1 (REQ-PAY-002)', () => {
  it('confirms a signed event once and replays a retry', async () => {
    const event = payload();
    const signature = buildProviderSignature(event, EMULATOR_SECRET);

    const first = await postWebhook(
      { tenantId: TENANT_A, providerId: 'automatic', payload: event },
      signature,
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { status: string };
    expect(firstBody.status).toBe('confirmed');

    const retry = await postWebhook(
      { tenantId: TENANT_A, providerId: 'automatic', payload: event },
      signature,
    );
    expect(retry.status).toBe(200);
    expect(((await retry.json()) as { status: string }).status).toBe('replayed');

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
    const response = await postWebhook(
      { tenantId: TENANT_A, providerId: 'automatic', payload: payload() },
      'deadbeef',
    );
    expect(response.status).toBe(401);
    const payments = await db
      .collection(`tenants/${TENANT_A}/payments`)
      .get();
    expect(payments.size).toBe(0);
  });

  it('rejects a malformed body before the settlement path', async () => {
    const response = await postWebhook('{not-json');
    expect(response.status).toBe(400);
    const payments = await db
      .collection(`tenants/${TENANT_A}/payments`)
      .get();
    expect(payments.size).toBe(0);
  });
});
