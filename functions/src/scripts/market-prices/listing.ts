/**
 * A price listing read from one seller, normalized across sources.
 *
 * Every source adapter maps its own response into this shape so the collector
 * can compare a WinMart kilogram against a Co.op Online kilogram without
 * knowing either site's field names.
 */

/**
 * How the seller sells. A `wholesale` listing is closer to what a kitchen
 * actually pays; `retail` is a street-price reference. The distinction is
 * recorded per observation so a reviewer is never misled about which one a Seed
 * Cost came from (ADR 0014).
 */
export type MarketType = 'retail' | 'wholesale';

export interface ListingItem {
  /** Stable source id, e.g. `winmart`. */
  readonly sourceId: string;
  /** Display name of the seller, e.g. `WinMart`. */
  readonly sourceName: string;
  readonly marketType: MarketType;
  /**
   * Delivery region the price was quoted for, e.g. `HCM` or `HN`, or null when
   * the seller serves one region only. Vietnam prices the same ingredient
   * differently by region, so a price without a region is not comparable to one
   * from another city.
   */
  readonly region?: string | null;
  /** Seller's product id. */
  readonly id: string;
  readonly name: string;
  /** Raw unit-of-measure label as the seller writes it, e.g. `KG`, `Hộp`. */
  readonly uom: string;
  /** Current selling price for one `uom`, integer VND. */
  readonly priceVnd: number;
  /** Undiscounted price, integer VND, or null when not discounted. */
  readonly listPriceVnd: number | null;
  /** The category page this item was read from, kept as provenance. */
  readonly sourceUrl: string;
  /**
   * The seller's own category path, outermost first, when the source exposes
   * one. A keyword search returns hits from every department — a search for
   * `sả` surfaced a floor cleaner — so the path is what keeps a search hit
   * inside the right department.
   */
  readonly categoryPath?: readonly string[];
  /**
   * True when the item came from a keyword search rather than a scoped category
   * page. Only a search needs the department check: a category read is already
   * limited to one department, and a wholesale catalogue names its departments
   * in English, so applying a Vietnamese department pattern to it would drop
   * every row.
   */
  readonly fromSearch?: boolean;
  /**
   * True when `priceVnd` already buys a measured base unit (a per-kilogram or
   * per-litre listing), so the price needs no pack parsing. False when the
   * listing sells a container whose size has to be read from the name.
   */
  readonly isBulkMeasure: boolean;
}

/** Normalize a seller's unit label so `KG`, `Kg`, and `kg` compare equal. */
export function normalizeUom(uom: string): string {
  return uom.trim().toLowerCase();
}

/**
 * Normalize a product name to precomposed Unicode (NFC).
 *
 * Sellers do not agree on encoding. Kamereo returns `Mỡ Heo` as `M` + `ơ` +
 * U+0303 COMBINING TILDE, while a pattern written as the single codepoint `ỡ`
 * (U+1EE1) does not match it. The mismatch is silent — the row simply never
 * matches — and it defeats every accented pattern, including the exclusions
 * that keep pork fat and bones out of a meat price. Every adapter runs its
 * names through here before matching.
 */
export function normalizeName(value: string): string {
  return value.normalize('NFC');
}

/**
 * True when the seller's unit label means the price is per kilogram or per
 * litre.
 *
 * Every spelling observed in the wild is covered, because a missed spelling is
 * silent: WinMart writes `KG`, Co.op Online writes `Kg`, and Kamereo writes the
 * full enum code `KILOGRAM`. Missing `KILOGRAM` dropped every per-kilogram line
 * from the wholesale catalogue, so only its pack and carton lines were ever
 * compared.
 */
export function isBulkMeasureUom(uom: string): 'kg' | 'l' | null {
  const normalized = normalizeUom(uom);
  if (normalized === 'kg' || normalized === 'kilogram' || normalized === 'kilo') {
    return 'kg';
  }
  if (
    normalized === 'l' ||
    normalized === 'lit' ||
    normalized === 'lít' ||
    normalized === 'liter' ||
    normalized === 'litre'
  ) {
    return 'l';
  }
  return null;
}
