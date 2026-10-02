/**
 * Inventory Stock count and loss review Functions Emulator evidence
 * (REQ-INV-003, REQ-INV-004, NFR-AI-001).
 *
 * The server computes expected quantity from stock-in, deduction, and
 * restoration, stores the variance with audit, and a loss finding cites the
 * count, movements, and period. A missing count states the limitation.
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

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-count-alpha';
const OWNER_UID = 'uid-owner-count';
const STAFF_UID = 'uid-staff-count';
const INGREDIENT_A = 'ingredient-noodle-count';
const INGREDIENT_B = 'ingredient-beef-count';
// The server timestamps a Stock count at call time, so seed the ledger and
// query the same real UTC day the emulator runs in.
const AT = new Date().toISOString();
const DAY = AT.slice(0, 10).replace(/-/g, '');

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

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
  await adminAuth.createUser({
    uid: OWNER_UID,
    email: 'owner-count@example.com',
    password: PASSWORD,
  });
  await adminAuth.createUser({
    uid: STAFF_UID,
    email: 'staff-count@example.com',
    password: PASSWORD,
  });
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_A}/members/${OWNER_UID}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${STAFF_UID}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_A}`).set({
    name: 'Bánh phở',
    baseUnit: 'g',
    unitCostVnd: 40,
    stockQuantity: 700,
    lowStockThreshold: 100,
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/ingredients/${INGREDIENT_B}`).set({
    name: 'Thịt bò',
    baseUnit: 'g',
    unitCostVnd: 300,
    stockQuantity: 500,
    lowStockThreshold: 100,
    isActive: true,
  });
  // Movement ledger: +1000 stock-in, -400 deduction, +100 restoration => 700.
  const movements = [
    { id: 'mv-stock-in', delta: 1000, reason: 'stock_in' },
    { id: 'mv-deduct', delta: -400, reason: 'order_deduction' },
    { id: 'mv-restore', delta: 100, reason: 'order_restore' },
  ];
  for (const movement of movements) {
    await db.doc(`tenants/${TENANT_A}/stockMovements/${movement.id}`).set({
      movementId: movement.id,
      tenantId: TENANT_A,
      ingredientId: INGREDIENT_A,
      quantityDelta: movement.delta,
      reason: movement.reason,
      orderId: null,
      actorUid: OWNER_UID,
      idempotencyKey: `idem-${movement.id}`,
      createdAt: AT,
    });
  }
  await db.doc(`tenants/${TENANT_A}/stockMovements/mv-beef`).set({
    movementId: 'mv-beef',
    tenantId: TENANT_A,
    ingredientId: INGREDIENT_B,
    quantityDelta: -200,
    reason: 'order_deduction',
    orderId: null,
    actorUid: OWNER_UID,
    idempotencyKey: 'idem-mv-beef',
    createdAt: AT,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

describe('inventory stock count callables (REQ-INV-003, REQ-INV-004)', () => {
  it('computes expected from the ledger and stores the variance with audit', async () => {
    await signIn('owner-count@example.com');
    const record = httpsCallable(functions, 'callableInventoryRecordStockCount');
    const result = await record({
      tenantId: TENANT_A,
      ingredientId: INGREDIENT_A,
      countedQuantityBaseUnits: 650,
      reason: 'Kiểm kê sáng',
      idempotencyKey: 'idem-count-0001',
    });
    const stockCount = (
      result.data as {
        stockCount: {
          countId: string;
          expectedQuantityBaseUnits: number;
          varianceBaseUnits: number;
        };
      }
    ).stockCount;
    expect(stockCount.expectedQuantityBaseUnits).toBe(700);
    expect(stockCount.varianceBaseUnits).toBe(-50);

    const audit = await db
      .collection(`tenants/${TENANT_A}/audit`)
      .where('action', '==', 'StockCountRecorded')
      .get();
    expect(audit.size).toBe(1);

    const review = httpsCallable(functions, 'callableInventoryReviewLoss');
    const reviewed = await review({
      tenantId: TENANT_A,
      fromDay: DAY,
      toDay: DAY,
    });
    const findings = (
      reviewed.data as {
        findings: Array<{
          ingredientId: string;
          countId: string | null;
          movementIds: string[];
          periodStart: string;
          missingData: boolean;
        }>;
      }
    ).findings;
    const noodle = findings.find(
      (finding) => finding.ingredientId === INGREDIENT_A,
    );
    expect(noodle?.countId).toBe(stockCount.countId);
    expect(noodle?.movementIds).toContain('mv-deduct');
    expect(noodle?.periodStart).toBe(DAY);
    expect(noodle?.missingData).toBe(false);

    const beef = findings.find(
      (finding) => finding.ingredientId === INGREDIENT_B,
    );
    expect(beef?.missingData).toBe(true);
    expect(beef?.countId).toBeNull();
  });

  it('rejects a non-owner stock count', async () => {
    await signIn('staff-count@example.com');
    const record = httpsCallable(functions, 'callableInventoryRecordStockCount');
    await expect(
      record({
        tenantId: TENANT_A,
        ingredientId: INGREDIENT_A,
        countedQuantityBaseUnits: 1,
        idempotencyKey: 'idem-count-0002',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
  });
});
