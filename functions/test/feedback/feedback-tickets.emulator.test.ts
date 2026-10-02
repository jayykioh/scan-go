/**
 * Feedback ticket Functions Emulator evidence (REQ-FDB-003).
 *
 * A ticket records state, actor, time, and reason on every change. Both the
 * create and the transition commands are Owner-only and server-written.
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

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-tickets-alpha';
const FEEDBACK_ID = 'feedback-ticket-source-1';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  owner: { uid: 'uid-owner-tickets', email: 'owner-tickets@example.com' },
  staff: { uid: 'uid-staff-tickets', email: 'staff-tickets@example.com' },
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
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A' });
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
  await db.doc(`tenants/${TENANT_A}/feedback/${FEEDBACK_ID}`).set({
    tenantId: TENANT_A,
    verificationState: 'verified',
    maskedMessage: 'ok',
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

describe('feedback ticket callables (REQ-FDB-003)', () => {
  it('records state, actor, time, and reason on every change', async () => {
    await signIn(USERS.owner.email);
    const create = httpsCallable(functions, 'callableFeedbackCreateTicket');
    const created = await create({
      tenantId: TENANT_A,
      feedbackIds: [FEEDBACK_ID],
      priority: 'high',
      reason: 'Tiếp nhận phản hồi.',
    });
    const createdTicket = (
      created.data as {
        ticket: {
          ticketId: string;
          state: string;
          history: Array<{
            at: string;
            actorUid: string;
            toState: string;
            reason: string | null;
          }>;
        };
      }
    ).ticket;
    expect(createdTicket.state).toBe('received');
    expect(createdTicket.history).toHaveLength(1);
    expect(createdTicket.history[0]).toMatchObject({
      actorUid: USERS.owner.uid,
      toState: 'received',
      reason: 'Tiếp nhận phản hồi.',
    });
    expect(createdTicket.history[0].at).toMatch(/Z$/);

    const update = httpsCallable(functions, 'callableFeedbackUpdateTicket');
    const moved = await update({
      tenantId: TENANT_A,
      ticketId: createdTicket.ticketId,
      toState: 'in_progress',
      reason: 'Đã phân công.',
    });
    const movedTicket = (
      moved.data as {
        ticket: {
          state: string;
          history: Array<{ fromState: string | null; toState: string }>;
        };
      }
    ).ticket;
    expect(movedTicket.state).toBe('in_progress');
    expect(movedTicket.history).toHaveLength(2);
    expect(movedTicket.history[1]).toMatchObject({
      fromState: 'received',
      toState: 'in_progress',
    });

    const resolved = await update({
      tenantId: TENANT_A,
      ticketId: createdTicket.ticketId,
      toState: 'resolved',
      reason: 'Đã xử lý xong.',
    });
    const resolvedTicket = (
      resolved.data as { ticket: { history: unknown[] } }
    ).ticket;
    expect(resolvedTicket.history).toHaveLength(3);
  });

  it('rejects a non-owner ticket change', async () => {
    await signIn(USERS.staff.email);
    const create = httpsCallable(functions, 'callableFeedbackCreateTicket');
    await expect(
      create({
        tenantId: TENANT_A,
        feedbackIds: [FEEDBACK_ID],
        priority: 'low',
        reason: 'Thử.',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
  });

  it('rejects a ticket that references missing feedback', async () => {
    await signIn(USERS.owner.email);
    const create = httpsCallable(functions, 'callableFeedbackCreateTicket');
    await expect(
      create({
        tenantId: TENANT_A,
        feedbackIds: ['missing-feedback'],
        priority: 'low',
        reason: 'Thử.',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('failed-precondition'),
    });
  });
});
