/**
 * Product feedback Functions Emulator evidence (REQ-FDB-004, REQ-FDB-005,
 * REQ-FDB-006).
 *
 * These tests call the real callables through the Functions emulator: an active
 * member reports with a screenshot path, the server records it under the Tenant,
 * the attachment path boundary rejects a forged path, a Staff member is denied
 * the Owner inbox, and a status change appends actor, time, and reason.
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
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-product-feedback-alpha';
const TENANT_B = 'tenant-product-feedback-bravo';

const USERS = {
  owner: { uid: 'uid-pf-owner', email: 'pf-owner@example.com' },
  staff: { uid: 'uid-pf-staff', email: 'pf-staff@example.com' },
  kitchen: { uid: 'uid-pf-kitchen', email: 'pf-kitchen@example.com' },
  outsider: { uid: 'uid-pf-outsider', email: 'pf-outsider@example.com' },
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
  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Tenant B' });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.owner.uid}`).set({
    membershipType: 'owner',
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staff.uid}`).set({
    membershipType: 'staff',
    role: 'cashier',
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.kitchen.uid}`).set({
    membershipType: 'staff',
    role: 'kitchen',
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.outsider.uid}`).set({
    membershipType: 'owner',
    isActive: true,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

const submit = () => httpsCallable(functions, 'callableProductFeedbackSubmit');
const list = () => httpsCallable(functions, 'callableProductFeedbackList');
const setStatus = () =>
  httpsCallable(functions, 'callableProductFeedbackSetStatus');

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
  expect((caught as { code?: string }).code ?? '').toContain(codeFragment);
}

const VALID_MESSAGE =
  'Bảng giá vốn khó đọc trên màn hình điện thoại, chữ bị cắt ở cột thứ ba.';

describe('callableProductFeedbackSubmit (REQ-FDB-004, REQ-FDB-005)', () => {
  it('records a tenant-scoped report with the derived reporter role', async () => {
    await signIn(USERS.kitchen.email);
    const response = await submit()({
      tenantId: TENANT_A,
      category: 'bug',
      severity: 'high',
      message: VALID_MESSAGE,
      screenContext: '/simulator/kitchen',
    });

    expect(response.data.tenantId).toBe(TENANT_A);
    expect(response.data.status).toBe('received');
    expect(response.data.attachmentCount).toBe(0);

    const stored = await db
      .doc(`tenants/${TENANT_A}/productFeedback/${response.data.feedbackId}`)
      .get();
    expect(stored.get('tenantId')).toBe(TENANT_A);
    expect(stored.get('actorUid')).toBe(USERS.kitchen.uid);
    expect(stored.get('actorRole')).toBe('kitchen');
    expect(stored.get('history')).toHaveLength(1);
  });

  it('records an attachment inside the reporter prefix', async () => {
    await signIn(USERS.owner.email);
    const storagePath = `tenants/${TENANT_A}/feedbackAttachments/${USERS.owner.uid}/shot-1.png`;
    const response = await submit()({
      tenantId: TENANT_A,
      category: 'ux',
      severity: 'medium',
      message: VALID_MESSAGE,
      attachments: [
        { storagePath, contentType: 'image/png', sizeBytes: 4096 },
      ],
    });

    expect(response.data.attachmentCount).toBe(1);
    const stored = await db
      .doc(`tenants/${TENANT_A}/productFeedback/${response.data.feedbackId}`)
      .get();
    expect(stored.get('attachments')).toEqual([
      { storagePath, contentType: 'image/png', sizeBytes: 4096 },
    ]);
  });

  it('rejects a forged attachment path in another tenant or another uid', async () => {
    await signIn(USERS.owner.email);
    for (const storagePath of [
      `tenants/${TENANT_B}/feedbackAttachments/${USERS.owner.uid}/shot.png`,
      `tenants/${TENANT_A}/feedbackAttachments/${USERS.staff.uid}/shot.png`,
    ]) {
      await expectRejection(
        submit()({
          tenantId: TENANT_A,
          category: 'bug',
          severity: 'low',
          message: VALID_MESSAGE,
          attachments: [
            { storagePath, contentType: 'image/png', sizeBytes: 1024 },
          ],
        }),
        'permission-denied',
      );
    }
  });

  it('rejects a traversal or nested file name inside the correct prefix', async () => {
    await signIn(USERS.owner.email);
    for (const storagePath of [
      `tenants/${TENANT_A}/feedbackAttachments/${USERS.owner.uid}/../escape.png`,
      `tenants/${TENANT_A}/feedbackAttachments/${USERS.owner.uid}/nested/shot.png`,
    ]) {
      await expectRejection(
        submit()({
          tenantId: TENANT_A,
          category: 'bug',
          severity: 'low',
          message: VALID_MESSAGE,
          attachments: [
            { storagePath, contentType: 'image/png', sizeBytes: 1024 },
          ],
        }),
        'invalid-argument',
      );
    }
  });

  it('rejects an anonymous caller and a non-member', async () => {
    await expectRejection(
      submit()({
        tenantId: TENANT_A,
        category: 'bug',
        severity: 'low',
        message: VALID_MESSAGE,
      }),
      'unauthenticated',
    );

    await signIn(USERS.outsider.email);
    await expectRejection(
      submit()({
        tenantId: TENANT_A,
        category: 'bug',
        severity: 'low',
        message: VALID_MESSAGE,
      }),
      'permission-denied',
    );
  });

  it('rejects a message that is too short', async () => {
    await signIn(USERS.owner.email);
    await expectRejection(
      submit()({
        tenantId: TENANT_A,
        category: 'bug',
        severity: 'low',
        message: 'lỗi',
      }),
      'invalid-argument',
    );
  });
});

describe('callableProductFeedbackList (REQ-FDB-006)', () => {
  it('returns the tenant reports to an Owner and hides them from Staff', async () => {
    await signIn(USERS.staff.email);
    await submit()({
      tenantId: TENANT_A,
      category: 'feature',
      severity: 'medium',
      message: VALID_MESSAGE,
    });
    await signOut(auth);

    await signIn(USERS.owner.email);
    const ownerView = await list()({ tenantId: TENANT_A, limit: 10 });
    expect(ownerView.data.items).toHaveLength(1);
    expect(ownerView.data.items[0].actorRole).toBe('cashier');
    await signOut(auth);

    await signIn(USERS.staff.email);
    await expectRejection(
      list()({ tenantId: TENANT_A, limit: 10 }),
      'permission-denied',
    );
  });

  it('never returns another tenant reports', async () => {
    await signIn(USERS.owner.email);
    await submit()({
      tenantId: TENANT_A,
      category: 'other',
      severity: 'low',
      message: VALID_MESSAGE,
    });
    await signOut(auth);

    await signIn(USERS.outsider.email);
    const otherView = await list()({ tenantId: TENANT_B, limit: 10 });
    expect(otherView.data.items).toHaveLength(0);
  });
});

describe('callableProductFeedbackSetStatus (REQ-FDB-006)', () => {
  it('appends actor, time, and reason and keeps the earlier history', async () => {
    await signIn(USERS.owner.email);
    const created = await submit()({
      tenantId: TENANT_A,
      category: 'bug',
      severity: 'critical',
      message: VALID_MESSAGE,
    });

    const moved = await setStatus()({
      tenantId: TENANT_A,
      feedbackId: created.data.feedbackId,
      toStatus: 'resolved',
      reason: 'Đã sửa trong bản 1.1.',
    });

    const record = moved.data.record as {
      status: string;
      history: Array<{
        actorUid: string;
        fromStatus: string | null;
        toStatus: string;
        reason: string | null;
        at: string;
      }>;
    };
    expect(record.status).toBe('resolved');
    expect(record.history).toHaveLength(2);
    expect(record.history[1]).toMatchObject({
      actorUid: USERS.owner.uid,
      fromStatus: 'received',
      toStatus: 'resolved',
      reason: 'Đã sửa trong bản 1.1.',
    });
    expect(record.history[1].at).toMatch(/Z$/);
  });

  it('denies a Staff member and rejects a change without a reason', async () => {
    await signIn(USERS.owner.email);
    const created = await submit()({
      tenantId: TENANT_A,
      category: 'ux',
      severity: 'low',
      message: VALID_MESSAGE,
    });
    await signOut(auth);

    await signIn(USERS.staff.email);
    await expectRejection(
      setStatus()({
        tenantId: TENANT_A,
        feedbackId: created.data.feedbackId,
        toStatus: 'resolved',
        reason: 'tự xử lý',
      }),
      'permission-denied',
    );

    await signOut(auth);
    await signIn(USERS.owner.email);
    await expectRejection(
      setStatus()({
        tenantId: TENANT_A,
        feedbackId: created.data.feedbackId,
        toStatus: 'resolved',
        reason: '',
      }),
      'invalid-argument',
    );
  });
});
