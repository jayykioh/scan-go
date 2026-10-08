/**
 * Product feedback contract tests (REQ-FDB-004, REQ-FDB-005).
 *
 * The attachment prefix is the security-relevant part of the contract: the
 * client builds the Storage path from it and the Cloud Function rejects any
 * path outside it, so both sides must agree on one definition.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES,
  PRODUCT_FEEDBACK_MAX_ATTACHMENTS,
  productFeedbackAttachmentPrefix,
  productFeedbackAttachmentSchema,
  productFeedbackListInputSchema,
  productFeedbackRecordSchema,
  productFeedbackSetStatusInputSchema,
  productFeedbackSubmitInputSchema,
} from './product-feedback.contract.js';

const NOW = '2026-10-08T10:00:00.000Z';

describe('product feedback attachment prefix', () => {
  it('scopes the path to the tenant and the reporter uid', () => {
    expect(productFeedbackAttachmentPrefix('tenant-a', 'uid-1')).toBe(
      'tenants/tenant-a/feedbackAttachments/uid-1',
    );
  });

  it('keeps two reporters in the same tenant apart', () => {
    expect(productFeedbackAttachmentPrefix('tenant-a', 'uid-1')).not.toBe(
      productFeedbackAttachmentPrefix('tenant-a', 'uid-2'),
    );
  });
});

describe('product feedback submit input', () => {
  const valid = {
    tenantId: 'tenant-a',
    category: 'bug' as const,
    severity: 'high' as const,
    message: 'Nút gửi đơn không phản hồi khi bấm hai lần liên tiếp.',
  };

  it('accepts a minimal report', () => {
    expect(productFeedbackSubmitInputSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a message shorter than the minimum', () => {
    expect(
      productFeedbackSubmitInputSchema.safeParse({ ...valid, message: 'lỗi' })
        .success,
    ).toBe(false);
  });

  it('rejects an unknown category and an unknown field', () => {
    expect(
      productFeedbackSubmitInputSchema.safeParse({ ...valid, category: 'idea' })
        .success,
    ).toBe(false);
    expect(
      productFeedbackSubmitInputSchema.safeParse({ ...valid, rating: 5 }).success,
    ).toBe(false);
  });

  it('rejects more attachments than the bound', () => {
    const attachment = {
      storagePath: 'tenants/tenant-a/feedbackAttachments/uid-1/a.png',
      contentType: 'image/png' as const,
      sizeBytes: 1024,
    };
    expect(
      productFeedbackSubmitInputSchema.safeParse({
        ...valid,
        attachments: Array.from(
          { length: PRODUCT_FEEDBACK_MAX_ATTACHMENTS + 1 },
          () => attachment,
        ),
      }).success,
    ).toBe(false);
  });
});

describe('product feedback attachment', () => {
  it('rejects an oversized image and an unknown content type', () => {
    expect(
      productFeedbackAttachmentSchema.safeParse({
        storagePath: 'tenants/t/feedbackAttachments/u/a.png',
        contentType: 'image/png',
        sizeBytes: PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES + 1,
      }).success,
    ).toBe(false);
    expect(
      productFeedbackAttachmentSchema.safeParse({
        storagePath: 'tenants/t/feedbackAttachments/u/a.svg',
        contentType: 'image/svg+xml',
        sizeBytes: 10,
      }).success,
    ).toBe(false);
  });
});

describe('product feedback record', () => {
  const record = {
    schemaVersion: 1 as const,
    feedbackId: 'fb-1',
    tenantId: 'tenant-a',
    category: 'ux' as const,
    severity: 'medium' as const,
    status: 'received' as const,
    message: 'Bảng giá vốn khó đọc trên màn hình nhỏ.',
    attachments: [],
    actorUid: 'uid-1',
    actorRole: 'owner' as const,
    screenContext: '/dashboard/inventory',
    history: [
      {
        at: NOW,
        actorUid: 'uid-1',
        fromStatus: null,
        toStatus: 'received' as const,
        reason: null,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('requires at least one history entry', () => {
    expect(productFeedbackRecordSchema.safeParse(record).success).toBe(true);
    expect(
      productFeedbackRecordSchema.safeParse({ ...record, history: [] }).success,
    ).toBe(false);
  });

  it('requires a reason on a status change command', () => {
    expect(
      productFeedbackSetStatusInputSchema.safeParse({
        tenantId: 'tenant-a',
        feedbackId: 'fb-1',
        toStatus: 'resolved',
        reason: '',
      }).success,
    ).toBe(false);
    expect(
      productFeedbackSetStatusInputSchema.safeParse({
        tenantId: 'tenant-a',
        feedbackId: 'fb-1',
        toStatus: 'resolved',
        reason: 'Đã sửa trong bản 1.1',
      }).success,
    ).toBe(true);
  });

  it('bounds the inbox query', () => {
    expect(
      productFeedbackListInputSchema.safeParse({ tenantId: 'tenant-a', limit: 500 })
        .success,
    ).toBe(false);
    expect(
      productFeedbackListInputSchema.safeParse({ tenantId: 'tenant-a' }).success,
    ).toBe(true);
  });
});
