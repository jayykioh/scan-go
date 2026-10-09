/**
 * P0-L06 Customer menu performance evidence (NFR-PERF-001).
 *
 * Seeds a production-like Tenant menu and 100 active Table links, then runs
 * 100 Customer menu loads. One load calls the real public Table resolver and
 * performs the bounded public-menu read the Customer listener uses. Each load
 * is measured, the representative 4G allowance is applied, and the harness
 * asserts p95 is at most two seconds.
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
import type { TableLinkContext } from '../../../shared/contracts/table.contract.js';
import { FUNCTIONS_REGION } from '../../../shared/config/region.js';
import {
  MENU_LOAD_SAMPLE_COUNT,
  PUBLIC_MENU_LOAD_LIMIT,
  REPRESENTATIVE_4G_PROFILE,
  meetsMenuP95Budget,
  summarizeMenuLoads,
} from '../../src/modules/catalog/performance.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const REGION = FUNCTIONS_REGION;
const FUNCTIONS_HOST = '127.0.0.1';
const FUNCTIONS_PORT = 5001;

const TENANT_ID = 'tenant-perf';
const TABLE_ID = 'table-perf';
const MENU_ITEM_COUNT = 60;
const TABLE_LINK_COUNT = MENU_LOAD_SAMPLE_COUNT;

const FIXTURE_NOW = '2026-10-01T00:00:00.000Z';

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
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('publicTableLinks'));
  await seedProductionLikeFixture();
});

function resolveCallable() {
  return httpsCallable<
    { token: string; tenantId: string | null },
    TableLinkContext
  >(functions, 'callableTableResolvePublic');
}

/** A menu with descriptions and modifiers, close to a real shop size. */
async function seedProductionLikeFixture(): Promise<void> {
  await db.doc(`tenants/${TENANT_ID}`).set({
    shopName: 'Perf Cafe',
    archivedAt: null,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
  });

  const menuBatch = db.batch();
  for (let i = 0; i < MENU_ITEM_COUNT; i += 1) {
    const itemId = `item-${String(i).padStart(3, '0')}`;
    menuBatch.set(db.doc(`tenants/${TENANT_ID}/publicMenuItems/${itemId}`), {
      schemaVersion: 1,
      menuItemId: itemId,
      tenantId: TENANT_ID,
      name: `Món ${i}`,
      description:
        'Mô tả món ăn đủ dài để gần với dữ liệu thật của một quán đông khách.',
      category: i % 2 === 0 ? 'Đồ ăn' : 'Đồ uống',
      type: i % 2 === 0 ? 'Đồ ăn' : 'Đồ uống',
      priceVnd: 25000 + i * 500,
      imageUrl: null,
      modifierGroups: [
        {
          modifierGroupId: 'size',
          name: 'Kích cỡ',
          required: true,
          options: [
            { modifierOptionId: 'm', name: 'Vừa', priceVnd: 0 },
            { modifierOptionId: 'l', name: 'Lớn', priceVnd: 5000 },
          ],
        },
      ],
      isAvailable: true,
      updatedAt: FIXTURE_NOW,
    });
  }
  await menuBatch.commit();

  const linkBatch = db.batch();
  for (let i = 0; i < TABLE_LINK_COUNT; i += 1) {
    const token = `perf-token-${String(i).padStart(3, '0')}`;
    linkBatch.set(db.doc(`publicTableLinks/${token}`), {
      schemaVersion: 1,
      tenantId: TENANT_ID,
      tableId: TABLE_ID,
      tableName: `Bàn ${i}`,
      tokenVersion: 1,
      isActive: true,
      createdAt: FIXTURE_NOW,
      revokedAt: null,
    });
  }
  await linkBatch.commit();
}

async function runOneMenuLoad(token: string): Promise<number> {
  const startedAt = performance.now();
  // 1. Public Table resolution boundary (real callable, App Check enforced by
  //    the server in production and skipped only in the emulator).
  await resolveCallable()({ token, tenantId: TENANT_ID });
  // 2. Bounded public-menu projection read, matching the Customer listener.
  await db
    .collection(`tenants/${TENANT_ID}/publicMenuItems`)
    .orderBy('updatedAt', 'desc')
    .limit(PUBLIC_MENU_LOAD_LIMIT)
    .get();
  return performance.now() - startedAt;
}

describe('Customer menu 100-load p95 (NFR-PERF-001)', () => {
  it('meets the two-second p95 budget on the representative 4G profile', async () => {
    const measured: number[] = [];
    for (let i = 0; i < MENU_LOAD_SAMPLE_COUNT; i += 1) {
      const token = `perf-token-${String(i).padStart(3, '0')}`;
      measured.push(await runOneMenuLoad(token));
    }

    const report = summarizeMenuLoads(measured);

    // The 100-load report is required evidence. Keep it in the test log.
    console.log(
      `[NFR-PERF-001] ${report.profileLabel} ` +
        `samples=${report.sampleCount} ` +
        `measuredP50=${report.measuredP50Ms.toFixed(1)}ms ` +
        `measuredP95=${report.measuredP95Ms.toFixed(1)}ms ` +
        `effectiveP50=${report.effectiveP50Ms.toFixed(1)}ms ` +
        `effectiveP95=${report.effectiveP95Ms.toFixed(1)}ms ` +
        `max=${report.maxEffectiveMs.toFixed(1)}ms budget=${report.budgetMs}ms`,
    );

    expect(report.sampleCount).toBe(MENU_LOAD_SAMPLE_COUNT);
    expect(report.profileId).toBe(REPRESENTATIVE_4G_PROFILE.id);
    expect(meetsMenuP95Budget(report)).toBe(true);
    expect(report.effectiveP95Ms).toBeLessThanOrEqual(2000);
  }, 120_000);
});
