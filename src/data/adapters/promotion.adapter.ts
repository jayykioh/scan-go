import { httpsCallable } from 'firebase/functions';
import {
  promotionEvaluationResultSchema,
  promotionListResultSchema,
  type Promotion,
  type PromotionCartLine,
  type PromotionEvaluationResult,
} from '@contracts/promotion.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';
import { getActiveTenantId } from './subscription.adapter';

/**
 * Server-authoritative promotion calculation. The client sends only menu ids
 * and quantities, so the server resolves the current prices and the single
 * applied promotion (REQ-PRO-001).
 */
export async function evaluatePromotions(
  lines: PromotionCartLine[],
  tenantId?: string,
): Promise<PromotionEvaluationResult> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const resolvedTenantId = tenantId ?? (await getActiveTenantId());
  if (!resolvedTenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  const callable = httpsCallable(functions, 'callablePromotionEvaluate');
  return promotionEvaluationResultSchema.parse(
    (await callable({ tenantId: resolvedTenantId, lines })).data,
  );
}

export async function listPromotions(): Promise<Promotion[]> {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  const callable = httpsCallable(functions, 'callablePromotionList');
  return promotionListResultSchema.parse((await callable({ tenantId })).data)
    .promotions;
}
