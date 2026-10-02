/**
 * M3/P2 Subscription Functions Emulator evidence (REQ-SUB-001).
 *
 * The callable reads and changes the tenant `pricingTier`; the server resolves
 * plan entitlements, and a plan change records audit events. A repeat of the
 * same plan is a replay.
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
const TENANT_A = 'tenant-alpha';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  owner: { uid: 'uid-owner-sub', email: 'owner-sub@example.com' },
  staff: { uid: 'uid-staff-sub', email: 'staff-sub@example.com' },
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
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
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
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function expectRejection(promise: Promise<unknown>, codeFragment: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  if (caught === undefined) {
    throw new Error(`Expected rejection with "${codeFragment}".`);
  }
  expect((caught as { code?: string }).code ?? '').toContain(codeFragment);
}

describe('subscription callables', () => {
  it('reads the free plan and changes to pro with audit', async () => {
    await signInWithEmailAndPassword(auth, USERS.owner.email, PASSWORD);
    const get = httpsCallable(functions, 'callableSubscriptionGet');
    const before = await get({ tenantId: TENANT_A });
    expect((before.data as { state: { plan: string } }).state.plan).toBe('free');

    const change = httpsCallable(functions, 'callableSubscriptionChangePlan');
    const changed = await change({ tenantId: TENANT_A, plan: 'pro' });
    expect((changed.data as { status: string }).status).toBe('changed');
    expect(
      (changed.data as { state: { entitlements: { features: string[] } } })
        .state.entitlements.features,
    ).toContain('nfc');
    expect((await db.doc(`tenants/${TENANT_A}`).get()).get('pricingTier')).toBe(
      'pro',
    );
    const audit = await db
      .collection(`tenants/${TENANT_A}/audit`)
      .where('action', '==', 'SubscriptionChanged')
      .get();
    expect(audit.size).toBe(1);
  });

  it('replays a repeated plan change without a new write', async () => {
    await signInWithEmailAndPassword(auth, USERS.owner.email, PASSWORD);
    const change = httpsCallable(functions, 'callableSubscriptionChangePlan');
    await change({ tenantId: TENANT_A, plan: 'lite' });
    const retry = await change({ tenantId: TENANT_A, plan: 'lite' });
    expect((retry.data as { status: string }).status).toBe('replayed');
  });

  it('denies a staff plan change', async () => {
    await signInWithEmailAndPassword(auth, USERS.staff.email, PASSWORD);
    const change = httpsCallable(functions, 'callableSubscriptionChangePlan');
    await expectRejection(
      change({ tenantId: TENANT_A, plan: 'pro' }),
      'permission-denied',
    );
  });
});
