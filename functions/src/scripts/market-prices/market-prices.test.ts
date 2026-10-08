/**
 * Seed price resolution tests.
 *
 * The rule under test is precedence and comparability: a human decision beats
 * an observation, an observation beats the fallback, and a survey in a
 * different base unit is never rescaled by a guessed factor. Getting this wrong
 * puts a wrong number into `unitCostVnd` and therefore into gross profit.
 */
import { describe, expect, it } from 'vitest';
import { SEED_INGREDIENTS, SEED_INGREDIENT_PRICE_SOURCES } from '../seed-data.js';
import { MARKET_PRICE_SURVEY } from '../market-prices.generated.js';
import {
  isSurveyStale,
  resolveSeedPrice,
  SURVEY_MAX_AGE_DAYS,
} from './market-prices.js';

const SURVEY = {
  observedAt: '2026-10-06',
  region: 'HCM',
  marketType: 'retail',
  sources: [
    { sourceId: 'winmart', sourceName: 'WinMart', marketType: 'retail' },
  ],
  observations: [
    {
      ingredientId: 'seed-ing-thit-heo',
      seedName: 'Thịt heo',
      sourceId: 'winmart',
      sourceName: 'WinMart',
      region: 'HCM',
      productName: 'MEATDELI Thịt heo xay chuẩn ngon (S)',
      packPriceVnd: 141900,
      listPriceVnd: null,
      unitCostVnd: 142,
      baseUnit: 'g',
      packLabel: '1 kg',
      quotes: [],
      spreadPercent: null,
      alternatives: [],
    },
    {
      ingredientId: 'seed-ing-trung-ga',
      seedName: 'Trứng gà',
      sourceId: 'cooponline',
      sourceName: 'Co.op Online',
      region: 'HCM',
      productName: 'Trứng gà Co.op Select loại 1- 10 trứng',
      packPriceVnd: 26900,
      listPriceVnd: null,
      unitCostVnd: 2690,
      baseUnit: 'unit',
      packLabel: '10 trứng',
      quotes: [],
      spreadPercent: null,
      alternatives: [],
    },
  ],
} as unknown as Parameters<typeof resolveSeedPrice>[4];

describe('resolveSeedPrice precedence', () => {
  it('lets a human override beat the survey', () => {
    const resolved = resolveSeedPrice(
      'seed-ing-thit-heo',
      150000,
      'kg',
      { 'seed-ing-thit-heo': 280000 },
      SURVEY,
    );
    expect(resolved).toEqual({
      purchasePriceVnd: 280000,
      source: 'override',
      observedProduct: null,
    });
  });

  it('scales an observed cost per gram back up to a price per kilogram', () => {
    const resolved = resolveSeedPrice('seed-ing-thit-heo', 150000, 'kg', {}, SURVEY);
    expect(resolved.purchasePriceVnd).toBe(142000);
    expect(resolved.source).toBe('survey');
    expect(resolved.observedProduct).toContain('Thịt heo xay');
  });

  it('keeps a per-piece observation unscaled for a count unit', () => {
    const resolved = resolveSeedPrice(
      'seed-ing-trung-ga',
      4000,
      'unit',
      {},
      SURVEY,
    );
    expect(resolved.purchasePriceVnd).toBe(2690);
    expect(resolved.source).toBe('survey');
  });

  it('falls back to the Seed default when nothing was surveyed', () => {
    const resolved = resolveSeedPrice('seed-ing-ca-loc', 140000, 'kg', {}, SURVEY);
    expect(resolved).toEqual({
      purchasePriceVnd: 140000,
      source: 'seed-default',
      observedProduct: null,
    });
  });

  it('refuses to rescale an observation in a different base unit', () => {
    // The Seed records this ingredient per litre, but the survey priced grams.
    const resolved = resolveSeedPrice('seed-ing-thit-heo', 150000, 'l', {}, SURVEY);
    expect(resolved.source).toBe('seed-default');
    expect(resolved.purchasePriceVnd).toBe(150000);
  });

  it('ignores a nonsensical override', () => {
    const resolved = resolveSeedPrice(
      'seed-ing-thit-heo',
      150000,
      'kg',
      { 'seed-ing-thit-heo': 0 },
      SURVEY,
    );
    expect(resolved.source).toBe('survey');
  });
});

describe('isSurveyStale', () => {
  it('accepts a recent survey', () => {
    expect(isSurveyStale('2026-10-06', new Date('2026-11-01T00:00:00Z'))).toBe(false);
  });

  it('flags a survey older than the limit', () => {
    const beyond = new Date('2026-10-06T00:00:00Z');
    beyond.setUTCDate(beyond.getUTCDate() + SURVEY_MAX_AGE_DAYS + 1);
    expect(isSurveyStale('2026-10-06', beyond)).toBe(true);
  });

  it('treats an unparseable date as stale', () => {
    expect(isSurveyStale('not-a-date')).toBe(true);
  });
});

describe('the committed survey against the Seed', () => {
  it('applies every observation whose base unit matches the Seed', () => {
    const mismatches = SEED_INGREDIENT_PRICE_SOURCES.filter(
      (entry) =>
        entry.source === 'seed-default' &&
        MARKET_PRICE_SURVEY.observations.some(
          (observation) => observation.ingredientId === entry.id,
        ),
    );

    // Two mismatches, both deliberate:
    //  - `Đậu hũ` is stored per piece but the listing only sells a 300g pack, so
    //    the guard keeps the fallback rather than assuming a weight per piece.
    //  - `Dứa` is only listed in the Hanoi catalogue, and the Seed resolves for
    //    its own region (HCM), so it must not borrow a Hanoi price.
    // Any other mismatch means the survey map drifted and needs review.
    expect(mismatches.map((entry) => entry.id)).toEqual([
      'seed-ing-dau-hu',
      'seed-ing-dua',
    ]);
  });

  it('never leaves a surveyed price unlabelled', () => {
    const surveyed = SEED_INGREDIENT_PRICE_SOURCES.filter(
      (entry) => entry.source === 'survey',
    );
    expect(surveyed.length).toBeGreaterThan(0);
    for (const entry of surveyed) {
      expect(entry.observedProduct).toBeTruthy();
      expect(entry.purchasePriceVnd).toBeGreaterThan(0);
      expect(Number.isInteger(entry.purchasePriceVnd)).toBe(true);
    }
  });

  it('covers every Seed ingredient exactly once', () => {
    expect(SEED_INGREDIENT_PRICE_SOURCES).toHaveLength(SEED_INGREDIENTS.length);
    const ids = new Set(SEED_INGREDIENT_PRICE_SOURCES.map((entry) => entry.id));
    expect(ids.size).toBe(SEED_INGREDIENT_PRICE_SOURCES.length);
  });
});

describe('region selection', () => {
  const twoRegions = {
    observedAt: '2026-10-07',
    region: 'HCM+HN',
    marketType: 'retail',
    sources: [],
    observations: [
      {
        ingredientId: 'seed-ing-ca-chua',
        seedName: 'Cà chua',
        sourceId: 'kamereo',
        sourceName: 'Kamereo',
        region: 'HCM',
        marketType: 'wholesale',
        productName: 'Cà Chua Beef Đà Lạt',
        packPriceVnd: 23100,
        listPriceVnd: null,
        unitCostVnd: 23,
        baseUnit: 'g',
        packLabel: '1 kg',
        quotes: [],
        spreadPercent: null,
        alternatives: [],
      },
      {
        ingredientId: 'seed-ing-ca-chua',
        seedName: 'Cà chua',
        sourceId: 'kamereo',
        sourceName: 'Kamereo',
        region: 'HN',
        marketType: 'wholesale',
        productName: 'Cà Chua Bắc',
        packPriceVnd: 29000,
        listPriceVnd: null,
        unitCostVnd: 29,
        baseUnit: 'g',
        packLabel: '1 kg',
        quotes: [],
        spreadPercent: null,
        alternatives: [],
      },
    ],
  } as unknown as Parameters<typeof resolveSeedPrice>[4];

  it('uses the price quoted for the shop region', () => {
    expect(
      resolveSeedPrice('seed-ing-ca-chua', 25000, 'kg', {}, twoRegions, 'HN')
        .purchasePriceVnd,
    ).toBe(29000);
    expect(
      resolveSeedPrice('seed-ing-ca-chua', 25000, 'kg', {}, twoRegions, 'HCM')
        .purchasePriceVnd,
    ).toBe(23000);
  });

  it('never borrows another region price when the region is missing', () => {
    // A Da Nang shop has no observation, so it keeps the Seed default rather
    // than silently inheriting a Hanoi or Saigon price.
    const resolved = resolveSeedPrice(
      'seed-ing-ca-chua',
      25000,
      'kg',
      {},
      twoRegions,
      'DN',
    );
    expect(resolved.purchasePriceVnd).toBe(25000);
    expect(resolved.source).toBe('seed-default');
  });
});
