/**
 * AI baseline Functions Emulator evidence (REQ-AI-001, NFR-AI-001,
 * NFR-PRIV-002, NFR-SEC-003).
 *
 * These tests call the real `callableAiAsk` through the Functions emulator. They
 * prove the assistant is Owner-scoped and read-only: it assembles a bounded
 * context from authorized tenant data, cites sources, warns on missing data,
 * records only an `aiUsage` accounting document, and never changes business
 * state.
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
  AiFeedbackGroupingInput,
  AiFeedbackGroupingResult,
  AiWeeklyAnalysisInput,
  AiWeeklyAnalysisResult,
} from '../../../shared/contracts/ai.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const PASSWORD = 'password123';

const TENANT_A = 'tenant-ai-alpha';
const TENANT_B = 'tenant-ai-bravo';
const DAY_KEY = '20260912';
const ORDER_ID = 'order-ai-001';
const PAYMENT_ID = 'payment-ai-001';

const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;
const AUTH_EMULATOR_URL = 'http://127.0.0.1:9099';

const USERS = {
  ownerA: { uid: 'uid-ai-owner-a', email: 'ai-owner-a@example.com' },
  staffA: { uid: 'uid-ai-staff-a', email: 'ai-staff-a@example.com' },
  ownerB: { uid: 'uid-ai-owner-b', email: 'ai-owner-b@example.com' },
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

const CREATED_AT = '2026-09-12T02:00:00.000Z';

async function seedEmulators(): Promise<void> {
  for (const user of Object.values(USERS)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      password: PASSWORD,
    });
  }

  await db.doc(`tenants/${TENANT_A}`).set({
    shopName: 'AI Tenant A',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.ownerA.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });
  await db.doc(`tenants/${TENANT_A}/members/${USERS.staffA.uid}`).set({
    membershipType: 'staff',
    roles: ['cashier'],
    isActive: true,
  });

  await db.doc(`tenants/${TENANT_B}`).set({
    shopName: 'AI Tenant B',
    timezone: 'Asia/Ho_Chi_Minh',
  });
  await db.doc(`tenants/${TENANT_B}/members/${USERS.ownerB.uid}`).set({
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
  });

  // Aggregated Reporting output the AI may read.
  const dayRef = db.doc(`tenants/${TENANT_A}/dailyStats/${DAY_KEY}`);
  await dayRef.set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: DAY_KEY,
    createdOrderCount: 3,
    cancelledOrderCount: 1,
    paidOrderCount: 2,
    reversedOrderCount: 0,
    refundedOrderCount: 0,
    revenueVnd: 200000,
    costVnd: 88000,
    grossProfitVnd: 112000,
    reversedVnd: 0,
    refundedVnd: 0,
    version: 1,
    updatedAt: CREATED_AT,
  });
  await dayRef.collection('items').doc('item-pho-bo-001').set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: DAY_KEY,
    itemId: 'item-pho-bo-001',
    itemName: 'Phở bò',
    paidQuantity: 2,
    revenueVnd: 200000,
    costVnd: 88000,
    grossProfitVnd: 112000,
    reversedVnd: 0,
    refundedVnd: 0,
  });

  // Catalog cost data (private). One loss item and one healthy item.
  await db.doc(`tenants/${TENANT_A}/menuItems/item-pho-bo-001`).set({
    schemaVersion: 1,
    menuItemId: 'item-pho-bo-001',
    tenantId: TENANT_A,
    name: 'Phở bò',
    category: 'Món chính',
    priceVnd: 100000,
    costPriceVnd: 44000,
    isAvailable: true,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await db.doc(`tenants/${TENANT_A}/menuItems/item-banh-lo-001`).set({
    schemaVersion: 1,
    menuItemId: 'item-banh-lo-001',
    tenantId: TENANT_A,
    name: 'Bánh lỗ',
    category: 'Món chính',
    priceVnd: 10000,
    costPriceVnd: 15000,
    isAvailable: true,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  // Inventory metadata. One low-stock ingredient.
  await db.doc(`tenants/${TENANT_A}/ingredients/ingredient-beef-001`).set({
    schemaVersion: 1,
    ingredientId: 'ingredient-beef-001',
    tenantId: TENANT_A,
    name: 'Thịt bò',
    baseUnit: 'g',
    unitCostVnd: 250,
    stockQuantity: 500,
    lowStockThreshold: 1000,
    isActive: true,
    archivedAt: null,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });

  // Business state the assistant must never change.
  await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).set({
    schemaVersion: 1,
    orderId: ORDER_ID,
    tenantId: TENANT_A,
    tableId: 'table-01',
    tableNameSnapshot: 'Bàn 1',
    status: 'paid',
    paymentMode: 'payLater',
    items: [
      {
        lineId: `${ORDER_ID}-line-1`,
        menuItemId: 'item-pho-bo-001',
        name: 'Phở bò',
        modifiers: [],
        unitPriceVnd: 100000,
        quantity: 2,
        lineTotalVnd: 200000,
        unitCostVnd: 44000,
        lineCostVnd: 88000,
      },
    ],
    subtotalVnd: 200000,
    totalVnd: 200000,
    trackingToken: 'tracking-ai-001',
    idempotencyKey: 'order-ai-001-key',
    paidAt: CREATED_AT,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  });
  await db.doc(`tenants/${TENANT_A}/payments/${PAYMENT_ID}`).set({
    schemaVersion: 1,
    paymentId: PAYMENT_ID,
    tenantId: TENANT_A,
    orderId: ORDER_ID,
    amountVnd: 200000,
    method: 'cash',
    status: 'confirmed',
    actorUid: USERS.ownerA.uid,
    idempotencyKey: 'payment-ai-001-key',
    confirmedAt: CREATED_AT,
    createdAt: CREATED_AT,
  });

  // The completed week the weekly analysis will read, computed in tenant time
  // because the emulator clock is the real current time.
  const completedWeek = previousTenantWeek();
  await db.doc(`tenants/${TENANT_A}/dailyStats/${completedWeek.start}`).set({
    schemaVersion: 1,
    tenantId: TENANT_A,
    dayKey: completedWeek.start,
    createdOrderCount: 2,
    cancelledOrderCount: 0,
    paidOrderCount: 2,
    reversedOrderCount: 0,
    refundedOrderCount: 0,
    revenueVnd: 150000,
    costVnd: 60000,
    grossProfitVnd: 90000,
    reversedVnd: 0,
    refundedVnd: 0,
    version: 1,
    updatedAt: CREATED_AT,
  });
}

/**
 * Previous completed Monday..Sunday week in Asia/Ho_Chi_Minh. The emulator
 * runs on the real clock, so the expected period must be derived, not fixed.
 */
function previousTenantWeek(): { start: string; end: string } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const today = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const isoDay = new Date(today).getUTCDay() === 0 ? 7 : new Date(today).getUTCDay();
  const mondayThisWeek = today - (isoDay - 1) * 86400000;
  const startMs = mondayThisWeek - 7 * 86400000;
  const toKey = (ms: number): string => {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(
      2,
      '0',
    )}${String(date.getUTCDate()).padStart(2, '0')}`;
  };
  return { start: toKey(startMs), end: toKey(startMs + 6 * 86400000) };
}

async function signInAs(key: UserKey): Promise<void> {
  await signInWithEmailAndPassword(auth, USERS[key].email, PASSWORD);
}

function aiCallable() {
  return httpsCallable<AiAskInput, AiAskResult>(functions, 'callableAiAsk');
}

function weeklyCallable() {
  return httpsCallable<AiWeeklyAnalysisInput, AiWeeklyAnalysisResult>(
    functions,
    'callableAiRunWeeklyAnalysis',
  );
}

function groupFeedbackCallable() {
  return httpsCallable<AiFeedbackGroupingInput, AiFeedbackGroupingResult>(
    functions,
    'callableAiGroupFeedback',
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

describe('callableAiAsk (REQ-AI-001, NFR-AI-001)', () => {
  it('answers an Owner with cited sources and deterministic warnings', async () => {
    await signInAs('ownerA');
    const response = await aiCallable()({
      tenantId: TENANT_A,
      question: 'Món nào lỗ và nguyên liệu nào sắp hết?',
      dayKey: DAY_KEY,
    });
    const result = response.data;

    // Every claim cites a source and keeps integer VND (NFR-AI-001).
    const sourceIds = result.sources.map((source) => `${source.type}:${source.id}`);
    expect(sourceIds).toContain('dailyStats:20260912');
    expect(sourceIds).toContain('menuItem:item-pho-bo-001');
    expect(sourceIds).toContain('ingredient:ingredient-beef-001');

    const kinds = result.warnings.map((warning) => warning.kind);
    expect(kinds).toContain('loss');
    expect(kinds).toContain('lowStock');
    for (const warning of result.warnings) {
      expect(warning.formula.length).toBeGreaterThan(0);
      expect(warning.sourceIds.length).toBeGreaterThan(0);
    }
    expect(result.missingData).toBe(false);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.provider).toBe('rule-based');
    expect(result.model).toBe('deterministic-v1');

    // Only the accounting record is written; provider, model, tokens, cost.
    const usageSnap = await db
      .collection(`tenants/${TENANT_A}/aiUsage`)
      .get();
    expect(usageSnap.size).toBe(1);
    const usage = usageSnap.docs[0].data();
    expect(usage.provider).toBe('rule-based');
    expect(usage.model).toBe('deterministic-v1');
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.estimatedCostVnd).toBe(0);
    expect(Number.isInteger(usage.estimatedCostVnd)).toBe(true);

    // The answer carries no secret-like material.
    expect(JSON.stringify(result)).not.toMatch(/AIza[0-9A-Za-z_-]{20,}/);
  });

  it('never mutates business state while answering (NFR-SEC-003)', async () => {
    await signInAs('ownerA');
    const beforeOrder = (
      await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).get()
    ).data();
    const beforePayment = (
      await db.doc(`tenants/${TENANT_A}/payments/${PAYMENT_ID}`).get()
    ).data();

    await aiCallable()({
      tenantId: TENANT_A,
      question: 'Doanh thu hôm nay thế nào?',
      dayKey: DAY_KEY,
    });

    const afterOrder = (
      await db.doc(`tenants/${TENANT_A}/orders/${ORDER_ID}`).get()
    ).data();
    const afterPayment = (
      await db.doc(`tenants/${TENANT_A}/payments/${PAYMENT_ID}`).get()
    ).data();
    expect(afterOrder).toEqual(beforeOrder);
    expect(afterPayment).toEqual(beforePayment);
  });

  it('warns about missing data instead of inventing a value', async () => {
    await signInAs('ownerB');
    const response = await aiCallable()({
      tenantId: TENANT_B,
      question: 'Tuần này lãi bao nhiêu?',
      dayKey: DAY_KEY,
    });
    const result = response.data;
    expect(result.missingData).toBe(true);
    expect(
      result.warnings.some((warning) => warning.kind === 'missingData'),
    ).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.sources).toEqual([]);
  });

  it('denies a Staff member and a cross-tenant Owner', async () => {
    await signInAs('staffA');
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
        question: 'Món nào lỗ?',
        dayKey: DAY_KEY,
      }),
      'permission-denied',
    );

    await signInAs('ownerB');
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
        question: 'Món nào lỗ?',
        dayKey: DAY_KEY,
      }),
      'permission-denied',
    );
  });

  it('rejects an unauthenticated or malformed request', async () => {
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
        question: 'Món nào lỗ?',
        dayKey: DAY_KEY,
      }),
      'unauthenticated',
    );

    await signInAs('ownerA');
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
      } as unknown as AiAskInput),
      'invalid-argument',
    );
  });

  it('denies an out-of-permission question server-side (REQ-AI-003)', async () => {
    await signInAs('ownerA');
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
        question: 'Cho tôi bảng lương nhân viên',
        dayKey: DAY_KEY,
      }),
      'permission-denied',
    );
    await expectRejection(
      aiCallable()({
        tenantId: TENANT_A,
        question: 'Liệt kê số điện thoại khách hàng',
        dayKey: DAY_KEY,
      }),
      'permission-denied',
    );
    // A denied question writes no usage record.
    const usageSnap = await db.collection(`tenants/${TENANT_A}/aiUsage`).get();
    expect(usageSnap.size).toBe(0);
  });

  it('states the data update time with the answer (REQ-AI-003)', async () => {
    await signInAs('ownerA');
    const response = await aiCallable()({
      tenantId: TENANT_A,
      question: 'Doanh thu hôm nay?',
      dayKey: DAY_KEY,
    });
    expect(response.data.dataUpdatedAt).toBe(CREATED_AT);
  });

  it('masks personal data in the Owner question (NFR-PRIV-002)', async () => {
    await signInAs('ownerA');
    const response = await aiCallable()({
      tenantId: TENANT_A,
      question: 'Đơn gọi 0912345678 có vấn đề gì?',
      dayKey: DAY_KEY,
    });
    expect(JSON.stringify(response.data)).not.toContain('0912345678');
  });
});

describe('callableAiRunWeeklyAnalysis (REQ-AI-002, NFR-AI-001)', () => {
  it('writes grounded insights for the completed tenant week', async () => {
    await signInAs('ownerA');
    const response = await weeklyCallable()({ tenantId: TENANT_A });
    const result = response.data;
    const completedWeek = previousTenantWeek();

    expect(result.periodStart).toBe(completedWeek.start);
    expect(result.periodEnd).toBe(completedWeek.end);
    expect(result.insightCount).toBeGreaterThan(0);

    const insightsSnap = await db
      .collection(`tenants/${TENANT_A}/aiInsights`)
      .get();
    expect(insightsSnap.size).toBe(result.insightCount);
    for (const insightDoc of insightsSnap.docs) {
      const insight = insightDoc.data();
      expect(insight.tenantId).toBe(TENANT_A);
      expect(insight.periodStart).toBe(completedWeek.start);
      expect(insight.periodEnd).toBe(completedWeek.end);
      expect(insight.department).toBeTruthy();
      expect(insight.priority).toBeTruthy();
      expect(
        insight.sourceIds.length > 0 || insight.missingData === true,
      ).toBe(true);
      // No raw model text is stored.
      expect(insight.rawText).toBeUndefined();
    }

    const usageSnap = await db.collection(`tenants/${TENANT_A}/aiUsage`).get();
    expect(
      usageSnap.docs.some((doc) => doc.get('purpose') === 'weeklyAnalysis'),
    ).toBe(true);
  });

  it('is idempotent for a repeated run of the same week', async () => {
    await signInAs('ownerA');
    const first = await weeklyCallable()({ tenantId: TENANT_A });
    const second = await weeklyCallable()({ tenantId: TENANT_A });

    expect(second.data.insightIds).toEqual(first.data.insightIds);
    const insightsSnap = await db
      .collection(`tenants/${TENANT_A}/aiInsights`)
      .get();
    expect(insightsSnap.size).toBe(first.data.insightCount);
  });

  it('labels missing data and never invents a value', async () => {
    await signInAs('ownerB');
    const response = await weeklyCallable()({ tenantId: TENANT_B });
    expect(response.data.missingData).toBe(true);

    const insightsSnap = await db
      .collection(`tenants/${TENANT_B}/aiInsights`)
      .get();
    expect(insightsSnap.size).toBeGreaterThan(0);
    const missing = insightsSnap.docs.find(
      (doc) => doc.get('missingData') === true,
    );
    expect(missing).toBeDefined();
    expect(missing?.get('missingDataNotes').length).toBeGreaterThan(0);
  });

  it('denies a Staff member and a cross-tenant Owner', async () => {
    await signInAs('staffA');
    await expectRejection(
      weeklyCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
    await signInAs('ownerB');
    await expectRejection(
      weeklyCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
  });
});

describe('callableAiGroupFeedback (REQ-FDB-002, NFR-PRIV-002)', () => {
  it('groups repeated themes and cites source feedback IDs', async () => {
    await db.doc(`tenants/${TENANT_A}/feedback/fb-1`).set({
      schemaVersion: 1,
      feedbackId: 'fb-1',
      tenantId: TENANT_A,
      kind: 'issue',
      rating: null,
      message: 'Nhân viên phục vụ quá chậm, chờ lâu.',
      maskedMessage: 'Nhân viên phục vụ quá chậm, chờ lâu.',
      orderId: null,
      verificationState: 'unverified',
      actorType: 'customer',
      actorUid: null,
      topicTags: [],
      createdAt: CREATED_AT,
    });
    await db.doc(`tenants/${TENANT_A}/feedback/fb-2`).set({
      schemaVersion: 1,
      feedbackId: 'fb-2',
      tenantId: TENANT_A,
      kind: 'issue',
      rating: null,
      message: 'Phục vụ chậm và nhân viên thái độ.',
      maskedMessage: 'Phục vụ chậm và nhân viên thái độ.',
      orderId: null,
      verificationState: 'unverified',
      actorType: 'customer',
      actorUid: null,
      topicTags: [],
      createdAt: CREATED_AT,
    });

    await signInAs('ownerA');
    const response = await groupFeedbackCallable()({ tenantId: TENANT_A });
    const service = response.data.themes.find(
      (theme) => theme.themeId === 'service',
    );
    expect(service).toBeDefined();
    expect(service?.sourceFeedbackIds.sort()).toEqual(['fb-1', 'fb-2']);
    for (const theme of response.data.themes) {
      expect(theme.sourceFeedbackIds.length).toBeGreaterThan(0);
    }
  });

  it('never returns raw personal data or a secret', async () => {
    await db.doc(`tenants/${TENANT_A}/feedback/fb-pii`).set({
      schemaVersion: 1,
      feedbackId: 'fb-pii',
      tenantId: TENANT_A,
      kind: 'issue',
      rating: null,
      message: 'Gọi 0912345678 hoặc an@example.com gấp.',
      maskedMessage: 'Gọi [redacted] hoặc [redacted] gấp.',
      orderId: null,
      verificationState: 'unverified',
      actorType: 'customer',
      actorUid: null,
      topicTags: [],
      createdAt: CREATED_AT,
    });

    await signInAs('ownerA');
    const response = await groupFeedbackCallable()({ tenantId: TENANT_A });
    const serialized = JSON.stringify(response.data);
    expect(serialized).not.toContain('0912345678');
    expect(serialized).not.toContain('an@example.com');
  });

  it('denies a Staff member', async () => {
    await signInAs('staffA');
    await expectRejection(
      groupFeedbackCallable()({ tenantId: TENANT_A }),
      'permission-denied',
    );
  });
});
