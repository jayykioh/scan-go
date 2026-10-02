import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  SUBSCRIPTION_CONTRACT_VERSION,
  normalizeSubscriptionPlan,
  planAllowsFeature,
  resolvePlanEntitlements,
  subscriptionChangePlanInputSchema,
  subscriptionGetInputSchema,
  type SubscriptionChangePlanInput,
  type SubscriptionFeature,
  type SubscriptionGetInput,
  type SubscriptionPlan,
  type SubscriptionState,
} from '../../../../shared/contracts/subscription.contract.js';

export const SUBSCRIPTION_INVALID_MESSAGE = 'Yêu cầu gói cước không hợp lệ.';
export const SUBSCRIPTION_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const SUBSCRIPTION_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng hoặc ADMIN đổi được gói cước.';
export const SUBSCRIPTION_FEATURE_DENIED_MESSAGE =
  'Gói cước hiện tại không bao gồm tính năng này.';
export const SUBSCRIPTION_TENANT_NOT_FOUND_MESSAGE =
  'Không tìm thấy cửa hàng.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', SUBSCRIPTION_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseSubscriptionGetInput(data: unknown): SubscriptionGetInput {
  return parseOrInvalid<SubscriptionGetInput>(
    subscriptionGetInputSchema,
    data,
  );
}

export function parseSubscriptionChangePlanInput(
  data: unknown,
): SubscriptionChangePlanInput {
  return parseOrInvalid<SubscriptionChangePlanInput>(
    subscriptionChangePlanInputSchema,
    data,
  );
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      SUBSCRIPTION_MEMBER_DENIED_MESSAGE,
    );
  }
}

/**
 * Plan changes are an Owner or ADMIN capability. A Staff membership is denied
 * even when it carries other roles (REQ-SUB-001, docs/module/subscription.md).
 */
export function assertPlanChangeAuthorized(
  memberData: DocumentData | undefined,
  isAdmin: boolean,
): void {
  if (isAdmin) {
    return;
  }
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      SUBSCRIPTION_OWNER_DENIED_MESSAGE,
    );
  }
}

/**
 * Derive the entitlement state from the stored Tenant `pricingTier`. An absent
 * or unknown value resolves to `free`, so a missing doc never grants a paid
 * feature (REQ-SUB-001).
 */
export function toSubscriptionState(
  tenantId: string,
  tenantData: DocumentData | undefined,
  now: string,
): SubscriptionState {
  const plan = normalizeSubscriptionPlan(tenantData?.pricingTier);
  return {
    schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
    tenantId,
    plan,
    entitlements: resolvePlanEntitlements(plan),
    updatedAt: now,
  };
}

/**
 * Trusted-code gate. Any module that exposes a restricted capability calls this
 * before it runs the command, so the frontend can never unlock a paid feature
 * on its own (REQ-SUB-001, docs/module/subscription.md).
 */
export function assertFeatureEntitlement(
  state: SubscriptionState,
  feature: SubscriptionFeature,
): void {
  if (!planAllowsFeature(state.entitlements, feature)) {
    throw new HttpsError(
      'failed-precondition',
      SUBSCRIPTION_FEATURE_DENIED_MESSAGE,
    );
  }
}

export async function loadSubscriptionState(
  db: Firestore,
  tenantId: string,
): Promise<SubscriptionState> {
  const tenantSnap = await db.doc(`tenants/${tenantId}`).get();
  if (!tenantSnap.exists) {
    throw new HttpsError(
      'not-found',
      SUBSCRIPTION_TENANT_NOT_FOUND_MESSAGE,
    );
  }
  return toSubscriptionState(tenantId, tenantSnap.data(), nowIso());
}

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return (
    value === 'free' || value === 'lite' || value === 'pro'
  );
}
