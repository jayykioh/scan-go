/**
 * Listing-normalization tests.
 *
 * Each case below pins a defect that silently produced a wrong price, so none
 * of them is hypothetical: a missed unit spelling dropped a whole catalogue, a
 * missed Unicode form defeated every accented exclusion, and a missing word
 * boundary turned a lime into tamarind.
 */
import { describe, expect, it } from 'vitest';
import { isBulkMeasureUom, normalizeName, normalizeUom } from './listing.js';

describe('normalizeName', () => {
  it('folds a decomposed seller name into precomposed Unicode', () => {
    // Kamereo returns `Mỡ Heo` as `M` + `ơ` + U+0303 COMBINING TILDE.
    const decomposed = 'M\u01a1\u0303 Heo';
    expect(decomposed).not.toBe(decomposed.normalize('NFC'));
    expect(normalizeName(decomposed)).toBe('Mỡ Heo');
  });

  it('makes an accented exclusion pattern match a decomposed name', () => {
    const decomposed = 'M\u01a1\u0303 Heo Tảng Đông Lạnh CP 1kg';
    // The defect: the pattern for pork fat never matched, so fat priced as meat.
    expect(/mỡ/i.test(decomposed)).toBe(false);
    expect(/mỡ/i.test(normalizeName(decomposed))).toBe(true);
  });

  it('leaves an already precomposed name unchanged', () => {
    expect(normalizeName('Thịt Heo Xay')).toBe('Thịt Heo Xay');
  });
});

describe('normalizeUom', () => {
  it('compares unit labels case-insensitively', () => {
    expect(normalizeUom(' KG ')).toBe('kg');
  });
});

describe('isBulkMeasureUom', () => {
  it('reads every kilogram spelling the sellers use', () => {
    // WinMart writes KG, Co.op Online writes Kg, Kamereo writes the enum code.
    expect(isBulkMeasureUom('KG')).toBe('kg');
    expect(isBulkMeasureUom('Kg')).toBe('kg');
    expect(isBulkMeasureUom('KILOGRAM')).toBe('kg');
  });

  it('reads the litre spellings', () => {
    expect(isBulkMeasureUom('L')).toBe('l');
    expect(isBulkMeasureUom('LITER')).toBe('l');
    expect(isBulkMeasureUom('Lít')).toBe('l');
  });

  it('does not treat a container as a measure', () => {
    // Missing `KILOGRAM` once dropped every per-kilogram wholesale line, so the
    // wholesale catalogue was compared on its pack and carton lines only.
    expect(isBulkMeasureUom('PACK')).toBeNull();
    expect(isBulkMeasureUom('CARTON')).toBeNull();
    expect(isBulkMeasureUom('HOP')).toBeNull();
    expect(isBulkMeasureUom('')).toBeNull();
  });
});
