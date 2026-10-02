import { describe, expect, it } from 'vitest';
import {
  feedbackRecordSchema,
  feedbackSubmitInputSchema,
  feedbackSubmitResultSchema,
} from './feedback.contract.js';
import {
  unverifiedFeedbackFixture,
  verifiedFeedbackFixture,
} from '../fixtures/feedback.fixture.js';

/**
 * Feedback contract tests (REQ-FDB-001, NFR-PRIV-002). The contract is the
 * boundary: identity fields are rejected and a record always carries a
 * verification state.
 */
describe('feedbackSubmitInputSchema', () => {
  it('accepts a rated review and a described issue', () => {
    expect(
      feedbackSubmitInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        kind: 'review',
        rating: 5,
      }).success,
    ).toBe(true);
    expect(
      feedbackSubmitInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        kind: 'issue',
        message: 'Thiếu dụng cụ.',
      }).success,
    ).toBe(true);
  });

  it('rejects identity fields and out-of-range ratings', () => {
    for (const key of ['name', 'phone', 'email']) {
      expect(
        feedbackSubmitInputSchema.safeParse({
          tenantId: 'tenant-alpha',
          kind: 'issue',
          message: 'ok',
          [key]: 'secret',
        }).success,
      ).toBe(false);
    }
    expect(
      feedbackSubmitInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        kind: 'review',
        rating: 6,
      }).success,
    ).toBe(false);
  });

  it('requires content for the selected kind', () => {
    expect(
      feedbackSubmitInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        kind: 'review',
      }).success,
    ).toBe(false);
    expect(
      feedbackSubmitInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        kind: 'issue',
      }).success,
    ).toBe(false);
  });
});

describe('feedbackRecordSchema', () => {
  it('accepts verified and unverified fixtures', () => {
    expect(
      feedbackRecordSchema.parse(verifiedFeedbackFixture).verificationState,
    ).toBe('verified');
    expect(
      feedbackRecordSchema.parse(unverifiedFeedbackFixture).verificationState,
    ).toBe('unverified');
  });

  it('rejects a record that stores an identity field', () => {
    expect(() =>
      feedbackRecordSchema.parse({
        ...verifiedFeedbackFixture,
        phone: '0912345678',
      }),
    ).toThrow();
  });
});

describe('feedbackSubmitResultSchema', () => {
  it('never carries raw text', () => {
    expect(
      feedbackSubmitResultSchema.safeParse({
        schemaVersion: 1,
        feedbackId: 'feedback-1',
        tenantId: 'tenant-alpha',
        verificationState: 'verified',
        createdAt: '2026-09-13T00:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(
      feedbackSubmitResultSchema.safeParse({
        schemaVersion: 1,
        feedbackId: 'feedback-1',
        tenantId: 'tenant-alpha',
        verificationState: 'verified',
        createdAt: '2026-09-13T00:00:00.000Z',
        message: 'raw text',
      }).success,
    ).toBe(false);
  });
});
