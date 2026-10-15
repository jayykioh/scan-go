/**
 * Owner Staff command evidence (REQ-AUTH-003, REQ-AUTH-004).
 *
 * These tests call the real Staff callables through the Functions emulator and
 * prove the two ends of the PIN contract cannot disagree: a PIN the Owner can
 * set is a PIN the Staff member can verify. The default resolved policy is six
 * digits, so a four-digit PIN must be rejected where it is *set* rather than
 * stored and then refused at every sign-in.
 *
 * Run with:
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
import type { StaffPinVerifyResult } from '../../../shared/contracts/identity.contract.js';
import type {
  StaffAccount,
  StaffCommandResult,
  StaffCreateInput,
  StaffResetPinInput,
} from '../../../shared/contracts/staff.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-staff-commands';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

/** The default resolved `pinPolicy.length` (`shared/config/defaults.ts`). */
const POLICY_PIN = '948271';
/** Accepted by the outer `staffCreateInputSchema`, refused by the policy. */
const SHORT_PIN = '1234';

const USERS = {
  ownerA: { uid: 'uid-staff-owner', email: 'staff-owner@example.com' },
  cashierA: { uid: 'uid-staff-cashier', email: 'staff-cashier@example.com' },
} as const;

type UserKey = keyof typeof USERS;

const NEW_STAFF_EMAIL = 'created-staff@example.com';

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
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Staff Commands',
    configOverrides: {},
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    uid: USERS.ownerA.uid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashierA.uid}`).set({
    uid: USERS.cashierA.uid,
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: [],
    isActive: true,
    sessionVersion: 1,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function createCallable() {
  return httpsCallable<StaffCreateInput, StaffCommandResult>(
    functions,
    'callableStaffCreate',
  );
}

function resetPinCallable() {
  return httpsCallable<StaffResetPinInput, StaffCommandResult>(
    functions,
    'callableStaffResetPin',
  );
}

function pinVerifyCallable() {
  return httpsCallable<
    { tenantId: string; deviceId: string; pin: string },
    StaffPinVerifyResult
  >(functions, 'callableAuthStaffPinVerify');
}

async function captureFailure(
  promise: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const failure = error as { code?: string; message?: string };
    return { code: failure.code ?? '', message: failure.message ?? '' };
  }
  throw new Error('Expected the callable to reject.');
}

function staffCreateInput(pin: string): StaffCreateInput {
  return {
    tenantId: TENANT_A,
    email: NEW_STAFF_EMAIL,
    password: PASSWORD,
    displayName: 'Nhân viên mới',
    roles: ['cashier'],
    permissions: [],
    pin,
  };
}

async function createStaff(pin: string): Promise<StaffAccount> {
  const response = await createCallable()(staffCreateInput(pin));
  return response.data.staff;
}

describe('callableStaffCreate: PIN length must match the resolved policy', () => {
  it('rejects a short PIN before any Auth account or membership exists', async () => {
    await signInAs('ownerA');

    const failure = await captureFailure(createCallable()(staffCreateInput(SHORT_PIN)));
    expect(failure.code).toContain('invalid-argument');
    expect(failure.message).toContain('6');

    await expect(adminAuth.getUserByEmail(NEW_STAFF_EMAIL)).rejects.toThrow();
    const members = await db.collection(`tenants/${TENANT_A}/members`).get();
    expect(members.docs.map((doc) => doc.id).sort()).toEqual(
      [USERS.cashierA.uid, USERS.ownerA.uid].sort(),
    );
  });

  it('creates a staff member whose PIN then verifies and projects to the directory', async () => {
    await signInAs('ownerA');

    const staff = await createStaff(POLICY_PIN);
    expect(staff.hasPin).toBe(true);

    const memberSnap = await db
      .doc(`tenants/${TENANT_A}/members/${staff.uid}`)
      .get();
    expect(memberSnap.get('membershipType')).toBe('staff');
    expect(String(memberSnap.get('staffPinHash'))).not.toContain(POLICY_PIN);

    const directorySnap = await db
      .doc(`tenants/${TENANT_A}/staffDirectory/${staff.uid}`)
      .get();
    expect(directorySnap.exists).toBe(true);
    expect(directorySnap.get('hasPin')).toBe(true);
    expect(directorySnap.data()).not.toHaveProperty('staffPinHash');

    // The regression that shipped: the PIN the Owner just set must sign in.
    await signOut(auth);
    await signInWithEmailAndPassword(auth, NEW_STAFF_EMAIL, PASSWORD);
    const session = await pinVerifyCallable()({
      tenantId: TENANT_A,
      deviceId: 'device-cashier-01',
      pin: POLICY_PIN,
    });
    expect(session.data.session.roles).toEqual(['cashier']);
    expect(session.data.session.tenantId).toBe(TENANT_A);
  });
});

describe('callableStaffResetPin: PIN length must match the resolved policy', () => {
  it('rejects a short PIN and leaves the stored hash unchanged', async () => {
    await signInAs('ownerA');
    const staff = await createStaff(POLICY_PIN);
    const before = await db
      .doc(`tenants/${TENANT_A}/members/${staff.uid}`)
      .get();

    const failure = await captureFailure(
      resetPinCallable()({ tenantId: TENANT_A, uid: staff.uid, pin: SHORT_PIN }),
    );
    expect(failure.code).toContain('invalid-argument');

    const after = await db
      .doc(`tenants/${TENANT_A}/members/${staff.uid}`)
      .get();
    expect(after.get('staffPinHash')).toBe(before.get('staffPinHash'));
  });
});

describe('callableStaffCreate: Owner gate', () => {
  it('denies a staff caller', async () => {
    await signInAs('cashierA');

    const failure = await captureFailure(createCallable()(staffCreateInput(POLICY_PIN)));
    expect(failure.code).toContain('permission-denied');
  });
});
