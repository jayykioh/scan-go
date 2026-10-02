/**
 * M3/P2 Loyalty Functions Emulator evidence (REQ-LOY-001, NFR-PRIV-001).
 *
 * Covers idempotent earn/redeem/reversal, verified-phone redemption, and
 * server-enforced phone visibility for each role.
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
import { hashLoyaltyVerificationCode } from '../../src/modules/loyalty/service.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';
const TENANT_A = 'tenant-alpha';
const MEMBER_ID = 'member_84901234567';
const NOW = '2026-09-12T05:00:00.000Z';

const REGION = 'us-central1';
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  owner: { uid: 'uid-owner-loy', email: 'owner-loy@example.com' },
  cashier: { uid: 'uid-cashier-loy', email: 'cashier-loy@example.com' },
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

async function seedMember(overrides: Record<string, unknown> = {}): Promise<void> {
  await db.doc(`tenants/${TENANT_A}/loyaltyMembers/${MEMBER_ID}`).set({
    schemaVersion: 1,
    memberId: MEMBER_ID,
    tenantId: TENANT_A,
    phone: '+84901234567',
    displayName: 'Khách A',
    isVerified: true,
    pointBalance: 0,
    paidTotalVnd: 0,
    visitCount: 0,
    verificationCodeHash: null,
    verificationExpiresAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });
}

beforeEach(async () => {
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
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Tenant A', pricingTier: 'lite' });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.owner.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    permissions: ['customer.phone.read'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.cashier.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    permissions: [],
    isActive: true,
  });
});

afterEach(async () => {
  await signOut(auth).catch(() => undefined);
});

async function signIn(email: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email, PASSWORD);
}

describe('loyalty callables', () => {
  it('registers once per normalized phone and verifies the issued code', async () => {
    await seedMember({
      isVerified: false,
      verificationCodeHash: hashLoyaltyVerificationCode('123456'),
      verificationExpiresAt: '2030-01-01T00:00:00.000Z',
    });
    await signIn(USERS.owner.email);

    const register = httpsCallable(functions, 'callableLoyaltyRegisterMember');
    const first = await register({
      tenantId: TENANT_A,
      phone: '0901234567',
      displayName: 'Khách A',
      idempotencyKey: 'idem-register-0001',
    });
    const retry = await register({
      tenantId: TENANT_A,
      phone: '0901234567',
      displayName: 'Khách A',
      idempotencyKey: 'idem-register-0001',
    });
    expect((first.data as { status: string }).status).toBe('replayed');
    expect((retry.data as { member: { memberId: string } }).member.memberId).toBe(
      MEMBER_ID,
    );

    const verify = httpsCallable(functions, 'callableLoyaltyVerifyMember');
    const verified = await verify({
      tenantId: TENANT_A,
      memberId: MEMBER_ID,
      code: '123456',
    });
    expect((verified.data as { status: string }).status).toBe('verified');
    expect(
      (await db.doc(`tenants/${TENANT_A}/loyaltyMembers/${MEMBER_ID}`).get()).get(
        'verificationCodeHash',
      ),
    ).toBeNull();
  });

  it('earns points once per order and redeems from a verified member', async () => {
    await seedMember();
    await signIn(USERS.cashier.email);

    const earn = httpsCallable(functions, 'callableLoyaltyEarnPoints');
    const first = await earn({
      tenantId: TENANT_A,
      orderId: 'order-1',
      memberId: MEMBER_ID,
      amountVnd: 25000,
      idempotencyKey: 'idem-earn-0001',
    });
    const retry = await earn({
      tenantId: TENANT_A,
      orderId: 'order-1',
      memberId: MEMBER_ID,
      amountVnd: 25000,
      idempotencyKey: 'idem-earn-0001',
    });
    expect((first.data as { transaction: { points: number } }).transaction.points).toBe(2);
    expect((retry.data as { status: string }).status).toBe('replayed');
    const transactions = await db
      .collection(`tenants/${TENANT_A}/loyaltyTransactions`)
      .get();
    expect(transactions.size).toBe(1);
    expect(
      (await db.doc(`tenants/${TENANT_A}/loyaltyMembers/${MEMBER_ID}`).get()).get(
        'pointBalance',
      ),
    ).toBe(2);

    const redeem = httpsCallable(functions, 'callableLoyaltyRedeemPoints');
    const redeemed = await redeem({
      tenantId: TENANT_A,
      memberId: MEMBER_ID,
      points: 1,
      orderId: 'order-2',
      idempotencyKey: 'idem-redeem-0001',
    });
    expect(
      (redeemed.data as { member: { pointBalance: number } }).member.pointBalance,
    ).toBe(1);
    await expect(
      redeem({
        tenantId: TENANT_A,
        memberId: MEMBER_ID,
        points: 5,
        orderId: null,
        idempotencyKey: 'idem-redeem-0002',
      }),
    ).rejects.toMatchObject({ code: expect.stringContaining('failed-precondition') });
  });

  it('rejects a reused idempotency key with a different request hash', async () => {
    await seedMember();
    await signIn(USERS.cashier.email);

    const earn = httpsCallable(functions, 'callableLoyaltyEarnPoints');
    await earn({
      tenantId: TENANT_A,
      orderId: 'order-mismatch',
      memberId: MEMBER_ID,
      amountVnd: 25000,
      idempotencyKey: 'idem-earn-match-1',
    });

    // Same deterministic ledger id (same order) but a different amount is a
    // different request and must not replay the first transaction.
    await expect(
      earn({
        tenantId: TENANT_A,
        orderId: 'order-mismatch',
        memberId: MEMBER_ID,
        amountVnd: 30000,
        idempotencyKey: 'idem-earn-match-2',
      }),
    ).rejects.toMatchObject({ code: expect.stringContaining('already-exists') });

    const transactions = await db
      .collection(`tenants/${TENANT_A}/loyaltyTransactions`)
      .get();
    expect(transactions.size).toBe(1);
  });

  it('reverses the earn effect after a refund', async () => {
    await seedMember({ pointBalance: 2 });
    await signIn(USERS.owner.email);
    const earn = httpsCallable(functions, 'callableLoyaltyEarnPoints');
    await earn({
      tenantId: TENANT_A,
      orderId: 'order-9',
      memberId: MEMBER_ID,
      amountVnd: 20000,
      idempotencyKey: 'idem-earn-0009',
    });
    const reverse = httpsCallable(functions, 'callableLoyaltyReversePoints');
    const reversed = await reverse({
      tenantId: TENANT_A,
      orderId: 'order-9',
      memberId: MEMBER_ID,
      reason: 'refund',
      idempotencyKey: 'idem-reverse-0009',
    });
    expect(
      (reversed.data as { transaction: { points: number; kind: string } }).transaction
        .kind,
    ).toBe('reverse');
    expect(
      (reversed.data as { member: { pointBalance: number } }).member.pointBalance,
    ).toBe(2);
  });

  it('hides the phone without the permission and shows it with the permission', async () => {
    await seedMember();
    const list = httpsCallable(functions, 'callableLoyaltyListMembers');

    await signIn(USERS.cashier.email);
    const hidden = await list({ tenantId: TENANT_A });
    expect(
      (hidden.data as { members: Array<{ phone: string | null; phoneVisible: boolean }> })
        .members[0],
    ).toMatchObject({ phone: null, phoneVisible: false });

    await signOut(auth);
    await signIn(USERS.owner.email);
    const visible = await list({ tenantId: TENANT_A });
    expect(
      (visible.data as { members: Array<{ phone: string | null; phoneVisible: boolean }> })
        .members[0],
    ).toMatchObject({ phone: '+84901234567', phoneVisible: true });
  });
});
