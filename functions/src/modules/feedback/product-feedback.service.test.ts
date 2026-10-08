/**
 * Product feedback service tests (REQ-FDB-004, REQ-FDB-005, REQ-FDB-006).
 *
 * These are the pure, server-side guards: role derivation, the attachment path
 * boundary, the record builder, and the append-only status history.
 */
import { describe, expect, it } from 'vitest';
import {
  applyProductFeedbackStatusChange,
  assertActiveOwnerMember,
  assertActiveReporter,
  assertAttachmentsInReporterPrefix,
  buildProductFeedbackRecord,
  parseProductFeedbackSubmitInput,
  resolveProductFeedbackActorRole,
  toProductFeedbackRecord,
} from './product-feedback.service.js';

const NOW = '2026-10-08T10:00:00.000Z';
const TENANT = 'tenant-a';
const UID = 'uid-1';

function attachment(fileName: string) {
  return {
    storagePath: `tenants/${TENANT}/feedbackAttachments/${UID}/${fileName}`,
    contentType: 'image/png' as const,
    sizeBytes: 2048,
  };
}

describe('resolveProductFeedbackActorRole', () => {
  it('prefers the ADMIN claim, then the Owner membership, then the station', () => {
    expect(resolveProductFeedbackActorRole({ membershipType: 'owner' }, true)).toBe(
      'admin',
    );
    expect(
      resolveProductFeedbackActorRole({ membershipType: 'owner' }, false),
    ).toBe('owner');
    expect(
      resolveProductFeedbackActorRole(
        { membershipType: 'staff', role: 'kitchen' },
        false,
      ),
    ).toBe('kitchen');
    expect(
      resolveProductFeedbackActorRole(
        { membershipType: 'staff', role: 'cashier' },
        false,
      ),
    ).toBe('cashier');
    expect(
      resolveProductFeedbackActorRole({ membershipType: 'staff' }, false),
    ).toBe('staff');
  });
});

describe('membership guards', () => {
  it('denies a missing or inactive reporter', () => {
    expect(() => assertActiveReporter(undefined)).toThrow();
    expect(() => assertActiveReporter({ isActive: false })).toThrow();
    expect(() =>
      assertActiveReporter({ membershipType: 'staff', isActive: true }),
    ).not.toThrow();
  });

  it('denies a Staff member the Owner inbox and allows ADMIN', () => {
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff', isActive: true }, false),
    ).toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: false }, false),
    ).toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff' }, true),
    ).not.toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: true }, false),
    ).not.toThrow();
  });
});

describe('attachment path boundary', () => {
  it('accepts a file inside the reporter prefix', () => {
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [attachment('a.png'), attachment('b.jpg')],
      }),
    ).not.toThrow();
  });

  it('rejects a path in another tenant', () => {
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [
          {
            storagePath: `tenants/tenant-b/feedbackAttachments/${UID}/a.png`,
            contentType: 'image/png',
            sizeBytes: 10,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects a path under another uid in the same tenant', () => {
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [
          {
            storagePath: `tenants/${TENANT}/feedbackAttachments/uid-2/a.png`,
            contentType: 'image/png',
            sizeBytes: 10,
          },
        ],
      }),
    ).toThrow();
  });

  it('rejects a traversal, a nested path, and a duplicate', () => {
    for (const bad of [
      'tenants/tenant-a/feedbackAttachments/uid-1/../uid-2/a.png',
      'tenants/tenant-a/feedbackAttachments/uid-1/nested/a.png',
    ]) {
      expect(() =>
        assertAttachmentsInReporterPrefix({
          tenantId: TENANT,
          uid: UID,
          attachments: [
            { storagePath: bad, contentType: 'image/png', sizeBytes: 10 },
          ],
        }),
      ).toThrow();
    }
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [attachment('a.png'), attachment('a.png')],
      }),
    ).toThrow();
  });

  it('rejects a non-raster content type and an out-of-range size', () => {
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [
          {
            storagePath: `tenants/${TENANT}/feedbackAttachments/${UID}/a.svg`,
            // A forged descriptor must not smuggle a scriptable type in.
            contentType: 'image/svg+xml' as never,
            sizeBytes: 10,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: [
          {
            storagePath: `tenants/${TENANT}/feedbackAttachments/${UID}/a.png`,
            contentType: 'image/png',
            sizeBytes: 0,
          },
        ],
      }),
    ).toThrow();
  });

  it('accepts a report without attachments', () => {
    expect(() =>
      assertAttachmentsInReporterPrefix({
        tenantId: TENANT,
        uid: UID,
        attachments: undefined,
      }),
    ).not.toThrow();
  });
});

describe('parseProductFeedbackSubmitInput', () => {
  it('rejects a malformed payload with an invalid-argument error', () => {
    expect(() => parseProductFeedbackSubmitInput({ tenantId: '' })).toThrow(
      /Phản hồi không hợp lệ/,
    );
  });

  it('accepts a well-formed payload', () => {
    const parsed = parseProductFeedbackSubmitInput({
      tenantId: TENANT,
      category: 'feature',
      severity: 'low',
      message: 'Nên có phím tắt để mở giỏ hàng nhanh hơn.',
    });
    expect(parsed.category).toBe('feature');
  });
});

describe('buildProductFeedbackRecord', () => {
  it('starts at received with one history entry', () => {
    const record = buildProductFeedbackRecord({
      feedbackId: 'fb-1',
      tenantId: TENANT,
      category: 'bug',
      severity: 'critical',
      message: 'Màn hình bếp trắng trang sau khi đăng nhập PIN.',
      attachments: [attachment('a.png')],
      actorUid: UID,
      actorRole: 'kitchen',
      screenContext: '/simulator/kitchen',
      now: NOW,
    });

    expect(record.status).toBe('received');
    expect(record.history).toHaveLength(1);
    expect(record.history[0]).toMatchObject({
      fromStatus: null,
      toStatus: 'received',
      reason: null,
    });
    expect(record.createdAt).toBe(NOW);
    expect(record.updatedAt).toBe(NOW);
  });
});

describe('applyProductFeedbackStatusChange', () => {
  const base = buildProductFeedbackRecord({
    feedbackId: 'fb-1',
    tenantId: TENANT,
    category: 'bug',
    severity: 'high',
    message: 'Nút gửi đơn không phản hồi khi bấm hai lần.',
    attachments: [],
    actorUid: UID,
    actorRole: 'owner',
    screenContext: null,
    now: NOW,
  });

  it('appends actor, time, and reason and keeps the older entries', () => {
    const next = applyProductFeedbackStatusChange(base, {
      toStatus: 'in_progress',
      reason: 'Đang kiểm tra trên bản 1.1',
      actorUid: 'owner-2',
      now: '2026-10-08T11:00:00.000Z',
    });

    expect(next.status).toBe('in_progress');
    expect(next.history).toHaveLength(2);
    expect(next.history[1]).toMatchObject({
      actorUid: 'owner-2',
      fromStatus: 'received',
      toStatus: 'in_progress',
      reason: 'Đang kiểm tra trên bản 1.1',
    });
    expect(next.updatedAt).toBe('2026-10-08T11:00:00.000Z');
  });
});

describe('toProductFeedbackRecord', () => {
  it('repairs a stored document that predates a field', () => {
    const record = toProductFeedbackRecord('fb-9', {
      tenantId: TENANT,
      category: 'other',
      severity: 'low',
      message: 'Cần thêm mẫu báo cáo theo tuần.',
      actorUid: UID,
      createdAt: NOW,
    });

    expect(record.status).toBe('received');
    expect(record.attachments).toEqual([]);
    expect(record.history).toHaveLength(1);
    expect(record.updatedAt).toBe(NOW);
  });
});
