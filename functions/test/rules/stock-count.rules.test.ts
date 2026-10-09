/**
 * Stock count Security Rules tests (REQ-INV-003, REQ-INV-004, NFR-SEC-001).
 *
 * Stock counts are server-written only and tenant-scoped. Active tenants and
 * ADMIN read; cross-tenant and anonymous reads fail; every direct write fails.
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
const MEMBER_UID = 'member-uid';
const CASHIER_UID = 'cashier-uid';
const OTHER_UID = 'other-uid';
const COUNT_ID = 'count-001';

const rules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules },
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
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', MEMBER_UID), {
      membershipType: 'staff',
      roles: ['kitchen'],
      isActive: true,
    });
    // A count exposes expected quantity and variance, so it stays out of the
    // till role's permission set.
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', CASHIER_UID), {
      membershipType: 'staff',
      roles: ['cashier'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'stockCounts', COUNT_ID), {
      tenantId: TENANT_A,
      ingredientId: 'ingredient-1',
      varianceBaseUnits: -100,
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      membershipType: 'owner',
      isActive: true,
    });
  });
}

describe('tenant stock count boundary', () => {
  it('allows the Owner and Kitchen to read a count', async () => {
    await seed();
    const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
    const member = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(
      getDoc(doc(owner, 'tenants', TENANT_A, 'stockCounts', COUNT_ID)),
    );
    await assertSucceeds(
      getDoc(doc(member, 'tenants', TENANT_A, 'stockCounts', COUNT_ID)),
    );
  });

  it('denies a Cashier read of a count', async () => {
    await seed();
    const cashier = testEnv.authenticatedContext(CASHIER_UID).firestore();
    await assertFails(
      getDoc(doc(cashier, 'tenants', TENANT_A, 'stockCounts', COUNT_ID)),
    );
  });

  it('denies cross-tenant and anonymous reads', async () => {
    await seed();
    const other = testEnv.authenticatedContext(OTHER_UID).firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(other, 'tenants', TENANT_A, 'stockCounts', COUNT_ID)),
    );
    await assertFails(
      getDoc(doc(anon, 'tenants', TENANT_A, 'stockCounts', COUNT_ID)),
    );
  });

  it('denies every direct write', async () => {
    await seed();
    const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertFails(
      setDoc(doc(owner, 'tenants', TENANT_A, 'stockCounts', 'forged'), {
        tenantId: TENANT_A,
      }),
    );
  });
});
