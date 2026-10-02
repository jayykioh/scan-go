import { describe, expect, it } from 'vitest';
import {
  MENU_LOAD_SAMPLE_COUNT,
  MENU_P95_BUDGET_MS,
  MENU_PAYLOAD_BYTES_BUDGET,
  PUBLIC_MENU_LOAD_LIMIT,
  REPRESENTATIVE_4G_PROFILE,
  applyNetworkProfile,
  meetsMenuP95Budget,
  percentile,
  summarizeMenuLoads,
} from './performance.js';

describe('menu measurement aggregation (NFR-PERF-001)', () => {
  it('computes the nearest-rank percentile', () => {
    expect(percentile([10], 0.95)).toBe(10);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
    expect(() => percentile([], 0.95)).toThrow();
    expect(() => percentile([1], 0)).toThrow();
  });

  it('applies the documented 4G transfer allowance', () => {
    const transferMs =
      (MENU_PAYLOAD_BYTES_BUDGET * 8) / REPRESENTATIVE_4G_PROFILE.throughputKbps;
    expect(
      applyNetworkProfile(
        20,
        REPRESENTATIVE_4G_PROFILE,
        MENU_PAYLOAD_BYTES_BUDGET,
      ),
    ).toBeCloseTo(20 + REPRESENTATIVE_4G_PROFILE.addedLatencyMs + transferMs, 5);
  });

  it('reports p95 and the budget verdict for 100 loads', () => {
    const samples = Array.from({ length: MENU_LOAD_SAMPLE_COUNT }, (_, i) => i + 1);
    const report = summarizeMenuLoads(samples);

    expect(report.sampleCount).toBe(MENU_LOAD_SAMPLE_COUNT);
    expect(report.budgetMs).toBe(MENU_P95_BUDGET_MS);
    expect(report.effectiveP95Ms).toBeGreaterThan(report.measuredP95Ms);
    expect(report.meetsBudget).toBe(true);
    expect(meetsMenuP95Budget(report)).toBe(true);
  });

  it('fails the budget when a regression pushes p95 over two seconds', () => {
    const slow = Array.from(
      { length: MENU_LOAD_SAMPLE_COUNT },
      () => MENU_P95_BUDGET_MS * 2,
    );
    const report = summarizeMenuLoads(slow);
    expect(report.meetsBudget).toBe(false);
    expect(meetsMenuP95Budget(report)).toBe(false);
  });

  it('requires the bounded 100-load sample and a bounded public query', () => {
    expect(() => summarizeMenuLoads([1, 2, 3])).toThrow();
    expect(PUBLIC_MENU_LOAD_LIMIT).toBe(100);
  });
});
