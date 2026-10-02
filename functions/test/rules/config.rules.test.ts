/**
 * P0-001 Config Security Rules tests (REQ-CFG-001, NFR-SEC-001).
 *
 * Runner note: `functions/test/rules/**` is currently excluded from the
 * functions vitest project and `@firebase/rules-unit-testing` is not yet an
 * installed dev dependency. To run this file the tester must:
 *
 *   1. npm --workspace functions install --save-dev @firebase/rules-unit-testing
 *   2. Start the emulator and run the rules file, for example:
 *      firebase emulators:exec --only firestore --project scango-rules-test \
 *        "npx vitest run --root functions --config vitest.rules.config.mts"
 *
 * `vitest.rules.config.mts` must include `test/rules/**\/*.test.ts` and must not
 * exclude the rules folder.
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const configRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: configRules },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

async function seed(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'platform', 'config'), {
      values: { timezone: 'Asia/Bangkok' },
      allowedTenantOverrideKeys: ['locale', 'timezone'],
      configVersion: 1,
    });
    await setDoc(doc(db, 'tenants', TENANT_A), {
      shopName: 'Alpha',
      configOverrides: { locale: 'en' },
      configVersion: 2,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', 'owner-uid'), {
      uid: 'owner-uid',
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', 'inactive-uid'), {
      uid: 'inactive-uid',
      membershipType: 'staff',
      isActive: false,
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', 'other-uid'), {
      uid: 'other-uid',
      membershipType: 'owner',
      isActive: true,
    });
  });
}

describe('platform/config read boundary', () => {
  it('denies the unauthenticated context and a regular tenant member', async () => {
    await seed();

    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'platform', 'config')),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext('owner-uid').firestore(),
          'platform',
          'config',
        ),
      ),
    );
  });

  it('allows only the ADMIN claim', async () => {
    await seed();

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext('admin-uid', { admin: true }).firestore(),
          'platform',
          'config',
        ),
      ),
    );
  });
});

describe('direct Config writes', () => {
  it('denies every direct platform/config write, ADMIN included', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext('admin-uid', { admin: true }).firestore(),
          'platform',
          'config',
        ),
        { values: { timezone: 'UTC' } },
      ),
    );
    await assertFails(
      setDoc(
        doc(testEnv.authenticatedContext('owner-uid').firestore(), 'platform', 'config'),
        { values: { timezone: 'UTC' } },
      ),
    );
  });

  it('denies every direct tenant config write', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(testEnv.authenticatedContext('owner-uid').firestore(), 'tenants', TENANT_A),
        { configOverrides: { locale: 'en' } },
        { merge: true },
      ),
    );
  });
});

describe('tenant config read scoping', () => {
  it('allows a member to read their own tenant config', async () => {
    await seed();

    await assertSucceeds(
      getDoc(
        doc(testEnv.authenticatedContext('owner-uid').firestore(), 'tenants', TENANT_A),
      ),
    );
  });

  it('denies a cross-tenant member and an inactive member', async () => {
    await seed();

    await assertFails(
      getDoc(
        doc(testEnv.authenticatedContext('other-uid').firestore(), 'tenants', TENANT_A),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext('inactive-uid').firestore(),
          'tenants',
          TENANT_A,
        ),
      ),
    );
  });

  it('allows ADMIN to read any tenant config', async () => {
    await seed();

    await assertSucceeds(
      getDoc(
        doc(
          testEnv.authenticatedContext('admin-uid', { admin: true }).firestore(),
          'tenants',
          TENANT_A,
        ),
      ),
    );
  });
});

describe('platform audit is server-only', () => {
  it('denies client read and write of platform/config/audit', async () => {
    await seed();
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { admin: true })
      .firestore();
    const auditDoc = doc(adminDb, 'platform', 'config', 'audit', 'event-001');

    await assertFails(getDoc(auditDoc));
    await assertFails(setDoc(auditDoc, { action: 'ConfigurationChanged' }));
  });
});
