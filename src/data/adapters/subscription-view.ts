import type {
  PlanEntitlements,
  SubscriptionFeature,
  SubscriptionPlan,
} from '@contracts/subscription.contract';

/**
 * Presentation helpers for the server Subscription state. The plan code and
 * the entitlement feature list always come from the server; the view only maps
 * them to Owner language (REQ-SUB-001).
 */

/** `free`/`lite`/`pro` shown as `Free`/`Lite`/`Pro`. */
export function formatPlanLabel(plan: SubscriptionPlan): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

/** True when the server entitlements grant the named feature. */
export function allowsFeature(
  entitlements: PlanEntitlements,
  feature: SubscriptionFeature,
): boolean {
  return entitlements.features.includes(feature);
}

/** Human limit label from the server entitlements. `null` means unlimited. */
export function formatPlanLimit(value: number | null, unit: string): string {
  return value === null ? `Không giới hạn ${unit}` : `${value} ${unit}`;
}
