/**
 * Customer feedback Functions Emulator evidence (REQ-FDB-001, NFR-SEC-002,
 * NFR-PRIV-002).
 *
 * These tests call the real `callableFeedbackSubmit` through the Functions
 * emulator as an unauthenticated Customer. They prove server verification
 * against a matching Order, tenant scoping through the opaque tracking token,
 * and personal-data minimization.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import {
  afterAll,
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
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
  type Functions,
} from 'firebase/functions';
import type {
  FeedbackSubmitInput,
  FeedbackSubmitResult,
} from '../../../shared/contracts/feedback.contract.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-feedback-alpha';
const TENANT_B = 'tenant-feedback-bravo';
const ORDER_A = 'order-feedback-a';
const ORDER_B = 'order-feedback-b';
const TRACKING_A = 'tracking-feedback-a';
const TRACKING_B = 'tracking-feedback-b';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;

let adminApp: AdminApp;
let db: Firestore;

let clientApp: FirebaseApp;
let functions: Functions;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);

  clientApp =
    getClientApps().length > 0
      ? getClientApps()[0]
      : initializeClientApp({
          projectId: PROJECT_ID,
          apiKey: 'demo-api-key',
          appId: '1:demo:web:demo',
        });
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

async function resetEmulators(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('publicOrderTracking'));
}

async function seedEmulators(): Promise<void> {
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Feedback Tenant A' });
  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Feedback Tenant B' });

  await db.doc(`tenants/${TENANT_A}/orders/${ORDER_A}`).set({
    orderId: ORDER_A,
    tenantId: TENANT_A,
    status: 'paid',
  });
  await db.doc(`tenants/${TENANT_B}/orders/${ORDER_B}`).set({
    orderId: ORDER_B,
    tenantId: TENANT_B,
    status: 'paid',
  });

  await db.doc(`publicOrderTracking/${TRACKING_A}`).set({
    tenantId: TENANT_A,
    orderId: ORDER_A,
    trackingToken: TRACKING_A,
  });
  await db.doc(`publicOrderTracking/${TRACKING_B}`).set({
    tenantId: TENANT_B,
    orderId: ORDER_B,
    trackingToken: TRACKING_B,
  });
}

function feedbackCallable() {
  return httpsCallable<FeedbackSubmitInput, FeedbackSubmitResult>(
    functions,
    'callableFeedbackSubmit',
  );
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

describe('callableFeedbackSubmit (REQ-FDB-001)', () => {
  it('marks a submission verified only when the tracking Order matches', async () => {
    const response = await feedbackCallable()({
      tenantId: TENANT_A,
      trackingToken: TRACKING_A,
      kind: 'review',
      rating: 5,
      message: 'Món ăn ngon.',
    });
    expect(response.data.verificationState).toBe('verified');
    expect('message' in response.data).toBe(false);

    const stored = await db
      .doc(`tenants/${TENANT_A}/feedback/${response.data.feedbackId}`)
      .get();
    expect(stored.get('tenantId')).toBe(TENANT_A);
    expect(stored.get('orderId')).toBe(ORDER_A);
    expect(stored.get('verificationState')).toBe('verified');
  });

  it('stores a dangling Order reference as unverified with no link', async () => {
    const response = await feedbackCallable()({
      tenantId: TENANT_A,
      orderId: 'order-does-not-exist',
      kind: 'issue',
      message: 'Thiếu dụng cụ.',
    });
    expect(response.data.verificationState).toBe('unverified');

    const stored = await db
      .doc(`tenants/${TENANT_A}/feedback/${response.data.feedbackId}`)
      .get();
    expect(stored.get('verificationState')).toBe('unverified');
    expect(stored.get('orderId')).toBeNull();
  });

  it('rejects a tracking token from another tenant', async () => {
    await expectRejection(
      feedbackCallable()({
        tenantId: TENANT_A,
        trackingToken: TRACKING_B,
        kind: 'review',
        rating: 4,
      }),
      'permission-denied',
    );
  });

  it('masks personal data in the analysis text and keeps raw text private', async () => {
    const response = await feedbackCallable()({
      tenantId: TENANT_A,
      kind: 'issue',
      message: 'Gọi 0912345678 hoặc an@example.com gấp.',
    });
    const stored = await db
      .doc(`tenants/${TENANT_A}/feedback/${response.data.feedbackId}`)
      .get();
    expect(stored.get('maskedMessage')).toBe(
      'Gọi [redacted] hoặc [redacted] gấp.',
    );
    // The raw text is retained for the permission-controlled Owner view only.
    expect(stored.get('message')).toBe('Gọi 0912345678 hoặc an@example.com gấp.');
    expect(JSON.stringify(response.data)).not.toContain('0912345678');
  });

  it('rejects a malformed or identity-bearing submission', async () => {
    await expectRejection(
      feedbackCallable()({
        tenantId: TENANT_A,
        kind: 'issue',
      } as unknown as FeedbackSubmitInput),
      'invalid-argument',
    );
    await expectRejection(
      feedbackCallable()({
        tenantId: TENANT_A,
        kind: 'issue',
        message: 'ok',
        phone: '0912345678',
      } as unknown as FeedbackSubmitInput),
      'invalid-argument',
    );
  });
});
