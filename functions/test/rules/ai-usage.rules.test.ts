/**
 * AI usage and Insight Security Rules tests (REQ-AI-002, REQ-AI-004,
 * REQ-AI-005, NFR-AI-002, NFR-SEC-001).
 *
 * These tests prove tenant-scoped `aiUsage` and `aiInsights` reads, deny
 * cross-tenant and anonymous reads, and deny every direct write. AI records
 * are server-written only.
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
const OTHER_UID = 'other-uid';
const USAGE_ID = 'usage-001';
const INSIGHT_ID = 'insight-001';

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
      roles: ['cashier'],
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'aiUsage', USAGE_ID), {
      tenantId: TENANT_A,
      provider: 'rule-based',
      estimatedCostVnd: 0,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'aiInsights', INSIGHT_ID), {
      tenantId: TENANT_A,
      periodStart: '20260907',
      status: 'new',
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
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

describe('tenant aiUsage read boundary', () => {
  it('allows an active Owner to read usage', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'aiUsage', USAGE_ID)),
    );
  });

  it('denies a non-Owner member because provider spend is Owner data', async () => {
    await seed();
    await assertFails(
      getDoc(doc(memberDb(), 'tenants', TENANT_A, 'aiUsage', USAGE_ID)),
    );
  });

  it('denies cross-tenant and anonymous reads', async () => {
    await seed();
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'aiUsage', USAGE_ID)),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'aiUsage', USAGE_ID)),
    );
  });
});

describe('tenant aiUsage write denial', () => {
  it('denies every direct write', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'aiUsage', 'forged'), {
        estimatedCostVnd: 999999,
      }),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'aiUsage', 'forged'), {
        estimatedCostVnd: 1,
      }),
    );
  });
});

describe('tenant aiInsights boundary', () => {
  it('allows an active Owner to read insights', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'aiInsights', INSIGHT_ID)),
    );
  });

  it('denies a non-Owner member because insights summarise margin and loss', async () => {
    await seed();
    await assertFails(
      getDoc(doc(memberDb(), 'tenants', TENANT_A, 'aiInsights', INSIGHT_ID)),
    );
  });

  it('denies cross-tenant and anonymous reads', async () => {
    await seed();
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'aiInsights', INSIGHT_ID)),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'aiInsights', INSIGHT_ID)),
    );
  });

  it('denies every direct write', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'aiInsights', 'forged'), {
        tenantId: TENANT_A,
      }),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'tenants', TENANT_A, 'aiInsights', 'forged'), {
        tenantId: TENANT_A,
      }),
    );
  });
});
