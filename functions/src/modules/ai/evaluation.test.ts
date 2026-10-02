/**
 * Provider evaluation unit tests (G2-06, ADR 0008, REQ-AI-004, NFR-AI-002).
 *
 * The report compares cost per useful result, Vietnamese quality, grounding,
 * and latency. It only recommends; it never changes the default provider.
 */
import { describe, expect, it } from 'vitest';
import { aiEvaluationCaseSchema } from '../../../../shared/contracts/ai.contract.js';
import {
  createJevFixtureProvider,
  runProviderEvaluation,
  vietnameseQualityScore,
} from './evaluation.js';
import { createRuleBasedProvider } from './service.js';

const NOW = '2026-09-13T00:00:00.000Z';

const cases = [
  aiEvaluationCaseSchema.parse({
    caseId: 'qa-loss',
    input: 'Món nào đang bán dưới giá vốn?',
    expectsSource: true,
  }),
  aiEvaluationCaseSchema.parse({
    caseId: 'qa-stock',
    input: 'Nguyên liệu nào sắp hết?',
    expectsSource: true,
  }),
];

describe('vietnameseQualityScore', () => {
  it('scores Vietnamese prose above plain ASCII', () => {
    expect(vietnameseQualityScore('Doanh thu và lợi nhuận')).toBeGreaterThan(
      0.5,
    );
    expect(vietnameseQualityScore('revenue and profit')).toBe(0);
    expect(vietnameseQualityScore('')).toBe(0);
  });
});

describe('runProviderEvaluation', () => {
  it('reports cost per useful result, quality, grounding, and latency', async () => {
    let tick = 0;
    const report = await runProviderEvaluation({
      cases,
      providers: [createRuleBasedProvider(), createJevFixtureProvider()],
      baselineProvider: 'rule-based',
      now: NOW,
      clock: () => {
        const current = tick;
        tick += 5;
        return current;
      },
    });

    expect(report.caseCount).toBe(2);
    expect(report.metrics).toHaveLength(2);
    const baseline = report.metrics.find(
      (metric) => metric.provider === 'rule-based',
    );
    const candidate = report.metrics.find((metric) => metric.provider === 'jev');
    expect(baseline?.groundedCount).toBe(2);
    expect(baseline?.usefulCount).toBe(2);
    expect(baseline?.totalCostVnd).toBe(0);
    expect(baseline?.costPerUsefulResultVnd).toBe(0);
    expect(Number.isInteger(candidate?.costPerUsefulResultVnd)).toBe(true);
    expect(candidate?.averageLatencyMs).toBe(5);
    // The default provider has no cost, so no candidate is adopted.
    expect(report.recommendation).toBe('keep-default');
  });
});
