import { describe, expect, it } from 'vitest';
import {
  normalizeSubscriptionPlan,
  planAllowsFeature,
  resolvePlanEntitlements,
  subscriptionPlans,
} from './subscription.contract.js';

describe('resolvePlanEntitlements', () => {
  it('resolves the same deterministic limits for each plan', () => {
    for (const plan of subscriptionPlans) {
      const first = resolvePlanEntitlements(plan);
      const second = resolvePlanEntitlements(plan);
      expect(first).toEqual(second);
      expect(first.plan).toBe(plan);
    }
  });

  it('keeps free without paid capabilities and pro with the full set', () => {
    expect(resolvePlanEntitlements('free').features).toEqual([]);
    expect(planAllowsFeature(resolvePlanEntitlements('pro'), 'nfc')).toBe(true);
    expect(planAllowsFeature(resolvePlanEntitlements('lite'), 'nfc')).toBe(
      false,
    );
    expect(
      planAllowsFeature(resolvePlanEntitlements('lite'), 'loyalty'),
    ).toBe(true);
  });

  it('normalizes an unknown stored plan to free', () => {
    expect(normalizeSubscriptionPlan('enterprise')).toBe('free');
    expect(normalizeSubscriptionPlan(undefined)).toBe('free');
    expect(normalizeSubscriptionPlan('pro')).toBe('pro');
  });
});
