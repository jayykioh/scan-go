/**
 * Feedback service unit tests (REQ-FDB-001, NFR-PRIV-002).
 *
 * Server verification decides the state from a real Order reference, and
 * personal data is masked in the analysis text.
 */
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  buildFeedbackRecord,
  maskPersonalData,
  parseFeedbackSubmitInput,
  resolveVerificationState,
} from './service.js';

const NOW = '2026-09-13T00:00:00.000Z';

describe('maskPersonalData', () => {
  it('masks phone numbers, emails, and long digit runs', () => {
    const masked = maskPersonalData(
      'Gọi 0912345678 hoặc +84 912 345 678, email an@example.com, mã 123456789.',
    );
    expect(masked).not.toContain('0912345678');
    expect(masked).not.toContain('an@example.com');
    expect(masked).not.toContain('123456789');
    expect(masked).toContain('[redacted]');
  });

  it('keeps non-personal text unchanged', () => {
    expect(maskPersonalData('Món ăn ngon, phục vụ nhanh.')).toBe(
      'Món ăn ngon, phục vụ nhanh.',
    );
  });
});

describe('resolveVerificationState', () => {
  it('marks verified only when a matching Order exists', () => {
    expect(resolveVerificationState(true)).toBe('verified');
    expect(resolveVerificationState(false)).toBe('unverified');
  });
});

describe('buildFeedbackRecord', () => {
  it('stores masked analysis text and no identity data', () => {
    const record = buildFeedbackRecord({
      feedbackId: 'feedback-1',
      tenantId: 'tenant-1',
      kind: 'issue',
      message: 'Gọi 0912345678 gấp.',
      orderId: 'order-1',
      verificationState: 'verified',
      now: NOW,
    });
    expect(record.message).toBe('Gọi 0912345678 gấp.');
    expect(record.maskedMessage).toBe('Gọi [redacted] gấp.');
    expect(record.actorType).toBe('customer');
    expect(record.actorUid).toBeNull();
    expect('phone' in record).toBe(false);
  });

  it('drops the rating for an issue and keeps a null message', () => {
    const record = buildFeedbackRecord({
      feedbackId: 'feedback-2',
      tenantId: 'tenant-1',
      kind: 'issue',
      message: 'Thiếu dụng cụ.',
      orderId: null,
      verificationState: 'unverified',
      now: NOW,
    });
    expect(record.rating).toBeNull();
    expect(record.maskedMessage).toBe('Thiếu dụng cụ.');
  });
});

describe('parseFeedbackSubmitInput', () => {
  it('rejects malformed input and identity fields', () => {
    expect(() => parseFeedbackSubmitInput({})).toThrow(HttpsError);
    expect(() =>
      parseFeedbackSubmitInput({
        tenantId: 'tenant-1',
        kind: 'issue',
        message: 'ok',
        phone: '0912345678',
      }),
    ).toThrow(HttpsError);
  });

  it('accepts an issue with a message', () => {
    const parsed = parseFeedbackSubmitInput({
      tenantId: 'tenant-1',
      kind: 'issue',
      message: 'ok',
    });
    expect(parsed.kind).toBe('issue');
  });
});
