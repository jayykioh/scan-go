import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  SUBSCRIPTION_CONTRACT_VERSION,
  normalizeSubscriptionPlan,
  resolvePlanEntitlements,
  subscriptionChangePlanResultSchema,
  subscriptionGetResultSchema,
  subscriptionStateSchema,
  type SubscriptionPlan,
  type SubscriptionState,
} from '@contracts/subscription.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';
import { invalidateReadCache, readCached } from '../readCache';

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

function timestampToIso(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (
    value !== null &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = value.toDate();
    if (date instanceof Date) return date.toISOString();
  }
  return new Date(0).toISOString();
}

/** Direct member read; ADMIN remains on the server callable. */
export async function getSubscription(
  requestedTenantId?: string,
): Promise<SubscriptionState | null> {
  const db = getFirebaseFirestore();
  const user = getFirebaseAuth()?.currentUser;
  if (!db || !user) {
    return null;
  }
  const tenantId = requestedTenantId ?? (await getActiveTenantId());
  if (!tenantId) {
    return null;
  }

  const token = await user.getIdTokenResult();
  if (token.claims.admin === true) {
    const functions = getFirebaseFunctions();
    if (!functions) return null;
    const callable = httpsCallable<{ tenantId: string }, unknown>(
      functions,
      'callableSubscriptionGet',
    );
    const result = subscriptionGetResultSchema.parse(
      (await callable({ tenantId })).data,
    );
    return result.state;
  }

  return readCached(
    {
      userId: user.uid,
      tenantId,
      path: `tenants/${tenantId}`,
      query: 'subscription:pricingTier;entitlements:v1',
    },
    async () => {
      const snapshot = await getDoc(doc(db, 'tenants', tenantId));
      if (!snapshot.exists()) return null;
      const plan = normalizeSubscriptionPlan(snapshot.get('pricingTier'));
      return subscriptionStateSchema.parse({
        schemaVersion: SUBSCRIPTION_CONTRACT_VERSION,
        tenantId,
        plan,
        entitlements: resolvePlanEntitlements(plan),
        updatedAt: timestampToIso(snapshot.get('updatedAt')),
      });
    },
  );
}

/** Owner plan change through the server callable. */
export async function changeSubscriptionPlan(
  plan: SubscriptionPlan,
  requestedTenantId?: string,
): Promise<SubscriptionState | null> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    return null;
  }
  const tenantId = requestedTenantId ?? (await getActiveTenantId());
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
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (uid) {
    invalidateReadCache({
      userId: uid,
      tenantId,
      pathPrefix: `tenants/${tenantId}`,
    });
  }
  return result.state;
}
