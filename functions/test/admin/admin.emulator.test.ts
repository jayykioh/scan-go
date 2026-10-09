/**
 * P0-L01 ADMIN access Functions Emulator evidence (REQ-ADM-001, NFR-PRIV-001).
 *
 * These tests create real Firebase Auth users, set the server-verified ADMIN
 * platform claim through the Admin SDK, and call the real ADMIN callables
 * through the Functions emulator. Run with the root script:
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
  ADMIN_CONTRACT_VERSION,
  type AdminAuditListResult,
  type AdminChangeTenantResult,
  type AdminCustomerPhoneListResult,
  type AdminOpenTenantResult,
  type AdminTenantListResult,
} from '../../../shared/contracts/admin.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

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

function listTenantsCallable() {
  return httpsCallable<{ limit?: number }, AdminTenantListResult>(
    functions,
    'callableAdminListTenants',
  );
}

function openTenantCallable() {
  return httpsCallable<{ tenantId: string }, AdminOpenTenantResult>(
    functions,
    'callableAdminOpenTenant',
  );
}

function changeTenantCallable() {
  return httpsCallable<
    { tenantId: string; action: 'archive' | 'restore'; reason: string },
    AdminChangeTenantResult
  >(functions, 'callableAdminChangeTenant');
}

function listAuditCallable() {
  return httpsCallable<{ tenantId: string }, AdminAuditListResult>(
    functions,
    'callableAdminListAudit',
  );
}

function listPhonesCallable() {
  return httpsCallable<{ tenantId: string }, AdminCustomerPhoneListResult>(
    functions,
    'callableAdminListCustomerPhones',
  );
}

async function seedTenant(
  tenantId: string,
  shopName: string,
  memberUid: string,
): Promise<void> {
  await db.doc(`tenants/${tenantId}`).set({
    shopName,
    industry: 'quan_an',
    pricingTier: 'free',
    paymentMode: 'payLater',
    archivedAt: null,
    createdAt: '2026-09-12T00:00:00.000Z',
    updatedAt: '2026-09-12T00:00:00.000Z',
  });
  await db.doc(`tenants/${tenantId}/members/${memberUid}`).set({
    uid: memberUid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });
}

async function seedOwnerPhone(
  tenantId: string,
  memberId: string,
  phone: string,
): Promise<void> {
  await db.doc(`tenants/${tenantId}/loyaltyMembers/${memberId}`).set({
    displayName: `Khách ${memberId}`,
    phone,
  });
}

async function createAdminUser(
  email: string,
): Promise<{ uid: string }> {
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    PASSWORD,
  );
  await adminAuth.setCustomUserClaims(credential.user.uid, { admin: true });
  await credential.user.getIdToken(true);
  return { uid: credential.user.uid };
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

describe('ADMIN claim: cross-Tenant access with audit only for changes', () => {
  it('lists, opens, reads, and changes any Tenant; only changes are audited', async () => {
    await seedTenant(TENANT_A, 'Alpha', 'owner-a');
    await seedTenant(TENANT_B, 'Bravo', 'owner-b');
    await seedOwnerPhone(TENANT_A, 'member-1', '+84900000001');

    await createAdminUser('admin@example.com');

    const listed = await listTenantsCallable()({});
    expect(listed.data.schemaVersion).toBe(ADMIN_CONTRACT_VERSION);
    expect(listed.data.tenants.map((tenant) => tenant.tenantId).sort()).toEqual(
      [TENANT_A, TENANT_B].sort(),
    );
    // Listing tenants is a read and must not create an audit event.
    expect(
      (await db.collection(`tenants/${TENANT_A}/audit`).get()).empty,
    ).toBe(true);

    const opened = await openTenantCallable()({ tenantId: TENANT_A });
    expect(opened.data.tenant.shopName).toBe('Alpha');
    // Opening a Tenant is a read and must not create an audit event.
    expect(
      (await db.collection(`tenants/${TENANT_A}/audit`).get()).empty,
    ).toBe(true);

    const phones = await listPhonesCallable()({ tenantId: TENANT_A });
    expect(phones.data.records[0]?.phone).toBe('+84900000001');
    expect(phones.data.records[0]?.phoneVisible).toBe(true);
    // Reading customer phones is a read and must not create an audit event.
    expect(
      (await db.collection(`tenants/${TENANT_A}/audit`).get()).empty,
    ).toBe(true);

    const archived = await changeTenantCallable()({
      tenantId: TENANT_B,
      action: 'archive',
      reason: 'support request',
    });
    expect(archived.data.tenant.state).toBe('archived');
    expect(archived.data.auditEventId).toBeTruthy();

    const tenantB = await db.doc(`tenants/${TENANT_B}`).get();
    expect(tenantB.get('archivedAt')).not.toBeNull();

    const auditB = await listAuditCallable()({ tenantId: TENANT_B });
    const actions = auditB.data.events.map((event) => event.action);
    expect(actions).toContain('AdminTenantArchived');
    // Reading audit must not add a new audit event.
    expect(actions).not.toContain('AdminAuditRead');
    const auditAfter = await db.collection(`tenants/${TENANT_B}/audit`).get();
    expect(auditAfter.size).toBe(auditB.data.events.length);
    const archivedEvent = auditB.data.events.find(
      (event) => event.action === 'AdminTenantArchived',
    );
    expect(archivedEvent?.actorType).toBe('admin');
    expect(archivedEvent?.reason).toBe('support request');
    expect(archivedEvent?.targetId).toBe(TENANT_B);
  });

  it('does not write any audit event for ADMIN reads', async () => {
    await seedTenant(TENANT_A, 'Alpha', 'owner-a');
    await seedOwnerPhone(TENANT_A, 'member-1', '+84900000001');
    await createAdminUser('admin-platform@example.com');

    await listTenantsCallable()({});
    await openTenantCallable()({ tenantId: TENANT_A });
    await listAuditCallable()({ tenantId: TENANT_A });
    await listPhonesCallable()({ tenantId: TENANT_A });

    const tenantAudit = await db
      .collection(`tenants/${TENANT_A}/audit`)
      .get();
    expect(tenantAudit.empty).toBe(true);
    const platformAudit = await db
      .collection('platform/config/audit')
      .get();
    expect(platformAudit.empty).toBe(true);
  });
});

describe('non-ADMIN denial', () => {
  it('denies ADMIN queries and commands and writes no audit', async () => {
    await seedTenant(TENANT_A, 'Alpha', 'owner-a');
    await createUserWithEmailAndPassword(auth, 'owner@example.com', PASSWORD);

    await expectRejection(listTenantsCallable()({}), 'permission-denied');
    await expectRejection(
      openTenantCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
    await expectRejection(
      changeTenantCallable()({
        tenantId: TENANT_A,
        action: 'archive',
        reason: 'nope',
      }),
      'permission-denied',
    );
    await expectRejection(
      listPhonesCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );

    const tenant = await db.doc(`tenants/${TENANT_A}`).get();
    expect(tenant.get('archivedAt')).toBeNull();
    const audit = await db.collection(`tenants/${TENANT_A}/audit`).get();
    expect(audit.empty).toBe(true);
  });
});
