import { describe, expect, it } from 'vitest';
import {
  buildPromotionDocument,
  mapStoredPromotion,
  assertActiveOwnerMember,
} from './service.js';

const NOW = '2026-09-12T05:00:00.000Z';

describe('promotion service helpers', () => {
  it('builds an inactive promotion and archives with a timestamp', () => {
    const created = buildPromotionDocument({
      promotionId: 'promo-1',
      tenantId: 'tenant-a',
      name: 'Giảm 10%',
      priority: 3,
      startsAt: null,
      endsAt: null,
      eligibility: { minSubtotalVnd: 50000, menuItemIds: null },
      benefit: { type: 'percentOff', percent: 10, maxDiscountVnd: 20000 },
      status: 'inactive',
      now: NOW,
      createdAt: NOW,
    });
    expect(created.status).toBe('inactive');
    expect(created.archivedAt).toBeNull();

    const archived = buildPromotionDocument({
      ...created,
      promotionId: created.promotionId,
      tenantId: created.tenantId,
      name: created.name,
      priority: created.priority,
      startsAt: created.startsAt,
      endsAt: created.endsAt,
      eligibility: created.eligibility,
      benefit: created.benefit,
      status: 'archived',
      now: NOW,
      createdAt: created.createdAt,
    });
    expect(archived.archivedAt).toBe(NOW);
  });

  it('round-trips a stored promotion document', () => {
    const stored = buildPromotionDocument({
      promotionId: 'promo-2',
      tenantId: 'tenant-a',
      name: 'Giảm 20k',
      priority: 1,
      startsAt: null,
      endsAt: null,
      eligibility: { minSubtotalVnd: null, menuItemIds: ['item-1'] },
      benefit: { type: 'fixedAmount', amountVnd: 20000 },
      status: 'active',
      now: NOW,
      createdAt: NOW,
    });
    expect(mapStoredPromotion('promo-2', 'tenant-a', stored)).toEqual(stored);
  });

  it('allows only an active owner membership to manage promotions', () => {
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff', isActive: true }),
    ).toThrow();
  });
});
