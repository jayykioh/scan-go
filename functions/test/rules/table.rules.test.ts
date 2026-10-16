/**
 * P0-006 Table Access Security Rules tests (REQ-TBL-001, REQ-TBL-004,
 * REQ-TBL-010, NFR-SEC-001, NFR-SEC-002).
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
const STAFF_UID = 'staff-uid';
const INACTIVE_UID = 'inactive-uid';
const OTHER_UID = 'other-uid';
/** Assigned to "Khu A" only. */
const WAITER_A_UID = 'waiter-a-uid';
/** Assigned to "Khu B" only. */
const WAITER_B_UID = 'waiter-b-uid';

const AREA_A = 'Khu A';
const AREA_B = 'Khu B';

const PUBLIC_TOKEN = 'tok_opaque_public_0001';

const tableRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: tableRules },
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
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', WAITER_A_UID), {
      uid: WAITER_A_UID,
      membershipType: 'staff',
      isActive: true,
      roles: ['waiter'],
      assignedAreas: [AREA_A],
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', WAITER_B_UID), {
      uid: WAITER_B_UID,
      membershipType: 'staff',
      isActive: true,
      roles: ['waiter'],
      assignedAreas: [AREA_B],
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'tables', 'table-1'), {
      name: 'Bàn 1',
      isActive: true,
      activeToken: PUBLIC_TOKEN,
      tokenVersion: 1,
      area: AREA_A,
      areaWaiterUids: [WAITER_A_UID],
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'tables', 'table-b'), {
      name: 'Bàn B',
      isActive: true,
      tokenVersion: 1,
      area: AREA_B,
      areaWaiterUids: [WAITER_B_UID],
    });
    // Written before the area projection existed: no `areaWaiterUids` at all.
    await setDoc(doc(db, 'tenants', TENANT_A, 'tables', 'table-old'), {
      name: 'Bàn cũ',
      isActive: true,
      tokenVersion: 1,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'tableAreas', 'area-a'), {
      schemaVersion: 1,
      tenantId: TENANT_A,
      label: AREA_A,
      waiterUids: [WAITER_A_UID],
      updatedAt: new Date().toISOString(),
      updatedBy: OWNER_UID,
    });

    await setDoc(doc(db, 'publicTableLinks', PUBLIC_TOKEN), {
      tenantId: TENANT_A,
      tableId: 'table-1',
      tableName: 'Bàn 1',
      tokenVersion: 1,
      isActive: true,
      revokedAt: null,
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

describe('private tables read boundary', () => {
  it('allows active members and denies cross-tenant, inactive, and anonymous reads', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'tables', 'table-1')),
    );
    await assertSucceeds(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'tables', 'table-1')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'tables', 'table-1')),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(INACTIVE_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
          'table-1',
        ),
      ),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'tables', 'table-1')),
    );
  });
});

/** REQ-TBL-004, REQ-TBL-010: an assigned Waiter loads only their own areas. */
describe('area scope on the tables collection', () => {
  it('lets an unassigned member keep the tenant-wide read', async () => {
    await seed();

    const snap = await getDocs(
      collection(staffDb(), 'tenants', TENANT_A, 'tables'),
    );
    expect(snap.docs.map((entry) => entry.id).sort()).toEqual([
      'table-1',
      'table-b',
      'table-old',
    ]);
  });

  it('denies an assigned Waiter the unconstrained listener', async () => {
    await seed();

    await assertFails(
      getDocs(
        collection(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
        ),
      ),
    );
  });

  it('returns only the assigned area for the array-contains listener', async () => {
    await seed();

    const snap = await getDocs(
      query(
        collection(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
        ),
        where('areaWaiterUids', 'array-contains', WAITER_A_UID),
        orderBy('name'),
      ),
    );

    expect(snap.docs.map((entry) => entry.id)).toEqual(['table-1']);
  });

  it('serves the scoped listener to a second area without leaking the first', async () => {
    await seed();

    const snap = await getDocs(
      query(
        collection(
          testEnv.authenticatedContext(WAITER_B_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
        ),
        where('areaWaiterUids', 'array-contains', WAITER_B_UID),
      ),
    );

    expect(snap.docs.map((entry) => entry.id)).toEqual(['table-b']);
  });

  it('denies a single read outside the assigned area, Owner excepted', async () => {
    await seed();

    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
          'table-b',
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tables',
          'table-old',
        ),
      ),
    );
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'tables', 'table-b')),
    );
  });
});

describe('tableAreas assignment boundary', () => {
  it('is readable by the Owner and denied to Staff and other tenants', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'tableAreas', 'area-a')),
    );
    await assertSucceeds(
      getDocs(collection(ownerDb(), 'tenants', TENANT_A, 'tableAreas')),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tableAreas',
          'area-a',
        ),
      ),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'tableAreas', 'area-a')),
    );
  });

  it('denies every direct write', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'tableAreas', 'area-b'), {
        label: AREA_B,
        waiterUids: [WAITER_A_UID],
      }),
    );
    await assertFails(
      setDoc(
        doc(
          testEnv.authenticatedContext(WAITER_A_UID).firestore(),
          'tenants',
          TENANT_A,
          'tableAreas',
          'area-a',
        ),
        { waiterUids: [] },
      ),
    );
  });
});
describe('private tables write denial', () => {
  it('denies every direct write, Owner included', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'tables', 'table-1'), {
        activeToken: 'forged',
      }),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'tables', 'table-2'), {
        name: 'Forged',
      }),
    );
  });
});

describe('publicTableLinks token boundary', () => {
  it('allows a get at the opaque token path for anyone', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(unauthDb(), 'publicTableLinks', PUBLIC_TOKEN)),
    );
    await assertSucceeds(
      getDoc(doc(otherDb(), 'publicTableLinks', PUBLIC_TOKEN)),
    );
  });

  it('denies listing the public link collection', async () => {
    await seed();

    await assertFails(getDocs(collection(unauthDb(), 'publicTableLinks')));
    await assertFails(getDocs(collection(ownerDb(), 'publicTableLinks')));
  });

  it('denies every direct public link write', async () => {
    await seed();

    await assertFails(
      setDoc(doc(unauthDb(), 'publicTableLinks', PUBLIC_TOKEN), {
        isActive: false,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'publicTableLinks', 'tok_forged'), {
        tenantId: TENANT_A,
      }),
    );
  });

  it('exposes only minimal public context on the link document', async () => {
    await seed();

    const snap = await getDoc(
      doc(unauthDb(), 'publicTableLinks', PUBLIC_TOKEN),
    );
    expect(snap.get('staffPinHash')).toBeUndefined();
    expect(snap.get('costPriceVnd')).toBeUndefined();
    expect(snap.get('tenantId')).toBe(TENANT_A);
  });
});
