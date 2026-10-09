/**
 * M3/P2 Promotion Functions Emulator evidence (REQ-PRO-001).
 *
 * The server resolves the cart from the public menu projection, selects one
 * best eligible promotion, and returns a deterministic integer-VND result.
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
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';
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

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-alpha';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  owner: { uid: 'uid-owner-promo', email: 'owner-promo@example.com' },
  staff: { uid: 'uid-staff-promo', email: 'staff-promo@example.com' },
} as const;

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
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({ uid: user.uid, email: user.email, password: PASSWORD });
  }
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A', pricingTier: 'lite' });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.owner.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staff.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/publicMenuItems/item-1`).set({
    name: 'Phở',
    priceVnd: 50000,
    isAvailable: true,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

describe('promotion callables', () => {
  it('creates, activates, and applies one deterministic promotion', async () => {
    await signInWithEmailAndPassword(auth, USERS.owner.email, PASSWORD);
    const upsert = httpsCallable(functions, 'callablePromotionUpsert');
    const created = await upsert({
      tenantId: TENANT_A,
      promotionId: null,
      name: 'Giảm 10%',
      priority: 1,
      startsAt: null,
      endsAt: null,
      eligibility: { minSubtotalVnd: 50000, menuItemIds: null },
      benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
    });
    const promotionId = (created.data as { promotion: { promotionId: string } })
      .promotion.promotionId;
    const setStatus = httpsCallable(functions, 'callablePromotionSetStatus');
    await setStatus({ tenantId: TENANT_A, promotionId, status: 'active' });

    const evaluate = httpsCallable(functions, 'callablePromotionEvaluate');
    const first = await evaluate({
      tenantId: TENANT_A,
      lines: [{ menuItemId: 'item-1', quantity: 2 }],
    });
    const retry = await evaluate({
      tenantId: TENANT_A,
      lines: [{ menuItemId: 'item-1', quantity: 2 }],
    });
    expect((first.data as { subtotalVnd: number }).subtotalVnd).toBe(100000);
    expect((first.data as { discountVnd: number }).discountVnd).toBe(10000);
    expect((first.data as { totalVnd: number }).totalVnd).toBe(90000);
    expect((retry.data as { discountVnd: number }).discountVnd).toBe(10000);
  });

  it('denies a non-owner promotion write', async () => {
    await signInWithEmailAndPassword(auth, USERS.staff.email, PASSWORD);
    const upsert = httpsCallable(functions, 'callablePromotionUpsert');
    await expect(
      upsert({
        tenantId: TENANT_A,
        promotionId: null,
        name: 'X',
        priority: 1,
        eligibility: { minSubtotalVnd: null, menuItemIds: null },
        benefit: { type: 'fixedAmount', amountVnd: 1000 },
      }),
    ).rejects.toMatchObject({ code: expect.stringContaining('permission-denied') });
  });

  it('rejects an unavailable cart item', async () => {
    const evaluate = httpsCallable(functions, 'callablePromotionEvaluate');
    await expect(
      evaluate({
        tenantId: TENANT_A,
        lines: [{ menuItemId: 'missing', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: expect.stringContaining('failed-precondition') });
  });
});
