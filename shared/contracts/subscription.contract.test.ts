import { describe, expect, it } from 'vitest';
import {
  normalizeSubscriptionPlan,
  planAllowsAnotherActivePromotion,
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

  it('gives free one basic promotion and pro the full set', () => {
    const free = resolvePlanEntitlements('free');
    expect(free.features).toEqual(['promotions']);
    expect(planAllowsFeature(free, 'promotionAdvanced')).toBe(false);
    expect(free.maxActivePromotions).toBe(1);
    expect(planAllowsFeature(resolvePlanEntitlements('pro'), 'nfc')).toBe(true);
    expect(planAllowsFeature(resolvePlanEntitlements('lite'), 'nfc')).toBe(
      false,
    );
    expect(
      planAllowsFeature(resolvePlanEntitlements('lite'), 'loyalty'),
    ).toBe(true);
    expect(
      planAllowsFeature(resolvePlanEntitlements('lite'), 'promotionAdvanced'),
    ).toBe(true);
  });

  it('caps active promotions per plan', () => {
    const free = resolvePlanEntitlements('free');
    expect(planAllowsAnotherActivePromotion(free, 0)).toBe(true);
    expect(planAllowsAnotherActivePromotion(free, 1)).toBe(false);
    const pro = resolvePlanEntitlements('pro');
    expect(pro.maxActivePromotions).toBeNull();
    expect(planAllowsAnotherActivePromotion(pro, 99)).toBe(true);
  });

  it('normalizes an unknown stored plan to free', () => {
    expect(normalizeSubscriptionPlan('enterprise')).toBe('free');
    expect(normalizeSubscriptionPlan(undefined)).toBe('free');
    expect(normalizeSubscriptionPlan('pro')).toBe('pro');
  });
});
