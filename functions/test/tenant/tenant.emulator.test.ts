/**
 * P0-002B first Tenant bootstrap Functions Emulator evidence (REQ-TEN-001,
 * NFR-SEC-001, CON-002).
 *
 * These tests create real Firebase Auth email/password accounts and call the
 * real Tenant callables through the Functions emulator, then assert the
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
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  BootstrapTenantResult,
  ListMembershipsResult,
  SelectActiveTenantResult,
} from '../../../shared/contracts/identity.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const REGION = FUNCTIONS_REGION;
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

function bootstrapCallable() {
  return httpsCallable<unknown, BootstrapTenantResult>(
    functions,
    'callableTenantBootstrap',
  );
}

function createTenantCallable() {
  return httpsCallable<unknown, BootstrapTenantResult>(
    functions,
    'callableTenantCreate',
  );
}

function selectActiveCallable() {
  return httpsCallable<unknown, SelectActiveTenantResult>(
    functions,
    'callableTenantSelectActive',
  );
}

function listMembershipsCallable() {
  return httpsCallable<unknown, ListMembershipsResult>(
    functions,
    'callableTenantListMemberships',
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

describe('callableTenantBootstrap: first Tenant', () => {
  it('creates one Tenant, Owner membership, profile, and activeTenantId', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'bootstrap-owner@example.com',
      PASSWORD,
    );
    const uid = credential.user.uid;

    const response = await bootstrapCallable()({});

    const tenantId = response.data.membership.tenantId;
    expect(response.data.membership.membershipType).toBe('owner');
    expect(response.data.membership.isActive).toBe(true);
    expect(response.data.identity.activeTenantId).toBe(tenantId);

    const tenant = await db.doc(`tenants/${tenantId}`).get();
    expect(tenant.exists).toBe(true);
    expect(tenant.get('industry')).toBe('quan_an');
    expect(tenant.get('timezone')).toBe('Asia/Ho_Chi_Minh');
    expect(String(tenant.get('createdAt'))).toMatch(ISO_UTC);

    const member = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    expect(member.exists).toBe(true);
    expect(member.get('membershipType')).toBe('owner');
    expect(member.get('staffPinHash')).toBeNull();

    const profile = await db.doc(`users/${uid}`).get();
    expect(profile.get('activeTenantId')).toBe(tenantId);
    expect(await countTenants()).toBe(1);

    const audit = await readAuditEvents(tenantId);
    const created = audit.find((event) => event.action === 'TenantCreated');
    expect(created).toBeDefined();
    expect(created?.targetId).toBe(tenantId);
    // The shared audit writer uses the written document id as eventId.
    expect(created?.eventId).toBe(created?.id);
  });
});

describe('callableTenantCreate: additional Tenant', () => {
  it('creates a second Tenant with defaults and makes it active', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'multi-owner@example.com',
      PASSWORD,
    );
    const first = await bootstrapCallable()({});
    const firstTenantId = first.data.membership.tenantId;

    const second = await createTenantCallable()({ shopName: '  Quán Hai  ' });
    const secondTenantId = second.data.membership.tenantId;

    expect(secondTenantId).not.toBe(firstTenantId);
    expect(second.data.membership.membershipType).toBe('owner');
    expect(second.data.identity.activeTenantId).toBe(secondTenantId);

    const tenant = await db.doc(`tenants/${secondTenantId}`).get();
    expect(tenant.exists).toBe(true);
    expect(tenant.get('shopName')).toBe('Quán Hai');
    expect(tenant.get('pricingTier')).toBe('free');
    expect(tenant.get('paymentMode')).toBe('payLater');
    expect(String(tenant.get('createdAt'))).toMatch(ISO_UTC);
    expect(String(tenant.get('updatedAt'))).toMatch(ISO_UTC);

    const audit = await readAuditEvents(secondTenantId);
    const created = audit.find((event) => event.action === 'TenantCreated');
    expect(created).toBeDefined();
    expect(created?.targetId).toBe(secondTenantId);
    expect(created?.eventId).toBe(created?.id);

    expect(await countTenants()).toBe(2);
  });
});

describe('callableTenantBootstrap: repeat bootstrap', () => {
  it('returns the existing membership and creates no duplicate Tenant', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'idempotent-owner@example.com',
      PASSWORD,
    );

    const first = await bootstrapCallable()({});
    const second = await bootstrapCallable()({});

    expect(second.data.membership.tenantId).toBe(
      first.data.membership.tenantId,
    );
    expect(second.data.identity.activeTenantId).toBe(
      first.data.membership.tenantId,
    );
    expect(await countTenants()).toBe(1);
  });
});

describe('callableTenantBootstrap: concurrent first Tenant', () => {
  it('serializes concurrent calls onto one deterministic Tenant', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'concurrent-owner@example.com',
      PASSWORD,
    );
    const uid = credential.user.uid;

    const [first, second] = await Promise.all([
      bootstrapCallable()({}),
      bootstrapCallable()({}),
    ]);

    expect(first.data.membership.tenantId).toBe(
      second.data.membership.tenantId,
    );
    expect(first.data.membership.tenantId).toBe(`first-${uid}`);
    expect(await countTenants()).toBe(1);
  });
});

describe('callableTenantListMemberships: bounded read', () => {
  it('lists the caller memberships through the result contract', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'list-owner@example.com',
      PASSWORD,
    );
    const first = await bootstrapCallable()({});
    const firstTenantId = first.data.membership.tenantId;
    const second = await createTenantCallable()({ shopName: 'Quán Hai' });
    const secondTenantId = second.data.membership.tenantId;

    const listed = await listMembershipsCallable()({});
    expect(listed.data.tenants.map((tenant) => tenant.tenantId).sort()).toEqual(
      [firstTenantId, secondTenantId].sort(),
    );
    expect(listed.data.identity.activeTenantId).toBe(secondTenantId);
  });

  it('rejects a client-supplied field on the strict list input', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'list-strict@example.com',
      PASSWORD,
    );
    await bootstrapCallable()({});
    await expectRejection(
      listMembershipsCallable()({ unexpected: true }),
      'invalid-argument',
    );
  });
});

describe('Tenant callables: rejections without a write', () => {
  it('rejects an unauthenticated bootstrap and create', async () => {
    await expectRejection(bootstrapCallable()({}), 'unauthenticated');
    await expectRejection(
      createTenantCallable()({ shopName: 'Quán Ẩn' }),
      'unauthenticated',
    );
    expect(await countTenants()).toBe(0);
  });

  it('rejects invalid Tenant-create input and writes no Tenant', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'invalid-tenant@example.com',
      PASSWORD,
    );
    await bootstrapCallable()({});
    const before = await countTenants();

    await expectRejection(
      createTenantCallable()({ shopName: '' }),
      'invalid-argument',
    );
    await expectRejection(
      createTenantCallable()({ shopName: 7 }),
      'invalid-argument',
    );
    await expectRejection(createTenantCallable()({}), 'invalid-argument');
    expect(await countTenants()).toBe(before);
  });

  it('rejects malformed bootstrap, create, list, and select payloads', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'strict-owner@example.com',
      PASSWORD,
    );
    await bootstrapCallable()({});
    const before = await countTenants();

    await expectRejection(
      bootstrapCallable()({ unexpected: true }),
      'invalid-argument',
    );
    await expectRejection(
      createTenantCallable()({ shopName: 'Quán', extra: true }),
      'invalid-argument',
    );
    await expectRejection(selectActiveCallable()({}), 'invalid-argument');
    await expectRejection(
      selectActiveCallable()({ tenantId: 42 }),
      'invalid-argument',
    );
    await expectRejection(
      selectActiveCallable()({ tenantId: 'tenant-x', extra: true }),
      'invalid-argument',
    );
    expect(await countTenants()).toBe(before);
  });
});

describe('callableTenantSelectActive: two active Tenants', () => {
  it('verifies membership and updates only the caller activeTenantId', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'selector-owner@example.com',
      PASSWORD,
    );
    const uid = credential.user.uid;

    const first = await bootstrapCallable()({});
    const firstTenantId = first.data.membership.tenantId;
    const second = await createTenantCallable()({ shopName: 'Quán Hai' });
    const secondTenantId = second.data.membership.tenantId;
    expect(secondTenantId).not.toBe(firstTenantId);

    const select = selectActiveCallable();

    const toFirst = await select({ tenantId: firstTenantId });
    expect(toFirst.data.activeTenantId).toBe(firstTenantId);
    expect(toFirst.data.identity.activeTenantId).toBe(firstTenantId);

    const toSecond = await select({ tenantId: secondTenantId });
    expect(toSecond.data.activeTenantId).toBe(secondTenantId);
    expect(toSecond.data.identity.activeTenantId).toBe(secondTenantId);

    const profile = await db.doc(`users/${uid}`).get();
    expect(profile.get('activeTenantId')).toBe(secondTenantId);

    for (const tenantId of [firstTenantId, secondTenantId]) {
      const member = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
      expect(member.get('isActive')).toBe(true);
    }

    const audit = await readAuditEvents(secondTenantId);
    const changed = audit.find(
      (event) => event.action === 'ActiveTenantChanged',
    );
    expect(changed).toBeDefined();
    expect(changed?.targetId).toBe(secondTenantId);
    // The shared audit writer uses the written document id as eventId.
    expect(changed?.eventId).toBe(changed?.id);
    expect(changed?.metadata).toMatchObject({
      previousActiveTenantId: firstTenantId,
    });
  });
});

describe('callableTenantSelectActive: inactive membership', () => {
  it('rejects and keeps the prior activeTenantId', async () => {
    const credential = await createUserWithEmailAndPassword(
      auth,
      'inactive-selector@example.com',
      PASSWORD,
    );
    const uid = credential.user.uid;

    const first = await bootstrapCallable()({});
    const firstTenantId = first.data.membership.tenantId;
    const second = await createTenantCallable()({ shopName: 'Quán Khoá' });
    const secondTenantId = second.data.membership.tenantId;

    const select = selectActiveCallable();
    await select({ tenantId: firstTenantId });

    await db
      .doc(`tenants/${secondTenantId}/members/${uid}`)
      .set({ isActive: false }, { merge: true });

    await expectRejection(
      select({ tenantId: secondTenantId }),
      'permission-denied',
    );

    const profile = await db.doc(`users/${uid}`).get();
    expect(profile.get('activeTenantId')).toBe(firstTenantId);
  });
});

describe('callableTenantSelectActive: cross-tenant selection', () => {
  it('rejects a Tenant the caller does not belong to and keeps both profiles', async () => {
    await createUserWithEmailAndPassword(
      auth,
      'other-owner@example.com',
      PASSWORD,
    );
    const other = await bootstrapCallable()({});
    const otherTenantId = other.data.membership.tenantId;
    const otherUid = auth.currentUser?.uid;
    expect(otherUid).toBeTruthy();
    await signOut(auth);

    const credential = await createUserWithEmailAndPassword(
      auth,
      'cross-owner@example.com',
      PASSWORD,
    );
    const ownerUid = credential.user.uid;
    const owner = await bootstrapCallable()({});
    const ownerTenantId = owner.data.membership.tenantId;

    await expectRejection(
      selectActiveCallable()({ tenantId: otherTenantId }),
      'permission-denied',
    );

    const ownerProfile = await db.doc(`users/${ownerUid}`).get();
    expect(ownerProfile.get('activeTenantId')).toBe(ownerTenantId);
    const otherProfile = await db.doc(`users/${otherUid}`).get();
    expect(otherProfile.get('activeTenantId')).toBe(otherTenantId);
  });
});
