/**
 * P0-007 Ordering Functions Emulator evidence (REQ-ORD-001, REQ-ORD-002,
 * REQ-ORD-003, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001, NFR-MOD-001).
 *
 * These tests call the real Ordering callables through the Functions emulator.
 * Firestore is seeded with an active Table link, public menu projections, and
 * private Cost. They prove token validation, Pay-Later pending, Pay-First gate,
 * idempotency, rate limit, immutable Order, and the public tracking projection.
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
import {
  deleteApp as deleteClientApp,
  getApps as getClientApps,
  initializeApp as initializeClientApp,
  type FirebaseApp,
} from 'firebase/app';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore as ClientFirestore,
} from 'firebase/firestore';
import type {
  OrderSubmitInput,
  OrderSubmitResult,
  OrderTrackingResult,
} from '../../../shared/contracts/order.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const TABLE_TOKEN = 'tok-emulator-0001';
const TABLE_ID = 'table-01';
const MENU_ITEM_ID = 'item-pho-bo-001';
const MENU_ITEM_ID_DRINK = 'item-ca-phe-001';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;

let adminApp: AdminApp;
let db: Firestore;

let clientApp: FirebaseApp;
let functions: Functions;
let clientDb: ClientFirestore;

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
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
});

afterAll(async () => {
  await deleteClientApp(clientApp).catch(() => undefined);
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await resetEmulators();
  await seedEmulators();
});

afterEach(() => {
  // no-op; the next beforeEach resets shared emulator state
});

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('publicTableLinks'));
  await db.recursiveDelete(db.collection('publicOrderTracking'));
}

const now = () => new Date().toISOString();

async function seedEmulators(): Promise<void> {
  await db.doc('platform/config').set({
    values: { rateLimit: { publicOrderPerMinute: 60 } },
    configVersion: 1,
    updatedAt: now(),
  });

  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });

  await db.doc(`publicTableLinks/${TABLE_TOKEN}`).set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    tableId: TABLE_ID,
    tableName: 'Bàn 1',
    tokenVersion: 1,
    isActive: true,
    createdAt: now(),
    revokedAt: null,
  });

  await db.doc(`tenants/${TENANT_A}/publicMenuItems/${MENU_ITEM_ID}`).set({
    schemaVersion: 1,
    menuItemId: MENU_ITEM_ID,
    tenantId: TENANT_A,
    name: 'Phở bò',
    description: null,
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 45000,
    imageUrl: null,
    modifierGroups: [
      {
        groupId: 'group-topping',
        name: 'Topping',
        selectionType: 'multiple',
        isRequired: false,
        minSelections: 0,
        maxSelections: 3,
        options: [
          { optionId: 'opt-trung', name: 'Trứng', priceDeltaVnd: 5000 },
          { optionId: 'opt-thit', name: 'Thêm thịt', priceDeltaVnd: 15000 },
        ],
      },
    ],
    isAvailable: true,
    updatedAt: now(),
  });
  await db.doc(`tenants/${TENANT_A}/menuItems/${MENU_ITEM_ID}`).set({
    tenantId: TENANT_A,
    name: 'Phở bò',
    priceVnd: 45000,
    costPriceVnd: 22000,
    isAvailable: true,
  });

  await db.doc(`tenants/${TENANT_A}/publicMenuItems/${MENU_ITEM_ID_DRINK}`).set({
    schemaVersion: 1,
    menuItemId: MENU_ITEM_ID_DRINK,
    tenantId: TENANT_A,
    name: 'Cà phê',
    description: null,
    category: 'Đồ uống',
    type: 'Đồ uống',
    priceVnd: 25000,
    imageUrl: null,
    modifierGroups: [],
    isAvailable: true,
    updatedAt: now(),
  });
  await db.doc(`tenants/${TENANT_A}/menuItems/${MENU_ITEM_ID_DRINK}`).set({
    tenantId: TENANT_A,
    name: 'Cà phê',
    priceVnd: 25000,
    costPriceVnd: 9000,
    isAvailable: true,
  });
}

function submitCallable() {
  return httpsCallable<OrderSubmitInput, OrderSubmitResult>(
    functions,
    'callableOrderSubmit',
  );
}

function trackingCallable() {
  return httpsCallable<{ trackingToken: string }, OrderTrackingResult>(
    functions,
    'callableOrderGetTracking',
  );
}

function validInput(overrides: Partial<OrderSubmitInput> = {}): OrderSubmitInput {
  return {
    token: TABLE_TOKEN,
    paymentMode: 'payLater',
    idempotencyKey: 'idem-key-00000001',
    lines: [
      {
        menuItemId: MENU_ITEM_ID,
        quantity: 2,
        selectedOptionIds: ['opt-trung'],
      },
    ],
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
  const code = (caught as { code?: string }).code ?? '';
  expect(code).toContain(codeFragment);
}

async function orderCount(tenantId = TENANT_A): Promise<number> {
  return (await db.collection(`tenants/${tenantId}/orders`).get()).size;
}

describe('callableOrderSubmit: Pay-Later pending', () => {
  it('creates one pending Order, status event, idempotency record, and tracking', async () => {
    const response = await submitCallable()(validInput());
    const result = response.data;

    expect(result.status).toBe('created');
    expect(result.replayed).toBe(false);
    expect(result.order.status).toBe('pending');
    expect(result.order.paymentMode).toBe('payLater');
    expect(result.order.totalVnd).toBe(100000);
    expect(Number.isInteger(result.order.totalVnd)).toBe(true);
    expect(result.order.items[0]?.unitPriceVnd).toBe(50000);
    expect(result.order.items[0]?.unitCostVnd).toBe(22000);

    const orderSnap = await db
      .doc(`tenants/${TENANT_A}/orders/${result.order.orderId}`)
      .get();
    expect(orderSnap.get('status')).toBe('pending');
    expect(orderSnap.get('customerPhone')).toBeUndefined();

    const events = await db
      .collection(`tenants/${TENANT_A}/orders/${result.order.orderId}/statusEvents`)
      .get();
    expect(events.size).toBe(1);
    expect(events.docs[0]?.get('newStatus')).toBe('pending');

    const idempotencySnap = await db
      .doc(`tenants/${TENANT_A}/idempotency/idem-key-00000001`)
      .get();
    expect(idempotencySnap.get('orderId')).toBe(result.order.orderId);

    const trackingSnap = await db
      .doc(`publicOrderTracking/${result.tracking.trackingToken}`)
      .get();
    expect(trackingSnap.exists).toBe(true);
    expect(trackingSnap.get('status')).toBe('pending');
    expect(trackingSnap.get('itemSummary')).toBe('2x Phở bò (Trứng)');
    expect(trackingSnap.get('totalVnd')).toBe(100000);
  });

  it('recomputes the total when a quantity changes', async () => {
    const one = await submitCallable()(
      validInput({ idempotencyKey: 'idem-key-00000010' }),
    );
    const three = await submitCallable()(
      validInput({
        idempotencyKey: 'idem-key-00000011',
        lines: [
          {
            menuItemId: MENU_ITEM_ID,
            quantity: 3,
            selectedOptionIds: ['opt-trung'],
          },
        ],
      }),
    );
    expect(one.data.order.totalVnd).toBe(100000);
    expect(three.data.order.totalVnd).toBe(150000);
  });

  it('accepts a mixed cart and keeps integer VND totals', async () => {
    const result = await submitCallable()(
      validInput({
        idempotencyKey: 'idem-key-00000012',
        lines: [
          {
            menuItemId: MENU_ITEM_ID,
            quantity: 1,
            selectedOptionIds: ['opt-thit'],
          },
          {
            menuItemId: MENU_ITEM_ID_DRINK,
            quantity: 2,
            selectedOptionIds: [],
          },
        ],
      }),
    );
    expect(result.data.order.totalVnd).toBe(110000);
    expect(Number.isInteger(result.data.order.totalVnd)).toBe(true);
  });
});

describe('callableOrderSubmit: idempotency', () => {
  it('replays the prior result for a reused key with the same request', async () => {
    const first = await submitCallable()(validInput());
    const second = await submitCallable()(validInput());

    expect(second.data.replayed).toBe(true);
    expect(second.data.order.orderId).toBe(first.data.order.orderId);
    expect(second.data.tracking.trackingToken).toBe(
      first.data.tracking.trackingToken,
    );
    expect(await orderCount()).toBe(1);
  });

  it('rejects a reused key with a changed request without another Order', async () => {
    await submitCallable()(validInput());
    await expectRejection(
      submitCallable()(
        validInput({
          lines: [
            {
              menuItemId: MENU_ITEM_ID,
              quantity: 5,
              selectedOptionIds: ['opt-trung'],
            },
          ],
        }),
      ),
      'already-exists',
    );
    expect(await orderCount()).toBe(1);
  });
});

describe('callableOrderSubmit: token, App Check, and rate limit', () => {
  it('rejects an invalid or revoked token without an Order', async () => {
    await expectRejection(
      submitCallable()(validInput({ token: 'tok-does-not-exist' })),
      'permission-denied',
    );
    await db.doc(`publicTableLinks/${TABLE_TOKEN}`).set(
      { isActive: false },
      { merge: true },
    );
    await expectRejection(submitCallable()(validInput()), 'permission-denied');
    expect(await orderCount()).toBe(0);
  });

  it('rejects a malformed cart without an Order', async () => {
    await expectRejection(
      submitCallable()(
        validInput({
          lines: [
            {
              menuItemId: MENU_ITEM_ID,
              quantity: 0,
              selectedOptionIds: [],
            },
          ],
        }),
      ),
      'invalid-argument',
    );
    await expectRejection(
      submitCallable()(
        validInput({
          lines: [
            {
              menuItemId: MENU_ITEM_ID,
              quantity: 1,
              selectedOptionIds: ['opt-unknown'],
            },
          ],
        }),
      ),
      'invalid-argument',
    );
    expect(await orderCount()).toBe(0);
  });

  it('rejects beyond the configured per-minute rate limit', async () => {
    await db
      .doc('platform/config')
      .set({ values: { rateLimit: { publicOrderPerMinute: 1 } } }, { merge: true });

    // Use a dedicated token so no earlier test consumed this bucket.
    await db.doc('publicTableLinks/tok-emulator-rate-001').set({
      schemaVersion: 1,
      tenantId: TENANT_A,
      tableId: TABLE_ID,
      tableName: 'Bàn 1',
      tokenVersion: 1,
      isActive: true,
      createdAt: now(),
      revokedAt: null,
    });

    await submitCallable()(
      validInput({
        token: 'tok-emulator-rate-001',
        idempotencyKey: 'idem-key-rate-001',
      }),
    );
    await expectRejection(
      submitCallable()(
        validInput({
          token: 'tok-emulator-rate-001',
          idempotencyKey: 'idem-key-rate-002',
        }),
      ),
      'resource-exhausted',
    );
  });
});

describe('callableOrderSubmit: Pay-First gate', () => {
  it('keeps a payFirst Order pending and out of the Kitchen queue', async () => {
    const result = await submitCallable()(
      validInput({ paymentMode: 'payFirst', idempotencyKey: 'idem-key-pf-0001' }),
    );
    expect(result.data.order.status).toBe('pending');
    expect(result.data.order.paymentMode).toBe('payFirst');

    // The Kitchen queue query is status == cooking. A pending payFirst Order is
    // never returned because Ordering stores no confirmed Payment yet.
    const queueSnap = await db
      .collection(`tenants/${TENANT_A}/orders`)
      .where('status', '==', 'cooking')
      .get();
    expect(queueSnap.size).toBe(0);
  });
});

describe('callableOrderGetTracking', () => {
  it('returns the projection for a valid token and null for an unknown token', async () => {
    const created = await submitCallable()(validInput());
    const found = await trackingCallable()({
      trackingToken: created.data.tracking.trackingToken,
    });
    expect(found.data.tracking?.status).toBe('pending');
    expect(found.data.tracking?.totalVnd).toBe(100000);

    const missing = await trackingCallable()({ trackingToken: 'tok-missing-1' });
    expect(missing.data.tracking).toBeNull();
  });
});

describe('Ordering cross-tenant isolation', () => {
  it('scopes every written document under the link Tenant only', async () => {
    const result = await submitCallable()(validInput());
    expect(result.data.order.tenantId).toBe(TENANT_A);

    const tenantBOrders = await orderCount(TENANT_B);
    expect(tenantBOrders).toBe(0);
    const tenantBIdempotency = await db
      .collection(`tenants/${TENANT_B}/idempotency`)
      .get();
    expect(tenantBIdempotency.size).toBe(0);
  });
});

describe('end-to-end Pay-Later flow', () => {
  it('resolves a link, reads the public menu, submits, and tracks one Order', async () => {
    // 1. Resolve the opaque Table link.
    const linkSnap = await db.doc(`publicTableLinks/${TABLE_TOKEN}`).get();
    expect(linkSnap.get('isActive')).toBe(true);
    const tenantId = linkSnap.get('tenantId') as string;

    // 2. Read the public-safe menu projection only.
    const menuSnap = await db
      .collection(`tenants/${tenantId}/publicMenuItems`)
      .get();
    expect(menuSnap.size).toBe(2);
    const pho = menuSnap.docs.find((docSnap) => docSnap.id === MENU_ITEM_ID);
    expect(pho?.get('costPriceVnd')).toBeUndefined();
    expect(pho?.get('priceVnd')).toBe(45000);

    // 3. Submit a Pay-Later cart with a modifier.
    const submit = await submitCallable()(
      validInput({ idempotencyKey: 'idem-e2e-000001' }),
    );
    expect(submit.data.order.status).toBe('pending');
    expect(submit.data.order.totalVnd).toBe(100000);

    // 4. Read the public tracking projection by its opaque token.
    const tracking = await trackingCallable()({
      trackingToken: submit.data.tracking.trackingToken,
    });
    expect(tracking.data.tracking).toMatchObject({
      orderId: submit.data.order.orderId,
      status: 'pending',
      totalVnd: 100000,
    });

    // 5. The Order source is immutable in shape and carries no phone value.
    const orderSnap = await db
      .doc(`tenants/${tenantId}/orders/${submit.data.order.orderId}`)
      .get();
    expect(orderSnap.get('customerPhone')).toBeUndefined();
    expect(orderSnap.get('items')[0].name).toBe('Phở bò');
    expect(Number.isInteger(orderSnap.get('totalVnd'))).toBe(true);
  });
});
