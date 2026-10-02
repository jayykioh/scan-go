/**
 * P0-001 Config Functions Emulator callable evidence (REQ-CFG-001,
 * NFR-SEC-001, CON-002).
 *
 * These tests call the real Config callables through the Functions emulator.
 * Firestore and Auth are seeded with the Admin SDK connected to the emulator
 * (`FIREBASE_AUTH_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST`). The client SDK
 * signs in real users so the server verifies membership, Owner role, and the
 * ADMIN custom claim.
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
import {
  updatePlatformConfigResultSchema,
  updateTenantConfigResultSchema,
  type TenantVisibleResolvedConfig,
  type UpdatePlatformConfigResult,
  type UpdateTenantConfigResult,
} from '../../../shared/contracts/config.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  staffA: { uid: 'uid-staff-a', email: 'staff-a@example.com' },
  inactiveA: { uid: 'uid-inactive-a', email: 'inactive-a@example.com' },
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
  noMember: { uid: 'uid-no-member', email: 'no-member@example.com' },
  admin: { uid: 'uid-admin', email: 'admin@example.com' },
} as const;

type UserKey = keyof typeof USERS;

interface TenantSnapshot {
  configVersion?: number;
  configOverrides?: Record<string, unknown>;
}

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
  await seedEmulators();
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  const existing = await adminAuth.listUsers();
  if (existing.users.length > 0) {
    await adminAuth.deleteUsers(existing.users.map((user) => user.uid));
  }
}

async function seedEmulators(): Promise<void> {
  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }
  await adminAuth.setCustomUserClaims(USERS.admin.uid, { admin: true });

  await db.doc('platform/config').set({
    values: {
      retention: { years: 7 },
      backup: { retentionDays: 45 },
      rateLimit: { publicOrderPerMinute: 60 },
    },
    allowedTenantOverrideKeys: ['locale'],
    configVersion: 1,
    updatedAt: new Date().toISOString(),
  });

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    timezone: 'Asia/Ho_Chi_Minh',
    configOverrides: {},
    configVersion: 2,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.inactiveA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: false,
  });

  await db.doc(`tenants/${TENANT_B}`).set({
    shopName: 'Tenant B',
    configOverrides: {},
    configVersion: 1,
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function updateTenantCallable() {
  return httpsCallable<
    { tenantId: string; overrides: Record<string, unknown> },
    UpdateTenantConfigResult
  >(functions, 'callableConfigUpdateTenant');
}

function updatePlatformCallable() {
  return httpsCallable<
    { overrides: Record<string, unknown> },
    UpdatePlatformConfigResult
  >(functions, 'callableConfigUpdatePlatform');
}

function getResolvedCallable() {
  return httpsCallable<{ tenantId?: string }, TenantVisibleResolvedConfig>(
    functions,
    'callableConfigGetResolved',
  );
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

async function readTenant(tenantId: string): Promise<TenantSnapshot | undefined> {
  const snap = await db.doc(`tenants/${tenantId}`).get();
  return snap.data() as TenantSnapshot | undefined;
}

async function auditCount(tenantId: string): Promise<number> {
  const snap = await db.collection(`tenants/${tenantId}/audit`).get();
  return snap.size;
}

async function expectNoTenantWrite(
  before: TenantSnapshot | undefined,
): Promise<void> {
  const after = await readTenant(TENANT_A);
  expect(after?.configVersion).toBe(before?.configVersion);
  expect(after?.configOverrides).toEqual(before?.configOverrides);
  expect(await auditCount(TENANT_A)).toBe(0);
}

describe('callableConfigUpdateTenant: Owner allow', () => {
  it('writes the override, increments the version, audits, and returns tenant-visible values', async () => {
    await signInAs('ownerA');

    const response = await updateTenantCallable()({
      tenantId: TENANT_A,
      overrides: { locale: 'en' },
    });

    expect(response.data.configVersion).toBe(3);
    expect(updateTenantConfigResultSchema.safeParse(response.data).success).toBe(
      true,
    );

    const values = asRecord(response.data.resolvedConfig.values);
    expect(values.locale).toBe('en');
    expect('retention' in values).toBe(false);
    expect('backup' in values).toBe(false);
    expect('rateLimit' in values).toBe(false);
    const sources = asRecord(response.data.resolvedConfig.sources);
    expect('retention.years' in sources).toBe(false);

    const tenant = await readTenant(TENANT_A);
    expect(tenant?.configVersion).toBe(3);
    expect(tenant?.configOverrides?.locale).toBe('en');

    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.size).toBe(1);
    const event = audit.docs[0];
    expect(event.get('action')).toBe('ConfigurationChanged');
    expect(event.get('eventId')).toBe(event.id);
    expect(event.get('actorUid')).toBe(USERS.ownerA.uid);
  });
});

describe('callableConfigUpdateTenant: rejections without a write', () => {
  it('denies a Staff member (not Owner)', async () => {
    await signInAs('staffA');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({ tenantId: TENANT_A, overrides: { locale: 'en' } }),
      'permission-denied',
    );

    await expectNoTenantWrite(before);
  });

  it('denies an inactive membership', async () => {
    await signInAs('inactiveA');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({ tenantId: TENANT_A, overrides: { locale: 'en' } }),
      'permission-denied',
    );

    await expectNoTenantWrite(before);
  });

  it('denies a cross-tenant user', async () => {
    await signInAs('ownerB');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({ tenantId: TENANT_A, overrides: { locale: 'en' } }),
      'permission-denied',
    );

    await expectNoTenantWrite(before);
  });

  it('denies a caller with no membership', async () => {
    await signInAs('noMember');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({ tenantId: TENANT_A, overrides: { locale: 'en' } }),
      'permission-denied',
    );

    await expectNoTenantWrite(before);
  });

  it('denies a forbidden key (not in allowedTenantOverrideKeys)', async () => {
    await signInAs('ownerA');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({
        tenantId: TENANT_A,
        overrides: { timezone: 'Asia/Tokyo' },
      }),
      'invalid-argument',
    );

    await expectNoTenantWrite(before);
  });

  it('denies an invalid value', async () => {
    await signInAs('ownerA');
    const before = await readTenant(TENANT_A);

    await expectRejection(
      updateTenantCallable()({ tenantId: TENANT_A, overrides: { locale: 'fr' } }),
      'invalid-argument',
    );

    await expectNoTenantWrite(before);
  });
});

describe('callableConfigUpdatePlatform: ADMIN only', () => {
  it('lets ADMIN write platform defaults and records a platform audit event', async () => {
    await signInAs('admin');

    const response = await updatePlatformCallable()({
      overrides: { retention: { years: 9 } },
    });

    expect(response.data.configVersion).toBe(2);
    expect(response.data.resolvedConfig.values.retention.years).toBe(9);
    expect(
      updatePlatformConfigResultSchema.safeParse(response.data).success,
    ).toBe(true);

    const platform = await db.doc('platform/config').get();
    expect(platform.get('values')?.retention?.years).toBe(9);
    expect(platform.get('configVersion')).toBe(2);

    const audit = await db.collection('platform/config/audit').get();
    expect(audit.size).toBe(1);
    const event = audit.docs[0];
    expect(event.get('action')).toBe('ConfigurationChanged');
    expect(event.get('eventId')).toBe(event.id);
    expect(event.get('actorType')).toBe('admin');
  });

  it('denies a non-ADMIN caller and writes no platform audit', async () => {
    await signInAs('ownerA');

    await expectRejection(
      updatePlatformCallable()({ overrides: { retention: { years: 9 } } }),
      'permission-denied',
    );

    const audit = await db.collection('platform/config/audit').get();
    expect(audit.size).toBe(0);
  });
});

describe('callableConfigGetResolved: tenant-visible read', () => {
  it('returns tenant-visible values and no platform-only sources for an active member', async () => {
    await signInAs('staffA');

    const response = await getResolvedCallable()({ tenantId: TENANT_A });
    const values = asRecord(response.data.values);

    expect(values).toHaveProperty('locale');
    expect(values).toHaveProperty('timezone');
    expect(values).toHaveProperty('currency');
    expect(values).toHaveProperty('pinPolicy');
    expect('retention' in values).toBe(false);
    expect('backup' in values).toBe(false);
    expect('rateLimit' in values).toBe(false);

    const sourceKeys = Object.keys(asRecord(response.data.sources));
    expect(sourceKeys.some((key) => key.startsWith('retention.'))).toBe(false);
    expect(sourceKeys.some((key) => key.startsWith('backup.'))).toBe(false);
    expect(sourceKeys.some((key) => key.startsWith('rateLimit.'))).toBe(false);
    expect(sourceKeys).toContain('locale');
  });

  it('denies an inactive member', async () => {
    await signInAs('inactiveA');

    await expectRejection(
      getResolvedCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
  });

  it('denies a cross-tenant caller', async () => {
    await signInAs('ownerB');

    await expectRejection(
      getResolvedCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
  });
});
