/**
 * AI budget Functions Emulator evidence (REQ-AI-005, NFR-AI-002).
 *
 * These tests call the real `callableAiAsk` through the Functions emulator.
 * They prove the Config per-tenant monthly budget stops an over-budget call,
 * writes an audit event, and records provider, model, tokens, and integer cost
 * on an allowed call. No secret is written to `aiUsage` or the audit event.
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
import type {
  AiAskInput,
  AiAskResult,
} from '../../../shared/contracts/ai.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';
import { reserveAiBudget } from '../../src/modules/ai/service.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-ai-budget-alpha';
const TENANT_B = 'tenant-ai-budget-bravo';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-ai-budget-owner-a', email: 'ai-budget-a@example.com' },
  ownerB: { uid: 'uid-ai-budget-owner-b', email: 'ai-budget-b@example.com' },
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

  // Tenant A is already at its zero budget.
  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'AI Budget Tenant A',
    timezone: 'Asia/Ho_Chi_Minh',
    configOverrides: { ai: { monthlyBudgetVnd: 0 } },
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  // Tenant B keeps the default budget.
  await db.doc(`tenants/${TENANT_B}`).set({
    shopName: 'AI Budget Tenant B',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function aiCallable() {
  return httpsCallable<AiAskInput, AiAskResult>(functions, 'callableAiAsk');
}

describe('callableAiAsk budget enforcement (REQ-AI-005, NFR-AI-002)', () => {
  it('stops an over-budget call and records an audit event only', async () => {
    await signInAs('ownerA');
    let caught: unknown;
    try {
      await aiCallable()({ tenantId: TENANT_A, question: 'Món nào lỗ?' });
    } catch (error) {
      caught = error;
    }
    expect((caught as { code?: string }).code).toContain(
      'resource-exhausted',
    );

    const usageSnap = await db
      .collection(`tenants/${TENANT_A}/aiUsage`)
      .get();
    expect(usageSnap.size).toBe(0);

    const auditSnap = await db.collection(`tenants/${TENANT_A}/audit`).get();
    const budgetEvent = auditSnap.docs.find(
      (doc) => doc.get('action') === 'AiBudgetExceeded',
    );
    expect(budgetEvent).toBeDefined();
    expect(JSON.stringify(budgetEvent?.data())).not.toMatch(
      /AIza[0-9A-Za-z_-]{20,}/,
    );
  });

  it('records provider, model, tokens, and integer cost under budget', async () => {
    await signInAs('ownerB');
    const response = await aiCallable()({
      tenantId: TENANT_B,
      question: 'Doanh thu hôm nay?',
    });
    expect(response.data.provider).toBe('rule-based');

    const usageSnap = await db
      .collection(`tenants/${TENANT_B}/aiUsage`)
      .get();
    expect(usageSnap.size).toBe(1);
    const usage = usageSnap.docs[0].data();
    expect(usage.provider).toBe('rule-based');
    expect(usage.model).toBe('deterministic-v1');
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(Number.isInteger(usage.estimatedCostVnd)).toBe(true);
    expect(usage.monthKey).toMatch(/^\d{6}$/);
    expect(JSON.stringify(usage)).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it('reserves budget atomically so concurrent calls cannot exceed the cap', async () => {
    const monthKey = '202609';
    const now = new Date().toISOString();
    // Budget 100 and cost 30 each: at most three reservations may succeed even
    // though five run at the same time.
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        reserveAiBudget(db, {
          tenantId: TENANT_B,
          monthKey,
          monthlyBudgetVnd: 100,
          estimatedCostVnd: 30,
          now,
        }),
      ),
    );
    expect(results.filter((result) => result.reserved)).toHaveLength(3);

    const ledger = await db
      .doc(`tenants/${TENANT_B}/aiBudget/${monthKey}`)
      .get();
    expect(ledger.get('reservedVnd')).toBe(90);
    expect(ledger.get('spentVnd')).toBe(0);
  });
});
