import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

export const ONBOARDING_CONTRACT_VERSION = 1;

export const onboardingStepIdSchema = z.enum([
  'shopName',
  'industry',
  'plan',
  'paymentMode',
  'tables',
  'menu',
]);

export type OnboardingStepId = z.infer<typeof onboardingStepIdSchema>;

export const onboardingStepIds: readonly OnboardingStepId[] =
  onboardingStepIdSchema.options;

export const onboardingStepSchema = z.strictObject({
  step: onboardingStepIdSchema,
  isComplete: z.boolean(),
  completedAt: isoUtcTimestampSchema.nullable(),
});

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

export const onboardingChecklistSchema = z
  .strictObject({
    schemaVersion: z.literal(ONBOARDING_CONTRACT_VERSION),
    tenantId: z.string().min(1),
    steps: z.array(onboardingStepSchema),
    completedCount: z.number().int().nonnegative(),
    totalCount: z.number().int().positive(),
    completionPercent: z.number().int().min(0).max(100),
    nextIncompleteStep: onboardingStepIdSchema.nullable(),
    isComplete: z.boolean(),
    updatedAt: isoUtcTimestampSchema,
  })
  .refine(
    (checklist) =>
      checklist.steps.every(
        (step) => step.isComplete === (step.completedAt !== null),
      ),
    { message: 'step completion and completedAt must agree' },
  );

export type OnboardingChecklist = z.infer<typeof onboardingChecklistSchema>;

/** Stored completion map: an approved step maps to its UTC completion time. */
export type OnboardingCompletion = Partial<
  Record<OnboardingStepId, z.infer<typeof isoUtcTimestampSchema>>
>;

/**
 * A stored completion map holds only completed steps, so every approved step
 * key is optional. `z.partialRecord` accepts `{}` and rejects unknown keys.
 */
export const onboardingCompletionSchema = z.partialRecord(
  onboardingStepIdSchema,
  isoUtcTimestampSchema,
);

export const onboardingStateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
});

export type OnboardingStateInput = z.infer<typeof onboardingStateInputSchema>;

export const onboardingUpdateInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  step: onboardingStepIdSchema,
});

export type OnboardingUpdateInput = z.infer<
  typeof onboardingUpdateInputSchema
>;

/** The first approved step without a completion timestamp, or null. */
export function nextIncompleteOnboardingStep(
  completion: OnboardingCompletion,
): OnboardingStepId | null {
  return onboardingStepIds.find((step) => !completion[step]) ?? null;
}

/**
 * Mark one step complete without moving its first completion timestamp. A
 * repeat call is idempotent, so a retry never rewrites history.
 */
export function markOnboardingStepComplete(
  completion: OnboardingCompletion,
  step: OnboardingStepId,
  completedAt: string,
): OnboardingCompletion {
  if (completion[step]) {
    return { ...completion };
  }
  return { ...completion, [step]: completedAt };
}

export interface BuildOnboardingChecklistInput {
  tenantId: string;
  completion: OnboardingCompletion;
  now: string;
}

/**
 * Derive the checklist view from the stored completion map. The next
 * incomplete step always follows the approved order, and a new Tenant with no
 * completions starts at `shopName` (REQ-ONB-001).
 */
export function buildOnboardingChecklist(
  input: BuildOnboardingChecklistInput,
): OnboardingChecklist {
  const steps: OnboardingStep[] = onboardingStepIds.map((step) => {
    const completedAt = input.completion[step] ?? null;
    return { step, isComplete: completedAt !== null, completedAt };
  });
  const totalCount = steps.length;
  const completedCount = steps.filter((step) => step.isComplete).length;

  return onboardingChecklistSchema.parse({
    schemaVersion: ONBOARDING_CONTRACT_VERSION,
    tenantId: input.tenantId,
    steps,
    completedCount,
    totalCount,
    completionPercent:
      totalCount === 0 ? 100 : Math.round((completedCount / totalCount) * 100),
    nextIncompleteStep: nextIncompleteOnboardingStep(input.completion),
    isComplete: completedCount === totalCount,
    updatedAt: input.now,
  });
}
