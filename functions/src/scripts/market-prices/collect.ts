/**
 * Market price survey collector.
 *
 *   npm run market:survey              # survey, write the generated file
 *   npm run market:survey -- --dry-run # print the review table only
 *
 * The survey reads several public retail listings, converts each candidate to
 * the base unit the Seed stores, keeps the cheapest comparable product per
 * ingredient, and writes a generated TypeScript file. Nothing is applied to the
 * Seed automatically: the generated file is reviewed in a diff, which is the
 * point.
 *
 * A retail price is NOT a purchase cost. It is recorded with `marketType:
 * 'retail'` so a reviewer can see the provenance, and the Seed only consumes it
 * when a human has accepted it (see `market-prices.ts`).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COOP_SOURCE_ID, fetchCoopCategory } from './coop.js';
import {
  DEFAULT_KAMEREO_REGION,
  fetchKamereoCategory,
  KAMEREO_REGIONS,
  KAMEREO_SOURCE_ID,
} from './kamereo.js';
import { SURVEY_TARGETS, FRESH_DEPARTMENT, type IngredientSurveyTarget } from './ingredient-map.js';
import type { ListingItem } from './listing.js';
import { parsePackSize, pricePerBaseUnit, type PackBaseUnit } from './pack-size.js';
import { fetchWinmartCategory, searchWinmart, WINMART_SOURCE_ID } from './winmart.js';

const OUTPUT_PATH = fileURLToPath(
  new URL('../market-prices.generated.ts', import.meta.url),
);

/** One seller's best comparable offer for an ingredient. */
export interface SourceQuote {
  sourceId: string;
  sourceName: string;
  /** `wholesale` when the seller supplies businesses, `retail` otherwise. */
  marketType: string;
  productName: string;
  unitCostVnd: number;
  packLabel: string;
}

export interface Observation {
  ingredientId: string;
  seedName: string;
  /** Seller the winning price came from. */
  sourceId: string;
  sourceName: string;
  /** Delivery region the winning price was quoted for. */
  region: string;
  /**
   * How the winning seller sells. A `wholesale` winner is a business supplier
   * and is therefore far closer to a real purchase cost than a retail listing.
   */
  marketType: string;
  /** Cheapest comparable product found for this ingredient. */
  productName: string;
  /** Price actually charged now, integer VND, for the whole pack or kg. */
  packPriceVnd: number;
  /** Undiscounted shelf price, integer VND, or null when not discounted. */
  listPriceVnd: number | null;
  /** Cost per base unit, derived from the pack. */
  unitCostVnd: number;
  baseUnit: PackBaseUnit;
  /** Human-readable pack, e.g. `300g` or `1 kg`. */
  packLabel: string;
  /** Best price per seller, so the spread between shops is visible. */
  quotes: SourceQuote[];
  /**
   * Percentage gap between the cheapest and dearest seller for the same
   * ingredient. A large spread means "cheapest" is a weak signal and the price
   * needs a human decision rather than trust.
   */
  spreadPercent: number | null;
  /** Other comparable products, cheapest first, for review. */
  alternatives: Array<{
    sourceName: string;
    marketType: string;
    productName: string;
    unitCostVnd: number;
  }>;
}

export interface SurveyResult {
  observedAt: string;
  /** Region every observation was quoted for. */
  region: string;
  sources: Array<{ sourceId: string; sourceName: string; marketType: string }>;
  observations: Observation[];
  /** Ingredients with no comparable product, reported rather than hidden. */
  unmatched: Array<{ ingredientId: string; seedName: string; reason: string }>;
}

function isoDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

type CategoryFetcher = (
  slug: string,
  page: number,
  region: string,
) => Promise<{ items: readonly ListingItem[]; totalPages: number | null }>;

/**
 * Pages read per category. One page is not enough: the Co.op Online produce
 * category alone holds 641 products across 17 pages, so reading only the first
 * page would silently hide most prices. The cap keeps the survey light while
 * covering the realistic cheap end of each category.
 */
const MAX_PAGES_PER_CATEGORY = 3;

/**
 * Regions each seller actually serves.
 *
 * WinMart store 1535 and Co.op Online are southern, so quoting them for a Hanoi
 * survey would label a Saigon price as a Hanoi one. A seller outside the
 * requested region is skipped and reported, never relabelled.
 */
const SOURCE_REGIONS: Record<string, readonly string[]> = {
  [WINMART_SOURCE_ID]: ['HCM'],
  [COOP_SOURCE_ID]: ['HCM'],
  [KAMEREO_SOURCE_ID]: KAMEREO_REGIONS,
};

/** Seller registry. Adding a seller means adding one entry here. */
const SOURCE_FETCHERS: Record<string, CategoryFetcher> = {
  [WINMART_SOURCE_ID]: fetchWinmartCategory,
  [COOP_SOURCE_ID]: fetchCoopCategory,
  [KAMEREO_SOURCE_ID]: fetchKamereoCategory,
};

type KeywordSearcher = (keyword: string) => Promise<readonly ListingItem[]>;

/**
 * Sellers that expose a keyword search. Co.op Online does not publish one that
 * the survey can reach, so it is surveyed by category only; a missing searcher
 * is skipped rather than treated as a failure.
 */
const SOURCE_SEARCHERS: Record<string, KeywordSearcher> = {
  [WINMART_SOURCE_ID]: async (keyword) => (await searchWinmart(keyword)).items,
};

/** Price per base unit for one candidate, or null when not comparable. */
function resolveCandidate(
  item: ListingItem,
  target: IngredientSurveyTarget,
): { unitCostVnd: number; baseUnit: PackBaseUnit; packLabel: string } | null {
  // A per-kilogram or per-litre listing is already a measure.
  if (item.isBulkMeasure) {
    if (target.baseUnit !== 'g') {
      return null;
    }
    return {
      unitCostVnd: Math.round(item.priceVnd / 1000),
      baseUnit: 'g',
      packLabel: '1 kg',
    };
  }

  const size = parsePackSize(item.name);
  const converted = pricePerBaseUnit(item.priceVnd, size);
  if (!converted || !size) {
    return null;
  }
  // A pack that converts to a different base unit than the Seed stores is not
  // comparable, so it is dropped rather than rescaled.
  if (converted.baseUnit !== target.baseUnit) {
    return null;
  }
  return {
    unitCostVnd: converted.unitCostVnd,
    baseUnit: converted.baseUnit,
    packLabel: size.matchedText,
  };
}

function isCandidate(item: ListingItem, target: IngredientSurveyTarget): boolean {
  if (!target.include.some((pattern) => pattern.test(item.name))) {
    return false;
  }
  if (target.exclude.some((pattern) => pattern.test(item.name))) {
    return false;
  }
  // A search hit arrives from every department, so the seller's own category
  // path is checked. A category read is already scoped to one department, and a
  // wholesale catalogue names its departments in another language, so the
  // check applies to search hits only.
  if (item.fromSearch && item.categoryPath && item.categoryPath.length > 0) {
    const department = target.searchCategoryInclude ?? FRESH_DEPARTMENT;
    if (!department.test(item.categoryPath.join(' > '))) {
      return false;
    }
  }
  return true;
}

/**
 * Name the closest products that matched by name but could not be converted to
 * the Seed's base unit. A whole pineapple priced per fruit is a decision a
 * person has to make, so the survey surfaces it instead of reporting an empty
 * absence.
 */
function nearMissesByBaseUnit(
  items: readonly ListingItem[],
  target: IngredientSurveyTarget,
): string[] {
  const misses: string[] = [];
  for (const item of items) {
    if (!isCandidate(item, target)) {
      continue;
    }
    const size = parsePackSize(item.name);
    const converted = pricePerBaseUnit(item.priceVnd, size);
    const unit = item.isBulkMeasure
      ? target.baseUnit === 'g'
        ? 'kg'
        : 'l'
      : converted?.baseUnit;
    if (unit !== target.baseUnit) {
      misses.push(
        `${item.name} (${item.uom || '?'} @ ${item.priceVnd.toLocaleString('vi-VN')})`,
      );
    }
    if (misses.length >= 2) {
      break;
    }
  }
  return misses;
}

interface Comparable {
  item: ListingItem;
  unitCostVnd: number;
  baseUnit: PackBaseUnit;
  packLabel: string;
}

export async function collectSurvey(
  now: Date = new Date(),
  log: (message: string) => void = () => undefined,
  region: string = DEFAULT_KAMEREO_REGION,
): Promise<SurveyResult> {
  const observations: Observation[] = [];
  const unmatched: SurveyResult['unmatched'] = [];
  const seenSources = new Map<string, { sourceId: string; sourceName: string; marketType: string }>();
  // One read per (seller, category), reused by every ingredient that maps to it.
  const pageCache = new Map<string, readonly ListingItem[]>();

  const readCategory = async (
    sourceId: string,
    slug: string,
    region: string,
  ): Promise<readonly ListingItem[]> => {
    const key = `${sourceId}::${slug}::${region}`;
    const cached = pageCache.get(key);
    if (cached) {
      return cached;
    }
    const fetcher = SOURCE_FETCHERS[sourceId];
    if (!fetcher) {
      throw new Error(`no fetcher registered for source "${sourceId}"`);
    }

    const collected: ListingItem[] = [];
    for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page += 1) {
      const result = await fetcher(slug, page, region);
      collected.push(...result.items);
      if (result.items.length === 0) {
        break;
      }
      if (result.totalPages !== null && page >= result.totalPages) {
        break;
      }
    }

    pageCache.set(key, collected);
    const first = collected[0];
    if (first) {
      seenSources.set(first.sourceId, {
        sourceId: first.sourceId,
        sourceName: first.sourceName,
        marketType: first.marketType,
      });
    }
    log(`  ${sourceId}/${slug}: ${collected.length} listings`);
    return collected;
  };

  const readSearch = async (
    sourceId: string,
    keyword: string,
    searcher: KeywordSearcher,
  ): Promise<readonly ListingItem[]> => {
    const key = `${sourceId}::search::${keyword}`;
    const cached = pageCache.get(key);
    if (cached) {
      return cached;
    }
    const items = await searcher(keyword);
    pageCache.set(key, items);
    const first = items[0];
    if (first) {
      seenSources.set(first.sourceId, {
        sourceId: first.sourceId,
        sourceName: first.sourceName,
        marketType: first.marketType,
      });
    }
    log(`  ${sourceId} search "${keyword}": ${items.length} listings`);
    return items;
  };

  for (const target of SURVEY_TARGETS) {
    const comparable: Comparable[] = [];
    const readFailures: string[] = [];
    const allRead: ListingItem[] = [];
    let readCount = 0;

    for (const sourceTarget of target.sources) {
      const servedRegions = SOURCE_REGIONS[sourceTarget.sourceId] ?? [];
      if (!servedRegions.includes(region)) {
        readFailures.push(
          `${sourceTarget.sourceId}: does not serve ${region} (serves ${servedRegions.join(', ') || 'unknown'})`,
        );
        continue;
      }
      for (const slug of sourceTarget.categories) {
        let items: readonly ListingItem[];
        try {
          items = await readCategory(sourceTarget.sourceId, slug, region);
        } catch (error) {
          // A seller that blocks or fails is reported, not treated as empty.
          readFailures.push(
            `${sourceTarget.sourceId}/${slug}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        readCount += items.length;
        allRead.push(...items);
        for (const item of items) {
          if (!isCandidate(item, target)) {
            continue;
          }
          const resolved = resolveCandidate(item, target);
          if (resolved) {
            comparable.push({ item, ...resolved });
          }
        }
      }

      for (const keyword of sourceTarget.searchKeywords ?? []) {
        const searcher = SOURCE_SEARCHERS[sourceTarget.sourceId];
        if (!searcher) {
          continue;
        }
        let items: readonly ListingItem[];
        try {
          items = await readSearch(sourceTarget.sourceId, keyword, searcher);
        } catch (error) {
          readFailures.push(
            `${sourceTarget.sourceId} search "${keyword}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          continue;
        }
        readCount += items.length;
        allRead.push(...items);
        for (const item of items) {
          if (!isCandidate(item, target)) {
            continue;
          }
          const resolved = resolveCandidate(item, target);
          if (resolved) {
            comparable.push({ item, ...resolved });
          }
        }
      }
    }

    if (comparable.length === 0) {
      // Report near misses, not just a count: a product that exists but cannot
      // be converted is a decision for a human, not a silent absence.
      const nearMisses = nearMissesByBaseUnit(allRead, target);
      unmatched.push({
        ingredientId: target.ingredientId,
        seedName: target.seedName,
        reason:
          readFailures.length > 0
            ? `read failures: ${[...new Set(readFailures)].join('; ')}`
            : nearMisses.length > 0
              ? `no ${target.baseUnit}-comparable product; closest: ${nearMisses.join(', ')}`
              : `${readCount} listings read, none comparable in ${target.baseUnit}`,
      });
      continue;
    }

    comparable.sort((a, b) => a.unitCostVnd - b.unitCostVnd);
    const best = comparable[0];
    if (!best) {
      continue;
    }

    // Best offer per seller, so the spread is visible in the review table.
    const bySource = new Map<string, Comparable>();
    for (const entry of comparable) {
      if (!bySource.has(entry.item.sourceId)) {
        bySource.set(entry.item.sourceId, entry);
      }
    }
    const quotes = [...bySource.values()].map((entry) => ({
      sourceId: entry.item.sourceId,
      sourceName: entry.item.sourceName,
      marketType: entry.item.marketType,
      productName: entry.item.name,
      unitCostVnd: entry.unitCostVnd,
      packLabel: entry.packLabel,
    }));
    const cheapestQuote = quotes.reduce(
      (min, quote) => Math.min(min, quote.unitCostVnd),
      Number.POSITIVE_INFINITY,
    );
    const dearestQuote = quotes.reduce(
      (max, quote) => Math.max(max, quote.unitCostVnd),
      0,
    );
    const spreadPercent =
      quotes.length > 1 && cheapestQuote > 0
        ? Math.round(((dearestQuote - cheapestQuote) / cheapestQuote) * 100)
        : null;

    observations.push({
      ingredientId: target.ingredientId,
      seedName: target.seedName,
      sourceId: best.item.sourceId,
      sourceName: best.item.sourceName,
      region,
      marketType: best.item.marketType,
      productName: best.item.name,
      packPriceVnd: best.item.priceVnd,
      listPriceVnd: best.item.listPriceVnd,
      unitCostVnd: best.unitCostVnd,
      baseUnit: best.baseUnit,
      packLabel: best.packLabel,
      quotes,
      spreadPercent,
      alternatives: comparable
        .filter((entry) => entry !== best)
        .slice(0, 4)
        .map((entry) => ({
          sourceName: entry.item.sourceName,
          marketType: entry.item.marketType,
          productName: entry.item.name,
          unitCostVnd: entry.unitCostVnd,
        })),
    });
  }

  return {
    observedAt: isoDay(now),
    region,
    sources: [...seenSources.values()],
    observations,
    unmatched,
  };
}

/** Render the generated module. Kept pure so it can be reviewed in a test. */
export function renderGeneratedModule(result: SurveyResult): string {
  const lines: string[] = [];
  const sellerList = result.sources
    .map((source) => `${source.sourceName} (${source.marketType})`)
    .join(', ');

  lines.push('/**');
  lines.push(' * GENERATED FILE — do not edit by hand.');
  lines.push(' *');
  lines.push(' * Produced by `npm run market:survey`, which surveys public listings.');
  lines.push(' *');
  lines.push(' * Each observation records the seller AND its `marketType`. A wholesale');
  lines.push(' * observation comes from a business supplier and is close to a real');
  lines.push(' * purchase cost. A retail observation is a street-price reference only:');
  lines.push(' * a shop pays wholesale, typically well below a retail listing. The Seed');
  lines.push(' * carries these so the demo uses sourced values instead of invented');
  lines.push(' * ones, and so a real shop can compare its own invoices against them.');
  lines.push(' *');
  lines.push(` * Sellers: ${sellerList}`);
  lines.push(` * Observed: ${result.observedAt}`);
  lines.push(` * Region: ${result.region}`);
  lines.push(' */');
  lines.push("import type { PackBaseUnit } from './market-prices/pack-size.js';");
  lines.push("import type { MarketType } from './market-prices/listing.js';");
  lines.push('');
  lines.push('export interface MarketPriceQuote {');
  lines.push('  readonly sourceId: string;');
  lines.push('  readonly sourceName: string;');
  lines.push('  readonly marketType: MarketType;');
  lines.push('  readonly productName: string;');
  lines.push('  readonly unitCostVnd: number;');
  lines.push('  readonly packLabel: string;');
  lines.push('}');
  lines.push('');
  lines.push('export interface MarketPriceObservation {');
  lines.push('  readonly ingredientId: string;');
  lines.push('  readonly seedName: string;');
  lines.push('  readonly sourceId: string;');
  lines.push('  readonly sourceName: string;');
  lines.push('  readonly region: string;');
  lines.push('  readonly marketType: MarketType;');
  lines.push('  readonly productName: string;');
  lines.push('  readonly packPriceVnd: number;');
  lines.push('  readonly listPriceVnd: number | null;');
  lines.push('  readonly unitCostVnd: number;');
  lines.push('  readonly baseUnit: PackBaseUnit;');
  lines.push('  readonly packLabel: string;');
  lines.push('  readonly quotes: readonly MarketPriceQuote[];');
  lines.push('  readonly spreadPercent: number | null;');
  lines.push('  readonly alternatives: readonly { readonly sourceName: string; readonly marketType: MarketType; readonly productName: string; readonly unitCostVnd: number }[];');
  lines.push('}');
  lines.push('');
  lines.push('export const MARKET_PRICE_SURVEY = {');
  lines.push(`  observedAt: '${result.observedAt}',`);
  lines.push(`  region: '${result.region}',`);
  lines.push('  marketType: \'retail\' satisfies MarketType,');
  lines.push('  sources: [');
  for (const source of result.sources) {
    lines.push(
      `    { sourceId: '${source.sourceId}', sourceName: ${JSON.stringify(source.sourceName)}, marketType: '${source.marketType}' },`,
    );
  }
  lines.push('  ],');
  lines.push('  observations: [');
  for (const observation of result.observations) {
    lines.push('    {');
    lines.push(`      ingredientId: '${observation.ingredientId}',`);
    lines.push(`      seedName: '${observation.seedName}',`);
    lines.push(`      sourceId: '${observation.sourceId}',`);
    lines.push(`      sourceName: ${JSON.stringify(observation.sourceName)},`);
    lines.push(`      region: '${observation.region}',`);
    lines.push(`      marketType: '${observation.marketType}',`);
    lines.push(`      productName: ${JSON.stringify(observation.productName)},`);
    lines.push(`      packPriceVnd: ${observation.packPriceVnd},`);
    lines.push(`      listPriceVnd: ${observation.listPriceVnd ?? 'null'},`);
    lines.push(`      unitCostVnd: ${observation.unitCostVnd},`);
    lines.push(`      baseUnit: '${observation.baseUnit}',`);
    lines.push(`      packLabel: ${JSON.stringify(observation.packLabel)},`);
    lines.push('      quotes: [');
    for (const quote of observation.quotes) {
      lines.push(
        `        { sourceId: '${quote.sourceId}', sourceName: ${JSON.stringify(quote.sourceName)}, marketType: '${quote.marketType}', productName: ${JSON.stringify(quote.productName)}, unitCostVnd: ${quote.unitCostVnd}, packLabel: ${JSON.stringify(quote.packLabel)} },`,
      );
    }
    lines.push('      ],');
    lines.push(`      spreadPercent: ${observation.spreadPercent ?? 'null'},`);
    lines.push('      alternatives: [');
    for (const alternative of observation.alternatives) {
      lines.push(
        `        { sourceName: ${JSON.stringify(alternative.sourceName)}, marketType: '${alternative.marketType}', productName: ${JSON.stringify(alternative.productName)}, unitCostVnd: ${alternative.unitCostVnd} },`,
      );
    }
    lines.push('      ],');
    lines.push('    },');
  }
  lines.push('  ],');
  lines.push('} as const;');
  lines.push('');
  return lines.join('\n');
}

/**
 * Fold one survey per region into a single result. Observations keep their own
 * region, so a Seed can pick the region a shop actually buys in instead of
 * treating a Hanoi price and a Saigon price as interchangeable.
 */
export function mergeRegions(results: readonly SurveyResult[]): SurveyResult {
  const first = results[0];
  if (!first) {
    throw new Error('at least one region result is required');
  }
  const observations = results.flatMap((result) => result.observations);
  const sources = new Map<string, SurveyResult['sources'][number]>();
  for (const result of results) {
    for (const source of result.sources) {
      sources.set(source.sourceId, source);
    }
  }
  return {
    observedAt: first.observedAt,
    region: results.map((result) => result.region).join('+'),
    sources: [...sources.values()],
    observations,
    unmatched: results.flatMap((result) =>
      result.unmatched.map((entry) => ({
        ...entry,
        seedName: `${entry.seedName} [${result.region}]`,
      })),
    ),
  };
}

/**
 * Print the same ingredient side by side across regions. This is the table that
 * answers "is a Hanoi price the same as a Saigon price" with evidence.
 */
function printRegionComparison(result: SurveyResult): void {
  const regions = [...new Set(result.observations.map((entry) => entry.region))];
  if (regions.length < 2) {
    return;
  }
  const byIngredient = new Map<string, Map<string, Observation>>();
  for (const observation of result.observations) {
    const bucket = byIngredient.get(observation.seedName) ?? new Map();
    bucket.set(observation.region, observation);
    byIngredient.set(observation.seedName, bucket);
  }

  console.log(
    '\nSo sánh vùng. Cột cuối cho biết hai vùng có đang so CÙNG một sản phẩm không:',
  );
  console.log(
    '  ' +
      'Nguyên liệu'.padEnd(18) +
      regions.map((r) => r.padEnd(20)).join('') +
      'Lệch'.padEnd(8) +
      'Cùng SP?',
  );
  for (const [seedName, bucket] of byIngredient) {
    const entries = regions.map((region) => bucket.get(region) ?? null);
    const present = entries.filter(
      (entry): entry is Observation => entry !== null,
    );
    if (present.length < 2) {
      continue;
    }
    const costs = present.map((entry) => entry.unitCostVnd);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const gap = min > 0 ? Math.round(((max - min) / min) * 100) : 0;
    // The same seller AND the same product name is the only case where the gap
    // is a pure regional price difference. Anything else compares two different
    // products, so the gap also reflects grade, variety, or pack size.
    const sameProduct =
      present.length === regions.length &&
      present.every(
        (entry) =>
          entry.productName === present[0]?.productName &&
          entry.sourceId === present[0]?.sourceId,
      );
    console.log(
      '  ' +
        seedName.padEnd(18) +
        entries
          .map((entry) =>
            (entry === null
              ? '—'
              : `${formatVnd(entry.unitCostVnd)} ${entry.sourceId.slice(0, 7)}`
            ).padEnd(20),
          )
          .join('') +
        `${gap}%`.padEnd(8) +
        (sameProduct ? 'có' : 'không (khác SP/nguồn)'),
    );
  }
}

function formatVnd(value: number): string {
  return value.toLocaleString('vi-VN');
}

function printReviewTable(result: SurveyResult): void {
  console.log(`\nKhảo sát giá — ${result.observedAt} — vùng ${result.region}`);
  console.log(
    `Nguồn: ${result.sources.map((source) => source.sourceName).join(', ')}\n`,
  );
  console.log(
    'Nguyên liệu'.padEnd(18) +
      'Nơi rẻ nhất'.padEnd(22) +
      'Loại'.padEnd(11) +
      'Sản phẩm'.padEnd(34) +
      'Đơn giá',
  );
  for (const observation of result.observations) {
    console.log(
      observation.seedName.padEnd(18) +
        observation.sourceName.slice(0, 20).padEnd(22) +
        observation.marketType.padEnd(11) +
        observation.productName.slice(0, 32).padEnd(34) +
        `${formatVnd(observation.unitCostVnd)}/${observation.baseUnit}`,
    );
  }

  printRegionComparison(result);

  const wholesale = result.observations.filter(
    (observation) => observation.marketType === 'wholesale',
  ).length;
  console.log(
    `\n  ${wholesale}/${result.observations.length} nguyên liệu lấy được giá bán buôn.`,
  );

  const spreads = result.observations.filter(
    (observation) => observation.quotes.length > 1,
  );
  if (spreads.length > 0) {
    console.log('\nChênh lệch giữa các nơi bán (cùng quy đổi):');
    for (const observation of spreads) {
      const sorted = [...observation.quotes].sort(
        (a, b) => a.unitCostVnd - b.unitCostVnd,
      );
      const cheapest = sorted[0];
      const dearest = sorted[sorted.length - 1];
      if (!cheapest || !dearest || cheapest.unitCostVnd === 0) {
        continue;
      }
      const gap = Math.round(
        ((dearest.unitCostVnd - cheapest.unitCostVnd) / cheapest.unitCostVnd) * 100,
      );
      console.log(
        `  ${observation.seedName}: ${sorted
          .map((quote) => `${quote.sourceName} ${formatVnd(quote.unitCostVnd)}`)
          .join('  vs  ')}  (lệch ${gap}%)`,
      );
    }
  }

  if (result.unmatched.length > 0) {
    console.log('\nKhông tìm được sản phẩm tương đương:');
    const availabilityOnly = result.unmatched.filter((entry) =>
      entry.reason.includes('does not serve'),
    );
    for (const entry of result.unmatched) {
      if (availabilityOnly.includes(entry)) {
        continue;
      }
      console.log(`  - ${entry.seedName}: ${entry.reason}`);
    }
    if (availabilityOnly.length > 0) {
      const regionsAffected = [
        ...new Set(
          availabilityOnly.map(
            (entry) => entry.seedName.match(/\[([^\]]+)\]$/)?.[1] ?? '?',
          ),
        ),
      ];
      console.log(
        `  - ${availabilityOnly.length} nguyên liệu khác ở vùng ` +
          `${regionsAffected.join(', ')}: chỉ Kamereo phục vụ vùng đó, ` +
          'WinMart và Co.op Online là chuỗi miền Nam.',
      );
    }
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const regionArg = process.argv.find((arg) => arg.startsWith('--region='));
  const regions = (
    regionArg ? regionArg.slice('--region='.length) : DEFAULT_KAMEREO_REGION
  )
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => value.length > 0);

  console.log(`Đang khảo sát bảng giá công khai (vùng ${regions.join(', ')})...`);
  const perRegion: SurveyResult[] = [];
  for (const region of regions) {
    perRegion.push(
      await collectSurvey(new Date(), (message) => console.log(message), region),
    );
  }
  const result = mergeRegions(perRegion);
  printReviewTable(result);

  if (dryRun) {
    console.log('\n--dry-run: không ghi file.');
    return;
  }

  writeFileSync(OUTPUT_PATH, renderGeneratedModule(result), 'utf8');
  console.log(`\nĐã ghi ${OUTPUT_PATH}`);
  console.log(
    'Giá bán buôn gần với giá vốn nhưng vẫn không phải hoá đơn của quán. ' +
      'Xem lại diff trước khi dùng cho Seed.',
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
