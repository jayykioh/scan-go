/**
 * P0-004 Staff PIN, lockout, and server ACL Functions Emulator evidence
 * (REQ-AUTH-002, REQ-ACL-001, NFR-SEC-001, NFR-PRIV-001).
 *
 * These tests create real Firebase Auth accounts, seed hashed Staff PINs with
 * the production hashing helper, and call the real Auth callables through the
 * Functions emulator. They prove the server owns verification, lockout,
 * session version, tenant scope, and audit. Run with:
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
  type DocumentData,
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
  StaffPinVerifyResult,
  StaffSession,
} from '../../../shared/contracts/identity.contract.js';
import type {
  AuthorizationDecision,
  SessionRevokeResult,
} from '../../../shared/contracts/authorization.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';
import { hashPin } from '../../src/modules/auth/service.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const PIN = '948271';
const PIN_IN_TENANT_B = '552233';

const USERS = {
  ownerA: { uid: 'uid-owner-a', email: 'owner-a@example.com' },
  staffA: { uid: 'uid-staff-a', email: 'staff-a@example.com' },
  staffInactive: { uid: 'uid-staff-inactive', email: 'inactive@example.com' },
  staffB: { uid: 'uid-staff-b', email: 'staff-b@example.com' },
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

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'Tenant A',
    configOverrides: {},
  });
  await db.doc(`tenants/${TENANT_B}`).set({
    shopName: 'Tenant B',
    configOverrides: {},
  });

  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    uid: USERS.ownerA.uid,
    membershipType: 'owner',
    roles: ['owner'],
    permissions: [],
    isActive: true,
    staffPinHash: null,
    sessionVersion: 1,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set({
    uid: USERS.staffA.uid,
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: ['order.settle'],
    isActive: true,
    staffPinHash: await hashPin(PIN),
    pinFailedAttempts: 0,
    pinLockedUntil: null,
    sessionVersion: 3,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffInactive.uid}`).set({
    uid: USERS.staffInactive.uid,
    membershipType: 'staff',
    roles: ['kitchen'],
    permissions: ['order.transition'],
    isActive: false,
    staffPinHash: await hashPin(PIN),
    sessionVersion: 1,
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.staffB.uid}`).set({
    uid: USERS.staffB.uid,
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: ['order.settle'],
    isActive: true,
    staffPinHash: await hashPin(PIN_IN_TENANT_B),
    sessionVersion: 7,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function pinVerifyCallable() {
  return httpsCallable<
    { tenantId: string; deviceId: string; pin: string },
    StaffPinVerifyResult
  >(functions, 'callableAuthStaffPinVerify');
}

function authorizeCallable() {
  return httpsCallable<
    { tenantId: string; permission: string; sessionVersion: number },
    AuthorizationDecision
  >(functions, 'callableAuthAuthorizeStaff');
}

function revokeCallable() {
  return httpsCallable<
    { tenantId: string; uid: string },
    SessionRevokeResult
  >(functions, 'callableAuthRevokeStaffSessions');
}

interface CallableFailure {
  code: string;
  details?: Record<string, unknown>;
}

async function captureFailure(promise: Promise<unknown>): Promise<CallableFailure> {
  try {
    await promise;
  } catch (error) {
    const failure = error as { code?: string; details?: Record<string, unknown> };
    return { code: failure.code ?? '', details: failure.details };
  }
  throw new Error('Expected the callable to reject.');
}

async function expectRejection(
  promise: Promise<unknown>,
  codeFragment: string,
): Promise<void> {
  const failure = await captureFailure(promise);
  expect(failure.code).toContain(codeFragment);
}

async function readMember(tenantId: string, uid: string): Promise<DocumentData> {
  const snap = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
  return snap.data() ?? {};
}

async function auditEvents(
  tenantId: string,
): Promise<Array<Record<string, unknown>>> {
  const snap = await db.collection(`tenants/${tenantId}/audit`).get();
  return snap.docs.map((doc) => ({ eventId: doc.id, ...doc.data() }));
}

function collectValues(value: unknown, found: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) collectValues(item, found);
    return found;
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      collectValues(child, found);
    }
    return found;
  }
  found.push(value);
  return found;
}

async function verifyPin(
  tenantId: string,
  pin: string,
): Promise<StaffPinVerifyResult> {
  const response = await pinVerifyCallable()({
    tenantId,
    deviceId: 'device-cashier-01',
    pin,
  });
  return response.data;
}

describe('callableAuthStaffPinVerify: correct PIN starts a session', () => {
  it('creates a tenant-bound session with the current version and audits it', async () => {
    await signInAs('staffA');

    const result = await verifyPin(TENANT_A, PIN);
    const session: StaffSession = result.session;

    expect(session.status).toBe('active');
    expect(session.tenantId).toBe(TENANT_A);
    expect(session.uid).toBe(USERS.staffA.uid);
    expect(session.deviceId).toBe('device-cashier-01');
    expect(session.sessionVersion).toBe(3);
    expect(session.roles).toEqual(['cashier']);
    expect(session.permissions).toEqual(['order.settle']);
    expect(session.pinPolicy).toEqual({
      length: 6,
      maxFailedAttempts: 5,
      lockMinutes: 15,
      sessionHours: 8,
    });
    expect(Date.parse(session.expiresAt) - Date.parse(session.issuedAt)).toBe(
      8 * 3_600_000,
    );
    expect(result.remainingAttempts).toBeNull();

    const member = await readMember(TENANT_A, USERS.staffA.uid);
    expect(member.pinFailedAttempts).toBe(0);
    expect(member.pinLockedUntil).toBeNull();
    expect(String(member.staffPinHash)).toMatch(/^scrypt\$/);
    expect(typeof member.lastLoginAt).toBe('string');

    const audit = await auditEvents(TENANT_A);
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('StaffSessionStarted');
    expect(audit[0].actorUid).toBe(USERS.staffA.uid);
    expect(audit[0].actorType).toBe('staff');
  });

  it('never persists a plaintext PIN in membership or audit data', async () => {
    await signInAs('staffA');
    await verifyPin(TENANT_A, PIN);

    const member = await readMember(TENANT_A, USERS.staffA.uid);
    expect(member).not.toHaveProperty('pin');
    expect(Object.keys(member)).not.toContain('pin');
    expect(collectValues(member)).not.toContain(PIN);

    const audit = await auditEvents(TENANT_A);
    expect(collectValues(audit)).not.toContain(PIN);

    const serialized = JSON.stringify({ member, audit });
    expect(serialized).not.toContain(`"${PIN}"`);
  });
});

describe('callableAuthStaffPinVerify: five wrong PINs lock for 15 minutes', () => {
  it('counts attempts, locks, writes one lockout audit event, and rejects the correct PIN', async () => {
    await signInAs('staffA');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failure = await captureFailure(
        pinVerifyCallable()({
          tenantId: TENANT_A,
          deviceId: 'device-cashier-01',
          pin: '000000',
        }),
      );
      expect(failure.code).toContain('permission-denied');
      expect(failure.details?.remainingAttempts).toBe(5 - attempt);
      expect(failure.details?.lockedUntil ?? null).toBeNull();
    }

    const beforeLock = Date.now();
    await expectRejection(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: '000000',
      }),
      'permission-denied',
    );
    const afterLock = Date.now();

    const member = await readMember(TENANT_A, USERS.staffA.uid);
    expect(member.pinFailedAttempts).toBe(5);
    const lockedUntil = Date.parse(String(member.pinLockedUntil));
    expect(lockedUntil).toBeGreaterThanOrEqual(beforeLock + 14 * 60_000);
    expect(lockedUntil).toBeLessThanOrEqual(afterLock + 16 * 60_000);

    const audit = await auditEvents(TENANT_A);
    expect(audit.filter((event) => event.action === 'StaffPinLocked')).toHaveLength(
      1,
    );
    expect(audit.filter((event) => event.action === 'StaffSessionStarted')).toHaveLength(
      0,
    );

    const lockedFailure = await captureFailure(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: PIN,
      }),
    );
    expect(lockedFailure.code).toContain('permission-denied');
    expect(lockedFailure.details?.remainingAttempts).toBe(0);

    const afterLockRead = await readMember(TENANT_A, USERS.staffA.uid);
    expect(afterLockRead.pinFailedAttempts).toBe(5);
    expect(
      (await auditEvents(TENANT_A)).filter(
        (event) => event.action === 'StaffPinLocked',
      ),
    ).toHaveLength(1);
  });
});

describe('callableAuthStaffPinVerify: Config drives the PIN policy', () => {
  it('follows a tenant-resolved four-digit, two-attempt policy', async () => {
    await db.doc('platform/config').set({
      values: {
        pinPolicy: {
          length: 4,
          maxFailedAttempts: 2,
          lockMinutes: 1,
          sessionHours: 2,
        },
      },
      configVersion: 1,
      updatedAt: new Date().toISOString(),
    });
    await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set(
      { staffPinHash: await hashPin('1234') },
      { merge: true },
    );

    await signInAs('staffA');

    const first = await captureFailure(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: '0000',
      }),
    );
    expect(first.details?.remainingAttempts).toBe(1);
    expect(first.details?.lockedUntil ?? null).toBeNull();

    const second = await captureFailure(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: '0000',
      }),
    );
    expect(second.details?.remainingAttempts).toBe(0);
    expect(typeof second.details?.lockedUntil).toBe('string');

    const member = await readMember(TENANT_A, USERS.staffA.uid);
    const lockedFor = Date.parse(String(member.pinLockedUntil)) - Date.now();
    expect(lockedFor).toBeGreaterThan(0);
    expect(lockedFor).toBeLessThanOrEqual(60_000 + 5_000);

    await expectRejection(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: '1234',
      }),
      'permission-denied',
    );
  });
});

describe('callableAuthStaffPinVerify: malformed and unauthorized requests', () => {
  it('rejects a malformed PIN and payload without a session or audit', async () => {
    await signInAs('staffA');

    await expectRejection(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-cashier-01',
        pin: '12',
      }),
      'invalid-argument',
    );
    await expectRejection(
      pinVerifyCallable()({ tenantId: TENANT_A, pin: PIN } as never),
      'invalid-argument',
    );
    expect(await auditEvents(TENANT_A)).toHaveLength(0);
  });

  it('rejects an inactive Staff membership without a session', async () => {
    await signInAs('staffInactive');
    await expectRejection(
      pinVerifyCallable()({
        tenantId: TENANT_A,
        deviceId: 'device-kitchen-01',
        pin: PIN,
      }),
      'permission-denied',
    );
    expect(await auditEvents(TENANT_A)).toHaveLength(0);
  });

  it('rejects a cross-tenant PIN with no membership in that Tenant', async () => {
    await signInAs('staffA');
    await expectRejection(verifyPin(TENANT_B, PIN_IN_TENANT_B), 'permission-denied');
    expect(await auditEvents(TENANT_B)).toHaveLength(0);
  });

  it('rejects an unauthenticated caller', async () => {
    await signOut(auth);
    await expectRejection(verifyPin(TENANT_A, PIN), 'unauthenticated');
  });
});

describe('callableAuthAuthorizeStaff: permission and session matrix', () => {
  it('allows a granted permission and denies a missing permission', async () => {
    await signInAs('staffA');
    const callable = authorizeCallable();

    const allowed = await callable({
      tenantId: TENANT_A,
      permission: 'order.settle',
      sessionVersion: 3,
    });
    expect(allowed.data.allowed).toBe(true);
    expect(allowed.data.reason).toBe('allowed');
    expect(allowed.data.role).toBe('cashier');

    const denied = await callable({
      tenantId: TENANT_A,
      permission: 'menu.manage',
      sessionVersion: 3,
    });
    expect(denied.data.allowed).toBe(false);
    expect(denied.data.reason).toBe('missing_permission');
  });

  it('denies a stale sessionVersion', async () => {
    await signInAs('staffA');
    const callable = authorizeCallable();

    const revoked = await callable({
      tenantId: TENANT_A,
      permission: 'order.settle',
      sessionVersion: 2,
    });
    expect(revoked.data.allowed).toBe(false);
    expect(revoked.data.reason).toBe('session_revoked');
  });

  it('denies a cross-tenant Staff operation despite the UI state', async () => {
    await signInAs('staffA');
    const decision = await authorizeCallable()({
      tenantId: TENANT_B,
      permission: 'order.settle',
      sessionVersion: 7,
    });
    expect(decision.data.allowed).toBe(false);
    expect(decision.data.reason).toBe('no_membership');
  });
});

describe('callableAuthRevokeStaffSessions: Owner session revocation', () => {
  it('increases sessionVersion, audits, and invalidates the prior session', async () => {
    await signInAs('ownerA');

    const response = await revokeCallable()({
      tenantId: TENANT_A,
      uid: USERS.staffA.uid,
    });
    expect(response.data.sessionVersion).toBe(4);

    const member = await readMember(TENANT_A, USERS.staffA.uid);
    expect(member.sessionVersion).toBe(4);
    const audit = await auditEvents(TENANT_A);
    expect(audit.some((event) => event.action === 'SessionEnded')).toBe(true);

    await signOut(auth);
    await signInAs('staffA');
    const stale = await authorizeCallable()({
      tenantId: TENANT_A,
      permission: 'order.settle',
      sessionVersion: 3,
    });
    expect(stale.data.allowed).toBe(false);
    expect(stale.data.reason).toBe('session_revoked');

    const fresh = await authorizeCallable()({
      tenantId: TENANT_A,
      permission: 'order.settle',
      sessionVersion: 4,
    });
    expect(fresh.data.allowed).toBe(true);
  });

  it('denies a non-Owner revoke request without changing sessionVersion', async () => {
    await signInAs('staffA');
    await expectRejection(
      revokeCallable()({ tenantId: TENANT_A, uid: USERS.staffA.uid }),
      'permission-denied',
    );
    const member = await readMember(TENANT_A, USERS.staffA.uid);
    expect(member.sessionVersion).toBe(3);
  });
});
