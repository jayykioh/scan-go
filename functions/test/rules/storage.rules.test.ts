/**
 * P0-005 Storage Security Rules tests for Tenant menu images
 * (REQ-CAT-001, NFR-SEC-001, NFR-DATA-001).
 *
 * Storage reads are public at the tenant image path; writes require an active
 * Tenant member, an image content type, and a bounded size.
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
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';

const TENANT_A = 'tenant-alpha';
const TENANT_B = 'tenant-bravo';

const STAFF_UID = 'staff-uid';
const INACTIVE_UID = 'inactive-uid';
const OTHER_UID = 'other-uid';

const IMAGE_PATH = `tenants/${TENANT_A}/menuItems/item-1.jpg`;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const firestoreRules = readFileSync(
  new URL('../../../firestore.rules', import.meta.url),
  'utf8',
);
const storageRules = readFileSync(
  new URL('../../../storage.rules', import.meta.url),
  'utf8',
);

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'scango-rules-test',
    firestore: { rules: firestoreRules, host: '127.0.0.1', port: 8080 },
    storage: { rules: storageRules, host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

async function seed(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    await setDoc(doc(db, 'tenants', TENANT_A), { shopName: 'Alpha' });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_UID), {
      uid: STAFF_UID,
      isActive: true,
    });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', INACTIVE_UID), {
      uid: INACTIVE_UID,
      isActive: false,
    });

    await setDoc(doc(db, 'tenants', TENANT_B), { shopName: 'Bravo' });
    await setDoc(doc(db, 'tenants', TENANT_B, 'members', OTHER_UID), {
      uid: OTHER_UID,
      isActive: true,
    });

    await uploadBytes(ref(context.storage(), IMAGE_PATH), new Uint8Array([1, 2, 3]), {
      contentType: 'image/jpeg',
    });
  });
}

function staffStorage() {
  return testEnv.authenticatedContext(STAFF_UID).storage();
}

function otherStorage() {
  return testEnv.authenticatedContext(OTHER_UID).storage();
}

function inactiveStorage() {
  return testEnv.authenticatedContext(INACTIVE_UID).storage();
}

function unauthStorage() {
  return testEnv.unauthenticatedContext().storage();
}

const imageBytes = new Uint8Array([1, 2, 3, 4]);

describe('menu image write boundary', () => {
  it('allows an active Tenant member to upload a scoped image', async () => {
    await seed();

    await assertSucceeds(
      uploadBytes(ref(staffStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('denies a non-image content type and an inactive member', async () => {
    await seed();

    await assertFails(
      uploadBytes(ref(staffStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'text/plain',
      }),
    );
    await assertFails(
      uploadBytes(ref(inactiveStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('denies a cross-tenant member and an anonymous writer', async () => {
    await seed();

    await assertFails(
      uploadBytes(ref(otherStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'image/jpeg',
      }),
    );
    await assertFails(
      uploadBytes(ref(unauthStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'image/jpeg',
      }),
    );
  });

  it('denies an image larger than the bounded size', async () => {
    await seed();

    await assertFails(
      uploadBytes(
        ref(staffStorage(), IMAGE_PATH),
        new Uint8Array(MAX_IMAGE_BYTES + 1),
        { contentType: 'image/jpeg' },
      ),
    );
  });
});

describe('menu image read boundary', () => {
  it('allows a public customer read at the tenant image path', async () => {
    await seed();

    await assertSucceeds(getBytes(ref(unauthStorage(), IMAGE_PATH)));
  });
});
