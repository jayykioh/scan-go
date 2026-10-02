/**
 * P0-L04 Customer-phone privacy Functions Emulator evidence (NFR-PRIV-001).
 *
 * Seeds Tenant-scoped `loyaltyMembers` source rows and calls the real Tenant
 * Customer-phone query callable as each role. ADMIN is unrestricted and writes
 * no read audit; every other caller matches the server permission matrix. Run
 * with the root script:
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
  createUserWithEmailAndPassword,
  getAuth,
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
  CUSTOMER_PHONE_PERMISSION,
  type CustomerPhoneQueryResult,
} from '../../../shared/contracts/authorization.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const PHONE_A = '+84900000001';
const PHONE_B = '+84900000002';

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
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('users'));
  await db.recursiveDelete(db.collection('platform'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

function phoneCallable() {
  return httpsCallable<{ tenantId: string }, CustomerPhoneQueryResult>(
    functions,
    'callableTenantListCustomerPhones',
  );
}

async function seedTenant(tenantId: string): Promise<void> {
  await db.doc(`tenants/${tenantId}`).set({ shopName: tenantId });
  await db.doc(`tenants/${tenantId}/loyaltyMembers/member-1`).set({
    displayName: 'Khách',
    phone: tenantId === TENANT_A ? PHONE_A : PHONE_B,
  });
}

async function seedMember(
  tenantId: string,
  uid: string,
  membershipType: 'owner' | 'staff',
  permissions: string[],
  isActive = true,
): Promise<void> {
  await db.doc(`tenants/${tenantId}/members/${uid}`).set({
    uid,
    membershipType,
    roles: membershipType === 'owner' ? ['owner'] : ['cashier'],
    permissions,
    isActive,
    sessionVersion: 1,
  });
}

async function signUp(email: string): Promise<string> {
  const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
  return credential.user.uid;
}

describe('Customer-phone permission matrix (NFR-PRIV-001)', () => {
  it('shows the phone only to a role with the configured permission', async () => {
    await seedTenant(TENANT_A);
    const allowedUid = await signUp('allowed@example.com');
    await seedMember(TENANT_A, allowedUid, 'owner', [
      CUSTOMER_PHONE_PERMISSION,
    ]);

    const allowed = await phoneCallable()({ tenantId: TENANT_A });
    expect(allowed.data.decision.reason).toBe('allowed');
    expect(allowed.data.records[0]?.phone).toBe(PHONE_A);
    expect(allowed.data.records[0]?.phoneVisible).toBe(true);

    await signOut(auth);
    const deniedUid = await signUp('denied@example.com');
    await seedMember(TENANT_A, deniedUid, 'staff', ['order.settle']);

    const denied = await phoneCallable()({ tenantId: TENANT_A });
    expect(denied.data.decision.reason).toBe('missing_permission');
    expect(denied.data.records[0]?.phone).toBeNull();
    expect(denied.data.records[0]?.phoneVisible).toBe(false);
  });

  it('omits the phone for an inactive membership', async () => {
    await seedTenant(TENANT_A);
    const uid = await signUp('inactive@example.com');
    await seedMember(
      TENANT_A,
      uid,
      'staff',
      [CUSTOMER_PHONE_PERMISSION],
      false,
    );

    const result = await phoneCallable()({ tenantId: TENANT_A });
    expect(result.data.decision.reason).toBe('inactive_membership');
    expect(result.data.records[0]?.phone).toBeNull();
    expect(result.data.records[0]?.phoneVisible).toBe(false);
  });

  it('omits the phone on a cross-Tenant request', async () => {
    await seedTenant(TENANT_A);
    await seedTenant(TENANT_B);
    const uid = await signUp('cross@example.com');
    await seedMember(TENANT_A, uid, 'owner', [CUSTOMER_PHONE_PERMISSION]);

    const result = await phoneCallable()({ tenantId: TENANT_B });
    expect(result.data.decision.reason).toBe('no_membership');
    expect(result.data.decision.allowed).toBe(false);
    expect(result.data.records[0]?.phone).toBeNull();
    expect(result.data.records[0]?.phoneVisible).toBe(false);
  });
});

describe('ADMIN phone access is unrestricted and writes no audit (NFR-PRIV-001)', () => {
  it('returns the phone and does not write a read audit event', async () => {
    await seedTenant(TENANT_A);
    const credential = await createUserWithEmailAndPassword(
      auth,
      'admin@example.com',
      PASSWORD,
    );
    await adminAuth.setCustomUserClaims(credential.user.uid, { admin: true });
    await credential.user.getIdToken(true);

    const result = await phoneCallable()({ tenantId: TENANT_A });
    expect(result.data.decision.reason).toBe('admin_bypass');
    expect(result.data.decision.isAudited).toBe(true);
    expect(result.data.records[0]?.phone).toBe(PHONE_A);

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.empty).toBe(true);
  });
});
