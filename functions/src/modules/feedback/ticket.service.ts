import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  FEEDBACK_CONTRACT_VERSION,
  createFeedbackTicketInputSchema,
  feedbackTicketSchema,
  updateFeedbackTicketInputSchema,
  type CreateFeedbackTicketInput,
  type FeedbackTicket,
  type FeedbackTicketHistoryEntry,
  type UpdateFeedbackTicketInput,
} from '../../../../shared/contracts/feedback.contract.js';

export const FEEDBACK_TICKET_INVALID_MESSAGE = 'Phiếu phản hồi không hợp lệ.';
export const FEEDBACK_TICKET_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const FEEDBACK_TICKET_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng quản lý được phiếu phản hồi.';
export const FEEDBACK_TICKET_NOT_FOUND_MESSAGE =
  'Không tìm thấy phiếu phản hồi.';
export const FEEDBACK_TICKET_FEEDBACK_MISSING_MESSAGE =
  'Phản hồi không tồn tại trong cửa hàng.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', FEEDBACK_TICKET_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseCreateFeedbackTicketInput(
  data: unknown,
): CreateFeedbackTicketInput {
  return parseOrInvalid<CreateFeedbackTicketInput>(
    createFeedbackTicketInputSchema,
    data,
  );
}

export function parseUpdateFeedbackTicketInput(
  data: unknown,
): UpdateFeedbackTicketInput {
  return parseOrInvalid<UpdateFeedbackTicketInput>(
    updateFeedbackTicketInputSchema,
    data,
  );
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError(
      'permission-denied',
      FEEDBACK_TICKET_MEMBER_DENIED_MESSAGE,
    );
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError(
      'permission-denied',
      FEEDBACK_TICKET_OWNER_DENIED_MESSAGE,
    );
  }
}

export function feedbackTicketCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/feedbackTickets`;
}

/** Rebuild the ticket contract from a stored document. */
export function toFeedbackTicket(
  ticketId: string,
  data: DocumentData,
): FeedbackTicket {
  return feedbackTicketSchema.parse({
    schemaVersion: data.schemaVersion ?? FEEDBACK_CONTRACT_VERSION,
    ticketId,
    tenantId: data.tenantId,
    state: data.state,
    ownerUid: data.ownerUid ?? null,
    priority: data.priority,
    feedbackIds: data.feedbackIds ?? [],
    history: data.history ?? [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

export interface BuildFeedbackTicketInput {
  ticketId: string;
  tenantId: string;
  feedbackIds: string[];
  priority: FeedbackTicket['priority'];
  ownerUid: string | null;
  reason: string | null;
  actorUid: string;
  actorType: 'owner' | 'staff';
  now: string;
}

/** A new ticket starts `received` and records its first history entry. */
export function buildNewFeedbackTicket(
  input: BuildFeedbackTicketInput,
): FeedbackTicket {
  const history: FeedbackTicketHistoryEntry[] = [
    {
      at: input.now,
      actorUid: input.actorUid,
      actorType: input.actorType,
      fromState: null,
      toState: 'received',
      reason: input.reason,
    },
  ];
  return feedbackTicketSchema.parse({
    schemaVersion: FEEDBACK_CONTRACT_VERSION,
    ticketId: input.ticketId,
    tenantId: input.tenantId,
    state: 'received',
    ownerUid: input.ownerUid,
    priority: input.priority,
    feedbackIds: input.feedbackIds,
    history,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export interface ApplyFeedbackTicketTransitionInput {
  toState: FeedbackTicket['state'];
  reason: string;
  ownerUid?: string | null;
  actorUid: string;
  actorType: 'owner' | 'staff';
  now: string;
}

/**
 * Append-only transition: the previous history is preserved and a new entry
 * records state, actor, time, and reason (REQ-FDB-003).
 */
export function applyFeedbackTicketTransition(
  current: FeedbackTicket,
  input: ApplyFeedbackTicketTransitionInput,
): FeedbackTicket {
  const history: FeedbackTicketHistoryEntry[] = [
    ...current.history,
    {
      at: input.now,
      actorUid: input.actorUid,
      actorType: input.actorType,
      fromState: current.state,
      toState: input.toState,
      reason: input.reason,
    },
  ];
  return feedbackTicketSchema.parse({
    ...current,
    state: input.toState,
    ownerUid: input.ownerUid ?? current.ownerUid,
    history,
    updatedAt: input.now,
  });
}
