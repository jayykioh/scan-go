import {
  ONBOARDING_CONTRACT_VERSION,
  onboardingStepIds,
  type OnboardingChecklist,
  type OnboardingCompletion,
  type OnboardingStep,
} from '../contracts/onboarding.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';

/**
 * REQ-ONB-002 bound: a prepared Owner must finish the standard onboarding flow
 * within 15 minutes.
 */
export const ONBOARDING_TIME_BUDGET_MS = 15 * 60 * 1000;

/** Stored completion map for the partial checklist fixture below. */
export const partialOnboardingCompletionFixture: OnboardingCompletion = {
  shopName: '2026-09-12T03:05:00.000Z',
};

export const emptyOnboardingCompletionFixture: OnboardingCompletion = {};

export const partialOnboardingChecklistFixture: OnboardingChecklist = {
  schemaVersion: ONBOARDING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  steps: [
    { step: 'shopName', isComplete: true, completedAt: '2026-09-12T03:05:00.000Z' },
    { step: 'industry', isComplete: false, completedAt: null },
    { step: 'plan', isComplete: false, completedAt: null },
    { step: 'paymentMode', isComplete: false, completedAt: null },
    { step: 'tables', isComplete: false, completedAt: null },
    { step: 'menu', isComplete: false, completedAt: null },
  ],
  completedCount: 1,
  totalCount: 6,
  completionPercent: 17,
  nextIncompleteStep: 'industry',
  isComplete: false,
  updatedAt: '2026-09-12T03:05:00.000Z',
};

export const completeOnboardingChecklistFixture: OnboardingChecklist = {
  schemaVersion: ONBOARDING_CONTRACT_VERSION,
  tenantId: TENANT_A_FIXTURE,
  steps: onboardingStepIds.map<OnboardingStep>((step, index) => ({
    step,
    isComplete: true,
    completedAt: `2026-09-12T0${index + 3}:00:00.000Z`,
  })),
  completedCount: 6,
  totalCount: 6,
  completionPercent: 100,
  nextIncompleteStep: null,
  isComplete: true,
  updatedAt: '2026-09-12T08:00:00.000Z',
};
