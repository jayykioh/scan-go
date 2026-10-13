import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TENANT_ID = 'staff-directory-tenant';
const OWNER_UID = 'owner-uid';
const STAFF_UID = 'staff-uid';
const OTHER_UID = 'other-uid';
const RULES = readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-staff-directory-rules-test',
    firestore: { rules: RULES },
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
    await setDoc(doc(db, 'tenants', TENANT_ID), { shopName: 'Staff Shop' });
    await setDoc(doc(db, 'tenants', TENANT_ID, 'members', OWNER_UID), {
      uid: OWNER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_ID, 'members', STAFF_UID), {
      uid: STAFF_UID,
      membershipType: 'staff',
      roles: ['cashier'],
      isActive: true,
      staffPinHash: 'must-never-be-readable',
    });
    await setDoc(doc(db, 'tenants', TENANT_ID, 'staffDirectory', STAFF_UID), {
      schemaVersion: 1,
      tenantId: TENANT_ID,
      uid: STAFF_UID,
      email: 'cashier@example.com',
      displayName: 'Cashier',
      roles: ['cashier'],
      isActive: true,
      hasPin: true,
      createdAt: '2026-10-03T00:00:00.000Z',
      updatedAt: '2026-10-03T00:00:00.000Z',
    });
  });
}

function ownerDb() {
  return testEnv.authenticatedContext(OWNER_UID).firestore();
}

function staffDb() {
  return testEnv.authenticatedContext(STAFF_UID).firestore();
}

describe('Owner-only Staff directory projection', () => {
  it('allows only the active Owner to read the safe projection', async () => {
    await seed();

    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_ID, 'staffDirectory', STAFF_UID)),
    );
    await assertFails(
      getDoc(doc(staffDb(), 'tenants', TENANT_ID, 'staffDirectory', STAFF_UID)),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext(OTHER_UID).firestore(),
          'tenants',
          TENANT_ID,
          'staffDirectory',
          STAFF_UID,
        ),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext('admin-uid', { admin: true }).firestore(),
          'tenants',
          TENANT_ID,
          'staffDirectory',
          STAFF_UID,
        ),
      ),
    );
  });

  it('denies every client write, including an Owner', async () => {
    await seed();

    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_ID, 'staffDirectory', STAFF_UID), {
        displayName: 'Forged',
      }),
    );
    await assertFails(
      setDoc(doc(staffDb(), 'tenants', TENANT_ID, 'staffDirectory', 'new'), {
        displayName: 'Forged',
      }),
    );
  });
});
