/**
 * Co.op Online public listing client.
 *
 * The category page is server-rendered and embeds its product list in the
 * Next.js `__NEXT_DATA__` payload, so one plain request per category is enough
 * — no browser session and no HTML scraping of the visual layout.
 *
 * Co.op Online is a second retail reference. A second seller matters because a
 * single listing's "cheapest" can be an outlier: the two chains disagree by a
 * wide margin on several fresh items, and a reviewer can only see that when
 * both are recorded.
 */
import {
  isBulkMeasureUom,
  normalizeName,
  type ListingItem,
} from './listing.js';

const SITE_BASE = 'https://cooponline.vn';

export const COOP_SOURCE_ID = 'cooponline';
export const COOP_SOURCE_NAME = 'Co.op Online';

const USER_AGENT =
  'ScanGoPriceSurvey/1.0 (+https://github.com/; internal cost survey)';

const REQUEST_SPACING_MS = 1200;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;

export interface CoopPage {
  readonly items: readonly ListingItem[];
  readonly url: string;
  /** Pages the seller reports for this category, or null when unknown. */
  readonly totalPages: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Pull every product object out of the embedded payload.
 *
 * The walk is structural rather than path-based because Next.js moves the
 * payload between builds; a product is recognized by carrying a `sku`, a
 * `name`, and a `price` object with `latestPrice`.
 */
export function extractCoopProducts(
  payload: unknown,
  region = 'HCM',
): ListingItem[] {
  const found: ListingItem[] = [];

  const walk = (node: unknown, sourceUrl: string): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child, sourceUrl);
      }
      return;
    }
    const record = node as Record<string, unknown>;
    const name = normalizeName(
      typeof record.name === 'string' ? record.name : '',
    );
    const sku = typeof record.sku === 'string' ? record.sku : '';
    const price = record.price as Record<string, unknown> | undefined;
    const latestPrice = price ? readNumber(price.latestPrice) : null;

    if (name && sku && latestPrice !== null && latestPrice > 0) {
      const listPrice = price ? readNumber(price.supplierRetailPrice) : null;
      const uom = typeof record.uom === 'string' ? record.uom : '';
      found.push({
        sourceId: COOP_SOURCE_ID,
        sourceName: COOP_SOURCE_NAME,
        marketType: 'retail',
        id: sku,
        name,
        uom,
        priceVnd: latestPrice,
        listPriceVnd:
          listPrice !== null && listPrice > latestPrice ? listPrice : null,
        sourceUrl,
        region,
        isBulkMeasure: isBulkMeasureUom(uom) !== null,
      });
    }

    for (const key of Object.keys(record)) {
      walk(record[key], sourceUrl);
    }
  };

  walk(payload, SITE_BASE);
  return found;
}

/** Read one category page and return its normalized listings. */
export async function fetchCoopCategory(
  slug: string,
  page = 1,
  region = 'HCM',
): Promise<CoopPage> {
  const url = page > 1 ? `${SITE_BASE}/c/${slug}?page=${page}` : `${SITE_BASE}/c/${slug}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'vi,en',
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const html = await response.text();
      const match = html.match(
        /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
      );
      if (!match?.[1]) {
        throw new Error('category page carried no embedded product payload');
      }
      const payload = JSON.parse(match[1]) as unknown;
      const items = extractCoopProducts(payload, region);
      await sleep(REQUEST_SPACING_MS);
      return { items, url, totalPages: readTotalPages(payload) };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(REQUEST_SPACING_MS * attempt);
      }
    }
  }

  throw new Error(
    `Co.op Online category "${slug}" could not be read: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * Read the seller's own page count so the survey never requests past the end.
 * A category here can hold hundreds of products across many pages, and reading
 * only the first page silently limits which prices are discoverable.
 */
export function readTotalPages(payload: unknown): number | null {
  let found: number | null = null;
  const walk = (node: unknown): void => {
    if (found !== null || node === null || typeof node !== 'object') {
      return;
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }
    const record = node as Record<string, unknown>;
    const total = record.totalPages;
    if (typeof total === 'number' && Number.isInteger(total) && total > 0) {
      found = total;
      return;
    }
    for (const key of Object.keys(record)) {
      walk(record[key]);
    }
  };
  walk(payload);
  return found;
}
