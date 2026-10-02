/**
 * P0-L02 Retention and archive Functions Emulator evidence
 * (NFR-RET-001, NFR-REL-001).
 *
 * The scheduled retention job runs directly against the Firestore emulator.
 * These tests prove the configured five-year default, paid/confirmed selection,
 * the recoverable archive copy with a source `archivedAt` marker, the protected
 * record guard, idempotent retry, Tenant isolation, and the audit event.
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
  getFirestore as getAdminFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import { runRetentionArchive } from '../../src/modules/config/retention.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const NOW = '2026-10-01T00:00:00.000Z';

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
  await reset();
});

afterEach(async () => {
  await reset();
});

async function reset(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
}

function orderData(
  orderId: string,
  status: 'paid' | 'cancelled' | 'pending',
  createdAt: string,
) {
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
        unitPriceVnd: 50000,
        quantity: 1,
        lineTotalVnd: 50000,
        unitCostVnd: 22000,
        lineCostVnd: 22000,
      },
    ],
    subtotalVnd: 50000,
    totalVnd: 50000,
    trackingToken: `track-${orderId}`,
    idempotencyKey: `idem-${orderId}`,
    createdAt,
    updatedAt: createdAt,
    ...(status === 'paid' ? { paidAt: createdAt } : {}),
  };
}

function paymentData(paymentId: string, status: string, createdAt: string) {
  return {
    schemaVersion: 1,
    paymentId,
    tenantId: TENANT_A,
    orderId: 'order-old-paid',
    amountVnd: 50000,
    method: 'cash',
    status,
    vietQrInstruction: null,
    actorUid: 'uid-cashier-a',
    idempotencyKey: `idem-${paymentId}`,
    linkedPaymentId: null,
    correctionKind: null,
    reason: null,
    providerId: null,
    providerRef: null,
    confirmedAt: createdAt,
    createdAt,
  };
}

async function seed(): Promise<void> {
  await db.doc('platform/config').set({
    values: { retention: { years: 5 } },
    configVersion: 1,
  });

  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Alpha' });
  await db
    .doc(`tenants/${TENANT_A}/orders/order-old-paid`)
    .set(orderData('order-old-paid', 'paid', '2020-01-01T00:00:00.000Z'));
  await db
    .doc(`tenants/${TENANT_A}/orders/order-recent-paid`)
    .set(orderData('order-recent-paid', 'paid', '2026-09-01T00:00:00.000Z'));
  await db
    .doc(`tenants/${TENANT_A}/orders/order-old-cancelled`)
    .set(orderData('order-old-cancelled', 'cancelled', '2020-01-01T00:00:00.000Z'));
  await db
    .doc(`tenants/${TENANT_A}/payments/payment-old`)
    .set(paymentData('payment-old', 'confirmed', '2020-01-01T00:00:00.000Z'));
  await db
    .doc(`tenants/${TENANT_A}/payments/payment-reversed`)
    .set(paymentData('payment-reversed', 'reversed', '2020-01-01T00:00:00.000Z'));

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Bravo' });
  await db
    .doc(`tenants/${TENANT_B}/orders/order-b-paid`)
    .set({
      ...orderData('order-b-paid', 'paid', '2020-01-01T00:00:00.000Z'),
      tenantId: TENANT_B,
    });
}

describe('runRetentionArchive', () => {
  it('archives paid Orders and confirmed Payments once with a recoverable copy', async () => {
    await seed();
    const result = await runRetentionArchive(db, { now: NOW });

    expect(result.retentionYears).toBe(5);
    expect(result.cutoffAt).toBe('2021-10-01T00:00:00.000Z');
    expect(result.archivedOrderCount).toBe(2);
    expect(result.archivedPaymentCount).toBe(1);

    const archiveSnap = await db
      .doc(`tenants/${TENANT_A}/archivedOrders/order-old-paid`)
      .get();
    expect(archiveSnap.exists).toBe(true);
    expect(archiveSnap.get('orderId')).toBe('order-old-paid');
    expect(archiveSnap.get('archiveMetadata.archivedAt')).toBe(NOW);

    const sourceSnap = await db
      .doc(`tenants/${TENANT_A}/orders/order-old-paid`)
      .get();
    expect(sourceSnap.get('archivedAt')).toBe(NOW);
    expect(sourceSnap.get('status')).toBe('paid');

    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/order-old-cancelled`).get()).get(
        'archivedAt',
      ),
    ).toBeUndefined();
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/order-recent-paid`).get()).get(
        'archivedAt',
      ),
    ).toBeUndefined();
    expect(
      (await db.doc(`tenants/${TENANT_A}/payments/payment-reversed`).get()).get(
        'archivedAt',
      ),
    ).toBeUndefined();

    const paymentArchive = await db
      .doc(`tenants/${TENANT_A}/archivedPayments/payment-old`)
      .get();
    expect(paymentArchive.exists).toBe(true);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    const event = audit.docs.find(
      (docSnap) => docSnap.get('action') === 'RetentionArchived',
    );
    expect(event?.get('actorType')).toBe('system');
    expect(event?.get('metadata.archivedOrderCount')).toBe(1);
  });

  it('isolates tenants and never archives one tenant into another', async () => {
    await seed();
    await runRetentionArchive(db, { now: NOW });

    expect(
      (await db.doc(`tenants/${TENANT_B}/archivedOrders/order-b-paid`).get())
        .exists,
    ).toBe(true);
    expect(
      (await db.doc(`tenants/${TENANT_A}/archivedOrders/order-b-paid`).get())
        .exists,
    ).toBe(false);
  });

  it('retries without duplicating or deleting protected records', async () => {
    await seed();
    const first = await runRetentionArchive(db, { now: NOW });
    const retry = await runRetentionArchive(db, { now: NOW });

    expect(first.archivedOrderCount).toBe(2);
    expect(retry.archivedOrderCount).toBe(0);
    expect(retry.archivedPaymentCount).toBe(0);

    const archived = await db
      .collection(`tenants/${TENANT_A}/archivedOrders`)
      .get();
    expect(archived.size).toBe(1);
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/order-old-paid`).get()).get(
        'status',
      ),
    ).toBe('paid');
  });

  it('applies the stricter configured policy window', async () => {
    await seed();
    await db.doc('platform/config').set(
      { values: { retention: { years: 7 } } },
      { merge: true },
    );
    // Eligible under the five-year default but not under a seven-year window.
    await db
      .doc(`tenants/${TENANT_A}/orders/order-policy-window`)
      .set(orderData('order-policy-window', 'paid', '2020-06-01T00:00:00.000Z'));
    await db
      .doc(`tenants/${TENANT_A}/orders/order-very-old`)
      .set(orderData('order-very-old', 'paid', '2019-01-01T00:00:00.000Z'));

    const result = await runRetentionArchive(db, { now: NOW });

    expect(result.retentionYears).toBe(7);
    expect(result.cutoffAt).toBe('2019-10-01T00:00:00.000Z');
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/order-policy-window`).get()).get(
        'archivedAt',
      ),
    ).toBeUndefined();
    expect(
      (await db.doc(`tenants/${TENANT_A}/orders/order-very-old`).get()).get(
        'archivedAt',
      ),
    ).toBe(NOW);
  });
});
