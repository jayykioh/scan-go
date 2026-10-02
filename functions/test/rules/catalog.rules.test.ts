/**
 * P0-005 Catalog Security Rules tests (REQ-CAT-001, NFR-SEC-001,
 * NFR-DATA-001).
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
const STAFF_UID = 'staff-uid';
const INACTIVE_UID = 'inactive-uid';
const OTHER_UID = 'other-uid';

const catalogRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: catalogRules },
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
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_UID), {
      uid: STAFF_UID,
      membershipType: 'staff',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', INACTIVE_UID), {
      uid: INACTIVE_UID,
      membershipType: 'staff',
      isActive: false,
    });

    await setDoc(doc(db, 'tenants', TENANT_A, 'menuItems', 'item-1'), {
      menuItemId: 'item-1',
      tenantId: TENANT_A,
      name: 'Phở bò',
      priceVnd: 45000,
      costPriceVnd: 22000,
      recipeId: 'recipe-1',
      stockCount: 40,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'publicMenuItems', 'item-1'), {
      menuItemId: 'item-1',
      tenantId: TENANT_A,
      name: 'Phở bò',
      priceVnd: 45000,
      imageUrl: null,
      isAvailable: true,
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

function staffDb() {
  return testEnv.authenticatedContext(STAFF_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('private menuItems read boundary', () => {
  it('allows active members and denies cross-tenant, inactive, and anonymous reads', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'menuItems', 'item-1')),
    );
    await assertSucceeds(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'menuItems', 'item-1')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'menuItems', 'item-1')),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(INACTIVE_UID).firestore(),
          'tenants',
          TENANT_A,
          'menuItems',
          'item-1',
        ),
      ),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'menuItems', 'item-1')),
    );
  });
});

describe('private menuItems write denial', () => {
  it('denies every direct write, Owner included', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'menuItems', 'item-1'), {
        priceVnd: 1,
      }),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'menuItems', 'item-2'), {
        name: 'Forged',
      }),
    );
  });
});

describe('publicMenuItems projection boundary', () => {
  it('allows public reads and denies every write', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'publicMenuItems', 'item-1')),
    );
    await assertSucceeds(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'publicMenuItems', 'item-1')),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'publicMenuItems', 'item-1'), {
        priceVnd: 1,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'publicMenuItems', 'item-2'), {
        name: 'Forged',
      }),
    );
  });

  it('keeps private Cost fields out of the customer read path', async () => {
    await seed();

    const publicSnap = await getDoc(
      doc(unauthDb(), 'tenants', TENANT_A, 'publicMenuItems', 'item-1'),
    );
    expect(publicSnap.get('costPriceVnd')).toBeUndefined();
    expect(publicSnap.get('recipeId')).toBeUndefined();
    expect(publicSnap.get('stockCount')).toBeUndefined();
  });
});
