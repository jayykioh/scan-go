import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  subscriptionChangePlanResultSchema,
  subscriptionGetResultSchema,
  type SubscriptionPlan,
  type SubscriptionState,
} from '@contracts/subscription.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

/**
 * Resolve the caller's active Tenant for a server subscription query.
 * `activeTenantId` is navigation state only; the server re-verifies the
 * membership before it returns anything (docs/RULES_FIREBASE.md §3).
 */
export async function getActiveTenantId(): Promise<string | null> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    return null;
  }
  const snap = await getDoc(doc(db, 'users', uid));
  const activeTenantId = snap.get('activeTenantId');
  return typeof activeTenantId === 'string' ? activeTenantId : null;
}

/** Server plan and entitlements, or null when Firebase is not configured. */
export async function getSubscription(): Promise<SubscriptionState | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return null;
  }
  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    return null;
  }
  const callable = httpsCallable<
    { tenantId: string },
    unknown
  >(functions, 'callableSubscriptionGet');
  const result = subscriptionGetResultSchema.parse((await callable({ tenantId })).data);
  return result.state;
}

/** Owner plan change through the server callable. */
export async function changeSubscriptionPlan(
  plan: SubscriptionPlan,
): Promise<SubscriptionState | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return null;
  }
  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    return null;
  }
  const callable = httpsCallable<
    { tenantId: string; plan: SubscriptionPlan },
    unknown
  >(functions, 'callableSubscriptionChangePlan');
  const result = subscriptionChangePlanResultSchema.parse(
    (await callable({ tenantId, plan })).data,
  );
  return result.state;
}
