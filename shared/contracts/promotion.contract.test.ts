import { describe, expect, it } from 'vitest';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  PROMOTION_CONTRACT_VERSION,
  allocateLineDiscounts,
  clampDiscount,
  computePercentOffVnd,
  computePromotionBenefit,
  evaluatePromotionEligibility,
  hasAdvancedEligibility,
  isBasicPromotion,
  isInsideTimeWindow,
  isPromotionWindowOpen,
  mapPromotionV1ToV2,
  parseStoredPromotion,
  selectBestPromotion,
  type Promotion,
  type PromotionCartFacts,
} from './promotion.contract.js';

const NOW = '2026-09-12T05:00:00.000Z';

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    schemaVersion: PROMOTION_CONTRACT_VERSION,
    promotionId: 'promo-a',
    tenantId: 'tenant-a',
    name: 'Promo A',
    source: 'manual',
    status: 'active',
    priority: 1,
    startsAt: null,
    endsAt: null,
    eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY },
    benefit: { type: 'fixedAmount', amountVnd: 10000 },
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

interface FactOptions {
  lines?: Array<{ menuItemId: string; quantity: number; unitPriceVnd: number }>;
  menuItems?: Array<{
    menuItemId: string;
    name?: string;
    unitPriceVnd: number;
    isAvailable?: boolean;
  }>;
  loyaltyMember?: PromotionCartFacts['loyaltyMember'];
  localMinuteOfDay?: number;
  localDayOfWeek?: number;
}

function facts(options: FactOptions = {}): PromotionCartFacts {
  const lines = (
    options.lines ?? [{ menuItemId: 'item-1', quantity: 1, unitPriceVnd: 100000 }]
  ).map((line) => ({ ...line, lineTotalVnd: line.unitPriceVnd * line.quantity }));
  const rawMenuItems: Array<{
    menuItemId: string;
    name?: string;
    unitPriceVnd: number;
    isAvailable?: boolean;
  }> =
    options.menuItems ??
    lines.map((line) => ({
      menuItemId: line.menuItemId,
      unitPriceVnd: line.unitPriceVnd,
    }));
  const menuItems = rawMenuItems.map((item) => ({
    menuItemId: item.menuItemId,
    name: item.name ?? item.menuItemId,
    unitPriceVnd: item.unitPriceVnd,
    isAvailable: item.isAvailable ?? true,
  }));
  return {
    subtotalVnd: lines.reduce((sum, line) => sum + line.lineTotalVnd, 0),
    lines,
    menuItems,
    loyaltyMember: options.loyaltyMember ?? null,
    localMinuteOfDay: options.localMinuteOfDay ?? 720,
    localDayOfWeek: options.localDayOfWeek ?? 3,
  };
}

describe('clampDiscount', () => {
  it('never exceeds the amount and leaves at least one payable VND', () => {
    expect(clampDiscount(99999, 5000)).toBe(4999);
    expect(clampDiscount(-10, 5000)).toBe(0);
    expect(clampDiscount(0, 0)).toBe(0);
  });
});

describe('computePercentOffVnd', () => {
  it('floors whole-percent discounts and applies the cap', () => {
    expect(computePercentOffVnd(100000, 15, 12000)).toBe(12000);
    expect(computePercentOffVnd(50000, 15, 12000)).toBe(7500);
    expect(computePercentOffVnd(33333, 10, null)).toBe(3333);
  });

  it('never lets a discount make the total negative', () => {
    expect(computePercentOffVnd(5000, 100, null)).toBe(4999);
  });
});

describe('isInsideTimeWindow', () => {
  it('handles a same-day window inclusively', () => {
    const window = { fromMinuteOfDay: 840, toMinuteOfDay: 1020 };
    expect(isInsideTimeWindow(window, 839)).toBe(false);
    expect(isInsideTimeWindow(window, 840)).toBe(true);
    expect(isInsideTimeWindow(window, 1020)).toBe(true);
    expect(isInsideTimeWindow(window, 1021)).toBe(false);
  });

  it('handles a window that spans midnight', () => {
    const window = { fromMinuteOfDay: 1320, toMinuteOfDay: 120 };
    expect(isInsideTimeWindow(window, 1320)).toBe(true);
    expect(isInsideTimeWindow(window, 1439)).toBe(true);
    expect(isInsideTimeWindow(window, 0)).toBe(true);
    expect(isInsideTimeWindow(window, 120)).toBe(true);
    expect(isInsideTimeWindow(window, 121)).toBe(false);
    expect(isInsideTimeWindow(window, 1319)).toBe(false);
  });
});

describe('isBasicPromotion', () => {
  it('accepts the two basic benefits with plain eligibility', () => {
    expect(
      isBasicPromotion(
        { type: 'percentOff', percent: 10, maxDiscountVnd: null },
        { ...EMPTY_PROMOTION_ELIGIBILITY, minSubtotalVnd: 100000 },
      ),
    ).toBe(true);
  });

  it('rejects an item-level benefit and every advanced condition', () => {
    expect(
      isBasicPromotion(
        { type: 'freeItem', menuItemIds: ['item-1'], quantity: 1 },
        { ...EMPTY_PROMOTION_ELIGIBILITY },
      ),
    ).toBe(false);
    expect(
      hasAdvancedEligibility({
        ...EMPTY_PROMOTION_ELIGIBILITY,
        timeWindow: { fromMinuteOfDay: 600, toMinuteOfDay: 660 },
      }),
    ).toBe(true);
    expect(
      hasAdvancedEligibility({
        ...EMPTY_PROMOTION_ELIGIBILITY,
        daysOfWeek: [1, 2],
      }),
    ).toBe(true);
    expect(
      hasAdvancedEligibility({ ...EMPTY_PROMOTION_ELIGIBILITY, code: 'TET2026' }),
    ).toBe(true);
    expect(
      hasAdvancedEligibility({
        ...EMPTY_PROMOTION_ELIGIBILITY,
        customerSegment: { type: 'newCustomer' },
      }),
    ).toBe(true);
    expect(
      hasAdvancedEligibility({
        ...EMPTY_PROMOTION_ELIGIBILITY,
        customerSegment: { type: 'all' },
      }),
    ).toBe(false);
  });
});

describe('evaluatePromotionEligibility', () => {
  it('reports the window, subtotal, quantity, and item reasons', () => {
    expect(
      evaluatePromotionEligibility(
        promotion({ status: 'inactive' }),
        facts(),
        NOW,
        null,
      ).reason,
    ).toBe('windowClosed');
    expect(
      evaluatePromotionEligibility(
        promotion({
          eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, minSubtotalVnd: 500000 },
        }),
        facts(),
        NOW,
        null,
      ).reason,
    ).toBe('belowMinSubtotal');
    expect(
      evaluatePromotionEligibility(
        promotion({
          eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, minQuantity: 5 },
        }),
        facts(),
        NOW,
        null,
      ).reason,
    ).toBe('belowMinQuantity');
    expect(
      evaluatePromotionEligibility(
        promotion({
          eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, menuItemIds: ['item-9'] },
        }),
        facts(),
        NOW,
        null,
      ).reason,
    ).toBe('menuItemMissing');
  });

  it('separates a missing code from a wrong code', () => {
    const coded = promotion({
      eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, code: 'TET2026' },
    });
    expect(evaluatePromotionEligibility(coded, facts(), NOW, null).reason).toBe(
      'codeRequired',
    );
    expect(
      evaluatePromotionEligibility(coded, facts(), NOW, 'SAI').reason,
    ).toBe('codeMismatch');
    expect(
      evaluatePromotionEligibility(coded, facts(), NOW, 'tet2026').eligible,
    ).toBe(true);
  });

  it('checks the time window and the weekday', () => {
    const happyHour = promotion({
      eligibility: {
        ...EMPTY_PROMOTION_ELIGIBILITY,
        timeWindow: { fromMinuteOfDay: 840, toMinuteOfDay: 1020 },
      },
    });
    expect(
      evaluatePromotionEligibility(
        happyHour,
        facts({ localMinuteOfDay: 900 }),
        NOW,
        null,
      ).eligible,
    ).toBe(true);
    expect(
      evaluatePromotionEligibility(
        happyHour,
        facts({ localMinuteOfDay: 700 }),
        NOW,
        null,
      ).reason,
    ).toBe('outsideTimeWindow');
    const monday = promotion({
      eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, daysOfWeek: [1] },
    });
    expect(
      evaluatePromotionEligibility(
        monday,
        facts({ localDayOfWeek: 3 }),
        NOW,
        null,
      ).reason,
    ).toBe('wrongDayOfWeek');
  });

  it('requires a verified member for every non-all segment', () => {
    const newCustomer = promotion({
      eligibility: {
        ...EMPTY_PROMOTION_ELIGIBILITY,
        customerSegment: { type: 'newCustomer' },
      },
    });
    expect(
      evaluatePromotionEligibility(newCustomer, facts(), NOW, null).reason,
    ).toBe('loyaltyRequired');
    expect(
      evaluatePromotionEligibility(
        newCustomer,
        facts({
          loyaltyMember: {
            memberId: 'm1',
            isVerified: true,
            pointBalance: 0,
            visitCount: 0,
          },
        }),
        NOW,
        null,
      ).eligible,
    ).toBe(true);
    expect(
      evaluatePromotionEligibility(
        newCustomer,
        facts({
          loyaltyMember: {
            memberId: 'm1',
            isVerified: true,
            pointBalance: 0,
            visitCount: 2,
          },
        }),
        NOW,
        null,
      ).reason,
    ).toBe('segmentMismatch');
  });

  it('rejects a point redemption without enough points', () => {
    const redemption = promotion({
      benefit: {
        type: 'pointsRedemption',
        pointsCost: 100,
        reward: { type: 'fixedAmount', amountVnd: 20000 },
      },
    });
    expect(
      evaluatePromotionEligibility(redemption, facts(), NOW, null).reason,
    ).toBe('loyaltyRequired');
    expect(
      evaluatePromotionEligibility(
        redemption,
        facts({
          loyaltyMember: {
            memberId: 'm1',
            isVerified: true,
            pointBalance: 40,
            visitCount: 1,
          },
        }),
        NOW,
        null,
      ).reason,
    ).toBe('insufficientPoints');
  });
});

describe('computePromotionBenefit', () => {
  it('gives the cheapest reward units free for a same-item buy-1-get-1', () => {
    const bogo = promotion({
      benefit: {
        type: 'buyXGetY',
        buyMenuItemIds: ['item-1'],
        buyQuantity: 1,
        getMenuItemIds: ['item-1'],
        getQuantity: 1,
        reward: { type: 'free' },
      },
    });
    const two = facts({
      lines: [{ menuItemId: 'item-1', quantity: 2, unitPriceVnd: 30000 }],
    });
    expect(computePromotionBenefit(bogo, two).discountVnd).toBe(30000);
    const three = facts({
      lines: [{ menuItemId: 'item-1', quantity: 3, unitPriceVnd: 30000 }],
    });
    expect(computePromotionBenefit(bogo, three).discountVnd).toBe(30000);
    const four = facts({
      lines: [{ menuItemId: 'item-1', quantity: 4, unitPriceVnd: 30000 }],
    });
    expect(computePromotionBenefit(bogo, four).discountVnd).toBe(60000);
  });

  it('needs the reward item in the cart for a cross-item deal', () => {
    const cross = promotion({
      benefit: {
        type: 'buyXGetY',
        buyMenuItemIds: ['item-a'],
        buyQuantity: 1,
        getMenuItemIds: ['item-b'],
        getQuantity: 1,
        reward: { type: 'free' },
      },
    });
    const withoutB = facts({
      lines: [{ menuItemId: 'item-a', quantity: 2, unitPriceVnd: 40000 }],
    });
    expect(computePromotionBenefit(cross, withoutB).discountVnd).toBe(0);
    const withB = facts({
      lines: [
        { menuItemId: 'item-a', quantity: 1, unitPriceVnd: 40000 },
        { menuItemId: 'item-b', quantity: 1, unitPriceVnd: 25000 },
      ],
    });
    expect(computePromotionBenefit(cross, withB).discountVnd).toBe(25000);
  });

  it('applies a percent reward to the reward units, not the cart', () => {
    const halfOff = promotion({
      benefit: {
        type: 'buyXGetY',
        buyMenuItemIds: null,
        buyQuantity: 1,
        getMenuItemIds: ['item-1'],
        getQuantity: 1,
        reward: { type: 'percentOff', percent: 50 },
      },
    });
    const two = facts({
      lines: [{ menuItemId: 'item-1', quantity: 2, unitPriceVnd: 30000 }],
    });
    expect(computePromotionBenefit(halfOff, two).discountVnd).toBe(15000);
  });

  it('returns a 0 VND gift line for a free item and skips an unavailable one', () => {
    const gift = promotion({
      benefit: { type: 'freeItem', menuItemIds: ['item-gift'], quantity: 2 },
    });
    const withGift = facts({
      menuItems: [{ menuItemId: 'item-gift', name: 'Trà đá', unitPriceVnd: 5000 }],
    });
    const outcome = computePromotionBenefit(gift, withGift);
    expect(outcome.discountVnd).toBe(0);
    expect(outcome.giftValueVnd).toBe(10000);
    expect(outcome.giftLines).toEqual([
      { menuItemId: 'item-gift', name: 'Trà đá', quantity: 2, unitPriceVnd: 0 },
    ]);
    const unavailable = facts({
      menuItems: [
        {
          menuItemId: 'item-gift',
          name: 'Trà đá',
          unitPriceVnd: 5000,
          isAvailable: false,
        },
      ],
    });
    const skipped = computePromotionBenefit(gift, unavailable);
    expect(skipped.discountVnd).toBe(0);
    expect(skipped.giftValueVnd).toBe(0);
  });

  it('charges a bundle price for the most expensive units in the group', () => {
    const combo = promotion({
      benefit: {
        type: 'bundlePrice',
        menuItemIds: ['item-a', 'item-b'],
        quantity: 2,
        bundlePriceVnd: 50000,
      },
    });
    const cart = facts({
      lines: [
        { menuItemId: 'item-a', quantity: 1, unitPriceVnd: 40000 },
        { menuItemId: 'item-b', quantity: 1, unitPriceVnd: 30000 },
      ],
    });
    expect(computePromotionBenefit(combo, cart).discountVnd).toBe(20000);
    const tooFew = facts({
      lines: [{ menuItemId: 'item-a', quantity: 1, unitPriceVnd: 40000 }],
    });
    expect(computePromotionBenefit(combo, tooFew).discountVnd).toBe(0);
  });

  it('reports the redeemed points on a point redemption', () => {
    const redemption = promotion({
      benefit: {
        type: 'pointsRedemption',
        pointsCost: 100,
        reward: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
      },
    });
    const outcome = computePromotionBenefit(redemption, facts());
    expect(outcome.discountVnd).toBe(10000);
    expect(outcome.pointsRedeemed).toBe(100);
  });
});

describe('selectBestPromotion', () => {
  it('selects the largest discount and never stacks', () => {
    const { selection } = selectBestPromotion(
      [
        promotion({
          promotionId: 'fixed',
          benefit: { type: 'fixedAmount', amountVnd: 20000 },
        }),
        promotion({
          promotionId: 'percent',
          benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
        }),
      ],
      facts(),
      NOW,
      null,
    );
    expect(selection?.promotion.promotionId).toBe('fixed');
    expect(selection?.discountVnd).toBe(20000);
  });

  it('breaks equal benefits by priority then stable id', () => {
    const { selection } = selectBestPromotion(
      [
        promotion({
          promotionId: 'b',
          priority: 5,
          benefit: { type: 'fixedAmount', amountVnd: 10000 },
        }),
        promotion({
          promotionId: 'a',
          priority: 5,
          benefit: { type: 'fixedAmount', amountVnd: 10000 },
        }),
        promotion({
          promotionId: 'c',
          priority: 9,
          benefit: { type: 'fixedAmount', amountVnd: 10000 },
        }),
      ],
      facts(),
      NOW,
      null,
    );
    expect(selection?.promotion.promotionId).toBe('c');
  });

  it('ignores an inactive, expired, or ineligible promotion and says why', () => {
    const { selection, reasons } = selectBestPromotion(
      [
        promotion({
          status: 'inactive',
          benefit: { type: 'fixedAmount', amountVnd: 90000 },
        }),
        promotion({
          endsAt: '2026-09-01T00:00:00.000Z',
          benefit: { type: 'fixedAmount', amountVnd: 90000 },
        }),
        promotion({
          eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, minSubtotalVnd: 500000 },
          benefit: { type: 'fixedAmount', amountVnd: 90000 },
        }),
      ],
      facts(),
      NOW,
      null,
    );
    expect(selection).toBeNull();
    expect(reasons).toEqual([
      'windowClosed',
      'windowClosed',
      'belowMinSubtotal',
    ]);
    expect(isPromotionWindowOpen(promotion(), NOW)).toBe(true);
  });

  it('matches eligibility by menu item id', () => {
    const { selection } = selectBestPromotion(
      [
        promotion({
          eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY, menuItemIds: ['item-9'] },
          benefit: { type: 'fixedAmount', amountVnd: 15000 },
        }),
      ],
      facts(),
      NOW,
      null,
    );
    expect(selection).toBeNull();
  });

  it('lets a gift-only promotion win on the value of the gift', () => {
    const { selection } = selectBestPromotion(
      [
        promotion({
          promotionId: 'small-discount',
          benefit: { type: 'fixedAmount', amountVnd: 5000 },
        }),
        promotion({
          promotionId: 'big-gift',
          benefit: { type: 'freeItem', menuItemIds: ['item-gift'], quantity: 1 },
        }),
      ],
      facts({
        menuItems: [
          { menuItemId: 'item-1', unitPriceVnd: 100000 },
          { menuItemId: 'item-gift', name: 'Trà đá', unitPriceVnd: 20000 },
        ],
      }),
      NOW,
      null,
    );
    expect(selection?.promotion.promotionId).toBe('big-gift');
    expect(selection?.discountVnd).toBe(0);
    expect(selection?.giftValueVnd).toBe(20000);
    expect(selection?.totalValueVnd).toBe(20000);
    expect(selection?.outcome.giftLines).toHaveLength(1);
  });
});

describe('allocateLineDiscounts', () => {
  it('spreads the discount and adds back to the order discount', () => {
    const cart = facts({
      lines: [
        { menuItemId: 'item-a', quantity: 1, unitPriceVnd: 60000 },
        { menuItemId: 'item-b', quantity: 1, unitPriceVnd: 40000 },
      ],
    });
    const lines = allocateLineDiscounts(cart, 10000);
    expect(lines.map((line) => line.lineDiscountVnd)).toEqual([6000, 4000]);
    expect(
      lines.reduce((sum, line) => sum + line.lineDiscountVnd, 0),
    ).toBe(10000);
  });

  it('keeps integer VND and never discounts a line beyond its total', () => {
    const cart = facts({
      lines: [
        { menuItemId: 'item-a', quantity: 1, unitPriceVnd: 33333 },
        { menuItemId: 'item-b', quantity: 1, unitPriceVnd: 33333 },
        { menuItemId: 'item-c', quantity: 1, unitPriceVnd: 33334 },
      ],
    });
    const lines = allocateLineDiscounts(cart, 9999);
    expect(lines.reduce((sum, line) => sum + line.lineDiscountVnd, 0)).toBe(9999);
    for (const line of lines) {
      expect(Number.isInteger(line.lineDiscountVnd)).toBe(true);
      expect(line.lineDiscountVnd).toBeLessThanOrEqual(line.lineTotalVnd);
    }
  });
});

describe('stored promotion mapping', () => {
  it('reads a v1 document as v2 with the new fields defaulted', () => {
    const mapped = mapPromotionV1ToV2(
      {
        schemaVersion: 1,
        name: 'Giảm 10%',
        status: 'active',
        priority: 10,
        startsAt: null,
        endsAt: null,
        eligibility: { minSubtotalVnd: 50000, menuItemIds: null },
        benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: 30000 },
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
      },
      'promo-1',
      'tenant-a',
    );
    expect(mapped.schemaVersion).toBe(PROMOTION_CONTRACT_VERSION);
    expect(mapped.source).toBe('manual');
    expect(mapped.eligibility.minQuantity).toBeNull();
    expect(mapped.eligibility.code).toBeNull();
    expect(mapped.benefit).toEqual({
      type: 'percentOff',
      percent: 10,
      maxDiscountVnd: 30000,
    });
  });

  it('parses a stored document at either version', () => {
    const v2 = promotion({ promotionId: 'promo-2', tenantId: 'tenant-a' });
    expect(
      parseStoredPromotion(
        { ...v2, promotionId: undefined, tenantId: undefined },
        'promo-2',
        'tenant-a',
      ).promotionId,
    ).toBe('promo-2');
  });
});
