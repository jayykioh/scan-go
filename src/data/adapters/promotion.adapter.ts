import { httpsCallable } from 'firebase/functions';
import {
  promotionCommandResultSchema,
  promotionEvaluationResultSchema,
  promotionListResultSchema,
  type Promotion,
  type PromotionCartLine,
  type PromotionCommandResult,
  type PromotionEvaluationResult,
  type PromotionListResult,
  type PromotionSetStatusInput,
  type PromotionStatus,
  type PromotionUpsertInput,
} from '@contracts/promotion.contract';
import {
  promotionAiResultSchema,
  type PromotionAiAnswerInput,
  type PromotionAiConfirmInput,
  type PromotionAiResult,
  type PromotionAiSessionInput,
  type PromotionAiStartInput,
} from '@contracts/promotionAi.contract';
import {
  campaignMeasurementResultSchema,
  campaignSuggestionResultSchema,
  type ApproveCampaignInput,
  type CampaignGoal,
  type CampaignMeasurementResult,
  type CampaignSuggestionResult,
  type MeasureCampaignInput,
  type SuggestCampaignInput,
} from '@contracts/campaign.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';
import { getActiveTenantId } from './subscription.adapter';
import { readPromotions } from '../firestoreRead';

/**
 * Server-authoritative promotion calculation. The client sends only menu ids,
 * quantities, option ids, an optional code, and an optional verified Loyalty
 * member, so the server resolves the current prices and the single applied
 * promotion (REQ-PRO-001).
 */
export async function evaluatePromotions(
  lines: PromotionCartLine[],
  options: {
    tenantId?: string;
    code?: string | null;
    loyaltyMemberId?: string | null;
  } = {},
): Promise<PromotionEvaluationResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const resolvedTenantId = options.tenantId ?? (await getActiveTenantId());
  if (!resolvedTenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  const callable = httpsCallable(functions, 'callablePromotionEvaluate');
  return promotionEvaluationResultSchema.parse(
    (
      await callable({
        tenantId: resolvedTenantId,
        lines,
        code: options.code ?? null,
        loyaltyMemberId: options.loyaltyMemberId ?? null,
      })
    ).data,
  );
}

/** Read the tenant Promotion definitions directly (REQ-PRO-001). */
export async function listPromotions(): Promise<Promotion[]> {
  return readPromotions();
}

/**
 * Read the tenant Promotion definitions through the callable. It is the same
 * bounded list as the direct read, but it is the path a non-member token must
 * use (REQ-PRO-002).
 */
export async function fetchPromotions(
  tenantId?: string,
): Promise<PromotionListResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const resolvedTenantId = tenantId ?? (await getActiveTenantId());
  if (!resolvedTenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  const callable = httpsCallable(functions, 'callablePromotionList');
  return promotionListResultSchema.parse(
    (await callable({ tenantId: resolvedTenantId })).data,
  );
}

/** Owner command: create or update one Promotion (REQ-PRO-002). */
export async function upsertPromotion(
  input: PromotionUpsertInput,
): Promise<PromotionCommandResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable(functions, 'callablePromotionUpsert');
  return promotionCommandResultSchema.parse((await callable(input)).data);
}

/** Owner command: activate, pause, or archive one Promotion (REQ-PRO-002). */
export async function setPromotionStatus(
  input: PromotionSetStatusInput,
): Promise<PromotionCommandResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable(functions, 'callablePromotionSetStatus');
  return promotionCommandResultSchema.parse((await callable(input)).data);
}

/** Convenience wrapper for the three status commands the UI offers. */
export async function changePromotionStatus(
  tenantId: string,
  promotionId: string,
  status: PromotionStatus,
  reason?: string | null,
): Promise<PromotionCommandResult> {
  return setPromotionStatus({ tenantId, promotionId, status, reason });
}

// ---------------------------------------------------------------------------
// AI promotion builder (REQ-PRO-007)

async function promotionAiCall<T>(name: string, input: T): Promise<PromotionAiResult> {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error('Firebase chưa được cấu hình.');
  const callable = httpsCallable(functions, name);
  return promotionAiResultSchema.parse((await callable(input)).data);
}

export function startPromotionAi(input: PromotionAiStartInput): Promise<PromotionAiResult> {
  return promotionAiCall('callablePromotionAiStart', input);
}

export function getPromotionAi(input: PromotionAiSessionInput): Promise<PromotionAiResult> {
  return promotionAiCall('callablePromotionAiGet', input);
}

export function answerPromotionAi(input: PromotionAiAnswerInput): Promise<PromotionAiResult> {
  return promotionAiCall('callablePromotionAiAnswer', input);
}

export function discardPromotionAi(input: PromotionAiSessionInput): Promise<PromotionAiResult> {
  return promotionAiCall('callablePromotionAiDiscard', input);
}

export function confirmPromotionAi(input: PromotionAiConfirmInput): Promise<PromotionAiResult> {
  return promotionAiCall('callablePromotionAiConfirm', input);
}

// ---------------------------------------------------------------------------
// AI campaign suggestions (REQ-PRO-001, REQ-LOY-001, NFR-SEC-003)
// ---------------------------------------------------------------------------

/** Owner command: ask the AI for a Promotion or Loyalty campaign suggestion. */
export async function suggestCampaign(
  input: SuggestCampaignInput,
): Promise<CampaignSuggestionResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable(functions, 'callablePromotionSuggestCampaign');
  return campaignSuggestionResultSchema.parse((await callable(input)).data);
}

/**
 * Owner command: approve a suggestion. A human decision is what applies a
 * campaign; the AI never changes business state on its own (NFR-SEC-003).
 */
export async function approveCampaign(
  input: ApproveCampaignInput,
): Promise<CampaignSuggestionResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable(functions, 'callablePromotionApproveCampaign');
  return campaignSuggestionResultSchema.parse((await callable(input)).data);
}

/** Owner query: measure one approved campaign over its period. */
export async function measureCampaign(
  input: MeasureCampaignInput,
): Promise<CampaignMeasurementResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const callable = httpsCallable(functions, 'callablePromotionMeasureCampaign');
  return campaignMeasurementResultSchema.parse((await callable(input)).data);
}

export type { CampaignGoal };
