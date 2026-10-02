/**
 * M3/P2 Loyalty, Promotion, and NFC Security Rules tests
 * (REQ-LOY-001, REQ-PRO-001, REQ-NFC-001, NFR-SEC-001, NFR-PRIV-001).
 *
 * Tenant members read their own server-written collections; every direct write
 * is denied. Public NFC links are readable only at the opaque token path.
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
import { doc, getDoc, getDocs, collection, setDoc } from 'firebase/firestore';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';
const OWNER_UID = 'owner-uid';
const OTHER_UID = 'other-uid';
const MEMBER_ID = 'member_84901234567';
const NFC_TOKEN = 'nfc_tok_public_1';

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
    await setDoc(doc(db, 'tenants', TENANT_A, 'loyaltyMembers', MEMBER_ID), {
      memberId: MEMBER_ID,
      phone: '+84901234567',
      pointBalance: 10,
    });
    await setDoc(
      doc(db, 'tenants', TENANT_A, 'loyaltyTransactions', 'tx-1'),
      { transactionId: 'tx-1', points: 10 },
    );
    await setDoc(doc(db, 'tenants', TENANT_A, 'loyaltyConfig', 'current'), {
      earnRateVnd: 10000,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'promotions', 'promo-1'), {
      promotionId: 'promo-1',
      status: 'active',
    });
    await setDoc(doc(db, 'publicNfcLinks', NFC_TOKEN), {
      tenantId: TENANT_A,
      tableId: 'table-1',
      isActive: true,
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
function otherDb() {
  return testEnv.authenticatedContext(OTHER_UID).firestore();
}
function unauthDb() {
  return testEnv.unauthenticatedContext().firestore();
}

describe('Loyalty and Promotion read boundary', () => {
  it('allows an active member to read ledger, config, and promotions', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyTransactions', 'tx-1')),
    );
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyConfig', 'current')),
    );
    await assertSucceeds(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'promotions', 'promo-1')),
    );

    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'loyaltyTransactions', 'tx-1')),
    );
    await assertFails(
      getDoc(doc(otherDb(), 'tenants', TENANT_A, 'promotions', 'promo-1')),
    );
    await assertFails(
      getDoc(doc(unauthDb(), 'tenants', TENANT_A, 'promotions', 'promo-1')),
    );
  });

  it('keeps the Customer-phone source server-only for every client', async () => {
    await seed();
    await assertFails(
      getDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers', MEMBER_ID)),
    );
    await assertFails(
      getDoc(
        doc(
          testEnv.authenticatedContext('admin-uid', { admin: true }).firestore(),
          'tenants',
          TENANT_A,
          'loyaltyMembers',
          MEMBER_ID,
        ),
      ),
    );
    await assertFails(
      getDocs(collection(ownerDb(), 'tenants', TENANT_A, 'loyaltyMembers')),
    );
  });

  it('denies every direct Loyalty and Promotion write', async () => {
    await seed();
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyTransactions', 'forged'), {
        points: 1,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'loyaltyConfig', 'current'), {
        earnRateVnd: 1,
      }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'tenants', TENANT_A, 'promotions', 'forged'), {
        status: 'active',
      }),
    );
  });
});

describe('public NFC link boundary', () => {
  it('allows a single-document get and denies list and write', async () => {
    await seed();
    await assertSucceeds(
      getDoc(doc(unauthDb(), 'publicNfcLinks', NFC_TOKEN)),
    );
    await assertFails(
      getDocs(collection(unauthDb(), 'publicNfcLinks')),
    );
    await assertFails(
      setDoc(doc(unauthDb(), 'publicNfcLinks', 'forged'), { isActive: true }),
    );
    await assertFails(
      setDoc(doc(ownerDb(), 'publicNfcLinks', NFC_TOKEN), { isActive: false }),
    );
  });
});
