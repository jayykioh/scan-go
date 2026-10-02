import { describe, expect, it } from 'vitest';
import {
  assertFeatureEntitlement,
  assertPlanChangeAuthorized,
  toSubscriptionState,
  SUBSCRIPTION_FEATURE_DENIED_MESSAGE,
} from './service.js';

const NOW = '2026-09-12T05:00:00.000Z';

describe('toSubscriptionState', () => {
  it('reads the stored pricingTier and resolves entitlements', () => {
    const pro = toSubscriptionState('tenant-a', { pricingTier: 'pro' }, NOW);
    expect(pro.plan).toBe('pro');
    expect(pro.entitlements.features).toContain('nfc');
  });

  it('falls back to free for an absent or unknown tier', () => {
    expect(toSubscriptionState('tenant-a', {}, NOW).plan).toBe('free');
    expect(
      toSubscriptionState('tenant-a', { pricingTier: 'enterprise' }, NOW).plan,
    ).toBe('free');
  });
});

describe('assertFeatureEntitlement', () => {
  it('denies a paid feature on the free plan and allows it on pro', () => {
    const free = toSubscriptionState('tenant-a', { pricingTier: 'free' }, NOW);
    expect(() => assertFeatureEntitlement(free, 'nfc')).toThrowError(
      SUBSCRIPTION_FEATURE_DENIED_MESSAGE,
    );
    const pro = toSubscriptionState('tenant-a', { pricingTier: 'pro' }, NOW);
    expect(() => assertFeatureEntitlement(pro, 'nfc')).not.toThrow();
  });
});

describe('assertPlanChangeAuthorized', () => {
  it('allows owner and admin and denies staff', () => {
    expect(() =>
      assertPlanChangeAuthorized(
        { membershipType: 'owner', isActive: true },
        false,
      ),
    ).not.toThrow();
    expect(() => assertPlanChangeAuthorized(undefined, true)).not.toThrow();
    expect(() =>
      assertPlanChangeAuthorized(
        { membershipType: 'staff', isActive: true },
        false,
      ),
    ).toThrow();
  });
});
