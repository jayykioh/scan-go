import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_SUBMIT_CALLABLE,
  parseFeedbackSubmitResult,
} from './feedback.adapter';
import { verifiedFeedbackFixture } from '@shared/fixtures/feedback.fixture';

/**
 * Feedback frontend seam tests (REQ-FDB-001, NFR-PRIV-002). The client accepts
 * only the minimal server result, which never echoes raw text.
 */
describe('parseFeedbackSubmitResult', () => {
  it('accepts a minimal verified result', () => {
    const result = parseFeedbackSubmitResult({
      schemaVersion: 1,
      feedbackId: verifiedFeedbackFixture.feedbackId,
      tenantId: verifiedFeedbackFixture.tenantId,
      verificationState: verifiedFeedbackFixture.verificationState,
      createdAt: verifiedFeedbackFixture.createdAt,
    });
    expect(result.verificationState).toBe('verified');
  });

  it('rejects a result that echoes raw text', () => {
    expect(() =>
      parseFeedbackSubmitResult({
        schemaVersion: 1,
        feedbackId: 'feedback-1',
        tenantId: 'tenant-1',
        verificationState: 'verified',
        createdAt: '2026-09-13T00:00:00.000Z',
        message: 'raw text',
      }),
    ).toThrow();
  });

  it('uses the stable published callable name', () => {
    expect(FEEDBACK_SUBMIT_CALLABLE).toBe('callableFeedbackSubmit');
  });
});
