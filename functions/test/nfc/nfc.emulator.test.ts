/**
 * M3/P2 NFC session Functions Emulator evidence (REQ-NFC-001, NFR-SEC-002,
 * REQ-SUB-001).
 *
 * The server provisions an opaque NFC token, resolves it back to the same
 * table menu context as QR, and revokes it. Provisioning requires the `nfc`
 * plan entitlement.
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
const TABLE_ID = 'table-1';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  owner: { uid: 'uid-owner-nfc', email: 'owner-nfc@example.com' },
  staff: { uid: 'uid-staff-nfc', email: 'staff-nfc@example.com' },
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

async function seed(plan: 'free' | 'pro'): Promise<void> {
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
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A', pricingTier: plan });
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
  await db.doc(`tenants/${TENANT_A}/tables/${TABLE_ID}`).set({
    name: 'Bàn 1',
    isActive: true,
    tokenVersion: 1,
    activeToken: 'qr-token-1',
    qrPayload: '/menu/qr-token-1',
    nfcWritten: false,
    archivedAt: null,
    createdAt: '2026-09-12T05:00:00.000Z',
    updatedAt: '2026-09-12T05:00:00.000Z',
  });
}

beforeEach(async () => {
  await seed('pro');
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

describe('NFC session callables', () => {
  it('provisions, resolves the same table context, and revokes', async () => {
    await signInWithEmailAndPassword(auth, USERS.owner.email, PASSWORD);
    const provision = httpsCallable(functions, 'callableTableProvisionNfc');
    const provisioned = await provision({ tenantId: TENANT_A, tableId: TABLE_ID });
    const token = (provisioned.data as { session: { nfcToken: string } }).session
      .nfcToken;
    expect((provisioned.data as { status: string }).status).toBe('provisioned');

    const resolve = httpsCallable(functions, 'callableTableNfcResolve');
    const resolved = await resolve({ token });
    const context = (
      resolved.data as { context: { tableId: string; tableName: string; tenantId: string } }
    ).context;
    expect(context).toMatchObject({
      tenantId: TENANT_A,
      tableId: TABLE_ID,
      tableName: 'Bàn 1',
    });

    const revoke = httpsCallable(functions, 'callableTableRevokeNfc');
    const revoked = await revoke({ tenantId: TENANT_A, tableId: TABLE_ID });
    expect((revoked.data as { status: string }).status).toBe('revoked');
    await expect(resolve({ token })).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
  });

  it('denies provisioning when the plan does not include NFC', async () => {
    await seed('free');
    await signInWithEmailAndPassword(auth, USERS.owner.email, PASSWORD);
    const provision = httpsCallable(functions, 'callableTableProvisionNfc');
    await expect(
      provision({ tenantId: TENANT_A, tableId: TABLE_ID }),
    ).rejects.toMatchObject({ code: expect.stringContaining('failed-precondition') });
  });

  it('denies a non-owner provisioning attempt', async () => {
    await signInWithEmailAndPassword(auth, USERS.staff.email, PASSWORD);
    const provision = httpsCallable(functions, 'callableTableProvisionNfc');
    await expect(
      provision({ tenantId: TENANT_A, tableId: TABLE_ID }),
    ).rejects.toMatchObject({ code: expect.stringContaining('permission-denied') });
  });
});
