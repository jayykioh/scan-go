import { describe, expect, it } from 'vitest';
import {
  aiAskInputSchema,
  aiAskResultSchema,
  aiEvaluationReportSchema,
  aiFeedbackGroupingResultSchema,
  aiInsightSchema,
  aiUsageRecordSchema,
  aiWeeklyAnalysisResultSchema,
} from './ai.contract.js';
import {
  aiAskResultFixture,
  aiEvaluationReportFixture,
  aiFeedbackGroupingResultFixture,
  aiInsightFixture,
  aiUsageRecordFixture,
  aiWeeklyAnalysisResultFixture,
} from '../fixtures/ai.fixture.js';

/**
 * AI contract tests (REQ-AI-001, NFR-AI-001, NFR-PRIV-002). The contract is the
 * boundary: an answer carries citations, formulas, and integer VND, and it
 * rejects extra fields so no secret or PII can ride along.
 */
describe('aiAskInputSchema', () => {
  it('accepts a bounded Owner question', () => {
    const parsed = aiAskInputSchema.parse({
      tenantId: 'tenant-alpha',
      question: 'Món nào lỗ?',
    });
    expect(parsed.question).toBe('Món nào lỗ?');
  });

  it('rejects an empty or over-long question and extra fields', () => {
    expect(() =>
      aiAskInputSchema.parse({ tenantId: 'tenant-alpha', question: '' }),
    ).toThrow();
    expect(() =>
      aiAskInputSchema.parse({
        tenantId: 'tenant-alpha',
        question: 'x'.repeat(501),
      }),
    ).toThrow();
    expect(() =>
      aiAskInputSchema.parse({
        tenantId: 'tenant-alpha',
        question: 'ok',
        apiKey: 'AIzaSyA1234567890abcdefghijklmnop',
      }),
    ).toThrow();
  });
});

describe('aiAskResultSchema', () => {
  it('accepts the grounded fixture', () => {
    expect(aiAskResultSchema.parse(aiAskResultFixture).missingData).toBe(false);
  });

  it('rejects a warning without a formula source', () => {
    expect(() =>
      aiAskResultSchema.parse({
        ...aiAskResultFixture,
        warnings: [
          {
            kind: 'loss',
            severity: 'critical',
            subjectId: null,
            subjectName: null,
            message: 'lỗ',
            sourceIds: [],
            formula: '',
          },
        ],
      }),
    ).toThrow();
  });
});

describe('aiUsageRecordSchema', () => {
  it('records provider, model, tokens, and integer cost', () => {
    const usage = aiUsageRecordSchema.parse(aiUsageRecordFixture);
    expect(usage.provider).toBe('rule-based');
    expect(Number.isInteger(usage.estimatedCostVnd)).toBe(true);
  });
});

describe('aiInsightSchema (REQ-AI-002, NFR-AI-001)', () => {
  it('accepts a grounded insight with a cited source', () => {
    const insight = aiInsightSchema.parse(aiInsightFixture);
    expect(insight.department).toBe('inventory');
    expect(insight.sourceIds.length).toBeGreaterThan(0);
    expect(aiWeeklyAnalysisResultSchema.parse(aiWeeklyAnalysisResultFixture)
      .insightCount).toBe(1);
  });

  it('rejects a claim with no source that is not labelled missing data', () => {
    expect(() =>
      aiInsightSchema.parse({ ...aiInsightFixture, sourceIds: [] }),
    ).toThrow();
    expect(
      aiInsightSchema.parse({
        ...aiInsightFixture,
        sourceIds: [],
        missingData: true,
      }).missingData,
    ).toBe(true);
  });
});

describe('aiFeedbackGroupingResultSchema (REQ-FDB-002, NFR-PRIV-002)', () => {
  it('accepts a theme that cites its source feedback IDs', () => {
    const result = aiFeedbackGroupingResultSchema.parse(
      aiFeedbackGroupingResultFixture,
    );
    expect(result.themes[0].sourceFeedbackIds).toContain(
      'feedback-unverified-001',
    );
  });

  it('rejects a theme with no source feedback ID', () => {
    expect(() =>
      aiFeedbackGroupingResultSchema.parse({
        ...aiFeedbackGroupingResultFixture,
        themes: [
          { ...aiFeedbackGroupingResultFixture.themes[0], sourceFeedbackIds: [] },
        ],
      }),
    ).toThrow();
  });
});

describe('aiEvaluationReportSchema (G2-06, ADR 0008)', () => {
  it('accepts a comparison report that keeps the default provider', () => {
    const report = aiEvaluationReportSchema.parse(aiEvaluationReportFixture);
    expect(report.recommendation).toBe('keep-default');
    expect(report.metrics.map((metric) => metric.provider)).toEqual([
      'rule-based',
      'jev',
    ]);
  });
});
