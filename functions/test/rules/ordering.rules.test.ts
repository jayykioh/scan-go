/**
 * P0-007 Ordering Security Rules tests (REQ-ORD-002, REQ-ORD-003, NFR-SEC-002,
 * NFR-PRIV-001).
 *
 * These tests prove the public tracking-token read boundary, deny Customer
 * reads of the tenant Orders collection, and deny every direct business write.
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

const TRACKING_TOKEN = 'track-public-001';
const ORDER_ID = 'order-001';

const orderingRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: orderingRules },
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
    await setDoc(doc(db, 'tenants', TENANT_A, 'orders', ORDER_ID), {
      orderId: ORDER_ID,
      tenantId: TENANT_A,
      status: 'pending',
      totalVnd: 100000,
    });
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'orders', ORDER_ID, 'statusEvents', 'event-1'),
      { newStatus: 'pending' },
    );
    await setDoc(doc(db, 'tenants', TENANT_A, 'idempotency', 'idem-1'), {
      orderId: ORDER_ID,
    });
    await setDoc(doc(db, 'publicOrderTracking', TRACKING_TOKEN), {
      trackingToken: TRACKING_TOKEN,
      tenantId: TENANT_A,
      orderId: ORDER_ID,
      status: 'pending',
      totalVnd: 100000,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'notifications', 'evt-1'), {
      eventId: 'evt-1',
      tenantId: TENANT_A,
      channel: 'waiter',
      kind: 'orderReady',
      orderId: ORDER_ID,
      tableName: 'Bàn 1',
      createdAt: '2026-09-12T07:10:00.000Z',
    });
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'archivedOrders', ORDER_ID),
      { orderId: ORDER_ID, tenantId: TENANT_A, status: 'paid' },
    );
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

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('publicOrderTracking read boundary', () => {
  it('allows a token get and denies list', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(unauthDb(), 'publicOrderTracking', TRACKING_TOKEN)),
    );
    await assertSucceeds(
      getDoc(doc(otherDb(), 'publicOrderTracking', TRACKING_TOKEN)),
    );
  });

  it('denies every direct write, Owner and anonymous included', async () => {
    await seed();

    await assertFails(
      setDoc(doc(unauthDb(), 'publicOrderTracking', TRACKING_TOKEN), {
        status: 'paid',
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'publicOrderTracking', 'forged'), {
        status: 'paid',
      }),
    );
  });
});

describe('tenant Orders read boundary', () => {
  it('denies Customer and member direct Order reads', async () => {
    await seed();

    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'orders', ORDER_ID)),
    );
    await assertFails(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'orders', ORDER_ID)),
    );
  });
});

describe('notification tenant scoping (REQ-NOT-001, NFR-SEC-001)', () => {
  it('allows an active member read and denies a cross-tenant read', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'notifications', 'evt-1')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'notifications', 'evt-1')),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'notifications', 'evt-1')),
    );
  });

  it('denies every direct notification write', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'notifications', 'forged'), {
        eventId: 'forged',
      }),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'notifications', 'forged'), {
        eventId: 'forged',
      }),
    );
  });
});

describe('retention archive boundary (NFR-RET-001, P0-L02)', () => {
  it('allows an active member read and denies a cross-tenant read', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'archivedOrders', ORDER_ID)),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'archivedOrders', ORDER_ID)),
    );
  });

  it('keeps archived protected data server-write-only', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'archivedOrders', 'forged'),
        { status: 'paid' },
      ),
    );
    await assertFails(
      setDoc(
        doc(unauthDb(), 'tenants', TENANT_A, 'archivedOrders', ORDER_ID),
        { archivedAt: 'forged' },
        { merge: true },
      ),
    );
  });
});

describe('Tenant onboarding field write denial (REQ-ONB-001)', () => {
  it('allows an active member read and denies every direct write', async () => {
    await seed();

    await assertSucceeds(getDoc(doc(ownerDb(), 'tenants', TENANT_A)));
    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A),
        { onboardingChecklist: { shopName: '2026-09-12T07:10:00.000Z' } },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(doc(otherDb(), 'tenants', TENANT_A), { shopName: 'Hijack' }),
    );
  });
});

describe('tenant Orders and idempotency write denial', () => {
  it('denies every direct business write', async () => {
    await seed();

    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'orders', ORDER_ID), {
        status: 'cooking',
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'orders', 'forged'), {
        status: 'paid',
      }),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'orders', ORDER_ID, 'statusEvents', 'forged'),
        { newStatus: 'paid' },
      ),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'idempotency', 'forged'), {
        orderId: 'forged',
      }),
    );
  });

  it('denies status-event reads', async () => {
    await seed();

    await assertFails(
      getDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'orders', ORDER_ID, 'statusEvents', 'event-1'),
      ),
    );
  });
});
