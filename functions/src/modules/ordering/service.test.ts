import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  applyPromotionToOrderLines,
  assertIdempotencyMatch,
  assertUnpaidCancellableOrder,
  buildOrderCancelRequestHash,
  buildOrderLines,
  buildOrderSnapshot,
  buildOrderStaffCreateRequestHash,
  buildPublicOrderTracking,
  computeOrderTotal,
  parseOrderCancelInput,
  parseOrderStaffCreateInput,
  parseOrderSubmitInput,
  parsePublicMenuItem,
  resolveSelectedModifiers,
  resolveStaffOrderTable,
  summarizeItems,
} from './service.js';
import {
  EMPTY_PROMOTION_ELIGIBILITY,
  PROMOTION_CONTRACT_VERSION,
  type PromotionEvaluationResult,
} from '../../../../shared/contracts/promotion.contract.js';
import {
  ORDER_CONTRACT_VERSION,
  TAKEAWAY_TABLE_ID,
  TAKEAWAY_TABLE_NAME,
  orderSubmitResultSchema,
  publicOrderTrackingSchema,
} from '../../../../shared/contracts/order.contract.js';
import {
  publicMenuItemFixture,
  MENU_ITEM_ID_FIXTURE,
} from '../../../../shared/fixtures/catalog.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';
import {
  ORDER_IDEMPOTENCY_KEY_FIXTURE,
  pendingOrderFixture as orderedPendingOrderFixture,
} from '../../../../shared/fixtures/order.fixture.js';
import { mapStoredOrder } from '../fulfilment/service.js';

const OPTION_TRUNG = 'opt-trung';
const OPTION_THIT = 'opt-thit';

function publicItems() {
  return new Map([[MENU_ITEM_ID_FIXTURE, publicMenuItemFixture]]);
}

describe('resolveSelectedModifiers', () => {
  it('resolves known options and their VND deltas', () => {
    const modifiers = resolveSelectedModifiers(publicMenuItemFixture, [
      OPTION_TRUNG,
      OPTION_THIT,
    ]);
    expect(modifiers).toHaveLength(2);
    expect(modifiers.map((modifier) => modifier.priceDeltaVnd)).toEqual([
      5000, 15000,
    ]);
  });

  it('rejects an unknown option', () => {
    expect(() =>
      resolveSelectedModifiers(publicMenuItemFixture, ['opt-missing']),
    ).toThrow(HttpsError);
  });

  it('rejects a duplicate option', () => {
    expect(() =>
      resolveSelectedModifiers(publicMenuItemFixture, [OPTION_TRUNG, OPTION_TRUNG]),
    ).toThrow(HttpsError);
  });
});

describe('buildOrderLines: integer VND totals', () => {
  it('computes unit price, line total, and cost from current menu values', () => {
    const lines = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 2,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
      costByMenuItemId: new Map([[MENU_ITEM_ID_FIXTURE, 22000]]),
    });

    expect(lines[0]?.unitPriceVnd).toBe(50000);
    expect(lines[0]?.lineTotalVnd).toBe(100000);
    expect(lines[0]?.unitCostVnd).toBe(22000);
    expect(lines[0]?.lineCostVnd).toBe(44000);
    expect(Number.isInteger(lines[0]?.lineTotalVnd)).toBe(true);
  });

  it('recomputes the total when a quantity changes', () => {
    const single = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 1,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
    });
    const doubled = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 3,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
    });

    expect(computeOrderTotal(single)).toBe(50000);
    expect(computeOrderTotal(doubled)).toBe(150000);
    expect(computeOrderTotal(doubled) - computeOrderTotal(single)).toBe(100000);
  });

  it('rejects an unavailable item without a price', () => {
    const unavailable = new Map([
      [MENU_ITEM_ID_FIXTURE, { ...publicMenuItemFixture, isAvailable: false }],
    ]);
    expect(() =>
      buildOrderLines({
        publicItems: unavailable,
        lines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            quantity: 1,
            selectedOptionIds: [],
          },
        ],
      }),
    ).toThrow(HttpsError);
  });
});

describe('buildOrderSnapshot / tracking projection', () => {
  it('creates a pending order and a public tracking projection', () => {
    const lines = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 2,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
    });
    const order = buildOrderSnapshot({
      orderId: 'order-1',
      tenantId: TENANT_A_FIXTURE,
      tableId: 'table-05',
      tableName: 'Bàn 5',
      paymentMode: 'payLater',
      lines,
      trackingToken: 'track-1',
      idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
      now: '2026-09-12T07:00:00.000Z',
    });

    expect(order.status).toBe('pending');
    expect(order.paymentMode).toBe('payLater');
    expect(order.totalVnd).toBe(100000);
    expect(order.items).toEqual(lines);

    const tracking = buildPublicOrderTracking(order);
    expect(tracking.status).toBe('pending');
    expect(tracking.totalVnd).toBe(100000);
    expect(publicOrderTrackingSchema.safeParse(tracking).success).toBe(true);
    expect('customerPhone' in tracking).toBe(false);
    expect(summarizeItems(lines)).toBe('2x Phở bò (Trứng)');
  });

  it('keeps Order source order idempotency-keyed and immutable-shaped', () => {
    expect(orderedPendingOrderFixture.status).toBe('pending');
    expect(orderedPendingOrderFixture.idempotencyKey).toBe(
      ORDER_IDEMPOTENCY_KEY_FIXTURE,
    );
    expect(
      orderSubmitResultSchema.safeParse({
        schemaVersion: ORDER_CONTRACT_VERSION,
        status: 'created',
        order: orderedPendingOrderFixture,
        tracking: buildPublicOrderTracking(orderedPendingOrderFixture),
        replayed: false,
      }).success,
    ).toBe(true);
  });
});


describe('applyPromotionToOrderLines (REQ-PRO-001, REQ-PRO-003)', () => {
  function evaluation(
    overrides: Partial<PromotionEvaluationResult>,
  ): PromotionEvaluationResult {
    return {
      schemaVersion: PROMOTION_CONTRACT_VERSION,
      tenantId: TENANT_A_FIXTURE,
      subtotalVnd: 100000,
      discountVnd: 0,
      giftValueVnd: 0,
      totalVnd: 100000,
      appliedPromotion: null,
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 2,
          unitPriceVnd: 50000,
          lineTotalVnd: 100000,
          lineDiscountVnd: 0,
        },
      ],
      giftLines: [],
      pointsRedeemed: 0,
      codeRequired: false,
      ineligibilityReasons: [],
      consideredPromotionIds: [],
      evaluatedAt: '2026-09-12T07:00:00.000Z',
      ...overrides,
    };
  }

  function lines() {
    return buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 2,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
    });
  }

  it('puts the line discount on the paid line', () => {
    const applied = applyPromotionToOrderLines({
      lines: lines(),
      evaluation: evaluation({
        discountVnd: 12000,
        lines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            quantity: 2,
            unitPriceVnd: 50000,
            lineTotalVnd: 100000,
            lineDiscountVnd: 12000,
          },
        ],
      }),
      publicItems: publicItems(),
    });
    expect(applied).toHaveLength(1);
    expect(applied[0]?.lineDiscountVnd).toBe(12000);
    expect(applied[0]?.isGift).toBe(false);
  });

  it('appends a gift line with zero revenue and a real Cost', () => {
    const costByMenuItemId = new Map([[MENU_ITEM_ID_FIXTURE, 22000]]);
    const applied = applyPromotionToOrderLines({
      lines: [],
      evaluation: evaluation({
        lines: [],
        giftLines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            name: 'Phở bò',
            quantity: 1,
            unitPriceVnd: 0,
          },
        ],
      }),
      publicItems: publicItems(),
      costByMenuItemId,
    });
    expect(applied).toHaveLength(1);
    const gift = applied[0];
    expect(gift?.isGift).toBe(true);
    expect(gift?.lineTotalVnd).toBe(0);
    expect(gift?.lineDiscountVnd).toBe(0);
    expect(gift?.unitPriceVnd).toBe(publicMenuItemFixture.priceVnd);
    expect(gift?.lineCostVnd).toBe(22000);
  });

  it('never discounts a line more than its own total', () => {
    const applied = applyPromotionToOrderLines({
      lines: lines(),
      evaluation: evaluation({
        discountVnd: 999999,
        lines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            quantity: 2,
            unitPriceVnd: 50000,
            lineTotalVnd: 100000,
            lineDiscountVnd: 999999,
          },
        ],
      }),
      publicItems: publicItems(),
    });
    expect(applied[0]?.lineDiscountVnd).toBe(100000);
  });
});

describe('buildOrderSnapshot with a Promotion (REQ-PRO-001)', () => {
  it('records the discount, the frozen snapshot, and the net total', () => {
    const lines = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 2,
          selectedOptionIds: [OPTION_TRUNG],
        },
      ],
    });
    const order = buildOrderSnapshot({
      orderId: 'order-1',
      tenantId: TENANT_A_FIXTURE,
      tableId: 'table-05',
      tableName: 'Bàn 5',
      paymentMode: 'payLater',
      lines,
      trackingToken: 'track-1',
      idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
      now: '2026-09-12T07:00:00.000Z',
      promotion: {
        discountVnd: 15000,
        promotionSnapshot: {
          promotionId: 'promo-1',
          name: 'Giảm 15%',
          benefitType: 'percentOff',
          priority: 5,
          discountVnd: 15000,
          giftValueVnd: 0,
          code: null,
        },
        loyaltyMemberId: null,
        pointsRedeemed: 0,
      },
    });
    expect(order.subtotalVnd).toBe(100000);
    expect(order.discountVnd).toBe(15000);
    expect(order.totalVnd).toBe(85000);
    expect(order.promotionSnapshot?.promotionId).toBe('promo-1');
    expect(buildPublicOrderTracking(order).discountVnd).toBe(15000);
  });

  it('defaults to no discount when no Promotion applied', () => {
    const lines = buildOrderLines({
      publicItems: publicItems(),
      lines: [
        {
          menuItemId: MENU_ITEM_ID_FIXTURE,
          quantity: 1,
          selectedOptionIds: [],
        },
      ],
    });
    const order = buildOrderSnapshot({
      orderId: 'order-2',
      tenantId: TENANT_A_FIXTURE,
      tableId: 'table-05',
      tableName: 'Bàn 5',
      paymentMode: 'payLater',
      lines,
      trackingToken: 'track-2',
      idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
      now: '2026-09-12T07:00:00.000Z',
    });
    expect(order.discountVnd).toBe(0);
    expect(order.promotionSnapshot).toBeNull();
    expect(order.loyaltyMemberId).toBeNull();
    expect(order.pointsRedeemed).toBe(0);
    expect(order.totalVnd).toBe(order.subtotalVnd);
  });

  it('reads a stored Order written before the Promotion snapshot existed', () => {
    const legacy = buildOrderSnapshot({
      orderId: 'order-legacy',
      tenantId: TENANT_A_FIXTURE,
      tableId: 'table-05',
      tableName: 'Bàn 5',
      paymentMode: 'payLater',
      lines: buildOrderLines({
        publicItems: publicItems(),
        lines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            quantity: 1,
            selectedOptionIds: [],
          },
        ],
      }),
      trackingToken: 'track-legacy',
      idempotencyKey: ORDER_IDEMPOTENCY_KEY_FIXTURE,
      now: '2026-09-12T07:00:00.000Z',
    });
    const {
      discountVnd: _discount,
      promotionSnapshot: _snapshot,
      loyaltyMemberId: _member,
      pointsRedeemed: _points,
      ...withoutPromotion
    } = legacy as unknown as Record<string, unknown>;
    const mapped = mapStoredOrder('order-legacy', {
      ...withoutPromotion,
      items: (legacy.items as unknown as Array<Record<string, unknown>>).map(
        ({ lineDiscountVnd: _lineDiscount, isGift: _isGift, ...item }) => item,
      ),
    });
    expect(mapped.discountVnd).toBe(0);
    expect(mapped.promotionSnapshot).toBeNull();
    expect(mapped.pointsRedeemed).toBe(0);
    expect(mapped.items[0]?.isGift).toBe(false);
    expect(mapped.items[0]?.lineDiscountVnd).toBe(0);
  });
});

describe('idempotency matching', () => {
  const record = {
    command: 'submit',
    requestHash: 'hash-a',
    orderId: 'order-1',
    trackingToken: 'track-1',
    status: 'applied' as const,
    createdAt: '2026-09-12T07:00:00.000Z',
  };

  it('accepts a retry with the same request hash', () => {
    expect(() => assertIdempotencyMatch(record, 'hash-a')).not.toThrow();
  });

  it('rejects a reused key with a changed request hash', () => {
    expect(() => assertIdempotencyMatch(record, 'hash-b')).toThrow(HttpsError);
  });
});

describe('parseOrderSubmitInput', () => {
  it('rejects a malformed cart and accepts a valid one', () => {
    expect(() => parseOrderSubmitInput({ lines: [] })).toThrow(HttpsError);
    const parsed = parseOrderSubmitInput({
      token: 'tok-1',
      paymentMode: 'payLater',
      idempotencyKey: 'idem-12345678',
      lines: [
        { menuItemId: MENU_ITEM_ID_FIXTURE, quantity: 1, selectedOptionIds: [] },
      ],
    });
    expect(parsed.lines).toHaveLength(1);
  });

  it('rejects a client-supplied price field (strict object)', () => {
    expect(() =>
      parseOrderSubmitInput({
        token: 'tok-1',
        paymentMode: 'payLater',
        idempotencyKey: 'idem-12345678',
        lines: [
          {
            menuItemId: MENU_ITEM_ID_FIXTURE,
            quantity: 1,
            unitPriceVnd: 1,
            selectedOptionIds: [],
          },
        ],
      }),
    ).toThrow(HttpsError);
  });
});

describe('parsePublicMenuItem', () => {
  it('drops private Cost fields from the projection', () => {
    const parsed = parsePublicMenuItem(MENU_ITEM_ID_FIXTURE, {
      ...publicMenuItemFixture,
      costPriceVnd: 22000,
      recipeId: 'recipe-secret',
    });
    expect('costPriceVnd' in parsed).toBe(false);
    expect('recipeId' in parsed).toBe(false);
    expect(parsed.priceVnd).toBe(publicMenuItemFixture.priceVnd);
  });

  it('rejects a projection with a non-integer price', () => {
    expect(() =>
      parsePublicMenuItem(MENU_ITEM_ID_FIXTURE, {
        ...publicMenuItemFixture,
        priceVnd: 45000.5,
      }),
    ).toThrow();
  });
});

describe('unpaid cancellation eligibility', () => {
  it('accepts an unpaid Order and rejects paid or already cancelled Orders', () => {
    expect(() =>
      assertUnpaidCancellableOrder({ status: 'cooking' }),
    ).not.toThrow();
    expect(() =>
      assertUnpaidCancellableOrder({ status: 'ready' }),
    ).not.toThrow();
    expect(() =>
      assertUnpaidCancellableOrder({ status: 'paid' }),
    ).toThrow(HttpsError);
    expect(() =>
      assertUnpaidCancellableOrder({ status: 'cancelled' }),
    ).toThrow(HttpsError);
  });

  it('parses a cancellation input and requires a non-empty reason', () => {
    const parsed = parseOrderCancelInput({
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-cancel-001',
      reason: 'Khách đổi ý',
      idempotencyKey: 'idem-cancel-0001',
    });
    expect(parsed.reason).toBe('Khách đổi ý');

    expect(() =>
      parseOrderCancelInput({
        tenantId: TENANT_A_FIXTURE,
        orderId: 'order-cancel-001',
        reason: '   ',
        idempotencyKey: 'idem-cancel-0001',
      }),
    ).toThrow(HttpsError);
  });

  it('binds the request hash to tenant, order, and reason', () => {
    const base = {
      tenantId: TENANT_A_FIXTURE,
      orderId: 'order-cancel-001',
      reason: 'Khách đổi ý',
    };
    expect(buildOrderCancelRequestHash(base)).toBe(
      buildOrderCancelRequestHash(base),
    );
    expect(buildOrderCancelRequestHash(base)).not.toBe(
      buildOrderCancelRequestHash({ ...base, reason: 'Hết món' }),
    );
  });
});

describe('staff order entry (REQ-ORD-005)', () => {
  const line = {
    menuItemId: MENU_ITEM_ID_FIXTURE,
    quantity: 1,
    selectedOptionIds: [],
  };
  const baseInput = {
    tenantId: TENANT_A_FIXTURE,
    orderType: 'dineIn' as const,
    tableId: 'table-01',
    paymentMode: 'payLater' as const,
    idempotencyKey: 'idem-staff-0001',
    lines: [line],
  };

  it('rejects a dine-in input without a table', () => {
    expect(() =>
      parseOrderStaffCreateInput({ ...baseInput, tableId: null }),
    ).toThrow(HttpsError);
  });

  it('resolves the reserved takeaway label', () => {
    expect(
      resolveStaffOrderTable({ orderType: 'takeaway', tableId: null }),
    ).toEqual({ tableId: TAKEAWAY_TABLE_ID, tableName: TAKEAWAY_TABLE_NAME });
    expect(() =>
      resolveStaffOrderTable({ orderType: 'dineIn', tableId: 'table-01' }),
    ).toThrow(HttpsError);
  });

  it('stores orderType on the Order and public tracking', () => {
    const lines = buildOrderLines({ publicItems: publicItems(), lines: [line] });
    const order = buildOrderSnapshot({
      orderId: 'order-staff-001',
      tenantId: TENANT_A_FIXTURE,
      orderType: 'takeaway',
      tableId: TAKEAWAY_TABLE_ID,
      tableName: TAKEAWAY_TABLE_NAME,
      paymentMode: 'payLater',
      lines,
      trackingToken: 'track-staff-001',
      idempotencyKey: 'idem-staff-0001',
      now: '2026-09-12T07:05:00.000Z',
    });
    expect(order.orderType).toBe('takeaway');
    expect(buildPublicOrderTracking(order).orderType).toBe('takeaway');
  });

  it('binds the staff request hash to table and lines', () => {
    expect(buildOrderStaffCreateRequestHash(baseInput)).toBe(
      buildOrderStaffCreateRequestHash(baseInput),
    );
    expect(buildOrderStaffCreateRequestHash(baseInput)).not.toBe(
      buildOrderStaffCreateRequestHash({
        ...baseInput,
        tableId: 'table-02',
      }),
    );
  });
});
