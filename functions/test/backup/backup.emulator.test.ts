/**
 * P0-L03 Backup and isolated restore drill Functions Emulator evidence
 * (NFR-REL-001).
 *
 * The daily backup job records one manifest per UTC day with the deployment
 * schedule and 30-day retention. The restore rehearsal copies tenant documents
 * into an isolated target namespace and never writes the source environment.
 *
 * Rules are not applicable: backup and restore use server deployment
 * credentials, so no client rule path is exercised.
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
  getFirestore as getAdminFirestore,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  runRestoreDrill,
  runScheduledBackup,
} from '../../src/modules/config/backup.js';

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'scango-rules-test';
const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const NOW = '2026-10-01T02:00:00.000Z';

let adminApp: AdminApp;
let db: Firestore;

beforeAll(() => {
  adminApp =
    getAdminApps().length > 0
      ? getAdminApps()[0]
      : initializeAdminApp({ projectId: PROJECT_ID });
  db = getAdminFirestore(adminApp);
});

afterAll(async () => {
  await deleteAdminApp(adminApp).catch(() => undefined);
});

beforeEach(async () => {
  await reset();
});

afterEach(async () => {
  await reset();
});

async function reset(): Promise<void> {
  await db.recursiveDelete(db.collection('tenants'));
  await db.recursiveDelete(db.collection('platform'));
  await db.recursiveDelete(db.collection('restoreDrills'));
}

async function seed(): Promise<void> {
  await db.doc('platform/config').set({ values: {}, configVersion: 1 });
  await db.doc(`tenants/${TENANT_A}`).set({ shopName: 'Alpha' });
  await db.doc(`tenants/${TENANT_B}`).set({ shopName: 'Bravo' });
}

describe('runScheduledBackup', () => {
  it('records a daily manifest with 30-day retention and the tenant list', async () => {
    await seed();
    const result = await runScheduledBackup(db, { now: NOW });

    expect(result.schedule).toBe('daily');
    expect(result.retentionDays).toBe(30);
    expect(result.expiresAt).toBe('2026-10-31T02:00:00.000Z');
    expect(result.tenantCount).toBe(2);

    const manifest = await db
      .doc(`platform/config/backups/${result.runId}`)
      .get();
    expect(manifest.exists).toBe(true);
    expect(manifest.get('retentionDays')).toBe(30);
    expect(manifest.get('expiresAt')).toBe('2026-10-31T02:00:00.000Z');
    expect((manifest.get('tenantIds') as string[]).sort()).toEqual([
      TENANT_A,
      TENANT_B,
    ]);
  });

  it('rejects an unsupported schedule and an invalid retention', async () => {
    await seed();
    await expect(
      runScheduledBackup(db, { now: NOW, schedule: 'hourly' }),
    ).rejects.toThrow();
    await expect(
      runScheduledBackup(db, { now: NOW, retentionDays: 0 }),
    ).rejects.toThrow();
    await expect(
      runScheduledBackup(db, { now: NOW, retentionDays: 1.5 }),
    ).rejects.toThrow();
  });
});

describe('runRestoreDrill', () => {
  it('restores tenant records into an isolated namespace without touching the source', async () => {
    await seed();
    const drill = await runRestoreDrill(db, {
      backupId: '20261001',
      targetNamespace: 'restoreDrills/drill-2026',
      tenantIds: [TENANT_A],
      now: NOW,
    });

    expect(drill.restoredTenantIds).toEqual([TENANT_A]);
    expect(drill.sourceUnchanged).toBe(true);

    const restored = await db
      .doc(`restoreDrills/drill-2026/tenants/${TENANT_A}`)
      .get();
    expect(restored.exists).toBe(true);
    expect(restored.get('shopName')).toBe('Alpha');
    expect(restored.get('restoreMetadata.backupId')).toBe('20261001');

    const source = await db.doc(`tenants/${TENANT_A}`).get();
    expect(source.get('shopName')).toBe('Alpha');
    expect(source.get('restoreMetadata')).toBeUndefined();

    const record = await db
      .doc(`platform/config/restoreDrills/${drill.drillId}`)
      .get();
    expect(record.exists).toBe(true);
    expect(record.get('sourceUnchanged')).toBe(true);
  });
});
