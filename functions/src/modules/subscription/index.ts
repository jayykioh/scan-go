import { onCall } from 'firebase-functions/v2/https';
import {
  ENTITLEMENT_CHANGED_ACTION,
  SUBSCRIPTION_CHANGED_ACTION,
  SUBSCRIPTION_CONTRACT_VERSION,
  subscriptionChangePlanResultSchema,
  subscriptionGetResultSchema,
} from '../../../../shared/contracts/subscription.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  assertPlanChangeAuthorized,
  nowIso,
  parseSubscriptionChangePlanInput,
  parseSubscriptionGetInput,
  requireUid,
  SUBSCRIPTION_TENANT_NOT_FOUND_MESSAGE,
  toSubscriptionState,
} from './service.js';
import { HttpsError } from 'firebase-functions/v2/https';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

/** Active member query: the current plan and its resolved entitlements. */
export const callableSubscriptionGet = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseSubscriptionGetInput(request.data);
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;
    if (!isAdmin && (!memberSnap.exists || memberSnap.get('isActive') === false)) {
      throw new HttpsError(
        'permission-denied',
        'Bạn không thuộc cửa hàng này.',
      );
    }

    const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
    if (!tenantSnap.exists) {
      throw new HttpsError('not-found', SUBSCRIPTION_TENANT_NOT_FOUND_MESSAGE);
    }

    return subscriptionGetResultSchema.parse({
      schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
      state: toSubscriptionState(input.tenantId, tenantSnap.data(), nowIso()),
    });
  },
);

/**
 * Owner or ADMIN plan change. The server writes `pricingTier` and records an
 * audit event; a repeat of the same plan is a replay with no write
 * (REQ-SUB-001, docs/module/subscription.md).
 */
export const callableSubscriptionChangePlan = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseSubscriptionChangePlanInput(request.data);
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;
    const db = getDb();

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const tenantRef = db.doc(`tenants/${input.tenantId}`);

    const outcome = await db.runTransaction(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const tenantSnap = await transaction.get(tenantRef);
      assertPlanChangeAuthorized(memberSnap.data(), isAdmin);
      if (!tenantSnap.exists) {
        throw new HttpsError(
          'not-found',
          SUBSCRIPTION_TENANT_NOT_FOUND_MESSAGE,
        );
      }

      const now = nowIso();
      const current = toSubscriptionState(
        input.tenantId,
        tenantSnap.data(),
        now,
      );
      if (current.plan === input.plan) {
        return { replayed: true, state: current };
      }

      const nextState = toSubscriptionState(
        input.tenantId,
        { ...tenantSnap.data(), pricingTier: input.plan },
        now,
      );
      transaction.set(
        tenantRef,
        { pricingTier: input.plan, updatedAt: now },
        { merge: true },
      );
      const actorType = isAdmin
        ? 'admin'
        : memberSnap.get('membershipType') === 'owner'
          ? 'owner'
          : 'staff';
      const role = isAdmin
        ? 'admin'
        : memberSnap.get('membershipType') === 'owner'
          ? 'owner'
          : 'staff';
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType,
        role,
        action: SUBSCRIPTION_CHANGED_ACTION,
        targetType: 'tenant',
        targetId: input.tenantId,
        detail: { previousPlan: current.plan, plan: input.plan },
      });
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType,
        role,
        action: ENTITLEMENT_CHANGED_ACTION,
        targetType: 'tenant',
        targetId: input.tenantId,
        detail: { entitlements: nextState.entitlements },
      });
      return { replayed: false, state: nextState };
    });

    return subscriptionChangePlanResultSchema.parse({
      schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'changed',
      state: outcome.state,
    });
  },
);
