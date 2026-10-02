import { describe, expect, it } from 'vitest';
import {
  applyFeedbackTicketTransition,
  buildNewFeedbackTicket,
} from './ticket.service.js';

const NOW = '2026-09-13T00:00:00.000Z';
const LATER = '2026-09-13T01:00:00.000Z';

function newTicket() {
  return buildNewFeedbackTicket({
    ticketId: 'ticket-1',
    tenantId: 'tenant-a',
    feedbackIds: ['feedback-1'],
    priority: 'high',
    ownerUid: 'uid-owner',
    reason: 'Tiếp nhận phản hồi.',
    actorUid: 'uid-owner',
    actorType: 'owner',
    now: NOW,
  });
}

describe('feedback ticket service helpers (REQ-FDB-003)', () => {
  it('starts received and records state, actor, time, and reason', () => {
    const ticket = newTicket();
    expect(ticket.state).toBe('received');
    expect(ticket.history).toHaveLength(1);
    expect(ticket.history[0]).toMatchObject({
      at: NOW,
      actorUid: 'uid-owner',
      actorType: 'owner',
      fromState: null,
      toState: 'received',
      reason: 'Tiếp nhận phản hồi.',
    });
  });

  it('appends history and preserves every previous entry on transition', () => {
    const first = newTicket();
    const second = applyFeedbackTicketTransition(first, {
      toState: 'in_progress',
      reason: 'Đã phân công.',
      actorUid: 'uid-owner',
      actorType: 'owner',
      now: LATER,
    });
    expect(second.state).toBe('in_progress');
    expect(second.history).toHaveLength(2);
    expect(second.history[0]).toEqual(first.history[0]);
    expect(second.history[1]).toMatchObject({
      at: LATER,
      fromState: 'received',
      toState: 'in_progress',
      reason: 'Đã phân công.',
    });

    const third = applyFeedbackTicketTransition(second, {
      toState: 'resolved',
      reason: 'Đã xử lý xong.',
      actorUid: 'uid-owner',
      actorType: 'owner',
      now: LATER,
    });
    expect(third.history).toHaveLength(3);
    expect(third.history.slice(0, 2)).toEqual(second.history);
  });

  it('keeps the assigned owner when a transition omits one', () => {
    const ticket = applyFeedbackTicketTransition(newTicket(), {
      toState: 'in_progress',
      reason: 'Bắt đầu.',
      actorUid: 'uid-owner',
      actorType: 'owner',
      now: LATER,
    });
    expect(ticket.ownerUid).toBe('uid-owner');
  });
});
