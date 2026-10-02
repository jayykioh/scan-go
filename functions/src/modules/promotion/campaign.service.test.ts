import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_MISSING_DATA_NOTE,
  buildApproveCampaignRequestHash,
  buildCampaignMeasurement,
  buildCampaignSuggestion,
} from './campaign.service.js';
import {
  computeAverageOrderValueVnd,
  computeReturnRateBps,
  buildProposedPromotion,
} from '../../../../shared/contracts/campaign.contract.js';

const NOW = '2026-09-13T00:00:00.000Z';

describe('campaign suggestion (REQ-PRO-001, REQ-LOY-001, NFR-SEC-003)', () => {
  it('builds a deterministic Promotion proposal per goal', () => {
    expect(buildProposedPromotion('increaseOrderValue', 'x').benefit).toEqual({
      type: 'fixedAmount',
      amountVnd: 10000,
    });
    expect(buildProposedPromotion('increaseGrossProfit', 'x').benefit).toEqual({
      type: 'percentOff',
      percent: 5,
      maxDiscountVnd: null,
    });
    expect(buildProposedPromotion('increaseReturnRate', 'x').benefit).toEqual({
      type: 'percentOff',
      percent: 10,
      maxDiscountVnd: null,
    });
  });

  it('cites source day keys and stays suggested until an Owner approves', () => {
    const suggestion = buildCampaignSuggestion({
      suggestionId: 's-1',
      tenantId: 'tenant-a',
      channel: 'promotion',
      goal: 'increaseReturnRate',
      sourceDayKeys: ['20260901', '20260902'],
      currentLoyalty: {
        earnRateVnd: 10000,
        pointsPerEarnRate: 1,
        welcomePoints: 0,
      },
      provider: 'rule-based',
      model: 'deterministic-v1',
      now: NOW,
    });
    expect(suggestion.sourceIds).toEqual(['20260901', '20260902']);
    expect(suggestion.missingData).toBe(false);
    expect(suggestion.status).toBe('suggested');
    expect(suggestion.approvedByUid).toBeNull();
    expect(suggestion.proposedPromotion).not.toBeNull();
  });

  it('states the limitation and invents no data when there are no day keys', () => {
    const suggestion = buildCampaignSuggestion({
      suggestionId: 's-2',
      tenantId: 'tenant-a',
      channel: 'loyalty',
      goal: 'increaseOrderValue',
      sourceDayKeys: [],
      currentLoyalty: {
        earnRateVnd: 10000,
        pointsPerEarnRate: 1,
        welcomePoints: 0,
      },
      provider: 'rule-based',
      model: 'deterministic-v1',
      now: NOW,
    });
    expect(suggestion.missingData).toBe(true);
    expect(suggestion.missingDataNotes).toContain(CAMPAIGN_MISSING_DATA_NOTE);
    expect(suggestion.proposedLoyalty).not.toBeNull();
  });

  it('binds an approval request hash to the suggestion and reason', () => {
    const base = { tenantId: 'tenant-a', suggestionId: 's-1', reason: null };
    expect(buildApproveCampaignRequestHash(base)).toBe(
      buildApproveCampaignRequestHash({ ...base }),
    );
    expect(buildApproveCampaignRequestHash(base)).not.toBe(
      buildApproveCampaignRequestHash({ ...base, suggestionId: 's-2' }),
    );
    expect(buildApproveCampaignRequestHash(base)).not.toBe(
      buildApproveCampaignRequestHash({ ...base, reason: 'because' }),
    );
  });
});

describe('campaign measurement (REQ-PRO-001, REQ-LOY-001)', () => {
  it('computes integer average order value and basis-point return rate', () => {
    expect(computeAverageOrderValueVnd(400000, 4)).toBe(100000);
    expect(computeAverageOrderValueVnd(100, 0)).toBe(0);
    expect(computeReturnRateBps(1, 3)).toBe(3333);
    expect(computeReturnRateBps(5, 0)).toBe(0);
    expect(computeReturnRateBps(99, 1)).toBe(10000);
  });

  it('measures return rate, order value, and gross profit after discount', () => {
    const measurement = buildCampaignMeasurement({
      tenantId: 'tenant-a',
      suggestionId: 's-1',
      channel: 'promotion',
      periodStart: '20260901',
      periodEnd: '20260907',
      paidOrderCount: 4,
      revenueVnd: 400000,
      costVnd: 150000,
      grossProfitVnd: 250000,
      distinctLoyaltyMembers: 3,
      returningLoyaltyMembers: 1,
      sourceIds: ['20260901', '20260902'],
      now: NOW,
    });
    expect(measurement.averageOrderValueVnd).toBe(100000);
    expect(measurement.returnRateBps).toBe(3333);
    expect(measurement.grossProfitAfterDiscountVnd).toBe(250000);
    expect(measurement.missingData).toBe(false);
  });

  it('labels missing measurement data instead of inventing values', () => {
    const measurement = buildCampaignMeasurement({
      tenantId: 'tenant-a',
      suggestionId: 's-1',
      channel: 'promotion',
      periodStart: '20260901',
      periodEnd: '20260907',
      paidOrderCount: 0,
      revenueVnd: 0,
      costVnd: 0,
      grossProfitVnd: 0,
      distinctLoyaltyMembers: 0,
      returningLoyaltyMembers: 0,
      sourceIds: [],
      now: NOW,
    });
    expect(measurement.missingData).toBe(true);
    expect(measurement.missingDataNotes).toContain(CAMPAIGN_MISSING_DATA_NOTE);
  });
});
