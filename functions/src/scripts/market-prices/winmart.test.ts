/**
 * WinMart search-mapper tests.
 *
 * These pin the defect that mattered most: the search endpoint writes the pack
 * weight into `uomName` (`0.385KG`) while `uom` still says `KG`. Reading `uom`
 * alone priced a 385g pack of minced pork as if the price bought a kilogram,
 * understating Cost by 2.6x. The same product read from the category endpoint
 * carries `uomName: "Kg"` and a per-kilogram price.
 */
import { describe, expect, it } from 'vitest';
import { mapWinmartSearchItem } from './winmart.js';

function searchRow(overrides: Record<string, unknown> = {}): unknown {
  return {
    sku: '10617947KG',
    description: 'MEATDELI Thịt heo xay chuẩn ngon (S)',
    uom: 'KG',
    uomName: '0.385KG',
    mch1Name: 'Thực phẩm',
    mch2Name: 'Thực phẩm Tươi sống, Chế biến',
    mch3Name: 'Thịt',
    price: { originPrice: 54632, salePrice: 54632 },
    ...overrides,
  };
}

describe('mapWinmartSearchItem pack weight', () => {
  it('treats a declared pack weight as a pack, not a kilogram', () => {
    const item = mapWinmartSearchItem(searchRow(), 'https://example.test');
    expect(item).not.toBeNull();
    // 54.632 VND buys 385g, so this is NOT a per-kilogram price.
    expect(item?.isBulkMeasure).toBe(false);
    // The weight is folded into the name so the shared parser can read it.
    expect(item?.name).toContain('0.385KG');
  });

  it('keeps a bare kilogram label as a bulk measure', () => {
    const item = mapWinmartSearchItem(
      searchRow({ uomName: 'Kg', price: { originPrice: 141900, salePrice: 141900 } }),
      'https://example.test',
    );
    expect(item?.isBulkMeasure).toBe(true);
    expect(item?.name).toBe('MEATDELI Thịt heo xay chuẩn ngon (S)');
  });

  it('treats a declared one-kilogram pack as a bulk measure', () => {
    const item = mapWinmartSearchItem(
      searchRow({ uomName: '1KG' }),
      'https://example.test',
    );
    expect(item?.isBulkMeasure).toBe(true);
  });

  it('prefers the selling price and keeps the list price', () => {
    const item = mapWinmartSearchItem(
      searchRow({ price: { originPrice: 100000, salePrice: 80000 } }),
      'https://example.test',
    );
    expect(item?.priceVnd).toBe(80000);
    expect(item?.listPriceVnd).toBe(100000);
  });

  it('carries the seller category path for the department filter', () => {
    const item = mapWinmartSearchItem(searchRow(), 'https://example.test');
    expect(item?.categoryPath?.join(' > ')).toContain('Tươi sống');
  });

  it('drops a row with no usable name or price', () => {
    expect(
      mapWinmartSearchItem(searchRow({ description: '' }), 'https://example.test'),
    ).toBeNull();
    expect(
      mapWinmartSearchItem(
        searchRow({ price: { originPrice: 0, salePrice: 0 } }),
        'https://example.test',
      ),
    ).toBeNull();
  });
});
