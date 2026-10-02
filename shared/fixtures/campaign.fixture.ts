import {
  CAMPAIGN_CONTRACT_VERSION,
  type CampaignMeasurement,
  type CampaignSuggestion,
} from '../contracts/campaign.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

export const CAMPAIGN_NOW_FIXTURE = '2026-09-13T00:00:00.000Z';
export const CAMPAIGN_SUGGESTION_ID_FIXTURE = 'campaign-promo-return-001';

/** An AI suggestion that is not yet approved: no business state changed. */
export const campaignSuggestionFixture: CampaignSuggestion = {
  schemaVersion: CAMPAIGN_CONTRACT_VERSION,
  suggestionId: CAMPAIGN_SUGGESTION_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  channel: 'promotion',
  goal: 'increaseReturnRate',
  title: 'Khuyến mãi giữ chân khách quay lại',
  rationale: 'Doanh thu tuần ổn định; đề xuất giảm 10% để tăng lượt quay lại.',
  sourceIds: ['20260901', '20260902'],
  missingData: false,
  missingDataNotes: [],
  proposedPromotion: {
    name: 'Khuyến mãi giữ chân',
    priority: 100,
    startsAt: null,
    endsAt: null,
    benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: null },
  },
  proposedLoyalty: null,
  status: 'suggested',
  provider: 'rule-based',
  model: 'deterministic-v1',
  generatedAt: CAMPAIGN_NOW_FIXTURE,
  approvedByUid: null,
  approvedAt: null,
};

/** The same suggestion after an Owner approved it. */
export const approvedCampaignSuggestionFixture: CampaignSuggestion = {
  ...campaignSuggestionFixture,
  status: 'approved',
  approvedByUid: 'uid-owner-001',
  approvedAt: '2026-09-13T01:00:00.000Z',
};

/** Post-campaign measurement: return rate, order value, gross profit. */
export const campaignMeasurementFixture: CampaignMeasurement = {
  schemaVersion: CAMPAIGN_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  suggestionId: CAMPAIGN_SUGGESTION_ID_FIXTURE,
  channel: 'promotion',
  periodStart: '20260901',
  periodEnd: '20260907',
  paidOrderCount: 4,
  revenueVnd: 400000,
  costVnd: 150000,
  grossProfitAfterDiscountVnd: 250000,
  averageOrderValueVnd: 100000,
  distinctLoyaltyMembers: 3,
  returningLoyaltyMembers: 1,
  returnRateBps: 3333,
  sourceIds: ['20260901', '20260902'],
  missingData: false,
  missingDataNotes: [],
  measuredAt: CAMPAIGN_NOW_FIXTURE,
};
