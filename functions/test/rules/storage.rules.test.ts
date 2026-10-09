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
import { getBytes, ref, uploadBytes, deleteObject } from 'firebase/storage';

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

  it('denies a scriptable SVG even though it is an image type', async () => {
    await seed();

    // `image/svg+xml` matches a naive `image/.*` pattern, so it is pinned here
    // to keep the raster allowlist from regressing into a stored-XSS vector.
    await assertFails(
      uploadBytes(ref(staffStorage(), IMAGE_PATH), imageBytes, {
        contentType: 'image/svg+xml',
      }),
    );
  });

  it('denies a client delete of a stored image', async () => {
    await seed();

    await assertFails(
      deleteObject(ref(staffStorage(), IMAGE_PATH)),
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

// ---------------------------------------------------------------------------
// Product-feedback screenshots (REQ-FDB-004, REQ-FDB-005).
//
// The path itself carries the reporter's tenant and uid, so the rule can prove
// ownership from the URL. These tests pin the uid match, the raster allowlist,
// the size bound, the member-only read, and the denied delete.
// ---------------------------------------------------------------------------
const FEEDBACK_UID = STAFF_UID;
const FEEDBACK_PATH = `tenants/${TENANT_A}/feedbackAttachments/${FEEDBACK_UID}/shot-1.png`;

async function seedFeedbackMember(): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'tenants', TENANT_A), { shopName: 'Alpha' });
    await setDoc(doc(db, 'tenants', TENANT_A, 'members', FEEDBACK_UID), {
      uid: FEEDBACK_UID,
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
    await uploadBytes(
      ref(context.storage(), FEEDBACK_PATH),
      new Uint8Array([1, 2, 3]),
      { contentType: 'image/png' },
    );
  });
}

describe('product feedback screenshot write boundary', () => {
  it('allows the reporter to upload a raster image to their own prefix', async () => {
    await seedFeedbackMember();
    await assertSucceeds(
      uploadBytes(ref(staffStorage(), FEEDBACK_PATH), imageBytes, {
        contentType: 'image/png',
      }),
    );
  });

  it('denies an upload into another member uid of the same tenant', async () => {
    await seedFeedbackMember();
    await assertFails(
      uploadBytes(
        ref(staffStorage(), `tenants/${TENANT_A}/feedbackAttachments/${OTHER_UID}/shot.png`),
        imageBytes,
        { contentType: 'image/png' },
      ),
    );
  });

  it('denies a scriptable SVG, a text file, an inactive member, a cross-tenant member, and an anonymous writer', async () => {
    await seedFeedbackMember();

    for (const contentType of ['image/svg+xml', 'text/plain']) {
      await assertFails(
        uploadBytes(ref(staffStorage(), FEEDBACK_PATH), imageBytes, {
          contentType,
        }),
      );
    }
    await assertFails(
      uploadBytes(ref(inactiveStorage(), FEEDBACK_PATH), imageBytes, {
        contentType: 'image/png',
      }),
    );
    await assertFails(
      uploadBytes(ref(otherStorage(), FEEDBACK_PATH), imageBytes, {
        contentType: 'image/png',
      }),
    );
    await assertFails(
      uploadBytes(ref(unauthStorage(), FEEDBACK_PATH), imageBytes, {
        contentType: 'image/png',
      }),
    );
  });

  it('denies an image larger than the bounded size and any client delete', async () => {
    await seedFeedbackMember();
    await assertFails(
      uploadBytes(
        ref(staffStorage(), FEEDBACK_PATH),
        new Uint8Array(MAX_IMAGE_BYTES + 1),
        { contentType: 'image/png' },
      ),
    );
    await assertFails(deleteObject(ref(staffStorage(), FEEDBACK_PATH)));
  });
});

describe('product feedback screenshot read boundary', () => {
  it('allows an active member of the tenant and denies a cross-tenant reader', async () => {
    await seedFeedbackMember();
    await assertSucceeds(getBytes(ref(staffStorage(), FEEDBACK_PATH)));
    await assertFails(getBytes(ref(otherStorage(), FEEDBACK_PATH)));
  });

  it('denies an anonymous read: a screenshot is not public like a menu image', async () => {
    await seedFeedbackMember();
    await assertFails(getBytes(ref(unauthStorage(), FEEDBACK_PATH)));
  });
});

describe('product feedback screenshot ADMIN boundary', () => {
  it('allows an ADMIN claim to read without an evaluation error', async () => {
    await seedFeedbackMember();
    const adminStorage = testEnv
      .authenticatedContext(OTHER_UID, { admin: true })
      .storage();
    await assertSucceeds(getBytes(ref(adminStorage, FEEDBACK_PATH)));
  });

  it('denies a token without the ADMIN claim cleanly, not with an error', async () => {
    await seedFeedbackMember();
    // A bare claim object is the case that used to raise
    // "Property admin is undefined on object" in the Storage rules runtime.
    const plainStorage = testEnv
      .authenticatedContext(OTHER_UID, { someOtherClaim: true })
      .storage();
    await assertFails(getBytes(ref(plainStorage, FEEDBACK_PATH)));
  });
});
