import {
  EMPTY_PROMOTION_ELIGIBILITY,
  PROMOTION_CONTRACT_VERSION,
  type Promotion,
  type PromotionEvaluationResult,
} from '../contracts/promotion.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const PROMOTION_ID_FIXTURE = 'promo_10_percent';
export const PROMOTION_FIXED_ID_FIXTURE = 'promo_flat_20000';
export const PROMOTION_CREATED_AT_FIXTURE = '2026-09-12T05:00:00.000Z';

export const percentPromotionFixture: Promotion = {
  schemaVersion: PROMOTION_CONTRACT_VERSION,
  promotionId: PROMOTION_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  name: 'Giảm 10%',
  source: 'manual',
  status: 'active',
  priority: 10,
  startsAt: null,
  endsAt: null,
  eligibility: {
    ...EMPTY_PROMOTION_ELIGIBILITY,
    minSubtotalVnd: 50000,
  },
  benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: 30000 },
  createdAt: PROMOTION_CREATED_AT_FIXTURE,
  updatedAt: PROMOTION_CREATED_AT_FIXTURE,
  archivedAt: null,
};

export const fixedPromotionFixture: Promotion = {
  schemaVersion: PROMOTION_CONTRACT_VERSION,
  promotionId: PROMOTION_FIXED_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  name: 'Giảm 20.000đ',
  source: 'manual',
  status: 'active',
  priority: 5,
  startsAt: null,
  endsAt: null,
  eligibility: { ...EMPTY_PROMOTION_ELIGIBILITY },
  benefit: { type: 'fixedAmount', amountVnd: 20000 },
  createdAt: PROMOTION_CREATED_AT_FIXTURE,
  updatedAt: PROMOTION_CREATED_AT_FIXTURE,
  archivedAt: null,
};

export const promotionEvaluationFixture: PromotionEvaluationResult = {
  schemaVersion: PROMOTION_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  subtotalVnd: 100000,
  discountVnd: 10000,
  giftValueVnd: 0,
  totalVnd: 90000,
  appliedPromotion: {
    promotionId: PROMOTION_ID_FIXTURE,
    name: 'Giảm 10%',
    benefitType: 'percentOff',
    priority: 10,
    discountVnd: 10000,
    giftValueVnd: 0,
    code: null,
  },
  lines: [
    {
      menuItemId: 'item-1',
      quantity: 1,
      unitPriceVnd: 100000,
      lineTotalVnd: 100000,
      lineDiscountVnd: 10000,
    },
  ],
  giftLines: [],
  pointsRedeemed: 0,
  codeRequired: false,
  ineligibilityReasons: [],
  consideredPromotionIds: [PROMOTION_FIXED_ID_FIXTURE, PROMOTION_ID_FIXTURE],
  evaluatedAt: '2026-09-12T05:00:00.000Z',
};
