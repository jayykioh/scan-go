/**
 * WinMart public listing client.
 *
 * The storefront's own category page reads `item/category`, so the survey reads
 * the same endpoint the browser does rather than parsing rendered HTML. One
 * request per category, spaced and bounded: this is a price survey, not a crawl.
 */
import {
  isBulkMeasureUom,
  normalizeName,
  type ListingItem,
} from './listing.js';
import { parsePackSize } from './pack-size.js';

const API_BASE = 'https://api-crownx.winmart.vn';

/** The storefront store code observed on the public web listing. */
export const DEFAULT_STORE_CODE = '1535';
export const DEFAULT_STORE_GROUP_CODE = '1998';

export const WINMART_SOURCE_ID = 'winmart';
export const WINMART_SOURCE_NAME = 'WinMart';

const USER_AGENT =
  'ScanGoPriceSurvey/1.0 (+https://github.com/; internal cost survey)';

/** Delay between listing requests so the survey stays a light load. */
const REQUEST_SPACING_MS = 1200;
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export interface WinmartPage {
  readonly items: readonly ListingItem[];
  /** Request URL, kept as provenance for every observation taken from it. */
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

function mapItem(
  raw: unknown,
  sourceUrl: string,
  region: string,
): ListingItem | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const name = normalizeName(
    typeof record.name === 'string' ? record.name : '',
  );
  const price = readNumber(record.price);
  if (!name || price === null || price <= 0) {
    return null;
  }
  const salePrice = readNumber(record.salePrice);
  const sellingPrice = salePrice !== null && salePrice > 0 ? salePrice : price;
  const uom = typeof record.uom === 'string' ? record.uom : '';

  return {
    sourceId: WINMART_SOURCE_ID,
    sourceName: WINMART_SOURCE_NAME,
    marketType: 'retail',
    id: typeof record.id === 'string' ? record.id : '',
    name,
    uom,
    priceVnd: sellingPrice,
    listPriceVnd: sellingPrice < price ? price : null,
    sourceUrl,
    region,
    isBulkMeasure: isBulkMeasureUom(uom) !== null,
  };
}

/**
 * Read one category page. Retries a transient failure, then throws so the
 * caller can report the category as unread rather than silently empty.
 */
export async function fetchWinmartCategory(
  slug: string,
  page = 1,
  _region = 'HCM',
  options: {
    pageSize?: number;
    storeCode?: string;
    storeGroupCode?: string;
  } = {},
): Promise<WinmartPage> {
  const params = new URLSearchParams({
    orderByDesc: 'true',
    pageNumber: String(page),
    pageSize: String(options.pageSize ?? 50),
    slug,
    storeCode: options.storeCode ?? DEFAULT_STORE_CODE,
    storeGroupCode: options.storeGroupCode ?? DEFAULT_STORE_GROUP_CODE,
  });
  const url = `${API_BASE}/it/api/web/v3/item/category?${params.toString()}`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          Origin: 'https://winmart.vn',
          Referer: 'https://winmart.vn/',
          'User-Agent': USER_AGENT,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const body = (await response.json()) as {
        data?: { items?: unknown[] };
        paging?: { totalPages?: unknown };
      };
      const items = Array.isArray(body.data?.items)
        ? body.data.items
            .map((item) => mapItem(item, url, _region))
            .filter((item): item is ListingItem => item !== null)
        : [];
      const totalPages =
        typeof body.paging?.totalPages === 'number' &&
        Number.isInteger(body.paging.totalPages) &&
        body.paging.totalPages > 0
          ? body.paging.totalPages
          : null;
      await sleep(REQUEST_SPACING_MS);
      return { items, url, totalPages };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(REQUEST_SPACING_MS * attempt);
      }
    }
  }

  throw new Error(
    `WinMart category "${slug}" could not be read: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * Keyword search on the storefront.
 *
 * Category browsing misses ingredients the seller files elsewhere: neither
 * chain's produce category carried a common tomato or a pineapple, yet both
 * sell them. Search is the reliable way to reach a named ingredient, and it
 * returns the same fields as the category endpoint.
 */
export async function searchWinmart(
  keyword: string,
  options: {
    pageSize?: number;
    storeCode?: string;
    storeGroupCode?: string;
    region?: string;
  } = {},
): Promise<WinmartPage> {
  const url = `${API_BASE}/ss/api/v2/public/winmart/item-search`;
  const body = {
    keyword,
    pageNumber: 1,
    storeNo: options.storeCode ?? DEFAULT_STORE_CODE,
    storeGroupCode: options.storeGroupCode ?? DEFAULT_STORE_GROUP_CODE,
    pageSize: options.pageSize ?? 50,
    applicationType: 'Winmart',
  };

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-api-merchant': 'WCM',
          Origin: 'https://winmart.vn',
          Referer: 'https://winmart.vn/',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as {
        data?: unknown;
        paging?: { totalPages?: unknown };
      };
      const raw = Array.isArray(payload.data) ? payload.data : [];
      const items = raw
        .map((item) => mapWinmartSearchItem(item, url, options.region ?? 'HCM'))
        .filter((item): item is ListingItem => item !== null);
      const totalPages =
        typeof payload.paging?.totalPages === 'number' &&
        Number.isInteger(payload.paging.totalPages) &&
        payload.paging.totalPages > 0
          ? payload.paging.totalPages
          : null;
      await sleep(REQUEST_SPACING_MS);
      return { items, url, totalPages };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(REQUEST_SPACING_MS * attempt);
      }
    }
  }

  throw new Error(
    `WinMart search "${keyword}" could not be read: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * Map a search hit. Search names the product `description` rather than `name`,
 * and nests the prices under `price`, unlike the category endpoint.
 *
 * The two endpoints also disagree about `uomName`. A category row writes a
 * friendly label (`Kg`, `Khay`), but a search row can write the pack weight
 * (`0.385KG`) while `uom` still says `KG`. Reading `uom` alone therefore priced
 * a 385g pack of minced pork as if 54.632 VND bought a kilogram — a 2.6x
 * understatement of Cost. When `uomName` carries a quantity it is folded into
 * the name so the shared pack parser handles it.
 */
export function mapWinmartSearchItem(
  raw: unknown,
  sourceUrl: string,
  region = 'HCM',
): ListingItem | null {
  if (typeof raw !== 'object' || raw === null) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  const description = normalizeName(
    typeof record.description === 'string' ? record.description : '',
  );
  const price = record.price as Record<string, unknown> | undefined;
  const origin = price ? readNumber(price.originPrice) : null;
  const sale = price ? readNumber(price.salePrice) : null;
  const selling = sale !== null && sale > 0 ? sale : origin;
  if (!description || selling === null || selling <= 0) {
    return null;
  }
  const uom = typeof record.uom === 'string' ? record.uom : '';
  const uomName = typeof record.uomName === 'string' ? record.uomName : '';

  // `uomName` is a pack weight only when it parses to a quantity of measure.
  // A friendly label such as `Kg` or `Khay` parses to nothing.
  const declaredPack = parsePackSize(uomName);
  const packIsOneMeasureUnit =
    declaredPack !== null &&
    declaredPack.confidence === 'high' &&
    ((declaredPack.baseUnit === 'g' && declaredPack.quantity === 1000) ||
      (declaredPack.baseUnit === 'ml' && declaredPack.quantity === 1000));

  const name = declaredPack ? `${description} ${uomName}` : description;
  const categoryPath = ['mch1Name', 'mch2Name', 'mch3Name', 'mch4Name', 'mch5Name']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return {
    sourceId: WINMART_SOURCE_ID,
    sourceName: WINMART_SOURCE_NAME,
    marketType: 'retail',
    id: typeof record.sku === 'string' ? record.sku : '',
    name,
    uom,
    priceVnd: selling,
    listPriceVnd: origin !== null && origin > selling ? origin : null,
    sourceUrl,
    region,
    categoryPath,
    fromSearch: true,
    // A declared pack means the price buys that pack, not a bare kilogram.
    isBulkMeasure: declaredPack
      ? packIsOneMeasureUnit
      : isBulkMeasureUom(uom) !== null,
  };
}

/** Category slugs the storefront exposes, used to validate the survey map. */
export async function fetchWinmartCategorySlugs(): Promise<Set<string>> {
  const response = await fetch(`${API_BASE}/mt/api/web/v1/category`, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://winmart.vn',
      'User-Agent': USER_AGENT,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const body = (await response.json()) as { data?: unknown };
  const slugs = new Set<string>();

  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) {
      return;
    }
    for (const node of nodes) {
      if (typeof node !== 'object' || node === null) {
        continue;
      }
      const record = node as Record<string, unknown>;
      const parent = record.parent as Record<string, unknown> | undefined;
      if (parent && typeof parent.seoName === 'string') {
        slugs.add(parent.seoName);
      }
      walk(record.lstChild);
    }
  };
  walk(body.data);
  return slugs;
}
