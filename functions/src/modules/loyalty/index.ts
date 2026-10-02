import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { CUSTOMER_PHONE_PERMISSION } from '../../../../shared/contracts/authorization.contract.js';
import {
  LOYALTY_CONTRACT_VERSION,
  buildDefaultLoyaltyConfig,
  computeEarnedPoints,
  loyaltyConfigResultSchema,
  loyaltyEarnTransactionId,
  loyaltyListResultSchema,
  loyaltyMemberIdFor,
  loyaltyPointResultSchema,
  loyaltyRegisterResultSchema,
  loyaltyReverseTransactionId,
  loyaltyVerifyResultSchema,
  type LoyaltyTransaction,
} from '../../../../shared/contracts/loyalty.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { assertRateLimit } from '../../shared/rateLimit.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  decideCustomerPhoneAccess,
  mapAuthorizationMembership,
  type AuthorizationMembership,
} from '../tenant/service.js';
import {
  assertFeatureEntitlement,
  loadSubscriptionState,
} from '../subscription/service.js';
import { resolvePublicOrderRateLimit } from '../table-access/service.js';
import {
  assertActiveMember,
  assertCashierOrOwnerMember,
  assertOwnerMember,
  buildLoyaltyConfigDocument,
  buildLoyaltyEarnPlan,
  buildLoyaltyMemberDocument,
  buildLoyaltyRedeemPlan,
  buildLoyaltyRequestHash,
  buildLoyaltyReversePlan,
  generateLoyaltyVerificationCode,
  hashLoyaltyVerificationCode,
  LOYALTY_CODE_INVALID_MESSAGE,
  LOYALTY_CONFIG_PATH,
  LOYALTY_IDEMPOTENCY_CONFLICT_MESSAGE,
  LOYALTY_MEMBER_COLLECTION,
  LOYALTY_MEMBER_NOT_FOUND_MESSAGE,
  LOYALTY_NOTHING_TO_REVERSE_MESSAGE,
  LOYALTY_VERIFICATION_TTL_MINUTES,
  loyaltyMemberPath,
  loyaltyTransactionPath,
  mapStoredLoyaltyMember,
  normalizeLoyaltyPhoneOrThrow,
  nowIso,
  parseLoyaltyEarnInput,
  parseLoyaltyGetConfigInput,
  parseLoyaltyListInput,
  parseLoyaltyRedeemInput,
  parseLoyaltyRegisterInput,
  parseLoyaltyReverseInput,
  parseLoyaltyUpdateConfigInput,
  parseLoyaltyVerifyInput,
  parseStoredLoyaltyConfig,
  requireUid,
  resolveLoyaltyConfig,
  toLoyaltyMemberView,
  isAdminToken,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const LOYALTY_LIST_LIMIT = 100;

/**
 * Trusted-code plan gate. Loyalty is a restricted capability, so every
 * mutating Loyalty command verifies the tenant plan entitlement before it
 * runs (REQ-SUB-001, docs/module/subscription.md).
 */
async function assertLoyaltyEntitlement(
  db: import('firebase-admin/firestore').Firestore,
  tenantId: string,
): Promise<void> {
  const state = await loadSubscriptionState(db, tenantId);
  assertFeatureEntitlement(state, 'loyalty');
}

function phoneVisibleFor(input: {
  uid: string;
  tenantId: string;
  memberData: DocumentData | undefined;
  isAdmin: boolean;
}): boolean {
  const membership: AuthorizationMembership | undefined =
    mapAuthorizationMembership(input.memberData);
  const decision = decideCustomerPhoneAccess({
    uid: input.uid,
    tenantId: input.tenantId,
    membership,
    isAdmin: input.isAdmin,
    decidedAt: nowIso(),
  });
  return (
    decision.allowed && decision.permission === CUSTOMER_PHONE_PERMISSION
  );
}

/**
 * Register or reuse one verified-phone Loyalty member. The member id is
 * deterministic from the normalized `+84` phone, so a retry returns the same
 * member (REQ-LOY-001, docs/module/loyalty.md).
 *
 * VERIFICATION DELIVERY (TODO): sending the six-digit code by SMS/Zalo is an
 * external provider step. The server issues, stores a hash, expires it, and
 * verifies it; wiring a real delivery channel is a separate device/provider
 * task. Until then the verification seam is exercised by tests.
 */
export const callableLoyaltyRegisterMember = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyRegisterInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();
    const limit = await resolvePublicOrderRateLimit(db);
    assertRateLimit(`loyalty-register:${uid}`, limit);
    await assertLoyaltyEntitlement(db, input.tenantId);

    const config = await resolveLoyaltyConfig(db, input.tenantId);
    const normalizedPhone = normalizeLoyaltyPhoneOrThrow(input.phone);
    const memberId = loyaltyMemberIdFor(normalizedPhone);
    const memberRef = db.doc(loyaltyMemberPath(input.tenantId, memberId));
    const memberCallerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);

    const outcome = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(memberCallerRef);
      const memberSnap = await transaction.get(memberRef);
      assertCashierOrOwnerMember(callerSnap.data());

      const now = nowIso();
      if (memberSnap.exists) {
        return {
          replayed: true,
          member: mapStoredLoyaltyMember(
            memberId,
            input.tenantId,
            memberSnap.data() ?? {},
          ),
          callerData: callerSnap.data(),
        };
      }

      const code = generateLoyaltyVerificationCode();
      const expiresAt = new Date(
        Date.now() + LOYALTY_VERIFICATION_TTL_MINUTES * 60_000,
      ).toISOString();
      const member = buildLoyaltyMemberDocument({
        tenantId: input.tenantId,
        phone: normalizedPhone,
        displayName: input.displayName ?? null,
        now,
        verificationCodeHash: hashLoyaltyVerificationCode(code),
        verificationExpiresAt: expiresAt,
      });
      transaction.set(memberRef, member);
      if (config.welcomePoints > 0) {
        const transactionId = `loyalty_welcome_${member.memberId}`;
        const welcome: LoyaltyTransaction = {
          schemaVersion: LOYALTY_CONTRACT_VERSION,
          transactionId,
          tenantId: input.tenantId,
          memberId: member.memberId,
          kind: 'welcome',
          points: config.welcomePoints,
          balanceAfter: config.welcomePoints,
          orderId: null,
          reason: null,
          idempotencyKey: input.idempotencyKey,
          actorUid: uid,
          createdAt: now,
        };
        transaction.set(
          db.doc(loyaltyTransactionPath(input.tenantId, transactionId)),
          welcome,
        );
        member.pointBalance = config.welcomePoints;
        transaction.set(memberRef, member, { merge: true });
      }
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'LoyaltyMemberRegistered',
        targetType: 'loyalty_member',
        targetId: member.memberId,
        detail: { requestedVerification: true },
      });
      return { replayed: false, member, callerData: callerSnap.data() };
    });

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: outcome.callerData,
      isAdmin,
    });
    return loyaltyRegisterResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'registered',
      member: toLoyaltyMemberView(outcome.member, visible),
      verificationRequired: !outcome.member.isVerified,
    });
  },
);

/** Verify the issued phone code. A verified member may redeem points. */
export const callableLoyaltyVerifyMember = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyVerifyInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();
    const limit = await resolvePublicOrderRateLimit(db);
    assertRateLimit(`loyalty-verify:${uid}`, limit);
    await assertLoyaltyEntitlement(db, input.tenantId);

    const memberRef = db.doc(
      loyaltyMemberPath(input.tenantId, input.memberId),
    );
    const callerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const now = nowIso();

    const outcome = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(callerRef);
      const memberSnap = await transaction.get(memberRef);
      assertCashierOrOwnerMember(callerSnap.data());
      if (!memberSnap.exists) {
        throw new HttpsError('not-found', LOYALTY_MEMBER_NOT_FOUND_MESSAGE);
      }
      const member = mapStoredLoyaltyMember(
        input.memberId,
        input.tenantId,
        memberSnap.data() ?? {},
      );
      if (member.isVerified) {
        return { replayed: true, member, callerData: callerSnap.data() };
      }
      const expected = member.verificationCodeHash;
      const expiresAt = member.verificationExpiresAt
        ? Date.parse(member.verificationExpiresAt)
        : 0;
      if (
        expected !== hashLoyaltyVerificationCode(input.code) ||
        Date.parse(now) > expiresAt
      ) {
        throw new HttpsError('invalid-argument', LOYALTY_CODE_INVALID_MESSAGE);
      }
      const next = {
        ...member,
        isVerified: true,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        updatedAt: now,
      };
      transaction.set(memberRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'LoyaltyMemberVerified',
        targetType: 'loyalty_member',
        targetId: member.memberId,
        detail: {},
      });
      return { replayed: false, member: next, callerData: callerSnap.data() };
    });

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: outcome.callerData,
      isAdmin,
    });
    return loyaltyVerifyResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'verified',
      member: toLoyaltyMemberView(outcome.member, visible),
    });
  },
);

/**
 * Award points after a confirmed Payment. The deterministic transaction id
 * makes a retry a replay, so points post exactly once (REQ-LOY-001).
 */
export const callableLoyaltyEarnPoints = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyEarnInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();
    await assertLoyaltyEntitlement(db, input.tenantId);

    const memberRef = db.doc(
      loyaltyMemberPath(input.tenantId, input.memberId),
    );
    const callerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const transactionId = loyaltyEarnTransactionId(input.orderId);
    const transactionRef = db.doc(
      loyaltyTransactionPath(input.tenantId, transactionId),
    );
    const config = await resolveLoyaltyConfig(db, input.tenantId);
    const now = nowIso();
    const earnedPoints = computeEarnedPoints(input.amountVnd, config);
    const requestHash = buildLoyaltyRequestHash({
      tenantId: input.tenantId,
      memberId: input.memberId,
      action: 'earn',
      points: earnedPoints,
      amountVnd: input.amountVnd,
    });

    const outcome = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(callerRef);
      const memberSnap = await transaction.get(memberRef);
      const existingSnap = await transaction.get(transactionRef);
      assertCashierOrOwnerMember(callerSnap.data());
      if (!memberSnap.exists) {
        throw new HttpsError('not-found', LOYALTY_MEMBER_NOT_FOUND_MESSAGE);
      }
      const member = mapStoredLoyaltyMember(
        input.memberId,
        input.tenantId,
        memberSnap.data() ?? {},
      );
      if (existingSnap.exists) {
        const existing = existingSnap.data() as LoyaltyTransaction;
        if ((existing.requestHash ?? null) !== requestHash) {
          throw new HttpsError(
            'already-exists',
            LOYALTY_IDEMPOTENCY_CONFLICT_MESSAGE,
          );
        }
        return {
          replayed: true,
          member,
          transaction: existing,
          callerData: callerSnap.data(),
        };
      }
      const plan = buildLoyaltyEarnPlan({
        tenantId: input.tenantId,
        member,
        orderId: input.orderId,
        amountVnd: input.amountVnd,
        rate: config,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actorUid: uid,
        now,
      });
      transaction.set(transactionRef, plan.transaction);
      transaction.set(memberRef, plan.nextMember);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'LoyaltyPointsEarned',
        targetType: 'loyalty_member',
        targetId: member.memberId,
        requestId: input.idempotencyKey,
        detail: { orderId: input.orderId, points: plan.transaction.points },
      });
      return {
        replayed: false,
        member: plan.nextMember,
        transaction: plan.transaction,
        callerData: callerSnap.data(),
      };
    });

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: outcome.callerData,
      isAdmin,
    });
    return loyaltyPointResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'applied',
      member: toLoyaltyMemberView(outcome.member, visible),
      transaction: outcome.transaction,
    });
  },
);

/** Redeem points from a verified member. Requires phone verification. */
export const callableLoyaltyRedeemPoints = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyRedeemInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();
    const limit = await resolvePublicOrderRateLimit(db);
    assertRateLimit(`loyalty-redeem:${uid}`, limit);
    await assertLoyaltyEntitlement(db, input.tenantId);

    const memberRef = db.doc(
      loyaltyMemberPath(input.tenantId, input.memberId),
    );
    const callerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const transactionId = `loyalty_redeem_${input.idempotencyKey}`;
    const transactionRef = db.doc(
      loyaltyTransactionPath(input.tenantId, transactionId),
    );
    const now = nowIso();
    const requestHash = buildLoyaltyRequestHash({
      tenantId: input.tenantId,
      memberId: input.memberId,
      action: 'redeem',
      points: input.points,
      amountVnd: 0,
    });

    const outcome = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(callerRef);
      const memberSnap = await transaction.get(memberRef);
      const existingSnap = await transaction.get(transactionRef);
      assertCashierOrOwnerMember(callerSnap.data());
      if (!memberSnap.exists) {
        throw new HttpsError('not-found', LOYALTY_MEMBER_NOT_FOUND_MESSAGE);
      }
      const member = mapStoredLoyaltyMember(
        input.memberId,
        input.tenantId,
        memberSnap.data() ?? {},
      );
      if (existingSnap.exists) {
        const existing = existingSnap.data() as LoyaltyTransaction;
        if ((existing.requestHash ?? null) !== requestHash) {
          throw new HttpsError(
            'already-exists',
            LOYALTY_IDEMPOTENCY_CONFLICT_MESSAGE,
          );
        }
        return {
          replayed: true,
          member,
          transaction: existing,
          callerData: callerSnap.data(),
        };
      }
      const plan = buildLoyaltyRedeemPlan({
        tenantId: input.tenantId,
        member,
        points: input.points,
        orderId: input.orderId ?? null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actorUid: uid,
        now,
      });
      transaction.set(transactionRef, plan.transaction);
      transaction.set(memberRef, plan.nextMember);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'LoyaltyPointsRedeemed',
        targetType: 'loyalty_member',
        targetId: member.memberId,
        requestId: input.idempotencyKey,
        detail: { points: input.points, orderId: input.orderId ?? null },
      });
      return {
        replayed: false,
        member: plan.nextMember,
        transaction: plan.transaction,
        callerData: callerSnap.data(),
      };
    });

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: outcome.callerData,
      isAdmin,
    });
    return loyaltyPointResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'applied',
      member: toLoyaltyMemberView(outcome.member, visible),
      transaction: outcome.transaction,
    });
  },
);

/** Reverse the earn effect of one Order after a refund or cancellation. */
export const callableLoyaltyReversePoints = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyReverseInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();
    await assertLoyaltyEntitlement(db, input.tenantId);

    const memberRef = db.doc(
      loyaltyMemberPath(input.tenantId, input.memberId),
    );
    const callerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const earnId = loyaltyEarnTransactionId(input.orderId);
    const earnRef = db.doc(loyaltyTransactionPath(input.tenantId, earnId));
    const reverseId = loyaltyReverseTransactionId(input.orderId);
    const reverseRef = db.doc(
      loyaltyTransactionPath(input.tenantId, reverseId),
    );
    const now = nowIso();

    const outcome = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(callerRef);
      const memberSnap = await transaction.get(memberRef);
      const earnSnap = await transaction.get(earnRef);
      const reverseSnap = await transaction.get(reverseRef);
      assertCashierOrOwnerMember(callerSnap.data());
      if (!memberSnap.exists) {
        throw new HttpsError('not-found', LOYALTY_MEMBER_NOT_FOUND_MESSAGE);
      }
      const member = mapStoredLoyaltyMember(
        input.memberId,
        input.tenantId,
        memberSnap.data() ?? {},
      );
      const earnTransaction = earnSnap.exists
        ? (earnSnap.data() as LoyaltyTransaction)
        : null;
      const requestHash = buildLoyaltyRequestHash({
        tenantId: input.tenantId,
        memberId: input.memberId,
        action: 'reverse',
        points: earnTransaction ? Math.abs(earnTransaction.points) : 0,
        amountVnd: 0,
      });
      if (reverseSnap.exists) {
        const existing = reverseSnap.data() as LoyaltyTransaction;
        if ((existing.requestHash ?? null) !== requestHash) {
          throw new HttpsError(
            'already-exists',
            LOYALTY_IDEMPOTENCY_CONFLICT_MESSAGE,
          );
        }
        return {
          replayed: true,
          member,
          transaction: existing,
          callerData: callerSnap.data(),
        };
      }
      if (!earnTransaction) {
        throw new HttpsError(
          'failed-precondition',
          LOYALTY_NOTHING_TO_REVERSE_MESSAGE,
        );
      }
      const plan = buildLoyaltyReversePlan({
        tenantId: input.tenantId,
        member,
        earnTransaction,
        reason: input.reason ?? null,
        idempotencyKey: input.idempotencyKey,
        requestHash,
        actorUid: uid,
        now,
      });
      transaction.set(reverseRef, plan.transaction);
      transaction.set(memberRef, plan.nextMember);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role:
          callerSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'LoyaltyPointsReversed',
        targetType: 'loyalty_member',
        targetId: member.memberId,
        requestId: input.idempotencyKey,
        reason: input.reason ?? null,
        detail: { orderId: input.orderId, points: plan.transaction.points },
      });
      return {
        replayed: false,
        member: plan.nextMember,
        transaction: plan.transaction,
        callerData: callerSnap.data(),
      };
    });

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: outcome.callerData,
      isAdmin,
    });
    return loyaltyPointResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'applied',
      member: toLoyaltyMemberView(outcome.member, visible),
      transaction: outcome.transaction,
    });
  },
);

/**
 * Bounded member list with server-enforced phone visibility. ADMIN is
 * unrestricted; this read records no audit event (NFR-PRIV-001).
 */
export const callableLoyaltyListMembers = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyListInput(request.data);
    const isAdmin = isAdminToken(request.auth?.token);
    const db = getDb();

    const callerSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    if (!isAdmin) {
      assertActiveMember(callerSnap.data());
    }

    const limit = Math.min(
      input.limit ?? LOYALTY_LIST_LIMIT,
      LOYALTY_LIST_LIMIT,
    );
    const snapshot = await db
      .collection(
        `tenants/${input.tenantId}/${LOYALTY_MEMBER_COLLECTION}`,
      )
      .limit(limit)
      .get();
    const members = snapshot.docs.map((docSnap) =>
      mapStoredLoyaltyMember(docSnap.id, input.tenantId, docSnap.data()),
    );

    const visible = phoneVisibleFor({
      uid,
      tenantId: input.tenantId,
      memberData: callerSnap.data(),
      isAdmin,
    });
    return loyaltyListResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      members: members.map((member) => toLoyaltyMemberView(member, visible)),
    });
  },
);

/** Active member query: the resolved Loyalty configuration. */
export const callableLoyaltyGetConfig = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyGetConfigInput(request.data);
    const db = getDb();
    const callerSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveMember(callerSnap.data());
    return loyaltyConfigResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      config: await resolveLoyaltyConfig(db, input.tenantId),
    });
  },
);

/** Owner command: update the tenant Loyalty configuration. */
export const callableLoyaltyUpdateConfig = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseLoyaltyUpdateConfigInput(request.data);
    const db = getDb();
    const configRef = db.doc(
      `tenants/${input.tenantId}/${LOYALTY_CONFIG_PATH}`,
    );
    const callerRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const now = nowIso();

    const config = await db.runTransaction(async (transaction) => {
      const callerSnap = await transaction.get(callerRef);
      const configSnap = await transaction.get(configRef);
      assertOwnerMember(callerSnap.data());
      const current =
        (configSnap.exists
          ? parseStoredLoyaltyConfig(input.tenantId, configSnap.data() ?? {})
          : null) ?? buildDefaultLoyaltyConfig(input.tenantId, now);
      const next = buildLoyaltyConfigDocument(
        input.tenantId,
        current,
        input,
        now,
      );
      transaction.set(configRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'LoyaltyConfigChanged',
        targetType: 'loyalty_config',
        targetId: input.tenantId,
        detail: {
          earnRateVnd: next.earnRateVnd,
          pointsPerEarnRate: next.pointsPerEarnRate,
          welcomePoints: next.welcomePoints,
        },
      });
      return next;
    });

    return loyaltyConfigResultSchema.parse({
      schemaVersion: LOYALTY_CONTRACT_VERSION,
      config,
    });
  },
);
