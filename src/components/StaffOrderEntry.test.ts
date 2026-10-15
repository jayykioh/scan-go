import { describe, expect, it } from 'vitest';
import type { PublicMenuItem } from '@contracts/catalog.contract';
import { filterAvailableItems } from './StaffOrderEntry';

function item(overrides: Partial<PublicMenuItem>): PublicMenuItem {
  return {
    schemaVersion: 1,
    menuItemId: 'item-1',
    tenantId: 'tenant-1',
    name: 'Phở bò',
    description: null,
    category: 'Món chính',
    type: null,
    priceVnd: 45000,
    imageUrl: null,
    modifierGroups: [],
    isAvailable: true,
    updatedAt: '2026-10-14T00:00:00.000Z',
    ...overrides,
  };
}

/** REQ-WAI-002: the Waiter searches the dish list in the table dialog. */
describe('filterAvailableItems', () => {
  const items = [
    item({ menuItemId: 'a', name: 'Phở bò' }),
    item({ menuItemId: 'b', name: 'Bún chả' }),
    item({ menuItemId: 'c', name: 'Trà đá', isAvailable: false }),
  ];

  it('keeps every available dish for an empty or blank query', () => {
    expect(filterAvailableItems(items, '').map((entry) => entry.menuItemId)).toEqual(['a', 'b']);
    expect(filterAvailableItems(items, '   ').map((entry) => entry.menuItemId)).toEqual(['a', 'b']);
  });

  it('matches a name ignoring case and never returns an unavailable dish', () => {
    expect(filterAvailableItems(items, 'bún').map((entry) => entry.menuItemId)).toEqual(['b']);
    expect(filterAvailableItems(items, 'BÒ').map((entry) => entry.menuItemId)).toEqual(['a']);
    expect(filterAvailableItems(items, 'trà')).toEqual([]);
  });

  it('returns nothing when no dish matches', () => {
    expect(filterAvailableItems(items, 'cơm')).toEqual([]);
  });
});
