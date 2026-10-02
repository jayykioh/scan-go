import { z } from 'zod';
import { isoUtcTimestampSchema } from '../validation.js';

export const NOTIFICATION_CONTRACT_VERSION = 1;

/**
 * Kitchen is alerted for a new (Pay-Later) Order; Waiter is alerted when an
 * Order becomes ready. One mute setting controls both channels
 * (docs/module/fulfilment.md, REQ-NOT-001).
 */
export const notificationChannelSchema = z.enum(['kitchen', 'waiter']);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

export const notificationEventKindSchema = z.enum([
  'orderCreated',
  'orderReady',
]);

export type NotificationEventKind = z.infer<typeof notificationEventKindSchema>;

export const notificationEventSchema = z.strictObject({
  schemaVersion: z.literal(NOTIFICATION_CONTRACT_VERSION),
  eventId: z.string().min(1).max(200),
  tenantId: z.string().min(1),
  channel: notificationChannelSchema,
  kind: notificationEventKindSchema,
  orderId: z.string().min(1),
  tableName: z.string().min(1),
  createdAt: isoUtcTimestampSchema,
});

export type NotificationEvent = z.infer<typeof notificationEventSchema>;

/**
 * Deterministic event id. A retried command produces the same id, so the
 * notification effect dedupes without a second sound or banner
 * (REQ-NOT-001, NFR-RT-001).
 */
export function buildNotificationEventId(input: {
  channel: NotificationChannel;
  kind: NotificationEventKind;
  orderId: string;
}): string {
  return `${input.channel}:${input.kind}:${input.orderId}`;
}

export function notificationChannelForKind(
  kind: NotificationEventKind,
): NotificationChannel {
  return kind === 'orderCreated' ? 'kitchen' : 'waiter';
}

/** The bounded window of already-seen event ids kept by the client. */
export const NOTIFICATION_DEDUPE_WINDOW = 50;

/** Persistent mute preference. A missing value means sound is enabled. */
export const NOTIFICATION_SOUND_STORAGE_KEY = 'scango.notifications.soundEnabled';

export const notificationPreferenceSchema = z.strictObject({
  soundEnabled: z.boolean(),
});

export type NotificationPreference = z.infer<
  typeof notificationPreferenceSchema
>;

export function readSoundEnabled(raw: unknown): boolean {
  return raw !== false;
}

export interface NotificationState {
  seenEventIds: string[];
  lastEvent: NotificationEvent | null;
}

export const initialNotificationState: NotificationState = {
  seenEventIds: [],
  lastEvent: null,
};

export interface NotificationEffect {
  isDuplicate: boolean;
  isVisible: boolean;
  isAudible: boolean;
}

/**
 * Apply one notification event to the bounded dedupe state. A duplicate event
 * produces no visible or audible effect. Mute suppresses only the sound; the
 * visible banner still appears (REQ-NOT-001).
 */
export function applyNotificationEvent(
  state: NotificationState,
  event: NotificationEvent,
  soundEnabled: boolean,
): { state: NotificationState; effect: NotificationEffect } {
  if (state.seenEventIds.includes(event.eventId)) {
    return {
      state,
      effect: { isDuplicate: true, isVisible: false, isAudible: false },
    };
  }

  const seenEventIds = [...state.seenEventIds, event.eventId].slice(
    -NOTIFICATION_DEDUPE_WINDOW,
  );

  return {
    state: { seenEventIds, lastEvent: event },
    effect: {
      isDuplicate: false,
      isVisible: true,
      isAudible: soundEnabled,
    },
  };
}
