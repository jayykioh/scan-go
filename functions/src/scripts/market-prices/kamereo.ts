/**
 * Kamereo public catalogue client.
 *
 * Kamereo is a business-to-business food supplier: it sells to restaurants and
 * shops, not to consumers. Its listed price is therefore the closest public
 * number to what a kitchen actually pays, which is why these observations are
 * recorded as `marketType: 'wholesale'` rather than `retail`.
 *
 * The storefront reads a GraphQL endpoint that answers catalogue queries
 * without a session, so the survey posts the same `productSearch` query the
 * category page does. One request per category page, spaced and bounded.
 */
import {
  isBulkMeasureUom,
  normalizeName,
  type ListingItem,
} from './listing.js';

const GRAPHQL_URL = 'https://e5-buyer-graphql.prod.kamereo.vn/';

export const KAMEREO_SOURCE_ID = 'kamereo';
export const KAMEREO_SOURCE_NAME = 'Kamereo (bán buôn)';

/**
 * Regions the supplier serves. Kamereo quotes a separate catalogue per region:
 * the produce category alone holds 524 products in HCM against 302 in HN, so
 * the region is part of the price, not a display preference.
 */
export const KAMEREO_REGIONS = ['HCM', 'HN'] as const;
export type KamereoRegion = (typeof KAMEREO_REGIONS)[number];

/** Region used when the caller does not name one. */
export const DEFAULT_KAMEREO_REGION: KamereoRegion = 'HCM';

const USER_AGENT =
  'ScanGoPriceSurvey/1.0 (+https://github.com/; internal cost survey)';

const REQUEST_SPACING_MS = 1200;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const PAGE_SIZE = 40;

const PRODUCT_SEARCH_QUERY = `query productSearch($sort: [ProductSort!]!, $filter: ProductFilter, $pagination: Pagination!) {
  productSearch(sort: $sort, filter: $filter, pagination: $pagination) {
    totalResults
    totalPage
    data {
      id
      name
      uom
      uomLocal
      price
      originalPrice
      category { name parent { name } }
    }
  }
}`;

export interface KamereoPage {
  readonly items: readonly ListingItem[];
  readonly url: string;
  readonly totalPages: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

interface KamereoProduct {
  id?: unknown;
  name?: unknown;
  uom?: unknown;
  uomLocal?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  category?: { name?: unknown; parent?: { name?: unknown } } | null;
}

function mapProduct(
  raw: unknown,
  sourceUrl: string,
  region: string,
): ListingItem | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as KamereoProduct;
  const name = normalizeName(
    typeof record.name === 'string' ? record.name : '',
  );
  const price = readNumber(record.price);
  if (!name || price === null || price <= 0) {
    return null;
  }
  const original = readNumber(record.originalPrice);
  const uom = typeof record.uom === 'string' ? record.uom : '';
  const uomLocal = typeof record.uomLocal === 'string' ? record.uomLocal : '';
  const categoryName =
    typeof record.category?.name === 'string' ? record.category.name : '';
  const parentName =
    typeof record.category?.parent?.name === 'string'
      ? record.category.parent.name
      : '';

  return {
    sourceId: KAMEREO_SOURCE_ID,
    sourceName: KAMEREO_SOURCE_NAME,
    marketType: 'wholesale',
    id: typeof record.id === 'string' ? record.id : '',
    // The pack size usually lives in the name, e.g. `... 500g`; the unit label
    // is kept alongside so a reviewer sees what the price buys.
    name: uomLocal && !name.includes(uomLocal) ? `${name} (${uomLocal})` : name,
    uom,
    priceVnd: price,
    listPriceVnd: original !== null && original > price ? original : null,
    sourceUrl,
    region,
    categoryPath: [parentName, categoryName].filter((value) => value.length > 0),
    // Kamereo sells by kilogram for some lines and by pack or case for others.
    isBulkMeasure: isBulkMeasureUom(uom) !== null,
  };
}

/** Read one catalogue page for a Kamereo category id. */
export async function fetchKamereoCategory(
  categoryId: string,
  page = 1,
  region: string = DEFAULT_KAMEREO_REGION,
): Promise<KamereoPage> {
  const body = JSON.stringify({
    operationName: 'productSearch',
    variables: {
      sort: [{ field: 'name', order: 'ASC' }],
      filter: { categoryIds: [Number(categoryId)], regionCode: region },
      // Kamereo paginates from zero.
      pagination: { page: page - 1, size: PAGE_SIZE },
    },
    query: PRODUCT_SEARCH_QUERY,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: 'https://kamereo.vn',
          Referer: 'https://kamereo.vn/',
          'User-Agent': USER_AGENT,
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: { productSearch?: { data?: unknown[]; totalPage?: unknown } };
        errors?: unknown;
      };
      if (payload.errors) {
        throw new Error(`GraphQL error: ${JSON.stringify(payload.errors).slice(0, 200)}`);
      }
      const search = payload.data?.productSearch;
      const raw = Array.isArray(search?.data) ? search.data : [];
      const items = raw
        .map((item) => mapProduct(item, GRAPHQL_URL, region))
        .filter((item): item is ListingItem => item !== null);
      const totalPages =
        typeof search?.totalPage === 'number' &&
        Number.isInteger(search.totalPage) &&
        search.totalPage > 0
          ? search.totalPage
          : null;
      await sleep(REQUEST_SPACING_MS);
      return { items, url: GRAPHQL_URL, totalPages };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(REQUEST_SPACING_MS * attempt);
      }
    }
  }

  throw new Error(
    `Kamereo category "${categoryId}" could not be read: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}
