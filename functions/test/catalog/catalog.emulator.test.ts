/**
 * P0-005 Catalog Functions Emulator evidence (REQ-CAT-001, REQ-CAT-002,
 * NFR-SEC-001, NFR-DATA-001).
 *
 * These tests call the real Catalog callables through the Functions emulator.
 * Firestore and Auth are seeded with the Admin SDK. A bounded client listener
 * proves the public projection reaches a Customer within two seconds.
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
  collection,
  connectFirestoreEmulator,
  getFirestore,
  limit,
  onSnapshot,
  query,
  type Firestore as ClientFirestore,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  CatalogCommandResult,
  CatalogCreateInput,
  CatalogSearchResult,
} from '../../../shared/contracts/catalog.contract.js';

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
  ownerB: { uid: 'uid-owner-b', email: 'owner-b@example.com' },
} as const;

type UserKey = keyof typeof USERS;

let adminApp: AdminApp;
let db: Firestore;
let adminAuth: AdminAuth;

let clientApp: FirebaseApp;
let auth: Auth;
let clientDb: ClientFirestore;
let functions: Functions;

let activeSubscriptions: Unsubscribe[] = [];

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
  clientDb = getFirestore(clientApp);
  connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
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
  for (const unsubscribe of activeSubscriptions) {
    unsubscribe();
  }
  activeSubscriptions = [];
  await signOut(auth).catch(() => undefined);
});

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

  await db.doc('platform/config').set({
    values: { rateLimit: { publicOrderPerMinute: 60 } },
    allowedTenantOverrideKeys: ['locale'],
    configVersion: 1,
    updatedAt: new Date().toISOString(),
  });

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    industry: 'quan_an',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set({
    membershipType: 'staff',
    roles: ['kitchen'],
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
  return httpsCallable<CatalogCreateInput, CatalogCommandResult>(
    functions,
    'callableCatalogCreate',
  );
}

function updateCallable() {
  return httpsCallable<
    CatalogCreateInput & { menuItemId: string },
    CatalogCommandResult
  >(functions, 'callableCatalogUpdate');
}

function archiveCallable() {
  return httpsCallable<
    { tenantId: string; menuItemId: string; reason: string | null },
    CatalogCommandResult
  >(functions, 'callableCatalogArchive');
}

function searchCallable() {
  return httpsCallable<
    { tenantId: string; query: string | null; category: string | null },
    CatalogSearchResult
  >(functions, 'callableCatalogSearch');
}

function applyTemplateCallable() {
  return httpsCallable<
    { tenantId: string; templateId: string },
    CatalogCommandResult
  >(functions, 'callableCatalogApplyTemplate');
}

function setAvailabilityCallable() {
  return httpsCallable<
    { tenantId: string; menuItemId: string; isAvailable: boolean },
    CatalogCommandResult
  >(functions, 'callableCatalogSetAvailability');
}

function input(overrides: Partial<CatalogCreateInput> = {}): CatalogCreateInput {
  return {
    tenantId: TENANT_A,
    name: 'Phở bò',
    description: 'Phở bò gia truyền',
    category: 'Món chính',
    type: 'Đồ ăn',
    priceVnd: 45000,
    costPriceVnd: 22000,
    imagePath: `tenants/${TENANT_A}/menuItems/pho.jpg`,
    modifierGroups: [],
    recipeId: 'recipe-pho-bo-001',
    isAvailable: true,
    stockCount: 40,
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

async function menuItemCount(tenantId: string, collectionName: string) {
  const snap = await db.collection(`tenants/${tenantId}/${collectionName}`).get();
  return snap.size;
}

/** Bounded public-menu listener with a two-second acceptance bound. */
function waitForPublicItem(
  tenantId: string,
  predicate: (ids: string[]) => boolean,
  timeoutMs = 2000,
): Promise<{ ids: string[]; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Public menu listener timed out.'));
    }, timeoutMs);
    const unsubscribe = onSnapshot(
      query(
        collection(clientDb, 'tenants', tenantId, 'publicMenuItems'),
        limit(50),
      ),
      (snap) => {
        const ids = snap.docs.map((docSnap) => docSnap.id);
        if (predicate(ids)) {
          clearTimeout(timer);
          unsubscribe();
          resolve({ ids, elapsedMs: Date.now() - started });
        }
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      },
    );
    activeSubscriptions.push(unsubscribe);
  });
}

describe('callableCatalogCreate: private and public projection', () => {
  it('writes the private source and the public-safe projection together', async () => {
    await signInAs('ownerA');
    const response = await createCallable()(input());

    expect(response.data.status).toBe('applied');
    const projection = response.data.publicProjection as Record<string, unknown>;
    expect(projection).not.toBeNull();
    expect(projection).not.toHaveProperty('costPriceVnd');

    const menuItemId = response.data.menuItemId as string;
    const privateSnap = await db
      .doc(`tenants/${TENANT_A}/menuItems/${menuItemId}`)
      .get();
    expect(privateSnap.get('costPriceVnd')).toBe(22000);
    expect(privateSnap.get('recipeId')).toBe('recipe-pho-bo-001');
    expect(privateSnap.get('version')).toBe(1);

    const publicSnap = await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${menuItemId}`)
      .get();
    expect(publicSnap.exists).toBe(true);
    expect(publicSnap.get('priceVnd')).toBe(45000);
    expect(publicSnap.get('costPriceVnd')).toBeUndefined();
    expect(publicSnap.get('recipeId')).toBeUndefined();
    expect(publicSnap.get('stockCount')).toBeUndefined();
  });

  it('reaches a bounded Customer listener within two seconds', async () => {
    await signInAs('ownerA');
    const pending = waitForPublicItem(TENANT_A, (ids) => ids.length > 0);
    const response = await createCallable()(input());
    const result = await pending;

    expect(result.ids).toContain(response.data.menuItemId);
    expect(result.elapsedMs).toBeLessThan(2000);
  });
});

describe('callableCatalogUpdate / archive', () => {
  it('updates the projection and removes it when unavailable', async () => {
    await signInAs('ownerA');
    const created = await createCallable()(input());
    const menuItemId = created.data.menuItemId as string;

    await updateCallable()({
      ...input({ isAvailable: false }),
      menuItemId,
    });

    const publicSnap = await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${menuItemId}`)
      .get();
    expect(publicSnap.exists).toBe(false);
  });

  it('archives the private item and removes the projection', async () => {
    await signInAs('ownerA');
    const created = await createCallable()(input());
    const menuItemId = created.data.menuItemId as string;

    const archived = await archiveCallable()({
      tenantId: TENANT_A,
      menuItemId,
      reason: null,
    });
    expect(archived.data.command).toBe('archive');

    const privateSnap = await db
      .doc(`tenants/${TENANT_A}/menuItems/${menuItemId}`)
      .get();
    expect(privateSnap.get('archivedAt')).not.toBeNull();
    const publicSnap = await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${menuItemId}`)
      .get();
    expect(publicSnap.exists).toBe(false);
  });
});

describe('callableCatalogSetAvailability projection timestamp', () => {
  it('maps the public projection with the same updatedAt as the private item', async () => {
    await signInAs('ownerA');
    const created = await createCallable()(input());
    const menuItemId = created.data.menuItemId as string;
    const stale = '2020-01-01T00:00:00.000Z';
    await db
      .doc(`tenants/${TENANT_A}/menuItems/${menuItemId}`)
      .set({ updatedAt: stale }, { merge: true });
    await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${menuItemId}`)
      .set({ updatedAt: stale }, { merge: true });

    const applied = await setAvailabilityCallable()({
      tenantId: TENANT_A,
      menuItemId,
      isAvailable: true,
    });
    expect(applied.data.status).toBe('applied');

    const privateSnap = await db
      .doc(`tenants/${TENANT_A}/menuItems/${menuItemId}`)
      .get();
    const publicSnap = await db
      .doc(`tenants/${TENANT_A}/publicMenuItems/${menuItemId}`)
      .get();
    const privateUpdatedAt = privateSnap.get('updatedAt') as string;
    expect(privateUpdatedAt).not.toBe(stale);
    expect(publicSnap.get('updatedAt')).toBe(privateUpdatedAt);
  });
});

describe('callableCatalogApplyTemplate: one Tenant only', () => {
  it('seeds categories and items in the target Tenant and not the other', async () => {
    await signInAs('ownerA');
    const response = await applyTemplateCallable()({
      tenantId: TENANT_A,
      templateId: 'quan_an',
    });

    expect(response.data.status).toBe('applied');
    expect(response.data.affectedItemCount).toBeGreaterThan(0);
    expect(await menuItemCount(TENANT_A, 'menuItems')).toBe(
      response.data.affectedItemCount,
    );
    expect(await menuItemCount(TENANT_A, 'publicMenuItems')).toBe(
      response.data.affectedItemCount,
    );
    expect(await menuItemCount(TENANT_B, 'menuItems')).toBe(0);
    expect(await menuItemCount(TENANT_B, 'publicMenuItems')).toBe(0);
  });

  it('rejects an unknown template without a write', async () => {
    await signInAs('ownerA');
    await expectRejection(
      applyTemplateCallable()({ tenantId: TENANT_A, templateId: 'unknown' }),
      'invalid-argument',
    );
    expect(await menuItemCount(TENANT_A, 'menuItems')).toBe(0);
  });
});

describe('Catalog callable authorization', () => {
  it('denies a Staff member and a cross-tenant Owner without a write', async () => {
    await signInAs('staffA');
    await expectRejection(createCallable()(input()), 'permission-denied');

    await signInAs('ownerB');
    await expectRejection(createCallable()(input()), 'permission-denied');
    await expectRejection(
      searchCallable()({ tenantId: TENANT_A, query: null, category: null }),
      'permission-denied',
    );

    expect(await menuItemCount(TENANT_A, 'menuItems')).toBe(0);
  });

  it('lets an active member search the private menu', async () => {
    await signInAs('ownerA');
    await createCallable()(input({ name: 'Phở bò' }));
    await createCallable()(input({ name: 'Cà phê', category: 'Đồ uống' }));

    const result = await searchCallable()({
      tenantId: TENANT_A,
      query: 'phở',
      category: null,
    });
    expect(result.data.total).toBe(1);
    expect(result.data.items[0]?.name).toBe('Phở bò');
  });
});
