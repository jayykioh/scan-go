import { HttpsError } from 'firebase-functions/v2/https';
import {
  PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES,
  PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES,
  PRODUCT_FEEDBACK_CONTRACT_VERSION,
  PRODUCT_FEEDBACK_MAX_ATTACHMENTS,
  productFeedbackListInputSchema,
  productFeedbackRecordSchema,
  productFeedbackSetStatusInputSchema,
  productFeedbackSubmitInputSchema,
  productFeedbackAttachmentPrefix,
  type ProductFeedbackActorRole,
  type ProductFeedbackAttachment,
  type ProductFeedbackListInput,
  type ProductFeedbackRecord,
  type ProductFeedbackSetStatusInput,
  type ProductFeedbackStatus,
  type ProductFeedbackSubmitInput,
} from '../../../../shared/contracts/product-feedback.contract.js';

export const PRODUCT_FEEDBACK_INVALID_MESSAGE = 'Phản hồi không hợp lệ.';
export const PRODUCT_FEEDBACK_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const PRODUCT_FEEDBACK_NOT_FOUND_MESSAGE =
  'Không tìm thấy phản hồi.';
export const PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE =
  'Ảnh đính kèm không hợp lệ.';
export const PRODUCT_FEEDBACK_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng xem được hộp thư phản hồi.';

/** Firestore collection under the Tenant (server-written only). */
export const PRODUCT_FEEDBACK_COLLECTION = 'productFeedback';

export function productFeedbackCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/${PRODUCT_FEEDBACK_COLLECTION}`;
}

export function parseProductFeedbackSubmitInput(
  data: unknown,
): ProductFeedbackSubmitInput {
  const parsed = productFeedbackSubmitInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PRODUCT_FEEDBACK_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseProductFeedbackListInput(
  data: unknown,
): ProductFeedbackListInput {
  const parsed = productFeedbackListInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PRODUCT_FEEDBACK_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseProductFeedbackSetStatusInput(
  data: unknown,
): ProductFeedbackSetStatusInput {
  const parsed = productFeedbackSetStatusInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', PRODUCT_FEEDBACK_INVALID_MESSAGE);
  }
  return parsed.data;
}

/**
 * The role recorded on the report. A Firebase Auth ADMIN claim wins, then the
 * Tenant membership type, then the member's own role field when it names a
 * kitchen or cashier station (ADR 0012, ADR 0013).
 */
export function resolveProductFeedbackActorRole(
  member: Record<string, unknown> | undefined,
  isAdmin: boolean,
): ProductFeedbackActorRole {
  if (isAdmin) {
    return 'admin';
  }
  if (member?.membershipType === 'owner') {
    return 'owner';
  }
  const role = member?.role;
  if (role === 'kitchen' || role === 'cashier') {
    return role;
  }
  return 'staff';
}

/** An active member of the Tenant may report. The server re-checks membership. */
export function assertActiveReporter(
  member: Record<string, unknown> | undefined,
): void {
  if (!member || member.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      PRODUCT_FEEDBACK_MEMBER_DENIED_MESSAGE,
    );
  }
}

/** Only an active Owner (or ADMIN) reads or triages the inbox (REQ-FDB-006). */
export function assertActiveOwnerMember(
  member: Record<string, unknown> | undefined,
  isAdmin: boolean,
): void {
  if (isAdmin) {
    return;
  }
  if (!member || member.isActive === false || member.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      PRODUCT_FEEDBACK_OWNER_DENIED_MESSAGE,
    );
  }
}

const ALLOWED_CONTENT_TYPES = new Set<string>(
  PRODUCT_FEEDBACK_ATTACHMENT_CONTENT_TYPES,
);

/** A file name segment that cannot escape its prefix or hide an extension. */
function isSafeFileName(fileName: string): boolean {
  if (fileName.length === 0 || fileName.length > 120) {
    return false;
  }
  if (fileName.includes('/') || fileName.includes('\\')) {
    return false;
  }
  if (fileName === '.' || fileName === '..') {
    return false;
  }
  return /^[A-Za-z0-9._-]+$/.test(fileName);
}

/**
 * Verify every declared attachment is inside the reporter's own Tenant and uid
 * prefix, names a safe file, matches the raster allowlist, and is within the
 * size bound. Storage Rules enforce the same allowlist on the write itself
 * (REQ-FDB-005); this check keeps a forged path out of the record.
 */
export function assertAttachmentsInReporterPrefix(input: {
  tenantId: string;
  uid: string;
  attachments: readonly ProductFeedbackAttachment[] | undefined;
}): void {
  const attachments = input.attachments ?? [];
  if (attachments.length > PRODUCT_FEEDBACK_MAX_ATTACHMENTS) {
    throw new HttpsError(
      'invalid-argument',
      PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE,
    );
  }
  const prefix = `${productFeedbackAttachmentPrefix(input.tenantId, input.uid)}/`;
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (!attachment.storagePath.startsWith(prefix)) {
      throw new HttpsError(
        'permission-denied',
        PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE,
      );
    }
    const fileName = attachment.storagePath.slice(prefix.length);
    if (!isSafeFileName(fileName) || seen.has(attachment.storagePath)) {
      throw new HttpsError(
        'invalid-argument',
        PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE,
      );
    }
    if (!ALLOWED_CONTENT_TYPES.has(attachment.contentType)) {
      throw new HttpsError(
        'invalid-argument',
        PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE,
      );
    }
    if (
      attachment.sizeBytes <= 0 ||
      attachment.sizeBytes > PRODUCT_FEEDBACK_ATTACHMENT_MAX_BYTES
    ) {
      throw new HttpsError(
        'invalid-argument',
        PRODUCT_FEEDBACK_ATTACHMENT_DENIED_MESSAGE,
      );
    }
    seen.add(attachment.storagePath);
  }
}

export interface BuildProductFeedbackRecordInput {
  feedbackId: string;
  tenantId: string;
  category: ProductFeedbackSubmitInput['category'];
  severity: ProductFeedbackSubmitInput['severity'];
  message: string;
  attachments: readonly ProductFeedbackAttachment[];
  actorUid: string;
  actorRole: ProductFeedbackActorRole;
  screenContext: string | null;
  now: string;
}

export function buildProductFeedbackRecord(
  input: BuildProductFeedbackRecordInput,
): ProductFeedbackRecord {
  return productFeedbackRecordSchema.parse({
    schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
    feedbackId: input.feedbackId,
    tenantId: input.tenantId,
    category: input.category,
    severity: input.severity,
    status: 'received',
    message: input.message,
    attachments: input.attachments,
    actorUid: input.actorUid,
    actorRole: input.actorRole,
    screenContext: input.screenContext,
    history: [
      {
        at: input.now,
        actorUid: input.actorUid,
        fromStatus: null,
        toStatus: 'received',
        reason: null,
      },
    ],
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/**
 * Read one stored document back through the frozen contract. A document that
 * predates a field is repaired with a safe default rather than crashing the
 * inbox.
 */
export function toProductFeedbackRecord(
  feedbackId: string,
  data: Record<string, unknown>,
): ProductFeedbackRecord {
  return productFeedbackRecordSchema.parse({
    schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
    feedbackId,
    tenantId: data.tenantId,
    category: data.category,
    severity: data.severity,
    status: data.status ?? 'received',
    message: data.message,
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    actorUid: data.actorUid,
    actorRole: data.actorRole ?? 'staff',
    screenContext: data.screenContext ?? null,
    history: Array.isArray(data.history) && data.history.length > 0
      ? data.history
      : [
          {
            at: data.createdAt,
            actorUid: data.actorUid,
            fromStatus: null,
            toStatus: data.status ?? 'received',
            reason: null,
          },
        ],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt ?? data.createdAt,
  });
}

/** Append-only status change with actor, time, and reason (REQ-FDB-006). */
export function applyProductFeedbackStatusChange(
  record: ProductFeedbackRecord,
  input: {
    toStatus: ProductFeedbackStatus;
    reason: string;
    actorUid: string;
    now: string;
  },
): ProductFeedbackRecord {
  return productFeedbackRecordSchema.parse({
    ...record,
    status: input.toStatus,
    history: [
      ...record.history,
      {
        at: input.now,
        actorUid: input.actorUid,
        fromStatus: record.status,
        toStatus: input.toStatus,
        reason: input.reason,
      },
    ],
    updatedAt: input.now,
  });
}

/** Storage object path for one screenshot, shared by client and seed script. */
export function productFeedbackAttachmentPath(
  tenantId: string,
  uid: string,
  fileName: string,
): string {
  return `${productFeedbackAttachmentPrefix(tenantId, uid)}/${fileName}`;
}
