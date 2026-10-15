import { describe, expect, it } from 'vitest';
import {
  INGREDIENT_PAGE_SIZE,
  isWasteEntry,
  pageCount,
  pageSlice,
  parseBulkWasteQuantities,
} from './InventoryPanel';
import type { InventoryChangeEntry } from '@contracts/inventory.contract';

/**
 * The Kitchen and Owner inventory screens page the ingredient list instead of
 * rendering the whole catalogue (REQ-INV-001).
 */
describe('pageSlice', () => {
  const items = Array.from({ length: 23 }, (_, index) => index + 1);

  it('splits the list into ten-item pages', () => {
    expect(INGREDIENT_PAGE_SIZE).toBe(10);
    expect(pageSlice(items, 0, INGREDIENT_PAGE_SIZE)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(pageSlice(items, 1, INGREDIENT_PAGE_SIZE)).toEqual([
      11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
    expect(pageSlice(items, 2, INGREDIENT_PAGE_SIZE)).toEqual([21, 22, 23]);
  });

  it('clamps a page outside the list to the first or last real page', () => {
    expect(pageSlice(items, 99, INGREDIENT_PAGE_SIZE)).toEqual([21, 22, 23]);
    expect(pageSlice(items, -3, INGREDIENT_PAGE_SIZE)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });

  it('still reports one page when there is nothing to show', () => {
    expect(pageCount(0, INGREDIENT_PAGE_SIZE)).toBe(1);
    expect(pageCount(10, INGREDIENT_PAGE_SIZE)).toBe(1);
    expect(pageCount(11, INGREDIENT_PAGE_SIZE)).toBe(2);
    expect(pageSlice([], 0, INGREDIENT_PAGE_SIZE)).toEqual([]);
  });
});

const entry = (
  overrides: Partial<InventoryChangeEntry>,
): InventoryChangeEntry => ({
  eventId: 'evt-1',
  action: 'StockAdjusted',
  targetType: 'ingredient',
  targetId: 'ing-1',
  targetName: 'Thịt bò',
  command: 'adjustStock',
  actorType: 'member',
  role: 'kitchen',
  actorUid: 'uid-1',
  reason: 'waste',
  note: 'hết hạn',
  quantityDelta: -100,
  createdAt: '2026-10-14T02:00:00.000Z',
  ...overrides,
});

/**
 * The report view separates waste from the other inventory changes, so a stock
 * deduction with the waste reason is the only thing counted (REQ-INV-008).
 */
describe('isWasteEntry', () => {
  it('accepts a waste deduction and rejects every other change', () => {
    expect(isWasteEntry(entry({}))).toBe(true);
    expect(isWasteEntry(entry({ reason: 'manual_adjustment' }))).toBe(false);
    expect(isWasteEntry(entry({ reason: 'stock_in', quantityDelta: 500 }))).toBe(
      false,
    );
    expect(
      isWasteEntry(entry({ action: 'IngredientChanged', quantityDelta: null })),
    ).toBe(false);
  });
});

/** One bulk waste submission covers every selected ingredient (REQ-INV-009). */
describe('parseBulkWasteQuantities', () => {
  it('turns each typed quantity into a negative base-unit delta', () => {
    expect(
      parseBulkWasteQuantities(['a', 'b'], { a: '100', b: '250' }),
    ).toEqual({
      rows: [
        { ingredientId: 'a', delta: -100 },
        { ingredientId: 'b', delta: -250 },
      ],
      invalid: 0,
    });
  });

  it('skips an empty row and reports a zero, negative, or fractional one', () => {
    const result = parseBulkWasteQuantities(['a', 'b', 'c', 'd', 'e'], {
      a: '10',
      b: '   ',
      c: '0',
      d: '-5',
      e: '1.5',
    });
    expect(result.rows).toEqual([{ ingredientId: 'a', delta: -10 }]);
    expect(result.invalid).toBe(3);
  });

  it('returns nothing to send when the selection has no quantity', () => {
    expect(parseBulkWasteQuantities(['a'], {})).toEqual({ rows: [], invalid: 0 });
  });
});
