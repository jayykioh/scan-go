import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_DEDUPE_WINDOW,
  applyNotificationEvent,
  buildNotificationEventId,
  initialNotificationState,
  notificationChannelForKind,
  readSoundEnabled,
  type NotificationState,
} from '../../../../shared/contracts/notification.contract.js';
import {
  buildOrderNotificationEvent,
  notificationCollectionPath,
} from './notification.js';
import { readyOrderFixture } from '../../../../shared/fixtures/fulfilment.fixture.js';
import { pendingOrderFixture } from '../../../../shared/fixtures/order.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

const NOW = '2026-09-12T07:10:00.000Z';

function eventFor(kind: 'orderCreated' | 'orderReady') {
  return buildOrderNotificationEvent({
    tenantId: TENANT_A_FIXTURE,
    kind,
    order:
      kind === 'orderCreated' ? pendingOrderFixture : readyOrderFixture,
    now: NOW,
  });
}

describe('notification event building (REQ-NOT-001)', () => {
  it('routes created Orders to Kitchen and ready Orders to Waiter', () => {
    expect(notificationChannelForKind('orderCreated')).toBe('kitchen');
    expect(notificationChannelForKind('orderReady')).toBe('waiter');
    expect(eventFor('orderCreated').channel).toBe('kitchen');
    expect(eventFor('orderReady').channel).toBe('waiter');
  });

  it('builds a deterministic event id per channel, kind, and Order', () => {
    const first = eventFor('orderReady');
    const second = eventFor('orderReady');
    expect(first.eventId).toBe(second.eventId);
    expect(first.eventId).toBe(
      buildNotificationEventId({
        channel: 'waiter',
        kind: 'orderReady',
        orderId: readyOrderFixture.orderId,
      }),
    );
  });

  it('scopes the effect below the Tenant root', () => {
    expect(notificationCollectionPath(TENANT_A_FIXTURE)).toBe(
      `tenants/${TENANT_A_FIXTURE}/notifications`,
    );
  });
});

describe('notification dedupe and mute (REQ-NOT-001)', () => {
  it('shows and sounds one effect for a first event', () => {
    const { state, effect } = applyNotificationEvent(
      initialNotificationState,
      eventFor('orderReady'),
      true,
    );
    expect(effect).toEqual({ isDuplicate: false, isVisible: true, isAudible: true });
    expect(state.seenEventIds).toHaveLength(1);
    expect(state.lastEvent?.kind).toBe('orderReady');
  });

  it('suppresses a duplicate event entirely', () => {
    const event = eventFor('orderCreated');
    const first = applyNotificationEvent(initialNotificationState, event, true);
    const second = applyNotificationEvent(first.state, event, true);
    expect(second.effect).toEqual({
      isDuplicate: true,
      isVisible: false,
      isAudible: false,
    });
    expect(second.state.seenEventIds).toEqual(first.state.seenEventIds);
  });

  it('keeps the banner visible but silences the sound when muted', () => {
    const { effect } = applyNotificationEvent(
      initialNotificationState,
      eventFor('orderReady'),
      false,
    );
    expect(effect.isVisible).toBe(true);
    expect(effect.isAudible).toBe(false);
  });

  it('bounds the dedupe window to the approved size', () => {
    let state: NotificationState = initialNotificationState;
    for (let index = 0; index < NOTIFICATION_DEDUPE_WINDOW + 5; index += 1) {
      state = applyNotificationEvent(
        state,
        {
          ...eventFor('orderCreated'),
          eventId: `evt-${index}`,
        },
        true,
      ).state;
    }
    expect(state.seenEventIds).toHaveLength(NOTIFICATION_DEDUPE_WINDOW);
    expect(state.seenEventIds[0]).toBe('evt-5');
  });

  it('treats a missing preference value as sound enabled', () => {
    expect(readSoundEnabled(undefined)).toBe(true);
    expect(readSoundEnabled(true)).toBe(true);
    expect(readSoundEnabled(false)).toBe(false);
  });
});
