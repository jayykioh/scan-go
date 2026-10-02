import { describe, expect, it } from 'vitest';
import {
  computeRetentionCutoff,
  isRetentionEligible,
  resolveRetentionYears,
  RETENTION_DEFAULT_YEARS,
} from './retention.js';

/**
 * Unit evidence for the retention policy leaf (NFR-RET-001, NFR-REL-001).
 * Policy defaults to five years and eligibility is strictly older-than.
 */
describe('retention default and override resolution', () => {
  it('defaults to the approved five-year window', () => {
    expect(RETENTION_DEFAULT_YEARS).toBe(5);
    expect(resolveRetentionYears(undefined)).toBe(5);
    expect(resolveRetentionYears('7')).toBe(5);
    expect(resolveRetentionYears(0)).toBe(5);
    expect(resolveRetentionYears(1.5)).toBe(5);
  });

  it('accepts a configured positive integer window', () => {
    expect(resolveRetentionYears(7)).toBe(7);
  });
});

describe('computeRetentionCutoff', () => {
  it('subtracts the window in server UTC', () => {
    expect(computeRetentionCutoff('2026-10-01T00:00:00.000Z', 5)).toBe(
      '2021-10-01T00:00:00.000Z',
    );
  });

  it('rejects an invalid server clock', () => {
    expect(() => computeRetentionCutoff('not-a-date', 5)).toThrow();
  });
});

describe('isRetentionEligible', () => {
  it('is true only when the record is strictly older than the cutoff', () => {
    const cutoff = '2021-10-01T00:00:00.000Z';
    expect(isRetentionEligible('2020-01-01T00:00:00.000Z', cutoff)).toBe(true);
    expect(isRetentionEligible(cutoff, cutoff)).toBe(false);
    expect(isRetentionEligible('2026-01-01T00:00:00.000Z', cutoff)).toBe(false);
    expect(isRetentionEligible('invalid', cutoff)).toBe(false);
  });
});
