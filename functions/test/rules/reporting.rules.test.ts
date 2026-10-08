/**
 * Reporting dailyStats Security Rules tests (REQ-RPT-001, REQ-RPT-002,
 * NFR-SEC-001, ADR 0005).
 *
 * These tests prove tenant-scoped daily stats reads, deny cross-tenant and
 * anonymous reads, and deny every direct write. Daily stats are derived and
 * server-written only.
 *
 * Run with the root script:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';
const MEMBER_UID = 'member-uid';
const DAY_KEY = '20260912';

const reportingRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: reportingRules },
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
    await setDoc(doc(db, 'tenants', TENANT_A), { shopName: 'Alpha' });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', OWNER_UID), {
      uid: OWNER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', MEMBER_UID), {
      uid: MEMBER_UID,
      membershipType: 'staff',
      roles: ['cashier'],
      isActive: true,
    });
    const dayRef = doc(db, 'tenants', TENANT_A, 'dailyStats', DAY_KEY);
    await setDoc(dayRef, {
      dayKey: DAY_KEY,
      tenantId: TENANT_A,
      revenueVnd: 100000,
      costVnd: 44000,
      grossProfitVnd: 56000,
    });
    await setDoc(doc(dayRef, 'items', 'item-pho-bo-001'), {
      itemId: 'item-pho-bo-001',
      tenantId: TENANT_A,
      revenueVnd: 100000,
    });
    await setDoc(doc(dayRef, 'tables', 'table-01'), {
      tableId: 'table-01',
      tenantId: TENANT_A,
      revenueVnd: 100000,
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      membershipType: 'owner',
      isActive: true,
    });
  });
}

function ownerDb() {
  return testEnv.authenticatedContext(OWNER_UID).firestore();
}

function memberDb() {
  return testEnv.authenticatedContext(MEMBER_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('tenant dailyStats read boundary', () => {
  it('allows an active Owner to read stats and their subcollections', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY)),
    );
    await assertSucceeds(
      getDoc(
        doc(
          ownerDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'items',
          'item-pho-bo-001',
        ),
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(
          ownerDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'tables',
          'table-01',
        ),
      ),
    );
  });

  it('denies a non-Owner member because revenue and COGS are Owner data', async () => {
    await seed();

    await assertFails(
      getDoc(doc(memberDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY)),
    );
    await assertFails(
      getDoc(
        doc(
          memberDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'items',
          'item-pho-bo-001',
        ),
      ),
    );
  });

  it('denies cross-tenant and anonymous reads', async () => {
    await seed();

    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY)),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY)),
    );
    await assertFails(
      getDoc(
        doc(
          otherDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'items',
          'item-pho-bo-001',
        ),
      ),
    );
  });
});

describe('tenant dailyStats write denial', () => {
  it('denies every direct write to stats and subcollections', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY), {
        revenueVnd: 999999999,
      }),
    );
    await assertFails(
      setDoc(doc(memberDb(), 'tenants', TENANT_A, 'dailyStats', '20260913'), {
        revenueVnd: 1,
      }),
    );
    await assertFails(
      setDoc(
        doc(
          ownerDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'items',
          'forged',
        ),
        { revenueVnd: 1 },
      ),
    );
    await assertFails(
      setDoc(
        doc(
          ownerDb(),
          'tenants',
          TENANT_A,
          'dailyStats',
          DAY_KEY,
          'tables',
          'forged',
        ),
        { revenueVnd: 1 },
      ),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'dailyStats', DAY_KEY), {
        revenueVnd: 1,
      }),
    );
  });
});
