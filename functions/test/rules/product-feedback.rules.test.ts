/**
 * Product feedback Security Rules tests (REQ-FDB-004, REQ-FDB-006).
 *
 * Product feedback is server-written only: no client may create, update, or
 * delete a report, and only an active Owner or ADMIN may read one. These tests
 * pin that boundary so a future Rules edit cannot quietly open a direct write.
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
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const OWNER_UID = 'owner-uid';
const STAFF_UID = 'staff-uid';
const OTHER_UID = 'other-uid';
const FEEDBACK_ID = 'product-feedback-001';

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
      uid: OWNER_UID,
      membershipType: 'owner',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_UID), {
      uid: STAFF_UID,
      membershipType: 'staff',
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      membershipType: 'owner',
      isActive: true,
    });

    await setDoc(
      doc(db, 'tenants', TENANT_A, 'productFeedback', FEEDBACK_ID),
      {
        tenantId: TENANT_A,
        category: 'bug',
        severity: 'high',
        status: 'received',
        message: 'Màn hình bếp trắng trang sau khi đăng nhập PIN.',
        actorUid: OWNER_UID,
        createdAt: '2026-10-08T10:00:00.000Z',
      },
    );
  });
}

const feedbackDoc = (db: Firestore) =>
  doc(db, 'tenants', TENANT_A, 'productFeedback', FEEDBACK_ID);

describe('product feedback read boundary', () => {
  it('allows an active Owner to read the report', async () => {
    await seed();
    const db = testEnv.authenticatedContext(OWNER_UID).firestore();
    await assertSucceeds(getDoc(feedbackDoc(db)));
  });

  it('denies a Staff member, a cross-tenant Owner, and an anonymous reader', async () => {
    await seed();
    await assertFails(
      getDoc(feedbackDoc(testEnv.authenticatedContext(STAFF_UID).firestore())),
    );
    await assertFails(
      getDoc(feedbackDoc(testEnv.authenticatedContext(OTHER_UID).firestore())),
    );
    await assertFails(
      getDoc(feedbackDoc(testEnv.unauthenticatedContext().firestore())),
    );
  });

  it('denies an inactive Owner', async () => {
    await seed();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(
        doc(context.firestore(), 'tenants', TENANT_A, 'members', OWNER_UID),
        { isActive: false },
        { merge: true },
      );
    });
    await assertFails(
      getDoc(feedbackDoc(testEnv.authenticatedContext(OWNER_UID).firestore())),
    );
  });

  it('denies reading a report that does not exist to a Staff member', async () => {
    await seed();
    const db = testEnv.authenticatedContext(STAFF_UID).firestore();
    await assertFails(
      getDoc(doc(db, 'tenants', TENANT_A, 'productFeedback', 'missing')),
    );
  });
});

describe('product feedback write boundary', () => {
  it('denies create, update, and delete for every client', async () => {
    await seed();
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore();

    await assertFails(
      addDoc(collection(ownerDb, 'tenants', TENANT_A, 'productFeedback'), {
        tenantId: TENANT_A,
        message: 'ghi trực tiếp từ client',
      }),
    );
    await assertFails(
      updateDoc(feedbackDoc(ownerDb), { status: 'resolved' }),
    );
    await assertFails(deleteDoc(feedbackDoc(ownerDb)));
  });
});
