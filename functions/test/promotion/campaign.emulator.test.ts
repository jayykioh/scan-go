/**
 * Campaign suggestion Functions Emulator evidence (REQ-PRO-001, REQ-LOY-001,
 * NFR-SEC-003).
 *
 * AI suggests and writes only the suggestion record. No business state changes
 * until the Owner approves. Measurement reports return rate, average order
 * value, and gross profit after discount.
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
const TENANT_A = 'tenant-campaign-alpha';
const OWNER_UID = 'uid-owner-campaign';
const STAFF_UID = 'uid-staff-campaign';

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

function todayDayKey(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

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
    email: 'owner-campaign@example.com',
    password: PASSWORD,
  });
  await adminAuth.createUser({
    uid: STAFF_UID,
    email: 'staff-campaign@example.com',
    password: PASSWORD,
  });
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db
    .doc(`tenants/${TENANT_A}`)
    .set({ shopName: 'Tenant A', pricingTier: 'lite' });
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

  const now = new Date().toISOString();
  await db.doc(`tenants/${TENANT_A}/dailyStats/${todayDayKey()}`).set({
    paidOrderCount: 3,
    revenueVnd: 300000,
    costVnd: 100000,
    grossProfitVnd: 200000,
    updatedAt: now,
  });
  const orders = [
    { id: 'order-1', memberId: 'member-1' },
    { id: 'order-2', memberId: 'member-1' },
    { id: 'order-3', memberId: 'member-2' },
  ];
  for (const order of orders) {
    await db.doc(`tenants/${TENANT_A}/orders/${order.id}`).set({
      tenantId: TENANT_A,
      status: 'paid',
      loyaltyMemberId: order.memberId,
      createdAt: now,
    });
  }
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

describe('campaign suggestion and approval (REQ-PRO-001, NFR-SEC-003)', () => {
  it('does not change promotion state until the Owner approves', async () => {
    await signIn('owner-campaign@example.com');
    const suggest = httpsCallable(functions, 'callablePromotionSuggestCampaign');
    const suggested = await suggest({
      tenantId: TENANT_A,
      channel: 'promotion',
      goal: 'increaseReturnRate',
    });
    const suggestion = (
      suggested.data as { suggestion: { suggestionId: string; status: string } }
    ).suggestion;
    expect(suggestion.status).toBe('suggested');
    expect((await db.collection(`tenants/${TENANT_A}/promotions`).get()).size).toBe(
      0,
    );

    const approve = httpsCallable(functions, 'callablePromotionApproveCampaign');
    const approved = await approve({
      tenantId: TENANT_A,
      suggestionId: suggestion.suggestionId,
      idempotencyKey: 'idem-approve-0001',
    });
    expect((approved.data as { status: string }).status).toBe('approved');
    expect((await db.collection(`tenants/${TENANT_A}/promotions`).get()).size).toBe(
      1,
    );
    expect(
      (
        await db
          .doc(
            `tenants/${TENANT_A}/campaignSuggestions/${suggestion.suggestionId}`,
          )
          .get()
      ).get('status'),
    ).toBe('approved');
  });

  it('rejects a reused idempotency key for a different suggestion', async () => {
    await signIn('owner-campaign@example.com');
    const suggest = httpsCallable(functions, 'callablePromotionSuggestCampaign');
    const first = await suggest({
      tenantId: TENANT_A,
      channel: 'promotion',
      goal: 'increaseReturnRate',
    });
    const second = await suggest({
      tenantId: TENANT_A,
      channel: 'promotion',
      goal: 'increaseOrderValue',
    });
    const firstId = (first.data as { suggestion: { suggestionId: string } })
      .suggestion.suggestionId;
    const secondId = (second.data as { suggestion: { suggestionId: string } })
      .suggestion.suggestionId;

    const approve = httpsCallable(functions, 'callablePromotionApproveCampaign');
    await approve({
      tenantId: TENANT_A,
      suggestionId: firstId,
      idempotencyKey: 'idem-approve-shared-1',
    });

    // The same key with a different suggestion is a different request.
    await expect(
      approve({
        tenantId: TENANT_A,
        suggestionId: secondId,
        idempotencyKey: 'idem-approve-shared-1',
      }),
    ).rejects.toMatchObject({ code: expect.stringContaining('already-exists') });

    const secondSnap = await db
      .doc(`tenants/${TENANT_A}/campaignSuggestions/${secondId}`)
      .get();
    expect(secondSnap.get('status')).toBe('suggested');
  });

  it('measures return rate, order value, and gross profit after discount', async () => {
    await signIn('owner-campaign@example.com');
    const suggest = httpsCallable(functions, 'callablePromotionSuggestCampaign');
    const suggested = await suggest({
      tenantId: TENANT_A,
      channel: 'promotion',
      goal: 'increaseOrderValue',
    });
    const suggestionId = (
      suggested.data as { suggestion: { suggestionId: string } }
    ).suggestion.suggestionId;

    const measure = httpsCallable(functions, 'callablePromotionMeasureCampaign');
    const measured = await measure({
      tenantId: TENANT_A,
      suggestionId,
    });
    const measurement = (
      measured.data as {
        measurement: {
          averageOrderValueVnd: number;
          returnRateBps: number;
          grossProfitAfterDiscountVnd: number;
        };
      }
    ).measurement;
    expect(measurement.averageOrderValueVnd).toBe(100000);
    expect(measurement.returnRateBps).toBe(5000);
    expect(measurement.grossProfitAfterDiscountVnd).toBe(200000);
  });

  it('applies a Loyalty campaign only after approval', async () => {
    await signIn('owner-campaign@example.com');
    const suggest = httpsCallable(functions, 'callablePromotionSuggestCampaign');
    const suggested = await suggest({
      tenantId: TENANT_A,
      channel: 'loyalty',
      goal: 'increaseReturnRate',
    });
    const suggestionId = (
      suggested.data as { suggestion: { suggestionId: string } }
    ).suggestion.suggestionId;
    expect(
      (
        await db.doc(`tenants/${TENANT_A}/loyaltyConfig/current`).get()
      ).exists,
    ).toBe(false);

    const approve = httpsCallable(functions, 'callablePromotionApproveCampaign');
    await approve({
      tenantId: TENANT_A,
      suggestionId,
      idempotencyKey: 'idem-approve-loyalty-0001',
    });
    const config = await db.doc(`tenants/${TENANT_A}/loyaltyConfig/current`).get();
    expect(config.get('welcomePoints')).toBe(20);
  });

  it('denies a non-owner campaign command', async () => {
    await signIn('staff-campaign@example.com');
    const suggest = httpsCallable(functions, 'callablePromotionSuggestCampaign');
    await expect(
      suggest({
        tenantId: TENANT_A,
        channel: 'promotion',
        goal: 'increaseReturnRate',
      }),
    ).rejects.toMatchObject({
      code: expect.stringContaining('permission-denied'),
    });
  });
});
