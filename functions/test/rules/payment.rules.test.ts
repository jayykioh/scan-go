/**
 * P0-009 Payment Security Rules tests (REQ-CAS-001, NFR-SEC-001, REQ-PAY-001).
 *
 * These tests prove tenant-scoped Payment reads, deny cross-tenant Payment
 * reads, and deny every direct Payment write. Payment records are immutable
 * and server-written only.
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
const KITCHEN_UID = 'kitchen-uid';
const PAYMENT_ID = 'payment_order-001';

const paymentRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: paymentRules },
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
    // A Kitchen member settles nothing at the till, so money stays out of the
    // reduced permission set.
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', KITCHEN_UID), {
      uid: KITCHEN_UID,
      membershipType: 'staff',
      roles: ['kitchen'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'payments', PAYMENT_ID), {
      paymentId: PAYMENT_ID,
      tenantId: TENANT_A,
      orderId: 'order-001',
      amountVnd: 100000,
      method: 'cash',
      status: 'confirmed',
    });
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'payments', `${PAYMENT_ID}__reversal`),
      {
        paymentId: `${PAYMENT_ID}__reversal`,
        tenantId: TENANT_A,
        orderId: 'order-001',
        amountVnd: 100000,
        method: 'cash',
        status: 'reversed',
        linkedPaymentId: PAYMENT_ID,
        correctionKind: 'reversal',
      },
    );
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'archivedPayments', PAYMENT_ID),
      { paymentId: PAYMENT_ID, tenantId: TENANT_A, status: 'confirmed' },
    );
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'paymentAdapterEvidence', 'evidence-1'),
      { evidenceId: 'evidence-1', tenantId: TENANT_A },
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

function memberDb() {
  return testEnv.authenticatedContext(MEMBER_UID).firestore();
}

function kitchenDb() {
  return testEnv.authenticatedContext(KITCHEN_UID).firestore();
}

function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}

function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('tenant Payment read boundary', () => {
  it('allows the Owner and an active Cashier to read payment records', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID)),
    );
    await assertSucceeds(
      getDoc(doc(memberDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID)),
    );
  });

  it('denies a non-Cashier member because money is not in their permission set', async () => {
    await seed();

    await assertFails(
      getDoc(doc(kitchenDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID)),
    );
  });

  it('denies cross-tenant and anonymous Payment reads', async () => {
    await seed();

    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID)),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID)),
    );
  });
});

describe('retention and provider evidence boundary (P0-L02, P0-L08)', () => {
  it('allows an active member read and denies a cross-tenant read', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'archivedPayments', PAYMENT_ID)),
    );
    await assertSucceeds(
      getDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'paymentAdapterEvidence', 'evidence-1'),
      ),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'archivedPayments', PAYMENT_ID)),
    );
    await assertFails(
      getDoc(
        doc(otherDb(), 'tenants', TENANT_A, 'paymentAdapterEvidence', 'evidence-1'),
      ),
    );
  });

  it('keeps archived and evidence records server-write-only', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'archivedPayments', 'forged'),
        { status: 'confirmed' },
      ),
    );
    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'paymentAdapterEvidence', 'forged'),
        { evidenceId: 'forged' },
      ),
    );
  });
});

describe('compensating Payment write denial (REQ-PAY-001, P0-L09)', () => {
  it('denies a direct compensating reversal write and cross-tenant reads', async () => {
    await seed();

    await assertFails(
      setDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'payments', `${PAYMENT_ID}__reversal`),
        { status: 'refunded' },
        { merge: true },
      ),
    );
    await assertSucceeds(
      getDoc(
        doc(ownerDb(), 'tenants', TENANT_A, 'payments', `${PAYMENT_ID}__reversal`),
      ),
    );
    await assertFails(
      getDoc(
        doc(otherDb(), 'tenants', TENANT_A, 'payments', `${PAYMENT_ID}__reversal`),
      ),
    );
  });
});

describe('tenant Payment write denial', () => {
  it('denies every direct Payment write, member, Owner, and forged included', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'payments', PAYMENT_ID), {
        status: 'refunded',
      }),
    );
    await assertFails(
      setDoc(doc(memberDb(), 'tenants', TENANT_A, 'payments', 'forged'), {
        orderId: 'order-001',
        amountVnd: 100000,
        method: 'cash',
        status: 'confirmed',
      }),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'payments', 'forged'), {
        status: 'confirmed',
      }),
    );
    await assertFails(
      setDoc(
        doc(otherDb(), 'tenants', TENANT_B, 'payments', 'forged'),
        { status: 'confirmed' },
      ),
    );
  });
});
