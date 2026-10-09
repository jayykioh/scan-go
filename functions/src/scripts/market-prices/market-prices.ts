/**
 * Seed price resolution.
 *
 * The Seed needs one integer VND purchase price per ingredient. Three sources
 * can supply it, in priority order:
 *
 *   1. `APPROVED_PRICE_OVERRIDES` — a human decision, which always wins.
 *   2. The generated market survey — a real observed retail price.
 *   3. The hand-written Seed default — used when the survey found nothing
 *      comparable.
 *
 * A surveyed price is NOT the shop's own purchase cost. A wholesale seller
 * (Kamereo) is close to it; a retail listing is typically well above what a
 * kitchen pays. It is used here because a sourced real number beats an invented
 * one for a demo, and because a real shop can compare its own invoices against
 * it. Every resolved price carries its `source`, and every observation carries
 * its `marketType`, so nothing is mistaken for an invoice (ADR 0014).
 */
import { UNIT_BASE_FACTOR, type UnitInput } from '../../../../shared/contracts/inventory.contract.js';
import { MARKET_PRICE_SURVEY } from '../market-prices.generated.js';

export type SeedPriceSource = 'override' | 'survey' | 'seed-default';

export interface ResolvedSeedPrice {
  readonly purchasePriceVnd: number;
  readonly source: SeedPriceSource;
  /** Product the price was observed on, when the source is a survey. */
  readonly observedProduct: string | null;
}

/**
 * Human decisions that replace the survey. Add an entry when a reviewer knows
 * the surveyed product is the wrong one for the kitchen, or when the shop's own
 * invoice price is available. The shop invoice is always the better number.
 */
export const APPROVED_PRICE_OVERRIDES: Readonly<Record<string, number>> = {
  // Example: a real invoice price beats a retail observation.
  // 'seed-ing-thit-bo': 280000,
};

/** The survey date, so a stale survey is visible rather than silent. */
export const SURVEY_OBSERVED_AT = MARKET_PRICE_SURVEY.observedAt;

/**
 * Region a Tenant buys in. A shop in Hanoi must not be costed at Saigon
 * prices, so this selects which observation applies. The generated survey can
 * carry several regions; a region with no observation falls back to the Seed
 * default rather than borrowing another region's price.
 */
export const DEFAULT_SEED_REGION = 'HCM';

/** Days after which a survey is considered stale and should be re-run. */
export const SURVEY_MAX_AGE_DAYS = 90;

export function isSurveyStale(
  observedAt: string,
  now: Date = new Date(),
): boolean {
  const observed = Date.parse(`${observedAt}T00:00:00Z`);
  if (Number.isNaN(observed)) {
    return true;
  }
  const ageMs = now.getTime() - observed;
  return ageMs > SURVEY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Resolve one Seed purchase price. The survey stores a cost per base unit, so
 * it is scaled back up to the purchase unit the Seed records.
 *
 * `overrides` is injectable so the precedence rules can be tested without
 * editing the approved table.
 */
export function resolveSeedPrice(
  ingredientId: string,
  seedDefaultPurchasePriceVnd: number,
  purchaseUnit: UnitInput,
  overrides: Readonly<Record<string, number>> = APPROVED_PRICE_OVERRIDES,
  survey: typeof MARKET_PRICE_SURVEY = MARKET_PRICE_SURVEY,
  region: string = DEFAULT_SEED_REGION,
): ResolvedSeedPrice {
  const override = overrides[ingredientId];
  if (typeof override === 'number' && Number.isInteger(override) && override > 0) {
    return {
      purchasePriceVnd: override,
      source: 'override',
      observedProduct: null,
    };
  }

  // The region must match exactly. Falling back to another region would cost a
  // Hanoi shop at Saigon prices, which is precisely the error the region field
  // exists to prevent; a region with no observation keeps the Seed default.
  const observation = survey.observations.find(
    (entry) => entry.ingredientId === ingredientId && entry.region === region,
  );
  if (observation) {
    const factor = UNIT_BASE_FACTOR[purchaseUnit].factor;
    const expectedBase = UNIT_BASE_FACTOR[purchaseUnit].baseUnit;
    // A survey in a different base unit is not comparable, so the Seed default
    // is kept rather than rescaled by an assumed factor.
    if (expectedBase === observation.baseUnit) {
      return {
        purchasePriceVnd: observation.unitCostVnd * factor,
        source: 'survey',
        observedProduct: observation.productName,
      };
    }
  }

  return {
    purchasePriceVnd: seedDefaultPurchasePriceVnd,
    source: 'seed-default',
    observedProduct: null,
  };
}
