import {
  AI_CONTRACT_VERSION,
  aiInsightSchema,
  type AiInsight,
  type AiInsightDepartment,
} from '../../../../shared/contracts/ai.contract.js';
import {
  FEEDBACK_CONTRACT_VERSION,
  FEEDBACK_TOPIC_RECENT_IDS_MAX,
  feedbackTopicSchema,
  type FeedbackTopic,
  type FeedbackTopicKey,
} from '../../../../shared/contracts/feedback.contract.js';
import {
  RULE_BASED_MODEL,
  RULE_BASED_PROVIDER,
} from '../ai/service.js';
import { dayKeyFromIso } from '../reporting/service.js';

export const feedbackTopicCollectionPath = (tenantId: string): string =>
  `tenants/${tenantId}/feedbackTopics`;

const HOUR_MS = 60 * 60 * 1000;

/** Rebuild the topic contract from a stored document. */
export function toFeedbackTopic(
  tenantId: string,
  data: Record<string, unknown>,
): FeedbackTopic {
  return feedbackTopicSchema.parse({
    schemaVersion: data.schemaVersion ?? FEEDBACK_CONTRACT_VERSION,
    tenantId,
    topicKey: data.topicKey,
    label: data.label,
    department: data.department,
    count: data.count,
    windowStartedAt: data.windowStartedAt,
    windowCount: data.windowCount,
    recentFeedbackIds: data.recentFeedbackIds ?? [],
    lastFeedbackId: data.lastFeedbackId,
    firstAt: data.firstAt,
    lastAt: data.lastAt,
    alertState: data.alertState ?? 'none',
    alertedAt: data.alertedAt ?? null,
    updatedAt: data.updatedAt,
  });
}

export interface FeedbackTopicDefinition {
  topicKey: FeedbackTopicKey;
  label: string;
  department: AiInsightDepartment;
}

export interface ReportFeedbackTopicInput extends FeedbackTopicDefinition {
  tenantId: string;
  feedbackId: string;
  windowHours: number;
  now: string;
}

/**
 * The topic document for a topic's first report. The window opens at the first
 * report, so the count and the window always agree (REQ-FDB-007).
 */
export function buildFeedbackTopic(
  input: ReportFeedbackTopicInput,
): FeedbackTopic {
  return feedbackTopicSchema.parse({
    schemaVersion: FEEDBACK_CONTRACT_VERSION,
    tenantId: input.tenantId,
    topicKey: input.topicKey,
    label: input.label,
    department: input.department,
    count: 1,
    windowStartedAt: input.now,
    windowCount: 1,
    recentFeedbackIds: [input.feedbackId],
    lastFeedbackId: input.feedbackId,
    firstAt: input.now,
    lastAt: input.now,
    alertState: 'none',
    alertedAt: null,
    updatedAt: input.now,
  });
}

/**
 * Apply one report to a topic's counter. Pure so the window reset, the alert
 * reset, and the bounded recent-id list are unit-testable without Firestore.
 *
 * The window is tumbling, not sliding: it opens on the first report after the
 * previous window elapsed and resets the alert state with it. That keeps a
 * surge detectable from one document read and no scheduled job.
 */
export function applyFeedbackTopicReport(
  current: FeedbackTopic,
  input: ReportFeedbackTopicInput,
): FeedbackTopic {
  const elapsedMs =
    Date.parse(input.now) - Date.parse(current.windowStartedAt);
  const windowExpired = !Number.isFinite(elapsedMs)
    ? true
    : elapsedMs >= input.windowHours * HOUR_MS;

  return feedbackTopicSchema.parse({
    ...current,
    label: input.label,
    department: input.department,
    count: current.count + 1,
    windowStartedAt: windowExpired ? input.now : current.windowStartedAt,
    windowCount: windowExpired ? 1 : current.windowCount + 1,
    recentFeedbackIds: [
      input.feedbackId,
      ...current.recentFeedbackIds.filter(
        (feedbackId) => feedbackId !== input.feedbackId,
      ),
    ].slice(0, FEEDBACK_TOPIC_RECENT_IDS_MAX),
    lastFeedbackId: input.feedbackId,
    lastAt: input.now,
    alertState: windowExpired ? 'none' : current.alertState,
    alertedAt: windowExpired ? null : current.alertedAt,
    updatedAt: input.now,
  });
}

/**
 * A topic warns once per window, when it has reached the configured count. A
 * zero count disables the warning (REQ-FDB-008).
 */
export function shouldAlertFeedbackTopic(
  topic: FeedbackTopic,
  alertCount: number,
): boolean {
  return (
    alertCount > 0 &&
    topic.windowCount >= alertCount &&
    topic.alertState === 'none'
  );
}

export function markFeedbackTopicAlerted(
  topic: FeedbackTopic,
  now: string,
): FeedbackTopic {
  return feedbackTopicSchema.parse({
    ...topic,
    alertState: 'alerted',
    alertedAt: now,
    updatedAt: now,
  });
}

export interface BuildFeedbackSurgeInsightInput {
  topic: FeedbackTopic;
  windowHours: number;
  timezone: string;
  now: string;
}

/** Deterministic per topic window, so a retry overwrites instead of duplicating. */
export function feedbackSurgeInsightId(
  tenantId: string,
  topicKey: FeedbackTopicKey,
  windowStartedAt: string,
): string {
  const windowStamp = windowStartedAt.replace(/[^0-9]/g, '').slice(0, 14);
  return `${tenantId}-surge-${topicKey}-${windowStamp}`;
}

/**
 * The Insight a surge raises (REQ-FDB-008). It cites the source feedback IDs, so
 * a count is never presented without the reports behind it.
 */
export function buildFeedbackSurgeInsight(
  input: BuildFeedbackSurgeInsightInput,
): AiInsight {
  const { topic } = input;
  const dayKey = dayKeyFromIso(topic.windowStartedAt, input.timezone);
  return aiInsightSchema.parse({
    schemaVersion: AI_CONTRACT_VERSION,
    insightId: feedbackSurgeInsightId(
      topic.tenantId,
      topic.topicKey,
      topic.windowStartedAt,
    ),
    tenantId: topic.tenantId,
    analysisKey: `${topic.tenantId}:surge:${topic.topicKey}:${topic.windowStartedAt}`,
    department: topic.department,
    priority: 'high',
    periodStart: dayKey,
    periodEnd: dayKey,
    title: `Nhiều phản hồi: ${topic.label}`.slice(0, 120),
    detail:
      `${topic.windowCount} phản hồi về "${topic.label}" trong ${input.windowHours} giờ qua. ` +
      `Tổng cộng ${topic.count} phản hồi. Nguồn: ${topic.recentFeedbackIds.join(', ')}.`.slice(
        0,
        500,
      ),
    sourceIds: topic.recentFeedbackIds,
    confidence: 1,
    missingData: false,
    missingDataNotes: [],
    status: 'new',
    provider: RULE_BASED_PROVIDER,
    model: RULE_BASED_MODEL,
    generatedAt: input.now,
  });
}
