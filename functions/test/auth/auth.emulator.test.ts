/**
 * P0-002A Owner registration Functions Emulator evidence (REQ-AUTH-001,
 * NFR-SEC-001, CON-002).
 *
 * These tests create real Firebase Auth email/password accounts, call the real
 * `callableAuthRegisterOwner` through the Functions emulator, and assert the
 * server-owned Firestore fixtures. Run with the root script:
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
  signInWithCustomToken,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type { BootstrapTenantResult } from '../../../shared/contracts/identity.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

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
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

function registerCallable() {
  return httpsCallable<unknown, BootstrapTenantResult>(
    functions,
    'callableAuthRegisterOwner',
  );
}

async function countTenants(): Promise<number> {
  const snap = await db.collection('tenants').get();
  return snap.size;
}

async function readAuditEvents(
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const snap = await db.collection(`tenants/${tenantId}/audit`).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

describe('callableAuthRegisterOwner: registration success', () => {
  it('creates the Owner account, profile, first Tenant, and membership', async () => {
    const email = 'new-owner@example.com';
    const credential = await createUserWithEmailAndPassword(auth, email, PASSWORD);
    const uid = credential.user.uid;

    const response = await registerCallable()({
      shopName: '  Quán Mới  ',
      displayName: 'Chủ quán',
    });

    expect(response.data.identity.uid).toBe(uid);
    expect(response.data.identity.email).toBe(email);
    expect(response.data.identity.activeTenantId).toBe(
      response.data.membership.tenantId,
    );
    expect(response.data.identity.createdAt).toMatch(ISO_UTC);
    expect(response.data.membership.membershipType).toBe('owner');
    expect(response.data.membership.roles).toContain('owner');
    expect(response.data.membership.isActive).toBe(true);
    expect(response.data.membership.uid).toBe(uid);

    const tenantId = response.data.membership.tenantId;
    const tenant = await db.doc(`tenants/${tenantId}`).get();
    expect(tenant.exists).toBe(true);
    expect(tenant.get('shopName')).toBe('Quán Mới');
    expect(tenant.get('pricingTier')).toBe('free');
    expect(String(tenant.get('createdAt'))).toMatch(ISO_UTC);

    const member = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    expect(member.exists).toBe(true);
    expect(member.get('membershipType')).toBe('owner');
    expect(member.get('isActive')).toBe(true);
    expect(member.get('staffPinHash')).toBeNull();
    expect(member.get('pin')).toBeUndefined();

    const profile = await db.doc(`users/${uid}`).get();
    expect(profile.get('activeTenantId')).toBe(tenantId);
    expect(profile.get('email')).toBe(email);
    expect(profile.get('locale')).toBe('vi');

    // First-Tenant creation is deterministic for the Owner account.
    expect(tenantId).toBe(`first-${uid}`);

    const audit = await readAuditEvents(tenantId);
    const created = audit.find((event) => event.action === 'TenantCreated');
    expect(created).toBeDefined();
    expect(created?.targetId).toBe(tenantId);
    // The shared audit writer uses the written document id as eventId.
    expect(created?.eventId).toBe(created?.id);
  });
});

describe('callableAuthRegisterOwner: concurrent registration', () => {
  it('creates one deterministic first Tenant for concurrent calls', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'concurrent-register@example.com',
      PASSWORD,
    );
    const uid = credential.user.uid;

    const call = registerCallable();
    const [first, second] = await Promise.all([
      call({ shopName: 'Quán Một' }),
      call({ shopName: 'Quán Hai' }),
    ]);

    expect(first.data.membership.tenantId).toBe(
      second.data.membership.tenantId,
    );
    expect(first.data.membership.tenantId).toBe(`first-${uid}`);
    expect(await countTenants()).toBe(1);
  });
});

describe('callableAuthRegisterOwner: repeat registration is idempotent', () => {
  it('returns the existing membership and creates no second Tenant', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'repeat-owner@example.com',
      PASSWORD,
    );

    const first = await registerCallable()({ shopName: 'Quán Đầu' });
    const second = await registerCallable()({ shopName: 'Quán Hai' });

    expect(second.data.membership.tenantId).toBe(
      first.data.membership.tenantId,
    );
    expect(second.data.membership.createdAt).toBe(
      first.data.membership.createdAt,
    );
    expect(await countTenants()).toBe(1);
  });
});

describe('callableAuthRegisterOwner: rejections without a write', () => {
  it('rejects an authenticated account without an email', async () => {
    const uid = 'uid-no-email';
    await adminAuth.createUser({ uid });
    const token = await adminAuth.createCustomToken(uid);
    await signInWithCustomToken(auth, token);

    await expectRejection(
      registerCallable()({ shopName: 'Quán Không Email' }),
      'failed-precondition',
    );
    expect(await countTenants()).toBe(0);
  });

  it('rejects invalid registration input and writes no business record', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'bad-input@example.com',
      PASSWORD,
    );

    await expectRejection(
      registerCallable()({ shopName: '' }),
      'invalid-argument',
    );
    await expectRejection(
      registerCallable()({ shopName: 42 }),
      'invalid-argument',
    );
    await expectRejection(registerCallable()('not-an-object'), 'invalid-argument');
    expect(await countTenants()).toBe(0);
  });

  it('rejects an unauthenticated caller', async () => {
    await expectRejection(
      registerCallable()({ shopName: 'Quán Ẩn' }),
      'unauthenticated',
    );
    expect(await countTenants()).toBe(0);
  });
});
