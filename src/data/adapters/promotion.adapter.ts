import { httpsCallable } from 'firebase/functions';
import {
  promotionEvaluationResultSchema,
  type Promotion,
  type PromotionCartLine,
  type PromotionEvaluationResult,
} from '@contracts/promotion.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';
import { getActiveTenantId } from './subscription.adapter';
import { readPromotions } from '../firestoreRead';

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

/** Read the tenant Promotion definitions directly (REQ-PRO-001). */
export async function listPromotions(): Promise<Promotion[]> {
  return readPromotions();
}
