/**
 * Workforce Security Rules tests (REQ-HRM-001, REQ-HRM-002, REQ-HRM-004,
 * NFR-SEC-001).
 *
 * Shifts and attendance are server-written only and tenant-scoped. An active
 * Owner (and ADMIN) reads the tenant's workforce records; a Staff member reads
 * only their own, so an unconstrained listener is denied and the query must
 * carry `staffUid == request.auth.uid`. Cross-tenant and anonymous reads fail;
 * every direct write fails.
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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const OWNER_UID = 'owner-uid';
const MEMBER_UID = 'member-uid';
const OTHER_MEMBER_UID = 'other-member-uid';
const OTHER_UID = 'other-uid';

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
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', OTHER_MEMBER_UID), {
      membershipType: 'staff',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'shifts', 'shift-1'), {
      tenantId: TENANT_A,
      staffUid: MEMBER_UID,
      date: '20260914',
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'shifts', 'shift-2'), {
      tenantId: TENANT_A,
      staffUid: OTHER_MEMBER_UID,
      date: '20260914',
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'attendance', 'att-1'), {
      tenantId: TENANT_A,
      staffUid: MEMBER_UID,
      clockInAt: '2026-09-14T01:00:00.000Z',
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      membershipType: 'owner',
      isActive: true,
    });
  });
}

describe('tenant workforce read boundary', () => {
  it('lets the Owner read the whole schedule and attendance window', async () => {
    await seed();
    const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(
      getDoc(doc(owner, 'tenants', TENANT_A, 'shifts', 'shift-1')),
    );
    await assertSucceeds(
      getDocs(collection(owner, 'tenants', TENANT_A, 'shifts')),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(owner, 'tenants', TENANT_A, 'attendance'),
          where('clockInAt', '>=', '2026-09-14T00:00:00.000Z'),
          orderBy('clockInAt'),
        ),
      ),
    );
  });

  it('lets a Staff member read only their own Shift and attendance', async () => {
    await seed();
    const member = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertSucceeds(
      getDoc(doc(member, 'tenants', TENANT_A, 'shifts', 'shift-1')),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(member, 'tenants', TENANT_A, 'shifts'),
          where('staffUid', '==', MEMBER_UID),
          where('date', '>=', '20260914'),
          orderBy('date'),
        ),
      ),
    );
    await assertSucceeds(
      getDoc(doc(member, 'tenants', TENANT_A, 'attendance', 'att-1')),
    );
    await assertFails(
      getDoc(doc(member, 'tenants', TENANT_A, 'shifts', 'shift-2')),
    );
    // An unconstrained listener on the schedule is denied, so a Staff member
    // can never enumerate the shop's Shifts (REQ-HRM-004).
    await assertFails(
      getDocs(collection(member, 'tenants', TENANT_A, 'shifts')),
    );
  });

  it('denies cross-tenant and anonymous reads', async () => {
    await seed();
    const other = testEnv.authenticatedContext(OTHER_UID).firestore();
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      getDoc(doc(other, 'tenants', TENANT_A, 'shifts', 'shift-1')),
    );
    await assertFails(
      getDoc(doc(anon, 'tenants', TENANT_A, 'attendance', 'att-1')),
    );
  });

  it('denies every direct write', async () => {
    await seed();
    const owner = testEnv.authenticatedContext(OWNER_UID).firestore();
    const member = testEnv.authenticatedContext(MEMBER_UID).firestore();
    await assertFails(
      setDoc(doc(owner, 'tenants', TENANT_A, 'shifts', 'forged'), {
        tenantId: TENANT_A,
      }),
    );
    await assertFails(
      setDoc(doc(owner, 'tenants', TENANT_A, 'attendance', 'forged'), {
        tenantId: TENANT_A,
      }),
    );
    await assertFails(
      setDoc(doc(member, 'tenants', TENANT_A, 'shifts', 'forged'), {
        tenantId: TENANT_A,
        staffUid: MEMBER_UID,
      }),
    );
  });
});
