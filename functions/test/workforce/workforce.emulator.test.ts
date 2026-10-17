/**
 * Workforce Functions Emulator evidence (REQ-HRM-001 .. REQ-HRM-005).
 *
 * Proves server-side Shift overlap rejection for a whole batch, Owner-only
 * planning and cancellation, clock in/out against an assigned Shift with
 * server time, correction approval by an authorized user, and that attendance
 * review produces no payroll figure.
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
  type QuerySnapshot,
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
const STAFF_B_UID = 'uid-staff-b-workforce';
const OWNER_UID = 'uid-owner-workforce';
const DAY = '20260914';
const MORNING = {
  startAt: '2026-09-14T01:00:00.000Z',
  endAt: '2026-09-14T05:00:00.000Z',
};

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
  await adminAuth.createUser({
    uid: STAFF_B_UID,
    email: 'staff-b-workforce@example.com',
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
  await db.doc(`tenants/${TENANT_A}/members/${STAFF_B_UID}`).set({
    membershipType: 'staff',
    roles: ['waiter'],
    isActive: true,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

async function shifts(): Promise<QuerySnapshot> {
  return db.collection(`tenants/${TENANT_A}/shifts`).get();
}

/** One Shift document for a Staff member, as the Owner command wrote it. */
async function shiftIdFor(staffUid: string): Promise<string> {
  const snapshot = await db
    .collection(`tenants/${TENANT_A}/shifts`)
    .where('staffUid', '==', staffUid)
    .limit(1)
    .get();
  return snapshot.docs[0].id;
}

describe('workforce shift planning (REQ-HRM-001, REQ-HRM-004)', () => {
  it('plans one interval for two Staff members in one save', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    const result = await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID, STAFF_B_UID],
      date: DAY,
      ...MORNING,
      label: 'Ca sáng',
    });
    const planned = (result.data as { shifts: Array<{ label: string }> }).shifts;
    expect(planned).toHaveLength(2);
    expect(planned[0].label).toBe('Ca sáng');
    expect((await shifts()).size).toBe(2);
  });

  it('rejects the whole batch when any Staff member already overlaps', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID],
      date: DAY,
      ...MORNING,
    });

    await expect(
      schedule({
        tenantId: TENANT_A,
        staffUids: [STAFF_B_UID, STAFF_UID],
        date: DAY,
        startAt: '2026-09-14T04:00:00.000Z',
        endAt: '2026-09-14T08:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
    // Nothing from the rejected batch landed, not even the free Staff member.
    expect((await shifts()).size).toBe(1);
  });

  it('lets a second Shift touch the first and refuses one inside it', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID],
      date: DAY,
      ...MORNING,
    });
    await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID],
      date: DAY,
      startAt: MORNING.endAt,
      endAt: '2026-09-14T09:00:00.000Z',
    });
    expect((await shifts()).size).toBe(2);

    await expect(
      schedule({
        tenantId: TENANT_A,
        staffUids: [STAFF_UID],
        date: DAY,
        startAt: '2026-09-14T02:00:00.000Z',
        endAt: '2026-09-14T03:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
  });

  it('cancels a planned Shift but keeps one that already has attendance', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID, STAFF_B_UID],
      date: DAY,
      ...MORNING,
    });
    const cancel = httpsCallable(functions, 'callableWorkforceCancelShift');
    const freeShiftId = await shiftIdFor(STAFF_B_UID);
    await cancel({ tenantId: TENANT_A, shiftId: freeShiftId });
    expect((await shifts()).size).toBe(1);

    const workedShiftId = await shiftIdFor(STAFF_UID);
    await signOut(auth);
    await signIn('staff-workforce@example.com');
    await httpsCallable(functions, 'callableWorkforceClockIn')({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      shiftId: workedShiftId,
    });
    await signOut(auth);
    await signIn('owner-workforce@example.com');
    await expect(
      cancel({ tenantId: TENANT_A, shiftId: workedShiftId }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
    expect((await shifts()).size).toBe(1);
  });

  it('refuses a Staff member who tries to plan or cancel a Shift', async () => {
    await signIn('owner-workforce@example.com');
    const schedule = httpsCallable(functions, 'callableWorkforceScheduleShift');
    await schedule({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID],
      date: DAY,
      ...MORNING,
    });
    const shiftId = await shiftIdFor(STAFF_UID);

    await signOut(auth);
    await signIn('staff-workforce@example.com');
    await expect(
      schedule({
        tenantId: TENANT_A,
        staffUids: [STAFF_UID],
        date: '20260915',
        startAt: '2026-09-15T01:00:00.000Z',
        endAt: '2026-09-15T05:00:00.000Z',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
    await expect(
      httpsCallable(functions, 'callableWorkforceCancelShift')({
        tenantId: TENANT_A,
        shiftId,
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
    expect((await shifts()).size).toBe(1);
  });
});

describe('workforce shift attendance (REQ-HRM-005)', () => {
  /** Owner plans one Shift for one Staff member and returns its id. */
  async function planOne(staffUid: string, startAt = MORNING.startAt): Promise<string> {
    await signIn('owner-workforce@example.com');
    await httpsCallable(functions, 'callableWorkforceScheduleShift')({
      tenantId: TENANT_A,
      staffUids: [staffUid],
      date: DAY,
      startAt,
      endAt: MORNING.endAt,
    });
    const shiftId = await shiftIdFor(staffUid);
    await signOut(auth);
    return shiftId;
  }

  it('stamps server time and keys the record to the accepted Shift', async () => {
    const shiftId = await planOne(STAFF_UID);
    await signIn('staff-workforce@example.com');
    const before = Date.now();
    const clockIn = httpsCallable(functions, 'callableWorkforceClockIn');
    const result = await clockIn({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      shiftId,
    });
    const attendance = (
      result.data as {
        status: string;
        attendance: { attendanceId: string; clockInAt: string; shiftId: string };
      }
    ).attendance;
    expect((result.data as { status: string }).status).toBe('applied');
    expect(attendance.attendanceId).toBe(`attendance_${STAFF_UID}_${shiftId}`);
    expect(attendance.shiftId).toBe(shiftId);
    const stamped = Date.parse(attendance.clockInAt);
    expect(stamped).toBeGreaterThanOrEqual(before - 1_000);
    expect(stamped).toBeLessThanOrEqual(Date.now() + 1_000);

    // "Nhận ca" twice is a replay of the same record, not a second one.
    const replayed = await clockIn({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      shiftId,
    });
    expect((replayed.data as { status: string }).status).toBe('replayed');
    expect(
      (await db.collection(`tenants/${TENANT_A}/attendance`).get()).size,
    ).toBe(1);
  });

  it('refuses another Staff member\'s Shift and a second open record', async () => {
    const shiftId = await planOne(STAFF_UID);
    await signIn('staff-b-workforce@example.com');
    const clockIn = httpsCallable(functions, 'callableWorkforceClockIn');
    await expect(
      clockIn({ tenantId: TENANT_A, staffUid: STAFF_B_UID, shiftId }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
    await expect(
      clockIn({ tenantId: TENANT_A, staffUid: STAFF_UID, shiftId }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });

    await signIn('staff-workforce@example.com');
    await clockIn({ tenantId: TENANT_A, staffUid: STAFF_UID, shiftId });
    await expect(
      clockIn({ tenantId: TENANT_A, staffUid: STAFF_UID, shiftId: null }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
  });

  it('counts worked minutes from the server clock and carries no payroll', async () => {
    const shiftId = await planOne(STAFF_UID);
    await signIn('staff-workforce@example.com');
    const clockIn = httpsCallable(functions, 'callableWorkforceClockIn');
    const clocked = await clockIn({
      tenantId: TENANT_A,
      staffUid: STAFF_UID,
      shiftId,
    });
    const attendanceId = (
      clocked.data as { attendance: { attendanceId: string } }
    ).attendance.attendanceId;

    const clockOut = httpsCallable(functions, 'callableWorkforceClockOut');
    const closed = await clockOut({ tenantId: TENANT_A, attendanceId });
    const attendance = (
      closed.data as {
        attendance: { clockOutAt: string; history: Array<{ actorUid: string }> };
      }
    ).attendance;
    expect(attendance.clockOutAt).not.toBeNull();
    expect(attendance.history.at(-1)?.actorUid).toBe(STAFF_UID);
    expect(JSON.stringify(closed.data)).not.toMatch(/salary|wage|payroll/i);

    await expect(
      clockOut({ tenantId: TENANT_A, attendanceId }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
  });
});

describe('workforce attendance correction (REQ-HRM-002, REQ-HRM-003)', () => {
  it('keeps a correction pending until an owner approves and keeps history', async () => {
    await signIn('owner-workforce@example.com');
    await httpsCallable(functions, 'callableWorkforceScheduleShift')({
      tenantId: TENANT_A,
      staffUids: [STAFF_UID],
      date: DAY,
      ...MORNING,
    });
    const shiftId = await shiftIdFor(STAFF_UID);

    await signOut(auth);
    await signIn('staff-workforce@example.com');
    const clocked = await httpsCallable(
      functions,
      'callableWorkforceClockIn',
    )({ tenantId: TENANT_A, staffUid: STAFF_UID, shiftId });
    const attendanceId = (
      clocked.data as { attendance: { attendanceId: string } }
    ).attendance.attendanceId;
    // Clocked in and straight out: the server clock gives a zero-minute day,
    // which is exactly what the correction below replaces.
    await httpsCallable(functions, 'callableWorkforceClockOut')({
      tenantId: TENANT_A,
      attendanceId,
    });

    const requestCorrection = httpsCallable(
      functions,
      'callableWorkforceRequestCorrection',
    );
    const requested = await requestCorrection({
      tenantId: TENANT_A,
      attendanceId,
      requestedClockInAt: '2026-09-14T01:00:00.000Z',
      requestedClockOutAt: '2026-09-14T09:00:00.000Z',
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
          clockOutAt: string;
          history: unknown[];
        };
      }
    ).attendance;
    expect(attendance.correctionState).toBe('approved');
    expect(attendance.clockInAt).toBe('2026-09-14T01:00:00.000Z');
    expect(attendance.clockOutAt).toBe('2026-09-14T09:00:00.000Z');
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
    expect((result.data as { workedMinutes: number }).workedMinutes).toBe(480);
    expect(JSON.stringify(result.data)).not.toMatch(/salary|wage|payroll/i);
  });
});
