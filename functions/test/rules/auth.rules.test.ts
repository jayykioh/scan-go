/**
 * P0-002A/P0-002B Auth and Tenant Security Rules tests (REQ-AUTH-001,
 * REQ-TEN-001, NFR-SEC-001).
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
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const OWNER_UID = 'owner-uid';
const STAFF_UID = 'staff-uid';
const INACTIVE_UID = 'inactive-uid';
const OTHER_UID = 'other-uid';

const authRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: authRules },
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

    await setDoc(doc(db, 'users', OWNER_UID), {
      email: 'owner@example.com',
      activeTenantId: TENANT_A,
    });

    await setDoc(doc(db, 'tenants', TENANT_A), {
      shopName: 'Alpha',
      archivedAt: null,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', OWNER_UID), {
      uid: OWNER_UID,
      membershipType: 'owner',
      roles: ['owner'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_UID), {
      uid: STAFF_UID,
      membershipType: 'staff',
      roles: ['cashier'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', INACTIVE_UID), {
      uid: INACTIVE_UID,
      membershipType: 'staff',
      roles: ['kitchen'],
      isActive: false,
    });

    await setDoc(doc(db, 'tenants', TENANT_A, 'audit', 'evt-1'), {
      action: 'StaffSessionStarted',
      actorUid: STAFF_UID,
    });

    await setDoc(doc(db, 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'), {
      displayName: 'Khách',
      phone: '+84900000000',
    });

    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      membershipType: 'owner',
      roles: ['owner'],
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

describe('Owner profile read boundary', () => {
  it('allows an Owner to read the Owner profile', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_UID)));
  });

  it('denies an unauthenticated profile read', async () => {
    await seed();
    await assertFails(
      getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'users', OWNER_UID)),
    );
  });

  it('denies a cross-user profile read and write', async () => {
    await seed();
    await assertFails(getDoc(doc(staffDb(), 'users', OWNER_UID)));
    await assertFails(
      setDoc(doc(staffDb(), 'users', OWNER_UID), { activeTenantId: TENANT_B }),
    );
  });
});

describe('membership read and write boundary', () => {
  it('allows a member to read their own membership', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'members', OWNER_UID)),
    );
  });

  it('denies a cross-user membership read and write', async () => {
    await seed();
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', OWNER_UID)),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', OWNER_UID), {
        isActive: false,
      }),
    );
  });

  it('denies direct Tenant and membership writes', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A), { shopName: 'Changed' }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'members', OWNER_UID), {
        isActive: false,
      }),
    );
  });
});

describe('Staff session, audit, and self-scoped boundaries', () => {
  it('allows a Staff member to read only their own membership', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', STAFF_UID)),
    );
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', OWNER_UID)),
    );
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_B, 'members', OTHER_UID)),
    );
  });

  it('denies direct Staff membership writes', async () => {
    await seed();
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', STAFF_UID), {
        staffPinHash: 'scrypt$deadbeef$deadbeef',
        isActive: false,
      }),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'members', STAFF_UID), {
        sessionVersion: 99,
      }),
    );
  });

  it('denies audit reads and writes for members and unauthenticated callers', async () => {
    await seed();
    await assertFails(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'audit', 'evt-1')),
    );
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_A, 'audit', 'evt-1')),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'audit', 'evt-2'), {
        action: 'Forged',
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'audit', 'evt-3'), {
        action: 'Forged',
      }),
    );
    await assertFails(
      setDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'tenants',
          TENANT_A,
          'audit',
          'evt-4',
        ),
        { action: 'Forged' },
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'tenants',
          TENANT_A,
          'audit',
          'evt-1',
        ),
      ),
    );
  });

  it('denies cross-tenant Staff membership reads and writes', async () => {
    await seed();
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_B, 'members', OTHER_UID)),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_B, 'members', STAFF_UID), {
        isActive: true,
      }),
    );
    await assertFails(
      setDoc(doc(otherDb(), 'tenants', TENANT_A, 'members', STAFF_UID), {
        staffPinHash: 'scrypt$deadbeef$deadbeef',
      }),
    );
  });
});

describe('Tenant read scoping', () => {
  it('allows an active member to read the Tenant', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(staffDb(), 'tenants', TENANT_A)));
  });

  it('denies a cross-tenant member and an inactive member', async () => {
    await seed();
    await assertFails(getDoc(doc(otherDb(), 'tenants', TENANT_A)));
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(INACTIVE_UID).firestore(),
          'tenants',
          TENANT_A,
        ),
      ),
    );
  });
});

describe('two-Tenant isolation matrix', () => {
  it('allows each member their own Tenant and denies the other Tenant', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(ownerDb(), 'tenants', TENANT_A)));
    await assertSucceeds(getDoc(doc(otherDb(), 'tenants', TENANT_B)));
    await assertFails(getDoc(doc(otherDb(), 'tenants', TENANT_A)));
    await assertFails(getDoc(doc(ownerDb(), 'tenants', TENANT_B)));
  });

  it('denies cross-tenant membership reads and direct membership writes', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(otherDb(), 'tenants', TENANT_B, 'members', OTHER_UID)),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'members', STAFF_UID)),
    );
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_B, 'members', OTHER_UID)),
    );
    await assertFails(
      setDoc(doc(otherDb(), 'tenants', TENANT_A, 'members', OTHER_UID), {
        isActive: true,
      }),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_B, 'members', OTHER_UID), {
        isActive: false,
      }),
    );
  });

  it('denies cross-tenant profile reads and direct profile writes', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(ownerDb(), 'users', OWNER_UID)));
    await assertSucceeds(getDoc(doc(otherDb(), 'users', OTHER_UID)));
    await assertFails(getDoc(doc(otherDb(), 'users', OWNER_UID)));
    await assertFails(getDoc(doc(ownerDb(), 'users', OTHER_UID)));
    // activeTenantId is server-owned navigation state, never client-written.
    await assertFails(
      setDoc(doc(ownerDb(), 'users', OWNER_UID), { activeTenantId: TENANT_B }),
    );
  });

  it('denies direct Tenant writes for a member and a cross-tenant user', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A), { shopName: 'Changed' }),
    );
    await assertFails(
      setDoc(doc(otherDb(), 'tenants', TENANT_B), { shopName: 'Changed' }),
    );
  });
});

describe('server-only provisioning boundary', () => {
  it('denies client-created Tenant, membership, and profile documents', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', 'tenant-client'), {
        shopName: 'Client',
      }),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', 'tenant-client', 'members', OWNER_UID),
        {
          uid: OWNER_UID,
          membershipType: 'owner',
          isActive: true,
        },
      ),
    );
    // The Owner cannot self-provision the navigation field either.
    await assertFails(
      setDoc(doc(ownerDb(), 'users', OWNER_UID), { activeTenantId: TENANT_B }),
    );
  });

  it('denies listing the Tenant collection to any client', async () => {
    await seed();
    await assertFails(getDocs(collection(ownerDb(), 'tenants')));
    await assertFails(getDocs(collection(staffDb(), 'tenants')));
    await assertFails(getDocs(collection(otherDb(), 'tenants')));
  });

  it('denies an unauthenticated Tenant read', async () => {
    await seed();
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'tenants',
          TENANT_A,
        ),
      ),
    );
  });
});

describe('Customer-phone source is server-only (NFR-PRIV-001)', () => {
  it('denies direct phone reads and writes for every client', async () => {
    await seed();
    await assertFails(
      getDocs(collection(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers')),
    );
    await assertFails(
      getDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'),
      ),
    );
    await assertFails(
      getDoc(
        doc(staffDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'),
      ),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'), {
        phone: '+84111111111',
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers', 'member-1'), {
        phone: '+84222222222',
      }),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.unauthenticatedContext().firestore(),
          'tenants',
          TENANT_A,
          'loyaltyMembers',
          'member-1',
        ),
      ),
    );
  });

  it('denies phone reads to the ADMIN claim as well', async () => {
    await seed();
    const adminDb = testEnv
      .authenticatedContext('admin-uid', { admin: true })
      .firestore();
    await assertFails(
      getDoc(doc(adminDb, 'tenants', TENANT_A, 'loyaltyMembers', 'member-1')),
    );
  });
});
