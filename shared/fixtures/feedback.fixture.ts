import {
  FEEDBACK_CONTRACT_VERSION,
  type FeedbackRecord,
  type FeedbackTicket,
} from '../contracts/feedback.contract.js';
import { OWNER_UID_FIXTURE, TENANT_A_FIXTURE } from './identity.fixture.js';

/** Server timestamp for feedback fixtures. */
export const FEEDBACK_NOW_FIXTURE = '2026-09-13T00:00:00.000Z';

/** Verified review that references a real paid Order (REQ-FDB-001). */
export const verifiedFeedbackFixture: FeedbackRecord = {
  schemaVersion: FEEDBACK_CONTRACT_VERSION,
  feedbackId: 'feedback-verified-001',
  tenantId: TENANT_A_FIXTURE,
  kind: 'review',
  rating: 5,
  message: 'Món ăn ngon, phục vụ nhanh.',
  maskedMessage: 'Món ăn ngon, phục vụ nhanh.',
  orderId: 'order-001',
  verificationState: 'verified',
  actorType: 'customer',
  actorUid: null,
  topicTags: [],
  createdAt: FEEDBACK_NOW_FIXTURE,
};

/**
 * Feedback ticket history fixture (REQ-FDB-003). Each transition records the
 * state, actor, time, and reason.
 */
export const feedbackTicketFixture: FeedbackTicket = {
  schemaVersion: FEEDBACK_CONTRACT_VERSION,
  ticketId: 'feedback-ticket-001',
  tenantId: TENANT_A_FIXTURE,
  state: 'in_progress',
  ownerUid: OWNER_UID_FIXTURE,
  priority: 'high',
  feedbackIds: ['feedback-verified-001'],
  history: [
    {
      at: FEEDBACK_NOW_FIXTURE,
      actorUid: OWNER_UID_FIXTURE,
      actorType: 'owner',
      fromState: null,
      toState: 'received',
      reason: 'Tiếp nhận phản hồi.',
    },
    {
      at: '2026-09-13T01:00:00.000Z',
      actorUid: OWNER_UID_FIXTURE,
      actorType: 'owner',
      fromState: 'received',
      toState: 'in_progress',
      reason: 'Đã phân công xử lý.',
    },
  ],
  createdAt: FEEDBACK_NOW_FIXTURE,
  updatedAt: '2026-09-13T01:00:00.000Z',
};

/** Unverified visit feedback with no Order reference. */
export const unverifiedFeedbackFixture: FeedbackRecord = {
  schemaVersion: FEEDBACK_CONTRACT_VERSION,
  feedbackId: 'feedback-unverified-001',
  tenantId: TENANT_A_FIXTURE,
  kind: 'issue',
  rating: null,
  message: 'Nhân viên gọi số 0912345678 chưa tới bàn.',
  maskedMessage: 'Nhân viên gọi số [redacted] chưa tới bàn.',
  orderId: null,
  verificationState: 'unverified',
  actorType: 'customer',
  actorUid: null,
  topicTags: [],
  createdAt: FEEDBACK_NOW_FIXTURE,
};
