import { describe, expect, it } from 'vitest';
import {
  onboardingChecklistSchema,
  buildOnboardingChecklist,
  markOnboardingStepComplete,
  nextIncompleteOnboardingStep,
  onboardingStepIds,
  type OnboardingCompletion,
} from './onboarding.contract.js';
import {
  completeOnboardingChecklistFixture,
  partialOnboardingChecklistFixture,
} from '../fixtures/onboarding.fixture.js';
import { TENANT_A_FIXTURE } from '../fixtures/identity.fixture.js';

const NOW = '2026-09-12T03:05:00.000Z';

describe('OnboardingChecklist contract', () => {
  it('accepts the partial and complete fixtures', () => {
    expect(
      onboardingChecklistSchema.safeParse(partialOnboardingChecklistFixture)
        .success,
    ).toBe(true);
    expect(
      onboardingChecklistSchema.safeParse(completeOnboardingChecklistFixture)
        .success,
    ).toBe(true);
  });

  it('rejects an incomplete step with a completion timestamp', () => {
    expect(
      onboardingChecklistSchema.safeParse({
        ...partialOnboardingChecklistFixture,
        steps: [
          { step: 'shopName', isComplete: false, completedAt: '2026-09-12T03:05:00.000Z' },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an unapproved step id', () => {
    expect(
      onboardingChecklistSchema.safeParse({
        ...partialOnboardingChecklistFixture,
        steps: [{ step: 'loyalty', isComplete: false, completedAt: null }],
      }).success,
    ).toBe(false);
  });
});

describe('onboarding next-step selection and progression (REQ-ONB-001)', () => {
  it('selects the first incomplete step in the approved order', () => {
    expect(nextIncompleteOnboardingStep({})).toBe('shopName');
    expect(
      nextIncompleteOnboardingStep({ shopName: NOW, industry: NOW }),
    ).toBe('plan');
    const complete: OnboardingCompletion = Object.fromEntries(
      onboardingStepIds.map((step) => [step, NOW]),
    );
    expect(nextIncompleteOnboardingStep(complete)).toBeNull();
  });

  it('marks one step without moving its first completion timestamp', () => {
    const first = markOnboardingStepComplete({}, 'shopName', NOW);
    expect(first).toEqual({ shopName: NOW });
    const repeated = markOnboardingStepComplete(
      first,
      'shopName',
      '2026-09-12T09:00:00.000Z',
    );
    expect(repeated.shopName).toBe(NOW);
  });

  it('builds the checklist view with counts and percent', () => {
    const checklist = buildOnboardingChecklist({
      tenantId: TENANT_A_FIXTURE,
      completion: { shopName: NOW, industry: NOW },
      now: NOW,
    });
    expect(checklist.completedCount).toBe(2);
    expect(checklist.totalCount).toBe(6);
    expect(checklist.completionPercent).toBe(33);
    expect(checklist.nextIncompleteStep).toBe('plan');
    expect(checklist.isComplete).toBe(false);
  });
});
