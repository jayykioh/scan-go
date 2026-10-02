import { describe, expect, it } from 'vitest';
import {
  privateMenuItemFixture,
  publicMenuItemFixture,
} from '@shared/fixtures/catalog.fixture';
import {
  pendingOrderFixture,
  publicOrderTrackingFixture,
} from '@shared/fixtures/order.fixture';
import { loyaltyMemberViewFixture } from '@shared/fixtures/loyalty.fixture';
import {
  catalogMenuItemSchema,
  publicMenuItemSchema,
} from '@contracts/catalog.contract';
import {
  toOwnerMenuItem,
  toPublicMenuItem,
  toTrackingOrder,
  toViewLoyaltyMember,
  toViewOrder,
} from './view-mappers';

/**
 * P0-005/P0-007 client evidence: the views render the server projection shapes
 * without inventing money or private fields.
 */
describe('toOwnerMenuItem', () => {
  it('maps a private item with integer VND and availability', () => {
    expect(catalogMenuItemSchema.safeParse(privateMenuItemFixture).success).toBe(true);
    const item = toOwnerMenuItem(privateMenuItemFixture);
    expect(item.id).toBe(privateMenuItemFixture.menuItemId);
    expect(item.price).toBe(privateMenuItemFixture.priceVnd);
    expect(item.costPrice).toBe(privateMenuItemFixture.costPriceVnd);
    expect(item.inStock).toBe(true);
    expect(Number.isInteger(item.price)).toBe(true);
  });
});

describe('toPublicMenuItem', () => {
  it('maps the public projection without cost or stock', () => {
    expect(publicMenuItemSchema.safeParse(publicMenuItemFixture).success).toBe(true);
    const item = toPublicMenuItem(publicMenuItemFixture);
    expect(item.id).toBe(publicMenuItemFixture.menuItemId);
    expect(item.price).toBe(publicMenuItemFixture.priceVnd);
    expect(item.costPrice).toBe(0);
    expect(item.toppings?.length).toBe(2);
  });
});

describe('toViewOrder', () => {
  it('maps a server Order snapshot to the cross-view model', () => {
    const order = toViewOrder(pendingOrderFixture);
    expect(order.id).toBe(pendingOrderFixture.orderId);
    expect(order.tableId).toBe(pendingOrderFixture.tableId);
    expect(order.total).toBe(pendingOrderFixture.totalVnd);
    expect(order.status).toBe('pending');
    expect(order.paymentMode).toBe('Pay-Later');
    expect(order.items[0].menuId).toBe(pendingOrderFixture.items[0].menuItemId);
  });

  it('marks a Pay-First Order as paid for the Kitchen gate', () => {
    const order = toViewOrder({ ...pendingOrderFixture, paymentMode: 'payFirst' });
    expect(order.paymentMode).toBe('Pay-First');
    expect(order.paidAt).toBe(pendingOrderFixture.updatedAt);
  });
});

describe('toTrackingOrder', () => {
  it('maps the public tracking projection onto the Customer view model', () => {
    const order = toTrackingOrder(publicOrderTrackingFixture);
    expect(order.id).toBe(publicOrderTrackingFixture.orderId);
    expect(order.total).toBe(publicOrderTrackingFixture.totalVnd);
    expect(order.status).toBe(publicOrderTrackingFixture.status);
    expect('customerPhone' in order).toBe(false);
  });
});

describe('toViewLoyaltyMember', () => {
  it('maps the permission-filtered member view to the Owner model', () => {
    const member = toViewLoyaltyMember(loyaltyMemberViewFixture);
    expect(member.phone).toBe(loyaltyMemberViewFixture.phone);
    expect(member.points).toBe(loyaltyMemberViewFixture.pointBalance);
    expect(member.totalSpent).toBe(loyaltyMemberViewFixture.paidTotalVnd);
    expect(member.visits).toBe(loyaltyMemberViewFixture.visitCount);
  });

  it('falls back to the opaque member id when the server hides the phone', () => {
    const member = toViewLoyaltyMember({
      ...loyaltyMemberViewFixture,
      phone: null,
      phoneVisible: false,
    });
    expect(member.phone).toBe(loyaltyMemberViewFixture.memberId);
  });
});
