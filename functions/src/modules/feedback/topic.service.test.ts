/**
 * Report topic counter unit tests (REQ-FDB-007, REQ-FDB-008).
 *
 * The counter, the window reset, and the once-per-window alert are arithmetic in
 * code, so they are provable without Firestore. The surge Insight must cite the
 * reports behind the count.
 */
import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_TOPIC_RECENT_IDS_MAX,
  type FeedbackTopic,
} from '../../../../shared/contracts/feedback.contract.js';
import {
  applyFeedbackTopicReport,
  buildFeedbackSurgeInsight,
  buildFeedbackTopic,
  feedbackSurgeInsightId,
  markFeedbackTopicAlerted,
  shouldAlertFeedbackTopic,
  toFeedbackTopic,
  type ReportFeedbackTopicInput,
} from './topic.service.js';

const TENANT = 'tenant-topics';
const START = '2026-10-13T02:00:00.000Z';

function reportInput(
  overrides: Partial<ReportFeedbackTopicInput> = {},
): ReportFeedbackTopicInput {
  return {
    tenantId: TENANT,
    topicKey: 'service',
    label: 'Thái độ và tốc độ phục vụ',
    department: 'operations',
    feedbackId: 'fb-1',
    windowHours: 24,
    now: START,
    ...overrides,
  };
}

function topicAfterReports(count: number, stepMs = 60_000): FeedbackTopic {
  let topic = buildFeedbackTopic(reportInput());
  for (let index = 2; index <= count; index += 1) {
    topic = applyFeedbackTopicReport(
      topic,
      reportInput({
        feedbackId: `fb-${index}`,
        now: new Date(Date.parse(START) + (index - 1) * stepMs).toISOString(),
      }),
    );
  }
  return topic;
}

describe('buildFeedbackTopic', () => {
  it('opens the window and the count on the first report', () => {
    const topic = buildFeedbackTopic(reportInput());
    expect(topic.count).toBe(1);
    expect(topic.windowCount).toBe(1);
    expect(topic.windowStartedAt).toBe(START);
    expect(topic.recentFeedbackIds).toEqual(['fb-1']);
    expect(topic.alertState).toBe('none');
    expect(topic.alertedAt).toBeNull();
  });
});

describe('applyFeedbackTopicReport', () => {
  it('increments both counters inside the window', () => {
    const topic = topicAfterReports(2);
    expect(topic.count).toBe(2);
    expect(topic.windowCount).toBe(2);
    expect(topic.windowStartedAt).toBe(START);
    expect(topic.recentFeedbackIds).toEqual(['fb-2', 'fb-1']);
    expect(topic.lastFeedbackId).toBe('fb-2');
  });

  it('resets the window and the alert once the window elapses', () => {
    const alerted = markFeedbackTopicAlerted(topicAfterReports(3), START);
    const next = applyFeedbackTopicReport(
      alerted,
      reportInput({
        feedbackId: 'fb-late',
        now: '2026-10-14T03:00:00.000Z',
      }),
    );
    expect(next.count).toBe(4);
    expect(next.windowCount).toBe(1);
    expect(next.windowStartedAt).toBe('2026-10-14T03:00:00.000Z');
    expect(next.alertState).toBe('none');
    expect(next.alertedAt).toBeNull();
  });

  it('keeps the alert inside the window', () => {
    const alerted = markFeedbackTopicAlerted(topicAfterReports(3), START);
    const next = applyFeedbackTopicReport(
      alerted,
      reportInput({
        feedbackId: 'fb-4',
        now: '2026-10-13T05:00:00.000Z',
      }),
    );
    expect(next.windowCount).toBe(4);
    expect(next.alertState).toBe('alerted');
  });

  it('bounds the recent feedback id list', () => {
    const topic = topicAfterReports(FEEDBACK_TOPIC_RECENT_IDS_MAX + 5);
    expect(topic.recentFeedbackIds).toHaveLength(
      FEEDBACK_TOPIC_RECENT_IDS_MAX,
    );
    expect(topic.count).toBe(FEEDBACK_TOPIC_RECENT_IDS_MAX + 5);
  });
});

describe('shouldAlertFeedbackTopic', () => {
  it('warns once the count reaches the threshold', () => {
    expect(shouldAlertFeedbackTopic(topicAfterReports(2), 3)).toBe(false);
    expect(shouldAlertFeedbackTopic(topicAfterReports(3), 3)).toBe(true);
  });

  it('does not warn twice in one window', () => {
    const alerted = markFeedbackTopicAlerted(topicAfterReports(4), START);
    expect(shouldAlertFeedbackTopic(alerted, 3)).toBe(false);
  });

  it('disables the warning at a zero threshold', () => {
    expect(shouldAlertFeedbackTopic(topicAfterReports(10), 0)).toBe(false);
  });
});

describe('buildFeedbackSurgeInsight', () => {
  it('cites the reports behind the count and is deterministic', () => {
    const topic = topicAfterReports(3);
    const insight = buildFeedbackSurgeInsight({
      topic,
      windowHours: 24,
      timezone: 'Asia/Ho_Chi_Minh',
      now: START,
    });

    expect(insight.department).toBe('operations');
    expect(insight.priority).toBe('high');
    expect(insight.sourceIds).toEqual(['fb-3', 'fb-2', 'fb-1']);
    expect(insight.missingData).toBe(false);
    expect(insight.provider).toBe('rule-based');
    expect(insight.periodStart).toBe('20261013');
    expect(insight.insightId).toBe(
      feedbackSurgeInsightId(TENANT, 'service', topic.windowStartedAt),
    );

    const again = buildFeedbackSurgeInsight({
      topic,
      windowHours: 24,
      timezone: 'Asia/Ho_Chi_Minh',
      now: START,
    });
    expect(again.insightId).toBe(insight.insightId);
  });
});

describe('toFeedbackTopic', () => {
  it('rebuilds a stored document and defaults the alert fields', () => {
    const topic = buildFeedbackTopic(reportInput());
    const stored: Record<string, unknown> = { ...topic };
    delete stored.alertState;
    delete stored.alertedAt;
    delete stored.recentFeedbackIds;

    const rebuilt = toFeedbackTopic(TENANT, stored);
    expect(rebuilt.topicKey).toBe('service');
    expect(rebuilt.count).toBe(1);
    expect(rebuilt.alertState).toBe('none');
    expect(rebuilt.alertedAt).toBeNull();
    expect(rebuilt.recentFeedbackIds).toEqual([]);
  });
});
