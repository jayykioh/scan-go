import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  PROMOTION_CONTRACT_VERSION,
  type Promotion,
} from '../../../../shared/contracts/promotion.contract.js';
import { resolvePlanEntitlements } from '../../../../shared/contracts/subscription.contract.js';
import {
  assertActiveOwnerMember,
  assertPromotionAdvancedAllowed,
  assertPromotionCapacity,
  buildPromotionDocument,
  collectPromotionMenuItemIds,
  mapStoredPromotion,
  resolveLocalClock,
  resolveTenantTimezone,
} from './service.js';

const NOW = '2026-09-12T05:00:00.000Z';

function build(
  overrides: Partial<Parameters<typeof buildPromotionDocument>[0]> = {},
) {
  return buildPromotionDocument({
    promotionId: 'promo-1',
    tenantId: 'tenant-a',
    name: 'Giảm 10%',
    priority: 3,
    startsAt: null,
    endsAt: null,
    eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, minSubtotalVnd: 50000 },
    benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: 20000 },
    status: 'inactive',
    source: 'manual',
    now: NOW,
    createdAt: NOW,
    ...overrides,
  });
}

describe('promotion service helpers', () => {
  it('builds an inactive promotion and archives with a timestamp', () => {
    const created = build();
    expect(created.status).toBe('inactive');
    expect(created.archivedAt).toBeNull();
    expect(created.schemaVersion).toBe(PROMOTION_CONTRACT_VERSION);

    const archived = build({ status: 'archived' });
    expect(archived.archivedAt).toBe(NOW);
  });

  it('round-trips a stored promotion document', () => {
    const stored = build({
      promotionId: 'promo-2',
      benefit: { type: 'fixedAmount', amountVnd: 20000 },
      status: 'active',
    });
    expect(mapStoredPromotion('promo-2', 'tenant-a', stored)).toEqual(stored);
  });

  it('reads a v1 document as the current version', () => {
    const mapped = mapStoredPromotion('promo-v1', 'tenant-a', {
      schemaVersion: 1,
      name: 'Giảm 10%',
      status: 'active',
      priority: 1,
      startsAt: null,
      endsAt: null,
      eligibility: { minSubtotalVnd: null, menuItemIds: null },
      benefit: { type: 'fixedAmount', amountVnd: 10000 },
      createdAt: NOW,
      updatedAt: NOW,
      archivedAt: null,
    });
    expect(mapped.source).toBe('manual');
    expect(mapped.eligibility.timeWindow).toBeNull();
  });

  it('allows only an active owner membership to manage promotions', () => {
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff', isActive: true }),
    ).toThrow();
  });
});

describe('promotion plan gates', () => {
  it('rejects an advanced benefit or condition on the Free plan', () => {
    const free = resolvePlanEntitlements('free');
    expect(() =>
      assertPromotionAdvancedAllowed(free, {
        benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
        eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY },
      }),
    ).not.toThrow();
    expect(() =>
      assertPromotionAdvancedAllowed(free, {
        benefit: { type: 'freeItem', menuItemIds: ['item-1'], quantity: 1 },
        eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY },
      }),
    ).toThrow();
    expect(() =>
      assertPromotionAdvancedAllowed(free, {
        benefit: { type: 'fixedAmount', amountVnd: 10000 },
        eligibility: {
          ...EMPTY_PROMOTION_ELIGIBILITY,
          timeWindow: { fromMinuteOfDay: 840, toMinuteOfDay: 1020 },
        },
      }),
    ).toThrow();
  });

  it('lets Lite use every benefit and condition', () => {
    const lite = resolvePlanEntitlements('lite');
    expect(() =>
      assertPromotionAdvancedAllowed(lite, {
        benefit: { type: 'freeItem', menuItemIds: ['item-1'], quantity: 1 },
        eligibility: {
          ...EMPTY_PROMOTION_ELIGIBILITY,
          code: 'TET2026',
        },
      }),
    ).not.toThrow();
  });

  it('caps Free at one active promotion and leaves Pro unlimited', () => {
    const free = resolvePlanEntitlements('free');
    expect(() => assertPromotionCapacity(free, 0)).not.toThrow();
    expect(() => assertPromotionCapacity(free, 1)).toThrow();
    const pro = resolvePlanEntitlements('pro');
    expect(() => assertPromotionCapacity(pro, 25)).not.toThrow();
  });
});

describe('tenant-local clock', () => {
  it('falls back to Vietnam time for a missing timezone', () => {
    expect(resolveTenantTimezone(undefined)).toBe('Asia/Ho_Chi_Minh');
    expect(resolveTenantTimezone('')).toBe('Asia/Ho_Chi_Minh');
    expect(resolveTenantTimezone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('resolves the local minute and weekday, not the UTC one', () => {
    // 2026-09-12T05:00:00Z is 12:00 on Saturday in Vietnam.
    const vietnam = resolveLocalClock(NOW, 'Asia/Ho_Chi_Minh');
    expect(vietnam.minuteOfDay).toBe(12 * 60);
    expect(vietnam.dayOfWeek).toBe(6);
    const utc = resolveLocalClock(NOW, 'UTC');
    expect(utc.minuteOfDay).toBe(5 * 60);
    expect(utc.dayOfWeek).toBe(6);
  });

  it('handles a midnight boundary without returning hour 24', () => {
    const clock = resolveLocalClock('2026-09-11T17:00:00.000Z', 'Asia/Ho_Chi_Minh');
    expect(clock.minuteOfDay).toBe(0);
  });
});

describe('collectPromotionMenuItemIds', () => {
  it('collects every gift candidate across benefit shapes', () => {
    const promotions: Promotion[] = [
      build({
        promotionId: 'bogo',
        benefit: {
          type: 'buyXGetY',
          buyMenuItemIds: ['item-a'],
          buyQuantity: 1,
          getMenuItemIds: ['item-b'],
          getQuantity: 1,
          reward: { type: 'free' },
        },
      }),
      build({
        promotionId: 'gift',
        benefit: { type: 'freeItem', menuItemIds: ['item-c'], quantity: 1 },
      }),
      build({
        promotionId: 'combo',
        benefit: {
          type: 'bundlePrice',
          menuItemIds: ['item-d'],
          quantity: 2,
          bundlePriceVnd: 50000,
        },
      }),
      build({
        promotionId: 'points',
        benefit: {
          type: 'pointsRedemption',
          pointsCost: 100,
          reward: { type: 'freeItem', menuItemIds: ['item-e'], quantity: 1 },
        },
      }),
      build({
        promotionId: 'plain',
        benefit: { type: 'percentOff', percent: 5, maxDiscountVnd: null },
      }),
    ];
    expect(collectPromotionMenuItemIds(promotions).sort()).toEqual([
      'item-a',
      'item-b',
      'item-c',
      'item-d',
      'item-e',
    ]);
  });
});
