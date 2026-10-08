import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import {
  staffCommandResultSchema,
  staffListResultSchema,
  STAFF_CONTRACT_VERSION,
} from '../../../../shared/contracts/staff.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEvent } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import { hashPin } from '../auth/service.js';
import {
  STAFF_EMAIL_IN_USE_MESSAGE,
  STAFF_LIST_LIMIT,
  STAFF_NOT_FOUND_MESSAGE,
  assertActiveOwnerMember,
  buildStaffMembershipDocument,
  computeNextSessionVersion,
  memberCollectionPath,
  nowIso,
  parseStaffCreateInput,
  parseStaffListInput,
  parseStaffResetPinInput,
  parseStaffSetActiveInput,
  parseStaffUpdateInput,
  requireUid,
  toStaffAccount,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

async function requireActiveOwner(
  tenantId: string,
  uid: string,
): Promise<void> {
  const memberSnap = await getDb()
    .doc(`tenants/${tenantId}/members/${uid}`)
    .get();
  assertActiveOwnerMember(memberSnap.exists ? memberSnap.data() : undefined);
}

/**
 * Owner query: bounded Staff list for one Tenant. Memberships are private to
 * their user, so the client can never read the collection directly
 * (docs/RULES_FIREBASE.md §1, REQ-AUTH-003).
 */
export const callableStaffList = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseStaffListInput(request.data);
  await requireActiveOwner(input.tenantId, uid);

  const db = getDb();
  const snap = await db
    .collection(memberCollectionPath(input.tenantId))
    .where('membershipType', '==', 'staff')
    .limit(STAFF_LIST_LIMIT)
    .get();

  return staffListResultSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    tenantId: input.tenantId,
    staff: snap.docs.map((doc) =>
      toStaffAccount(input.tenantId, doc.id, doc.data()),
    ),
  });
});

/**
 * Owner command: create one Firebase Auth account plus its Staff membership.
 * The plaintext PIN is hashed before storage and never returned
 * (REQ-AUTH-002, REQ-AUTH-003).
 */
export const callableStaffCreate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseStaffCreateInput(request.data);
  await requireActiveOwner(input.tenantId, uid);

  const auth = getAuth();
  try {
    await auth.getUserByEmail(input.email);
    throw new HttpsError('already-exists', STAFF_EMAIL_IN_USE_MESSAGE);
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    // A missing user is the expected path; any other failure propagates below.
  }

  let created;
  try {
    created = await auth.createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });
  } catch {
    throw new HttpsError('already-exists', STAFF_EMAIL_IN_USE_MESSAGE);
  }

  const now = nowIso();
  const pinHash = await hashPin(input.pin);
  const db = getDb();
  const staff = buildStaffMembershipDocument({
    uid: created.uid,
    email: input.email,
    displayName: input.displayName,
    roles: input.roles,
    permissions: input.permissions,
    pinHash,
    now,
  });
  await db
    .doc(`${memberCollectionPath(input.tenantId)}/${created.uid}`)
    .set(staff);

  await writeAuditEvent({
    tenantId: input.tenantId,
    actorUid: uid,
    actorType: 'owner',
    role: 'owner',
    action: 'StaffCreated',
    targetType: 'member',
    targetId: created.uid,
    detail: { roles: input.roles },
  }).catch(() => undefined);

  return staffCommandResultSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    status: 'applied',
    staff: toStaffAccount(input.tenantId, created.uid, staff),
  });
});

/** Owner command: update one Staff member's name, roles, and permissions. */
export const callableStaffUpdate = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseStaffUpdateInput(request.data);
  await requireActiveOwner(input.tenantId, uid);

  const db = getDb();
  const memberRef = db.doc(
    `${memberCollectionPath(input.tenantId)}/${input.uid}`,
  );
  const snap = await memberRef.get();
  if (!snap.exists || snap.get('membershipType') !== 'staff') {
    throw new HttpsError('not-found', STAFF_NOT_FOUND_MESSAGE);
  }

  const now = nowIso();
  await memberRef.set(
    {
      displayName: input.displayName,
      roles: [...input.roles],
      permissions: [...input.permissions],
      updatedAt: now,
    },
    { merge: true },
  );

  await writeAuditEvent({
    tenantId: input.tenantId,
    actorUid: uid,
    actorType: 'owner',
    role: 'owner',
    action: 'StaffUpdated',
    targetType: 'member',
    targetId: input.uid,
    detail: { roles: input.roles },
  }).catch(() => undefined);

  const updated = await memberRef.get();
  return staffCommandResultSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    status: 'applied',
    staff: toStaffAccount(input.tenantId, input.uid, updated.data() ?? {}),
  });
});

/**
 * Owner command: enable or disable one Staff member. Disabling bumps
 * `sessionVersion`, so every issued Staff session is revoked
 * (REQ-AUTH-002, REQ-AUTH-003).
 */
export const callableStaffSetActive = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseStaffSetActiveInput(request.data);
  await requireActiveOwner(input.tenantId, uid);

  const db = getDb();
  const memberRef = db.doc(
    `${memberCollectionPath(input.tenantId)}/${input.uid}`,
  );
  const snap = await memberRef.get();
  if (!snap.exists || snap.get('membershipType') !== 'staff') {
    throw new HttpsError('not-found', STAFF_NOT_FOUND_MESSAGE);
  }

  const now = nowIso();
  const update: Record<string, unknown> = {
    isActive: input.isActive,
    updatedAt: now,
  };
  if (!input.isActive) {
    update.sessionVersion = computeNextSessionVersion(
      snap.get('sessionVersion'),
    );
  }
  await memberRef.set(update, { merge: true });

  await writeAuditEvent({
    tenantId: input.tenantId,
    actorUid: uid,
    actorType: 'owner',
    role: 'owner',
    action: input.isActive ? 'StaffActivated' : 'StaffDeactivated',
    targetType: 'member',
    targetId: input.uid,
  }).catch(() => undefined);

  const updated = await memberRef.get();
  return staffCommandResultSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    status: 'applied',
    staff: toStaffAccount(input.tenantId, input.uid, updated.data() ?? {}),
  });
});

/** Owner command: replace one Staff PIN hash and clear any lockout. */
export const callableStaffResetPin = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseStaffResetPinInput(request.data);
  await requireActiveOwner(input.tenantId, uid);

  const db = getDb();
  const memberRef = db.doc(
    `${memberCollectionPath(input.tenantId)}/${input.uid}`,
  );
  const snap = await memberRef.get();
  if (!snap.exists || snap.get('membershipType') !== 'staff') {
    throw new HttpsError('not-found', STAFF_NOT_FOUND_MESSAGE);
  }

  const now = nowIso();
  const pinHash = await hashPin(input.pin);
  await memberRef.set(
    {
      staffPinHash: pinHash,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      sessionVersion: computeNextSessionVersion(snap.get('sessionVersion')),
      updatedAt: now,
    },
    { merge: true },
  );

  await writeAuditEvent({
    tenantId: input.tenantId,
    actorUid: uid,
    actorType: 'owner',
    role: 'owner',
    action: 'StaffPinReset',
    targetType: 'member',
    targetId: input.uid,
  }).catch(() => undefined);

  const updated = await memberRef.get();
  return staffCommandResultSchema.parse({
    schemaVersion: STAFF_CONTRACT_VERSION,
    status: 'applied',
    staff: toStaffAccount(input.tenantId, input.uid, updated.data() ?? {}),
  });
});
