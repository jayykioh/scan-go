import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  FEEDBACK_CONTRACT_VERSION,
  feedbackSubmitResultSchema,
  feedbackTicketResultSchema,
} from '../../../../shared/contracts/feedback.contract.js';
import {
  PRODUCT_FEEDBACK_CONTRACT_VERSION,
  productFeedbackListResultSchema,
  productFeedbackSetStatusResultSchema,
  productFeedbackSubmitResultSchema,
} from '../../../../shared/contracts/product-feedback.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { assertRateLimit } from '../../shared/rateLimit.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import { nowIso } from '../reporting/service.js';
import { resolvePublicOrderRateLimit } from '../table-access/service.js';
import {
  FEEDBACK_INVALID_MESSAGE,
  FEEDBACK_TENANT_DENIED_MESSAGE,
  buildFeedbackRecord,
  parseFeedbackSubmitInput,
  resolveVerificationState,
} from './service.js';
import {
  PRODUCT_FEEDBACK_NOT_FOUND_MESSAGE,
  applyProductFeedbackStatusChange,
  assertActiveOwnerMember as assertProductFeedbackOwner,
  assertActiveReporter,
  assertAttachmentsInReporterPrefix,
  buildProductFeedbackRecord,
  parseProductFeedbackListInput,
  parseProductFeedbackSetStatusInput,
  parseProductFeedbackSubmitInput,
  productFeedbackCollectionPath,
  resolveProductFeedbackActorRole,
  toProductFeedbackRecord,
} from './product-feedback.service.js';
import {
  FEEDBACK_TICKET_FEEDBACK_MISSING_MESSAGE,
  FEEDBACK_TICKET_NOT_FOUND_MESSAGE,
  applyFeedbackTicketTransition,
  assertActiveOwnerMember,
  buildNewFeedbackTicket,
  feedbackTicketCollectionPath,
  parseCreateFeedbackTicketInput,
  parseUpdateFeedbackTicketInput,
  requireUid as requireTicketUid,
  toFeedbackTicket,
} from './ticket.service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

/**
 * Public Customer command: submit a review or issue. The server derives the
 * tenant from the opaque tracking token when present, checks the Order in that
 * tenant, and marks the record `verified` only for a matching Order
 * (REQ-FDB-001, NFR-SEC-002, NFR-PRIV-002).
 *
 * The write is tenant-scoped and server-only. No identity field is accepted,
 * and the response never echoes raw text.
 */
export const callableFeedbackSubmit = onCall(CALL_OPTIONS, async (request) => {
  assertAppCheck(request);
  const input = parseFeedbackSubmitInput(request.data);
  const db = getDb();

  const tenantSnap = await db.doc(`tenants/${input.tenantId}`).get();
  if (!tenantSnap.exists) {
    throw new HttpsError('permission-denied', FEEDBACK_TENANT_DENIED_MESSAGE);
  }

  assertRateLimit(
    `feedback-submit:${input.tenantId}`,
    await resolvePublicOrderRateLimit(db),
  );

  const tenantId = input.tenantId;
  let orderId: string | null = input.orderId ?? null;

  if (input.trackingToken) {
    const trackingSnap = await db
      .doc(`publicOrderTracking/${input.trackingToken}`)
      .get();
    const trackingTenantId = trackingSnap.get('tenantId');
    const trackingOrderId = trackingSnap.get('orderId');
    if (
      !trackingSnap.exists ||
      trackingTenantId !== tenantId ||
      typeof trackingOrderId !== 'string'
    ) {
      throw new HttpsError('permission-denied', FEEDBACK_INVALID_MESSAGE);
    }
    orderId = trackingOrderId;
  }

  let orderExists = false;
  if (orderId !== null) {
    const orderSnap = await db
      .doc(`tenants/${tenantId}/orders/${orderId}`)
      .get();
    orderExists = orderSnap.exists;
    if (!orderExists) {
      // A dangling reference is stored as unverified with no Order link.
      orderId = null;
    }
  }

  const now = nowIso();
  const ref = db.collection(`tenants/${tenantId}/feedback`).doc();
  const record = buildFeedbackRecord({
    feedbackId: ref.id,
    tenantId,
    kind: input.kind,
    rating: input.rating,
    message: input.message,
    orderId,
    verificationState: resolveVerificationState(orderExists),
    now,
  });
  await ref.set(record);

  return feedbackSubmitResultSchema.parse({
    schemaVersion: FEEDBACK_CONTRACT_VERSION,
    feedbackId: ref.id,
    tenantId,
    verificationState: record.verificationState,
    createdAt: now,
  });
});

const FEEDBACK_TICKET_CHANGED_ACTION = 'FeedbackTicketChanged';

/**
 * Owner command: open one Feedback ticket for existing feedback records. The
 * initial history entry records state, actor, time, and reason (REQ-FDB-003).
 */
export const callableFeedbackCreateTicket = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireTicketUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCreateFeedbackTicketInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const ticketRef = db
      .collection(feedbackTicketCollectionPath(input.tenantId))
      .doc();
    const feedbackRefs = input.feedbackIds.map((feedbackId) =>
      db.doc(`tenants/${input.tenantId}/feedback/${feedbackId}`),
    );

    const ticket = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveOwnerMember(memberSnap.data());
      const feedbackSnaps = await transaction.getAll(...feedbackRefs);
      if (feedbackSnaps.some((snap) => !snap.exists)) {
        throw new HttpsError(
          'failed-precondition',
          FEEDBACK_TICKET_FEEDBACK_MISSING_MESSAGE,
        );
      }

      const actorType =
        memberSnap.get('membershipType') === 'owner' ? 'owner' : 'staff';
      const next = buildNewFeedbackTicket({
        ticketId: ticketRef.id,
        tenantId: input.tenantId,
        feedbackIds: input.feedbackIds,
        priority: input.priority,
        ownerUid: input.ownerUid ?? null,
        reason: input.reason ?? null,
        actorUid: uid,
        actorType,
        now: nowIso(),
      });
      transaction.set(ticketRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType,
        role: actorType,
        action: FEEDBACK_TICKET_CHANGED_ACTION,
        targetType: 'feedback_ticket',
        targetId: ticketRef.id,
        reason: input.reason ?? null,
        detail: { toState: 'received', priority: next.priority },
      });
      return next;
    });

    return feedbackTicketResultSchema.parse({
      schemaVersion: FEEDBACK_CONTRACT_VERSION,
      status: 'applied',
      ticket,
    });
  },
);

/**
 * Owner command: move a Feedback ticket through `received`, `in_progress`, and
 * `resolved`. Every change appends state, actor, time, and reason to history
 * (REQ-FDB-003).
 */
export const callableFeedbackUpdateTicket = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireTicketUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseUpdateFeedbackTicketInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const ticketRef = db.doc(
      `${feedbackTicketCollectionPath(input.tenantId)}/${input.ticketId}`,
    );

    const ticket = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const ticketSnap = await transaction.get(ticketRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!ticketSnap.exists) {
        throw new HttpsError(
          'not-found',
          FEEDBACK_TICKET_NOT_FOUND_MESSAGE,
        );
      }
      const actorType =
        memberSnap.get('membershipType') === 'owner' ? 'owner' : 'staff';
      const current = toFeedbackTicket(input.ticketId, ticketSnap.data() ?? {});
      const next = applyFeedbackTicketTransition(current, {
        toState: input.toState,
        reason: input.reason,
        ownerUid: input.ownerUid,
        actorUid: uid,
        actorType,
        now: nowIso(),
      });
      transaction.set(ticketRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType,
        role: actorType,
        action: FEEDBACK_TICKET_CHANGED_ACTION,
        targetType: 'feedback_ticket',
        targetId: input.ticketId,
        reason: input.reason,
        detail: { fromState: current.state, toState: next.state },
      });
      return next;
    });

    return feedbackTicketResultSchema.parse({
      schemaVersion: FEEDBACK_CONTRACT_VERSION,
      status: 'applied',
      ticket,
    });
  },
);

const PRODUCT_FEEDBACK_SUBMITTED_ACTION = 'ProductFeedbackSubmitted';
const PRODUCT_FEEDBACK_STATUS_ACTION = 'ProductFeedbackStatusChanged';

/**
 * Owner, Staff, Kitchen, or Cashier reports a problem or a request about
 * ScanGo itself, with optional screenshots already uploaded to the reporter's
 * own Storage prefix (REQ-FDB-004, REQ-FDB-005).
 *
 * The record is tenant-scoped and server-written. The server re-verifies
 * membership, derives the reporter role, and rejects an attachment path that
 * is outside `tenants/{tenantId}/feedbackAttachments/{uid}/`.
 */
export const callableProductFeedbackSubmit = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', FEEDBACK_INVALID_MESSAGE);
    }
    const input = parseProductFeedbackSubmitInput(request.data);
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveReporter(memberSnap.data());

    assertAttachmentsInReporterPrefix({
      tenantId: input.tenantId,
      uid,
      attachments: input.attachments,
    });

    assertRateLimit(
      `product-feedback:${uid}`,
      await resolvePublicOrderRateLimit(db),
    );

    const now = nowIso();
    const ref = db.collection(productFeedbackCollectionPath(input.tenantId)).doc();
    const record = buildProductFeedbackRecord({
      feedbackId: ref.id,
      tenantId: input.tenantId,
      category: input.category,
      severity: input.severity,
      message: input.message,
      attachments: input.attachments ?? [],
      actorUid: uid,
      actorRole: resolveProductFeedbackActorRole(
        memberSnap.data(),
        request.auth?.token?.admin === true,
      ),
      screenContext: input.screenContext ?? null,
      now,
    });
    await ref.set(record);

    return productFeedbackSubmitResultSchema.parse({
      schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
      feedbackId: ref.id,
      tenantId: input.tenantId,
      status: record.status,
      attachmentCount: record.attachments.length,
      createdAt: now,
    });
  },
);

/**
 * Owner inbox read (REQ-FDB-006). The server re-checks that the caller is an
 * active Owner, so a direct Firestore read is not the only gate. The message is
 * returned because the inbox is Owner-only in both the contract and the Rules.
 */
export const callableProductFeedbackList = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', FEEDBACK_INVALID_MESSAGE);
    }
    const input = parseProductFeedbackListInput(request.data);
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertProductFeedbackOwner(
      memberSnap.data(),
      request.auth?.token?.admin === true,
    );

    const limit = input.limit ?? 50;
    const snap = await db
      .collection(productFeedbackCollectionPath(input.tenantId))
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return productFeedbackListResultSchema.parse({
      schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
      tenantId: input.tenantId,
      items: snap.docs.map((docSnap) =>
        toProductFeedbackRecord(docSnap.id, docSnap.data()),
      ),
    });
  },
);

/**
 * Owner triage command. Every change appends actor, time, and reason to the
 * append-only history (REQ-FDB-006).
 */
export const callableProductFeedbackSetStatus = onCall(
  CALL_OPTIONS,
  async (request) => {
    assertAppCheck(request);
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', FEEDBACK_INVALID_MESSAGE);
    }
    const input = parseProductFeedbackSetStatusInput(request.data);
    const db = getDb();

    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const feedbackRef = db.doc(
      `${productFeedbackCollectionPath(input.tenantId)}/${input.feedbackId}`,
    );

    const record = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertProductFeedbackOwner(
        memberSnap.data(),
        request.auth?.token?.admin === true,
      );
      const feedbackSnap = await transaction.get(feedbackRef);
      if (!feedbackSnap.exists) {
        throw new HttpsError('not-found', PRODUCT_FEEDBACK_NOT_FOUND_MESSAGE);
      }
      const current = toProductFeedbackRecord(
        input.feedbackId,
        feedbackSnap.data() ?? {},
      );
      const next = applyProductFeedbackStatusChange(current, {
        toStatus: input.toStatus,
        reason: input.reason,
        actorUid: uid,
        now: nowIso(),
      });
      transaction.set(feedbackRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: memberSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role: 'owner',
        action: PRODUCT_FEEDBACK_STATUS_ACTION,
        targetType: 'product_feedback',
        targetId: input.feedbackId,
        reason: input.reason,
        detail: { fromStatus: current.status, toStatus: next.status },
      });
      return next;
    });

    return productFeedbackSetStatusResultSchema.parse({
      schemaVersion: PRODUCT_FEEDBACK_CONTRACT_VERSION,
      status: 'applied',
      record,
    });
  },
);
