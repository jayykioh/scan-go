import { describe, expect, it } from 'vitest';
import {
  computePromotionDiscount,
  isPromotionWindowOpen,
  selectBestPromotion,
  type Promotion,
} from './promotion.contract.js';

const NOW = '2026-09-12T05:00:00.000Z';

function promotion(overrides: Partial<Promotion>): Promotion {
  return {
    schemaVersion: 1,
    promotionId: 'promo-a',
    tenantId: 'tenant-a',
    name: 'Promo A',
    status: 'active',
    priority: 1,
    startsAt: null,
    endsAt: null,
    eligibility: { minSubtotalVnd: null, menuItemIds: null },
    benefit: { type: 'fixedAmount', amountVnd: 10000 },
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    ...overrides,
  };
}

describe('computePromotionDiscount', () => {
  it('floors whole-percent discounts and applies the cap', () => {
    const percent = promotion({
      benefit: { type: 'percentOff', percent: 15, maxDiscountVnd: 12000 },
    });
    expect(computePromotionDiscount(percent, 100000)).toBe(12000);
    expect(computePromotionDiscount(percent, 50000)).toBe(7500);
  });

  it('never lets a discount make the total negative', () => {
    const fixed = promotion({
      benefit: { type: 'fixedAmount', amountVnd: 99999 },
    });
    expect(computePromotionDiscount(fixed, 5000)).toBe(5000);
  });
});

describe('selectBestPromotion', () => {
  it('selects the largest discount and never stacks', () => {
    const best = selectBestPromotion(
      [
        promotion({ promotionId: 'fixed', benefit: { type: 'fixedAmount', amountVnd: 20000 } }),
        promotion({
          promotionId: 'percent',
          benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
        }),
      ],
      100000,
      ['item-1'],
      NOW,
    );
    expect(best?.promotion.promotionId).toBe('fixed');
    expect(best?.discountVnd).toBe(20000);
  });

  it('breaks equal benefits by priority then stable id', () => {
    const best = selectBestPromotion(
      [
        promotion({ promotionId: 'b', priority: 5, benefit: { type: 'fixedAmount', amountVnd: 10000 } }),
        promotion({ promotionId: 'a', priority: 5, benefit: { type: 'fixedAmount', amountVnd: 10000 } }),
        promotion({ promotionId: 'c', priority: 9, benefit: { type: 'fixedAmount', amountVnd: 10000 } }),
      ],
      100000,
      [],
      NOW,
    );
    expect(best?.promotion.promotionId).toBe('c');
  });

  it('ignores an inactive, expired, or ineligible promotion', () => {
    const better = selectBestPromotion(
      [
        promotion({ status: 'inactive', benefit: { type: 'fixedAmount', amountVnd: 90000 } }),
        promotion({
          endsAt: '2026-09-01T00:00:00.000Z',
          benefit: { type: 'fixedAmount', amountVnd: 90000 },
        }),
        promotion({
          eligibility: { minSubtotalVnd: 500000, menuItemIds: null },
          benefit: { type: 'fixedAmount', amountVnd: 90000 },
        }),
      ],
      100000,
      [],
      NOW,
    );
    expect(better).toBeNull();
  });

  it('matches eligibility by menu item id', () => {
    const result = selectBestPromotion(
      [
        promotion({
          eligibility: { minSubtotalVnd: null, menuItemIds: ['item-9'] },
          benefit: { type: 'fixedAmount', amountVnd: 15000 },
        }),
      ],
      100000,
      ['item-1'],
      NOW,
    );
    expect(result).toBeNull();
    expect(isPromotionWindowOpen(promotion({}), NOW)).toBe(true);
  });
});
