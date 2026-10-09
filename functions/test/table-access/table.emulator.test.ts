/**
 * P0-006 Table Access Functions Emulator evidence (REQ-TBL-001,
 * NFR-SEC-001, NFR-SEC-002).
 *
 * These tests call the real Table Access callables through the Functions
 * emulator. They prove atomic token rotation, old-link failure, new-link
 * success, cross-tenant denial, and the configurable public rate limit.
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
import type {
  TableCommandResult,
  TableLinkContext,
} from '../../../shared/contracts/table.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  staffA: { uid: 'uid-staff-a', email: 'staff-a@example.com' },
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
} as const;

type UserKey = keyof typeof USERS;

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

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('publicTableLinks'));
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

  await db.doc('platform/config').set({
    values: { rateLimit: { publicOrderPerMinute: 60 } },
    configVersion: 1,
    updatedAt: new Date().toISOString(),
  });

  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
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

  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function createCallable() {
  return httpsCallable<
    { tenantId: string; name: string },
    TableCommandResult
  >(functions, 'callableTableCreate');
}

function regenerateCallable() {
  return httpsCallable<
    { tenantId: string; tableId: string },
    TableCommandResult
  >(functions, 'callableTableRegenerate');
}

function archiveCallable() {
  return httpsCallable<
    { tenantId: string; tableId: string; reason: string | null },
    TableCommandResult
  >(functions, 'callableTableArchive');
}

function renameCallable() {
  return httpsCallable<
    { tenantId: string; tableId: string; name: string },
    TableCommandResult
  >(functions, 'callableTableRename');
}

function resolveCallable() {
  return httpsCallable<
    { token: string; tenantId: string | null },
    TableLinkContext
  >(functions, 'callableTableResolvePublic');
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

async function createTable(): Promise<{ tableId: string; token: string }> {
  await signInAs('ownerA');
  const response = await createCallable()({ tenantId: TENANT_A, name: 'Bàn 1' });
  return {
    tableId: response.data.tableId as string,
    token: response.data.context?.token as string,
  };
}

describe('callableTableCreate', () => {
  it('creates a table and one opaque public link', async () => {
    const { tableId, token } = await createTable();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);

    const tableSnap = await db.doc(`tenants/${TENANT_A}/tables/${tableId}`).get();
    expect(tableSnap.get('tokenVersion')).toBe(1);
    expect(tableSnap.get('activeToken')).toBe(token);

    const linkSnap = await db.doc(`publicTableLinks/${token}`).get();
    expect(linkSnap.get('tenantId')).toBe(TENANT_A);
    expect(linkSnap.get('tableId')).toBe(tableId);
    expect(linkSnap.get('isActive')).toBe(true);
    expect(linkSnap.get('staffPinHash')).toBeUndefined();
  });

  it('denies a Staff member and a cross-tenant Owner', async () => {
    await signInAs('staffA');
    await expectRejection(
      createCallable()({ tenantId: TENANT_A, name: 'X' }),
      'permission-denied',
    );

    await signInAs('ownerB');
    await expectRejection(
      createCallable()({ tenantId: TENANT_A, name: 'X' }),
      'permission-denied',
    );

    const snap = await db.collection(`tenants/${TENANT_A}/tables`).get();
    expect(snap.size).toBe(0);
  });
});

describe('callableTableRename', () => {
  it('renames the table and keeps the public link label in sync', async () => {
    const { tableId, token } = await createTable();

    const renamed = await renameCallable()({
      tenantId: TENANT_A,
      tableId,
      name: 'Bàn 2',
    });
    expect(renamed.data.command).toBe('rename');
    expect(renamed.data.context?.tableName).toBe('Bàn 2');

    const tableSnap = await db.doc(`tenants/${TENANT_A}/tables/${tableId}`).get();
    expect(tableSnap.get('name')).toBe('Bàn 2');

    const linkSnap = await db.doc(`publicTableLinks/${token}`).get();
    expect(linkSnap.get('tableName')).toBe('Bàn 2');
  });

  it('denies a cross-tenant Owner rename without a write', async () => {
    const { tableId, token } = await createTable();

    await signInAs('ownerB');
    await expectRejection(
      renameCallable()({ tenantId: TENANT_A, tableId, name: 'Hijacked' }),
      'permission-denied',
    );

    const linkSnap = await db.doc(`publicTableLinks/${token}`).get();
    expect(linkSnap.get('tableName')).toBe('Bàn 1');
  });
});

describe('callableTableRegenerate: atomic rotation', () => {
  it('revokes the old link and activates the new one', async () => {
    const { tableId, token: oldToken } = await createTable();

    const rotated = await regenerateCallable()({
      tenantId: TENANT_A,
      tableId,
    });
    const newToken = rotated.data.context?.token as string;
    expect(newToken).not.toBe(oldToken);
    expect(rotated.data.rotation?.newTokenVersion).toBe(2);

    const oldLink = await db.doc(`publicTableLinks/${oldToken}`).get();
    expect(oldLink.get('isActive')).toBe(false);
    expect(oldLink.get('revokedAt')).not.toBeNull();

    const newLink = await db.doc(`publicTableLinks/${newToken}`).get();
    expect(newLink.get('isActive')).toBe(true);

    const tableSnap = await db.doc(`tenants/${TENANT_A}/tables/${tableId}`).get();
    expect(tableSnap.get('activeToken')).toBe(newToken);
    expect(tableSnap.get('qrPayload')).toBe(`/menu/${newToken}`);

    await signOut(auth);
    await expectRejection(
      resolveCallable()({ token: oldToken, tenantId: null }),
      'permission-denied',
    );
    const resolved = await resolveCallable()({ token: newToken, tenantId: null });
    expect(resolved.data.tenantId).toBe(TENANT_A);
    expect(resolved.data.tableName).toBe('Bàn 1');
    expect(resolved.data.status).toBe('active');
  });
});

describe('callableTableResolvePublic: revoked and cross-tenant tokens', () => {
  it('fails a revoked token', async () => {
    const { tableId, token } = await createTable();
    await archiveCallable()({ tenantId: TENANT_A, tableId, reason: null });

    await signOut(auth);
    await expectRejection(
      resolveCallable()({ token, tenantId: null }),
      'permission-denied',
    );
  });

  it('fails a cross-tenant token scope', async () => {
    const { token } = await createTable();
    await signOut(auth);

    await expectRejection(
      resolveCallable()({ token, tenantId: TENANT_B }),
      'permission-denied',
    );
  });

  it('denies a cross-tenant Owner regeneration without rotation', async () => {
    const { tableId, token } = await createTable();

    await signInAs('ownerB');
    await expectRejection(
      regenerateCallable()({ tenantId: TENANT_A, tableId }),
      'permission-denied',
    );

    const link = await db.doc(`publicTableLinks/${token}`).get();
    expect(link.get('isActive')).toBe(true);
  });
});

describe('callableTableResolvePublic: configurable rate limit', () => {
  it('rejects the request beyond the configured per-minute limit', async () => {
    await db.doc('platform/config').set(
      { values: { rateLimit: { publicOrderPerMinute: 1 } } },
      { merge: true },
    );
    const { token } = await createTable();
    await signOut(auth);

    const first = await resolveCallable()({ token, tenantId: null });
    expect(first.data.status).toBe('active');

    await expectRejection(
      resolveCallable()({ token, tenantId: null }),
      'resource-exhausted',
    );
  });
});
