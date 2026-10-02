import { describe, expect, it } from 'vitest';
import { aiAskResultFixture } from '@shared/fixtures/ai.fixture';
import { AI_ASK_CALLABLE, parseAiAskResult } from './ai.adapter';

/**
 * AI frontend seam tests (REQ-AI-001, NFR-AI-001). The client accepts only the
 * frozen grounded-answer contract, so an invented or malformed response never
 * reaches the UI.
 */
describe('parseAiAskResult', () => {
  it('accepts a grounded answer with sources, warnings, and formulas', () => {
    const result = parseAiAskResult(aiAskResultFixture);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.warnings[0]?.formula.length).toBeGreaterThan(0);
    expect(result.missingData).toBe(false);
  });

  it('rejects an answer that invents an out-of-range confidence', () => {
    expect(() =>
      parseAiAskResult({ ...aiAskResultFixture, confidence: 1.5 }),
    ).toThrow();
  });

  it('rejects an answer that carries an unknown field', () => {
    expect(() =>
      parseAiAskResult({ ...aiAskResultFixture, secretToken: 'nope' }),
    ).toThrow();
  });

  it('uses the stable published callable name', () => {
    expect(AI_ASK_CALLABLE).toBe('callableAiAsk');
  });
});
