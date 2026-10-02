/**
 * Workforce Functions Emulator evidence (REQ-HRM-001, REQ-HRM-002,
 * REQ-HRM-003).
 *
 * Proves server-side Shift overlap rejection, clock in/out, correction
 * approval by an authorized user, and that attendance review produces no
 * payroll figure.
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
const TENANT_A = 'tenant-workforce-alpha';
const STAFF_UID = 'uid-staff-workforce';
const OWNER_UID = 'uid-owner-workforce';
const DAY = '20260914';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

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
  await adminAuth.createUser({
    uid: OWNER_UID,
    email: 'owner-workforce@example.com',
    password: PASSWORD,
  });
  await adminAuth.createUser({
    uid: STAFF_UID,
    email: 'staff-workforce@example.com',
    password: PASSWORD,
  });
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
  await db.doc(`tenants/${TENANT_A}/members/${OWNER_UID}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${STAFF_UID}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

describe('workforce shift scheduling (REQ-HRM-001)', () => {
  it('rejects an overlapping shift and keeps only one record', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    await schedule({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      date: DAY,
      startAt: '2026-09-14T01:00:00.000Z',
      endAt: '2026-09-14T05:00:00.000Z',
    });
    await expect(
      schedule({
        tenantId: TENANT_A,
        staffUid: STAFF_UID,
        date: DAY,
        startAt: '2026-09-14T04:00:00.000Z',
        endAt: '2026-09-14T08:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
    const shifts = await db.collection(`tenants/${TENANT_A}/shifts`).get();
    expect(shifts.size).toBe(1);

    await schedule({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      date: DAY,
      startAt: '2026-09-14T05:00:00.000Z',
      endAt: '2026-09-14T09:00:00.000Z',
    });
    expect((await db.collection(`tenants/${TENANT_A}/shifts`).get()).size).toBe(2);
  });
});

describe('workforce attendance correction (REQ-HRM-002, REQ-HRM-003)', () => {
  it('keeps a correction pending until an owner approves and keeps history', async () => {
    await signIn('staff-workforce@example.com');
    const clockIn = httpsCallable(functions, 'callableWorkforceClockIn');
    const clocked = await clockIn({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      shiftId: null,
      clockInAt: '2026-09-14T01:00:00.000Z',
    });
    const attendanceId = (
      clocked.data as { attendance: { attendanceId: string } }
    ).attendance.attendanceId;

    const clockOut = httpsCallable(functions, 'callableWorkforceClockOut');
    await clockOut({
      tenantId: TENANT_A,
      attendanceId,
      clockOutAt: '2026-09-14T09:00:00.000Z',
    });

    const requestCorrection = httpsCallable(
      functions,
      'callableWorkforceRequestCorrection',
    );
    const requested = await requestCorrection({
      tenantId: TENANT_A,
      attendanceId,
      requestedClockInAt: '2026-09-14T01:15:00.000Z',
      reason: 'Nhập sai giờ vào ca.',
    });
    expect(
      (requested.data as { attendance: { correctionState: string } }).attendance
        .correctionState,
    ).toBe('pending');

    const approve = httpsCallable(
      functions,
      'callableWorkforceApproveCorrection',
    );
    await expect(
      approve({ tenantId: TENANT_A, attendanceId }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });

    await signOut(auth);
    await signIn('owner-workforce@example.com');
    const approved = await approve({ tenantId: TENANT_A, attendanceId });
    const attendance = (
      approved.data as {
        attendance: {
          correctionState: string;
          clockInAt: string;
          history: unknown[];
        };
      }
    ).attendance;
    expect(attendance.correctionState).toBe('approved');
    expect(attendance.clockInAt).toBe('2026-09-14T01:15:00.000Z');
    expect(attendance.history).toHaveLength(4);

    const summary = httpsCallable(
      functions,
      'callableWorkforceGetAttendanceSummary',
    );
    const result = await summary({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      fromDay: DAY,
      toDay: DAY,
    });
    expect((result.data as { workedMinutes: number }).workedMinutes).toBe(465);
    expect(JSON.stringify(result.data)).not.toMatch(/salary|wage|payroll/i);
  });
});
