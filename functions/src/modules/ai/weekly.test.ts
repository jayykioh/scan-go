/**
 * Weekly analysis unit tests (REQ-AI-002, NFR-AI-001, NFR-RT-001).
 *
 * The period resolves in the tenant timezone, every insight cites a source or
 * is labelled missing data, and the deterministic ids make a repeated run
 * idempotent.
 */
import { describe, expect, it } from 'vitest';
import type { AiWarning } from '../../../../shared/contracts/ai.contract.js';
import {
  buildWeeklyInsights,
  insightDocId,
  resolveWeeklyPeriod,
  weeklyAnalysisKey,
} from './weekly.js';

const NOW = '2026-09-16T03:00:00.000Z';

const lossWarning: AiWarning = {
  kind: 'loss',
  severity: 'critical',
  subjectId: 'item-loss',
  subjectName: 'Bánh lỗ',
  message: 'Bánh lỗ đang bán dưới giá vốn.',
  sourceIds: ['item-loss'],
  formula: 'priceVnd - costVnd < 0',
};

const missingWarning: AiWarning = {
  kind: 'missingData',
  severity: 'info',
  subjectId: null,
  subjectName: null,
  message: 'Chưa có đơn đã thanh toán trong kỳ.',
  sourceIds: [],
  formula: 'paidOrderCount == 0',
};

describe('resolveWeeklyPeriod (timezone)', () => {
  it('resolves the previous completed Monday..Sunday week in tenant time', () => {
    expect(resolveWeeklyPeriod(NOW, 'Asia/Ho_Chi_Minh')).toEqual({
      periodStart: '20260907',
      periodEnd: '20260913',
    });
  });

  it('uses the tenant timezone at a UTC day boundary', () => {
    const boundary = '2026-09-13T18:00:00.000Z';
    expect(resolveWeeklyPeriod(boundary, 'Asia/Ho_Chi_Minh')).toEqual({
      periodStart: '20260907',
      periodEnd: '20260913',
    });
    // The same instant is still Sunday in UTC, so the previous week differs.
    expect(resolveWeeklyPeriod(boundary, 'UTC')).toEqual({
      periodStart: '20260831',
      periodEnd: '20260906',
    });
  });
});

describe('buildWeeklyInsights (grounding)', () => {
  const period = { periodStart: '20260907', periodEnd: '20260913' };

  it('maps department, priority, period, source, and confidence', () => {
    const insights = buildWeeklyInsights({
      tenantId: 'tenant-1',
      period,
      warnings: [lossWarning, missingWarning],
      provider: 'rule-based',
      model: 'deterministic-v1',
      now: NOW,
    });

    expect(insights).toHaveLength(2);
    const [loss, missing] = insights;
    expect(loss.department).toBe('menu');
    expect(loss.priority).toBe('critical');
    expect(loss.periodStart).toBe('20260907');
    expect(loss.periodEnd).toBe('20260913');
    expect(loss.sourceIds).toEqual(['item-loss']);
    expect(loss.confidence).toBe(0.8);
    expect(loss.missingData).toBe(false);

    expect(missing.department).toBe('operations');
    expect(missing.missingData).toBe(true);
    expect(missing.sourceIds).toEqual([]);
    expect(missing.confidence).toBe(0.3);
    expect(missing.missingDataNotes).toContain(missingWarning.message);
    expect(missing.status).toBe('new');
  });

  it('is idempotent: deterministic ids for the same tenant week', () => {
    const input = {
      tenantId: 'tenant-1',
      period,
      warnings: [lossWarning],
      provider: 'rule-based',
      model: 'deterministic-v1',
      now: NOW,
    };
    const first = buildWeeklyInsights(input);
    const second = buildWeeklyInsights(input);
    expect(first.map((insight) => insight.insightId)).toEqual(
      second.map((insight) => insight.insightId),
    );
    expect(first[0].analysisKey).toBe(
      weeklyAnalysisKey('tenant-1', period),
    );
    expect(first[0].insightId).toBe(insightDocId('tenant-1', period, 0));
  });
});
