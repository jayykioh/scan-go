import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  onboardingChecklistSchema,
  type OnboardingChecklist,
  type OnboardingStepId,
} from '@contracts/onboarding.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

async function currentTenantId(): Promise<string> {
  const db = getFirebaseFirestore();
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!db || !uid) {
    throw new Error(
      'Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local.',
    );
  }
  const userSnap = await getDoc(doc(db, 'users', uid));
  const activeTenantId = userSnap.get('activeTenantId');
  if (typeof activeTenantId !== 'string' || activeTenantId.length === 0) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return activeTenantId;
}

function functionsOrThrow() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

/** Read the Owner onboarding checklist for the active Tenant (REQ-ONB-001). */
export async function getOnboardingChecklist(): Promise<OnboardingChecklist> {
  const tenantId = await currentTenantId();
  const callable = httpsCallable<
    { tenantId: string },
    OnboardingChecklist
  >(functionsOrThrow(), 'callableTenantOnboardingGet');
  return onboardingChecklistSchema.parse((await callable({ tenantId })).data);
}

/**
 * Mark one onboarding step complete for the active Tenant. The server owns the
 * checklist field and returns the updated view (REQ-ONB-001).
 */
export async function completeOnboardingStep(
  step: OnboardingStepId,
): Promise<OnboardingChecklist> {
  const tenantId = await currentTenantId();
  const callable = httpsCallable<
    { tenantId: string; step: OnboardingStepId },
    OnboardingChecklist
  >(functionsOrThrow(), 'callableTenantOnboardingUpdate');
  return onboardingChecklistSchema.parse(
    (await callable({ tenantId, step })).data,
  );
}
