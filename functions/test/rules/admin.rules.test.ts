/**
 * P0-L01 ADMIN access Security Rules tests (REQ-ADM-001, NFR-PRIV-001).
 *
 * ADMIN identity is a server-verified platform claim. Rules grant ADMIN read
 * across tenants but never grant a direct business-data write, and Tenant
 * audit plus Customer-phone source stay server-only.
 *
 * Run with the root script:
 *   npm run test:rules
 */
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, it } from 'vitest';
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
  setDoc,
} from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';
const ADMIN_UID = 'admin-uid';

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
    await setDoc(doc(db, 'platform', 'config'), { configVersion: 1 });
    await setDoc(doc(db, 'tenants', TENANT_A), {
      shopName: 'Alpha',
      archivedAt: null,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', OWNER_UID), {
      uid: OWNER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'menuItems', 'item-1'), {
      name: 'Phở',
      priceVnd: 50000,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'payments', 'pay-1'), {
      amountVnd: 50000,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'), {
      phone: '+84900000000',
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'audit', 'event-1'), {
      action: 'TenantCreated',
    });

    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      membershipType: 'owner',
      isActive: true,
    });
  });
}

function adminDb() {
  return testEnv.authenticatedContext(ADMIN_UID, { admin: true }).firestore();
}

function ownerDb() {
  return testEnv.authenticatedContext(OWNER_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

describe('ADMIN read boundary (REQ-ADM-001)', () => {
  it('allows ADMIN to read any Tenant and its business projections', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(adminDb(), 'tenants', TENANT_A)));
    await assertSucceeds(getDoc(doc(adminDb(), 'tenants', TENANT_B)));
    await assertSucceeds(
      getDoc(doc(adminDb(), 'tenants', TENANT_A, 'menuItems', 'item-1')),
    );
    await assertSucceeds(
      getDoc(doc(adminDb(), 'tenants', TENANT_A, 'payments', 'pay-1')),
    );
    await assertSucceeds(getDoc(doc(adminDb(), 'platform', 'config')));
  });

  it('keeps Tenant audit and Customer-phone source server-only for ADMIN', async () => {
    await seed();
    await assertFails(
      getDoc(doc(adminDb(), 'tenants', TENANT_A, 'audit', 'event-1')),
    );
    await assertFails(
      getDoc(doc(adminDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1')),
    );
    await assertFails(
      getDocs(collection(adminDb(), 'tenants', TENANT_A, 'loyaltyMembers')),
    );
  });

  it('denies an unauthenticated read of any Tenant', async () => {
    await seed();
    await assertFails(
      getDoc(
        doc(testEnv.unauthenticatedContext().firestore(), 'tenants', TENANT_A),
      ),
    );
  });
});

describe('non-ADMIN denial', () => {
  it('denies a cross-tenant member read and a Tenant collection list', async () => {
    await seed();
    await assertFails(getDoc(doc(ownerDb(), 'tenants', TENANT_B)));
    await assertFails(getDoc(doc(otherDb(), 'tenants', TENANT_A)));
    await assertFails(getDocs(collection(ownerDb(), 'tenants')));
  });

  it('denies platform config and phone source to a regular member', async () => {
    await seed();
    await assertFails(getDoc(doc(ownerDb(), 'platform', 'config')));
    await assertFails(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1')),
    );
  });
});

describe('direct business writes are denied for everyone', () => {
  it('denies ADMIN direct writes to Tenant, catalog, payment, and phone data', async () => {
    await seed();
    await assertFails(
      setDoc(doc(adminDb(), 'tenants', TENANT_A), { shopName: 'Changed' }),
    );
    await assertFails(
      setDoc(doc(adminDb(), 'tenants', TENANT_A, 'menuItems', 'item-1'), {
        priceVnd: 1,
      }),
    );
    await assertFails(
      setDoc(doc(adminDb(), 'tenants', TENANT_A, 'payments', 'pay-1'), {
        amountVnd: 1,
      }),
    );
    await assertFails(
      setDoc(doc(adminDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'), {
        phone: '+84000000000',
      }),
    );
  });

  it('denies a member direct writes and a forged audit event', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A), { shopName: 'Changed' }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'audit', 'forged'), {
        action: 'Forged',
      }),
    );
    await assertFails(
      setDoc(doc(adminDb(), 'tenants', TENANT_A, 'audit', 'forged'), {
        action: 'Forged',
      }),
    );
  });
});
