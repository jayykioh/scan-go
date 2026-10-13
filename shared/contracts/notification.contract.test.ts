import { describe, expect, it } from 'vitest';
import {
  applyNotificationEvent,
  initialNotificationState,
  NOTIFICATION_CONTRACT_VERSION,
  NOTIFICATION_DEDUPE_WINDOW,
  seedNotificationState,
  type NotificationEvent,
} from './notification.contract';

function event(eventId: string): NotificationEvent {
  return {
    schemaVersion: NOTIFICATION_CONTRACT_VERSION,
    eventId,
    tenantId: 'tenant-a',
    channel: 'kitchen',
    kind: 'orderCreated',
    orderId: eventId.split(':').pop() ?? 'order-1',
    tableName: 'Bàn 1',
    createdAt: '2026-10-12T04:19:22.348Z',
  };
}

/**
 * Reopening Kitchen must not replay the stored backlog as a new alert, while an
 * event that arrives afterwards still banners and plays the tone
 * (REQ-NOT-001).
 */
describe('seedNotificationState', () => {
  it('makes the stored backlog silent and the next event audible', () => {
    const backlog = event('kitchen:orderCreated:order-1');
    const arriving = event('kitchen:orderCreated:order-2');

    const state = seedNotificationState([backlog.eventId]);
    expect(applyNotificationEvent(state, backlog, true).effect.isVisible).toBe(
      false,
    );

    const live = applyNotificationEvent(state, arriving, true);
    expect(live.effect.isVisible).toBe(true);
    expect(live.effect.isAudible).toBe(true);
  });

  it('keeps only the bounded dedupe window', () => {
    const eventIds = Array.from(
      { length: NOTIFICATION_DEDUPE_WINDOW + 10 },
      (_, index) => `kitchen:orderCreated:order-${index}`,
    );
    expect(seedNotificationState(eventIds).seenEventIds).toHaveLength(
      NOTIFICATION_DEDUPE_WINDOW,
    );
  });

  it('starts from the initial state shape', () => {
    expect(seedNotificationState([]).lastEvent).toBe(
      initialNotificationState.lastEvent,
    );
  });
});
