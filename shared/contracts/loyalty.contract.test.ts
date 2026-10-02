import { describe, expect, it } from 'vitest';
import {
  buildDefaultLoyaltyConfig,
  computeEarnedPoints,
  loyaltyMemberIdFor,
  normalizeLoyaltyPhone,
} from './loyalty.contract.js';

describe('normalizeLoyaltyPhone', () => {
  it('normalizes local and country-code shapes to +84', () => {
    expect(normalizeLoyaltyPhone('0901234567')).toBe('+84901234567');
    expect(normalizeLoyaltyPhone('+84 901 234 567')).toBe('+84901234567');
    expect(normalizeLoyaltyPhone('84901234567')).toBe('+84901234567');
  });

  it('rejects a malformed phone', () => {
    expect(normalizeLoyaltyPhone('12345')).toBeNull();
    expect(normalizeLoyaltyPhone('abc')).toBeNull();
  });
});

describe('computeEarnedPoints', () => {
  it('awards one point per 10,000 VND by default', () => {
    const rate = { earnRateVnd: 10000, pointsPerEarnRate: 1 };
    expect(computeEarnedPoints(0, rate)).toBe(0);
    expect(computeEarnedPoints(9999, rate)).toBe(0);
    expect(computeEarnedPoints(10000, rate)).toBe(1);
    expect(computeEarnedPoints(25000, rate)).toBe(2);
  });

  it('supports a configured points-per-rate multiplier', () => {
    expect(
      computeEarnedPoints(50000, { earnRateVnd: 10000, pointsPerEarnRate: 3 }),
    ).toBe(15);
  });

  it('rejects a non-integer amount or invalid rate', () => {
    expect(() =>
      computeEarnedPoints(1.5, { earnRateVnd: 10000, pointsPerEarnRate: 1 }),
    ).toThrow();
    expect(() =>
      computeEarnedPoints(10000, { earnRateVnd: 0, pointsPerEarnRate: 1 }),
    ).toThrow();
  });
});

describe('loyalty defaults', () => {
  it('defaults welcome points to zero and uses a deterministic member id', () => {
    const config = buildDefaultLoyaltyConfig('tenant-a', '2026-01-01T00:00:00.000Z');
    expect(config.welcomePoints).toBe(0);
    expect(config.earnRateVnd).toBe(10000);
    expect(loyaltyMemberIdFor('+84901234567')).toBe('member_84901234567');
  });
});
