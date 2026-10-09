/**
 * Cost drift tests.
 *
 * The drift report is the only place the shop's own cost and a market reference
 * meet, so the rules that keep them honest are pinned here: a region must match
 * exactly, an archived or unpriced ingredient has nothing to compare, and the
 * band boundaries are inclusive.
 */
import { describe, expect, it } from 'vitest';
import {
  buildDriftRows,
  classifyDrift,
  compareToMarket,
  ON_PAR_BAND_PERCENT,
  REVIEW_THRESHOLD_PERCENT,
} from './drift.js';

describe('classifyDrift', () => {
  it('treats a small gap in either direction as on par', () => {
    expect(classifyDrift(0)).toBe('on-par');
    expect(classifyDrift(ON_PAR_BAND_PERCENT)).toBe('on-par');
    expect(classifyDrift(-ON_PAR_BAND_PERCENT)).toBe('on-par');
  });

  it('separates paying above from paying below', () => {
    expect(classifyDrift(ON_PAR_BAND_PERCENT + 1)).toBe('above-market');
    expect(classifyDrift(-ON_PAR_BAND_PERCENT - 1)).toBe('cheaper');
  });

  it('reports no benchmark when there is nothing to compare', () => {
    expect(classifyDrift(null)).toBe('no-benchmark');
  });

  it('keeps the review threshold above the on-par band', () => {
    expect(REVIEW_THRESHOLD_PERCENT).toBeGreaterThan(ON_PAR_BAND_PERCENT);
  });
});

describe('compareToMarket', () => {
  it('measures the shop against its own region', () => {
    // The committed survey carries both regions for this ingredient.
    const hcm = compareToMarket('seed-ing-ca-chua', 30000, 'HCM');
    const hn = compareToMarket('seed-ing-ca-chua', 30000, 'HN');
    expect(hcm.benchmarkUnitCostVnd).not.toBeNull();
    expect(hn.benchmarkUnitCostVnd).not.toBeNull();
    // Paying 30.000/kg is a bigger overspend against the cheaper region.
    expect(hcm.gapPercent).toBeGreaterThan(hn.gapPercent ?? 0);
  });

  it('returns nothing for a region the survey never covered', () => {
    // A Da Nang shop must not be graded against a Hanoi or Saigon reference.
    const result = compareToMarket('seed-ing-ca-chua', 30000, 'DN');
    expect(result).toEqual({
      benchmarkUnitCostVnd: null,
      gapPercent: null,
      product: null,
      unitMismatch: false,
    });
  });

  it('refuses to compare two different base units', () => {
    // The shop stores `Đậu hũ` per piece; the listing only sells a 300g pack.
    // Comparing them once reported a 9700% overspend that did not exist.
    const result = compareToMarket('seed-ing-dau-hu', 5000, 'HCM', 'unit');
    expect(result.unitMismatch).toBe(true);
    expect(result.gapPercent).toBeNull();
    // The product is still named, so a reviewer sees why it was skipped.
    expect(result.product).toBeTruthy();
  });

  it('compares when the base units agree', () => {
    const result = compareToMarket('seed-ing-ca-chua', 30000, 'HCM', 'g');
    expect(result.unitMismatch).toBe(false);
    expect(result.gapPercent).not.toBeNull();
  });

  it('returns nothing for an ingredient the survey never matched', () => {
    const result = compareToMarket('seed-ing-not-real', 1000, 'HCM');
    expect(result.benchmarkUnitCostVnd).toBeNull();
  });
});

describe('buildDriftRows', () => {
  const ingredients = [
    { id: 'seed-ing-ca-chua', data: { name: 'Cà chua', unitCostVnd: 40000, isActive: true } },
    { id: 'seed-ing-toi', data: { name: 'Tỏi', unitCostVnd: 70000, isActive: true } },
    { id: 'seed-ing-sa', data: { name: 'Sả', unitCostVnd: 45000, isActive: false } },
    { id: 'seed-ing-me-que', data: { name: 'Me chua', unitCostVnd: 0, isActive: true } },
    { id: 'seed-ing-gia-do', data: { name: 'Giá đỗ', isActive: true } },
  ];

  it('skips archived and unpriced ingredients', () => {
    const rows = buildDriftRows(ingredients, 'HCM');
    const ids = rows.map((row) => row.ingredientId);
    expect(ids).not.toContain('seed-ing-sa');
    expect(ids).not.toContain('seed-ing-me-que');
    expect(ids).not.toContain('seed-ing-gia-do');
  });

  it('sorts the worst overspend first so the report leads with what matters', () => {
    const rows = buildDriftRows(ingredients, 'HCM');
    const gaps = rows.map((row) => row.gapPercent ?? -1);
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });

  it('carries the observed product so a reviewer can judge the comparison', () => {
    const rows = buildDriftRows(ingredients, 'HCM');
    const tomato = rows.find((row) => row.ingredientId === 'seed-ing-ca-chua');
    expect(tomato?.benchmarkProduct).toBeTruthy();
    expect(tomato?.verdict).toBe('above-market');
  });

  it('marks a unit mismatch instead of inventing a gap', () => {
    const rows = buildDriftRows(
      [
        {
          id: 'seed-ing-dau-hu',
          data: { name: 'Đậu hũ', unitCostVnd: 5000, isActive: true, baseUnit: 'unit' },
        },
      ],
      'HCM',
    );
    expect(rows[0]?.verdict).toBe('unit-mismatch');
    expect(rows[0]?.gapPercent).toBeNull();
  });
});
