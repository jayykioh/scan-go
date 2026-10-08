import { httpsCallable } from 'firebase/functions';
import {
  loyaltyListResultSchema,
  loyaltyPointResultSchema,
  loyaltyRegisterResultSchema,
  loyaltyVerifyResultSchema,
  type LoyaltyConfig,
  type LoyaltyMemberView,
} from '@contracts/loyalty.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';
import { getActiveTenantId } from './subscription.adapter';
import { readLoyaltyConfig } from '../firestoreRead';

function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

async function requireTenantId(): Promise<string> {
  const tenantId = await getActiveTenantId();
  if (!tenantId) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return tenantId;
}

export async function listLoyaltyMembers(): Promise<LoyaltyMemberView[]> {
  const functions = requireFunctions();
  const tenantId = await requireTenantId();
  const callable = httpsCallable(functions, 'callableLoyaltyListMembers');
  const result = loyaltyListResultSchema.parse(
    (await callable({ tenantId })).data,
  );
  return result.members;
}

export async function registerLoyaltyMember(
  phone: string,
  displayName: string | null,
): Promise<{ member: LoyaltyMemberView; verificationRequired: boolean }> {
  const functions = requireFunctions();
  const tenantId = await requireTenantId();
  const callable = httpsCallable(functions, 'callableLoyaltyRegisterMember');
  const result = loyaltyRegisterResultSchema.parse(
    (
      await callable({
        tenantId,
        phone,
        displayName,
        idempotencyKey: `loyalty-register-${phone}`,
      })
    ).data,
  );
  return {
    member: result.member,
    verificationRequired: result.verificationRequired,
  };
}

export async function verifyLoyaltyMember(
  memberId: string,
  code: string,
): Promise<LoyaltyMemberView> {
  const functions = requireFunctions();
  const tenantId = await requireTenantId();
  const callable = httpsCallable(functions, 'callableLoyaltyVerifyMember');
  const result = loyaltyVerifyResultSchema.parse(
    (await callable({ tenantId, memberId, code })).data,
  );
  return result.member;
}

export async function redeemLoyaltyPoints(
  memberId: string,
  points: number,
  orderId: string | null,
): Promise<LoyaltyMemberView> {
  const functions = requireFunctions();
  const tenantId = await requireTenantId();
  const callable = httpsCallable(functions, 'callableLoyaltyRedeemPoints');
  const result = loyaltyPointResultSchema.parse(
    (
      await callable({
        tenantId,
        memberId,
        points,
        orderId,
        idempotencyKey: `loyalty-redeem-${memberId}-${points}-${orderId ?? 'none'}`,
      })
    ).data,
  );
  return result.member;
}

/** Read the tenant Loyalty configuration directly (REQ-LOY-001). */
export async function getLoyaltyConfig(): Promise<LoyaltyConfig> {
  return readLoyaltyConfig();
}
