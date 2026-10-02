import { HttpsError } from 'firebase-functions/v2/https';
import type { ZodType } from 'zod';
import { stableRequestHash } from '../../shared/idempotency.js';
import {
  CAMPAIGN_CONTRACT_VERSION,
  approveCampaignInputSchema,
  buildProposedPromotion,
  campaignSuggestionSchema,
  computeAverageOrderValueVnd,
  computeReturnRateBps,
  measureCampaignInputSchema,
  proposedLoyaltySchema,
  suggestCampaignInputSchema,
  type ApproveCampaignInput,
  type CampaignChannel,
  type CampaignGoal,
  type CampaignSuggestion,
  type MeasureCampaignInput,
  type SuggestCampaignInput,
} from '../../../../shared/contracts/campaign.contract.js';

export const CAMPAIGN_INVALID_MESSAGE = 'Dữ liệu chiến dịch không hợp lệ.';
export const CAMPAIGN_NOT_FOUND_MESSAGE = 'Không tìm thấy gợi ý chiến dịch.';
export const CAMPAIGN_IDEMPOTENCY_CONFLICT_MESSAGE =
  'Yêu cầu đã được gửi trước đó. Vui lòng thử lại.';
export const CAMPAIGN_MISSING_DATA_NOTE =
  'Chưa có số liệu bán hàng trong kỳ để kết luận.';

export interface LoyaltySnapshot {
  earnRateVnd: number;
  pointsPerEarnRate: number;
  welcomePoints: number;
}

/** Rebuild a CampaignSuggestion contract from a stored document. */
export function toCampaignSuggestion(
  suggestionId: string,
  data: Record<string, unknown>,
): CampaignSuggestion {
  return campaignSuggestionSchema.parse({
    ...data,
    suggestionId,
  });
}

export function campaignSuggestionCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/campaignSuggestions`;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', CAMPAIGN_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseSuggestCampaignInput(data: unknown): SuggestCampaignInput {
  return parseOrInvalid<SuggestCampaignInput>(suggestCampaignInputSchema, data);
}

export function parseApproveCampaignInput(
  data: unknown,
): ApproveCampaignInput {
  return parseOrInvalid<ApproveCampaignInput>(approveCampaignInputSchema, data);
}

export function parseMeasureCampaignInput(
  data: unknown,
): MeasureCampaignInput {
  return parseOrInvalid<MeasureCampaignInput>(measureCampaignInputSchema, data);
}

/**
 * Canonical request hash for one approval. Reusing an idempotency key for a
 * different suggestion or reason is a conflict, so a retry cannot replay an
 * unrelated approval (REQ-PRO-001, NFR-SEC-003).
 */
export function buildApproveCampaignRequestHash(input: {
  tenantId: string;
  suggestionId: string;
  reason: string | null;
}): string {
  return stableRequestHash({
    command: 'approveCampaign',
    tenantId: input.tenantId,
    suggestionId: input.suggestionId,
    reason: input.reason,
  });
}

const TITLE_BY_CHANNEL_GOAL: Record<CampaignChannel, Record<CampaignGoal, string>> = {
  promotion: {
    increaseReturnRate: 'Khuyến mãi giữ chân khách quay lại',
    increaseOrderValue: 'Khuyến mãi tăng giá trị đơn',
    increaseGrossProfit: 'Khuyến mãi bảo vệ lãi gộp',
  },
  loyalty: {
    increaseReturnRate: 'Điểm thưởng khuyến khích quay lại',
    increaseOrderValue: 'Điểm thưởng theo giá trị đơn',
    increaseGrossProfit: 'Điểm thưởng tiết kiệm chi phí',
  },
};

/**
 * Deterministic campaign proposal. It is grounded in the day keys that were
 * actually read, and states the limitation instead of inventing numbers when
 * there is no data (NFR-AI-001, REQ-PRO-001, REQ-LOY-001).
 */
export function buildCampaignSuggestion(input: {
  suggestionId: string;
  tenantId: string;
  channel: CampaignChannel;
  goal: CampaignGoal;
  sourceDayKeys: string[];
  currentLoyalty: LoyaltySnapshot;
  provider: string;
  model: string;
  now: string;
}): CampaignSuggestion {
  const missingData = input.sourceDayKeys.length === 0;
  const titleName = TITLE_BY_CHANNEL_GOAL[input.channel][input.goal];
  const rationale = missingData
    ? `${CAMPAIGN_MISSING_DATA_NOTE} Đề xuất này là giả thuyết, cần thêm dữ liệu trước khi áp dụng.`
    : `Dựa trên ${input.sourceDayKeys.length} ngày dữ liệu đã đọc, đề xuất chiến dịch "${titleName}".`;

  const proposedPromotion =
    input.channel === 'promotion'
      ? buildProposedPromotion(input.goal, titleName)
      : null;
  const proposedLoyalty =
    input.channel === 'loyalty'
      ? proposedLoyaltySchema.parse({
          earnRateVnd:
            input.goal === 'increaseOrderValue'
              ? Math.max(1000, Math.floor(input.currentLoyalty.earnRateVnd / 2))
              : input.currentLoyalty.earnRateVnd,
          pointsPerEarnRate: input.currentLoyalty.pointsPerEarnRate,
          welcomePoints:
            input.goal === 'increaseGrossProfit'
              ? input.currentLoyalty.welcomePoints
              : input.currentLoyalty.welcomePoints + 20,
        })
      : null;

  return campaignSuggestionSchema.parse({
    schemaVersion: CAMPAIGN_CONTRACT_VERSION,
    suggestionId: input.suggestionId,
    tenantId: input.tenantId,
    channel: input.channel,
    goal: input.goal,
    title: titleName,
    rationale,
    sourceIds: input.sourceDayKeys,
    missingData,
    missingDataNotes: missingData ? [CAMPAIGN_MISSING_DATA_NOTE] : [],
    proposedPromotion,
    proposedLoyalty,
    status: 'suggested',
    provider: input.provider,
    model: input.model,
    generatedAt: input.now,
    approvedByUid: null,
    approvedAt: null,
  });
}

export interface CampaignMeasurementInput {
  tenantId: string;
  suggestionId: string;
  channel: CampaignChannel;
  periodStart: string;
  periodEnd: string;
  paidOrderCount: number;
  revenueVnd: number;
  costVnd: number;
  grossProfitVnd: number;
  distinctLoyaltyMembers: number;
  returningLoyaltyMembers: number;
  sourceIds: string[];
  now: string;
}

/** Pure measurement assembly; integer VND and integer basis points only. */
export function buildCampaignMeasurement(input: CampaignMeasurementInput) {
  const missingData = input.sourceIds.length === 0 || input.paidOrderCount === 0;
  return {
    schemaVersion: CAMPAIGN_CONTRACT_VERSION,
    tenantId: input.tenantId,
    suggestionId: input.suggestionId,
    channel: input.channel,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    paidOrderCount: input.paidOrderCount,
    revenueVnd: input.revenueVnd,
    costVnd: input.costVnd,
    grossProfitAfterDiscountVnd: input.grossProfitVnd,
    averageOrderValueVnd: computeAverageOrderValueVnd(
      input.revenueVnd,
      input.paidOrderCount,
    ),
    distinctLoyaltyMembers: input.distinctLoyaltyMembers,
    returningLoyaltyMembers: input.returningLoyaltyMembers,
    returnRateBps: computeReturnRateBps(
      input.returningLoyaltyMembers,
      input.distinctLoyaltyMembers,
    ),
    sourceIds: input.sourceIds,
    missingData,
    missingDataNotes: missingData ? [CAMPAIGN_MISSING_DATA_NOTE] : [],
    measuredAt: input.now,
  };
}
