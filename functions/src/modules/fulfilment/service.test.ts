import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertFulfilmentIdempotencyMatch,
  assertKitchenOrOwnerMember,
  assertKitchenTransition,
  assertWaiterOrOwnerMember,
  assertWaiterTransition,
  buildFulfilmentRequestHash,
  buildRecipeCostByMenuItemId,
  chunkValues,
  mapStoredOrder,
  parseMarkServedInput,
  type FulfilmentIdempotencyRecord,
} from './service.js';
import { buildOrderStatusMutationPlan } from '../ordering/index.js';
import { recipeFixture } from '../../../../shared/fixtures/inventory.fixture.js';
import {
  KITCHEN_IDEMPOTENCY_KEY_FIXTURE,
  cookingOrderFixture,
} from '../../../../shared/fixtures/fulfilment.fixture.js';
import {
  ORDER_ID_FIXTURE,
  pendingOrderFixture,
} from '../../../../shared/fixtures/order.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';
import type { Recipe } from '../../../../shared/contracts/inventory.contract.js';

describe('Kitchen authorization against a membership document', () => {
  it('allows Owner and an active kitchen Staff member', () => {
    expect(() =>
      assertKitchenOrOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertKitchenOrOwnerMember({
        membershipType: 'staff',
        roles: ['kitchen'],
        isActive: true,
      }),
    ).not.toThrow();
  });

  it('denies Cashier, Waiter, inactive Staff, and missing membership', () => {
    expect(() =>
      assertKitchenOrOwnerMember({
        membershipType: 'staff',
        roles: ['cashier'],
        isActive: true,
      }),
    ).toThrow(HttpsError);
    expect(() =>
      assertKitchenOrOwnerMember({
        membershipType: 'staff',
        roles: ['waiter'],
        isActive: true,
      }),
    ).toThrow(HttpsError);
    expect(() =>
      assertKitchenOrOwnerMember({
        membershipType: 'staff',
        roles: ['kitchen'],
        isActive: false,
      }),
    ).toThrow(HttpsError);
    expect(() => assertKitchenOrOwnerMember(undefined)).toThrow(HttpsError);
  });
});

describe('Kitchen transition boundary', () => {
  it('allows pending to cooking and cooking to ready', () => {
    expect(() => assertKitchenTransition('pending', 'cooking')).not.toThrow();
    expect(() => assertKitchenTransition('cooking', 'ready')).not.toThrow();
  });

  it('rejects a skipped, reversed, or repeated transition', () => {
    expect(() => assertKitchenTransition('pending', 'ready')).toThrow(HttpsError);
    expect(() => assertKitchenTransition('ready', 'cooking')).toThrow(HttpsError);
    expect(() => assertKitchenTransition('cooking', 'cooking')).toThrow(
      HttpsError,
    );
  });
});

describe('Waiter authorization against a membership document (REQ-WAI-001)', () => {
  it('allows Owner and an active waiter Staff member', () => {
    expect(() =>
      assertWaiterOrOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertWaiterOrOwnerMember({
        membershipType: 'staff',
        roles: ['waiter'],
        isActive: true,
      }),
    ).not.toThrow();
  });

  it('denies Kitchen, Cashier, inactive Staff, and missing membership', () => {
    for (const member of [
      { membershipType: 'staff', roles: ['kitchen'], isActive: true },
      { membershipType: 'staff', roles: ['cashier'], isActive: true },
      { membershipType: 'staff', roles: ['waiter'], isActive: false },
      undefined,
    ]) {
      expect(() => assertWaiterOrOwnerMember(member)).toThrow(HttpsError);
    }
  });
});

describe('Waiter transition boundary (ready -> served only)', () => {
  it('allows ready to served', () => {
    expect(() => assertWaiterTransition('ready', 'served')).not.toThrow();
  });

  it('rejects pending, cooking, served, paid, and cancelled as source', () => {
    for (const from of ['pending', 'cooking', 'served', 'paid', 'cancelled'] as const) {
      expect(() => assertWaiterTransition(from, 'served')).toThrow(HttpsError);
    }
  });

  it('parses the strict served input payload', () => {
    const parsed = parseMarkServedInput({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      idempotencyKey: 'idem-waiter-0001',
    });
    expect(parsed.orderId).toBe(ORDER_ID_FIXTURE);
    expect(() =>
      parseMarkServedInput({
        tenantId: TENANT_A_FIXTURE,
        orderId: ORDER_ID_FIXTURE,
        idempotencyKey: 'idem-waiter-0001',
        target: 'paid',
      }),
    ).toThrow(HttpsError);
  });
});

describe('Fulfilment idempotency', () => {
  const record: FulfilmentIdempotencyRecord = {
    command: 'startCooking',
    requestHash: 'hash-a',
    tenantId: TENANT_A_FIXTURE,
    orderId: ORDER_ID_FIXTURE,
    status: 'applied',
    createdAt: '2026-09-12T07:05:00.000Z',
  };

  it('builds a stable request hash per command and Order', () => {
    const first = buildFulfilmentRequestHash(
      'startCooking',
      TENANT_A_FIXTURE,
      ORDER_ID_FIXTURE,
    );
    const second = buildFulfilmentRequestHash(
      'startCooking',
      TENANT_A_FIXTURE,
      ORDER_ID_FIXTURE,
    );
    const ready = buildFulfilmentRequestHash(
      'markReady',
      TENANT_A_FIXTURE,
      ORDER_ID_FIXTURE,
    );
    expect(second).toBe(first);
    expect(ready).not.toBe(first);
  });

  it('replays a matching hash and rejects a different hash', () => {
    expect(() => assertFulfilmentIdempotencyMatch(record, 'hash-a')).not.toThrow();
    expect(() => assertFulfilmentIdempotencyMatch(record, 'hash-b')).toThrow(
      HttpsError,
    );
  });
});

describe('Ordering-prepared mutation plan', () => {
  it('snapshots the recipe Cost onto the Order lines and records an event', () => {
    const plan = buildOrderStatusMutationPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      previousStatus: 'pending',
      nextStatus: 'cooking',
      actorUid: 'uid-kitchen-001',
      reason: null,
      now: '2026-09-12T07:05:00.000Z',
      order: pendingOrderFixture,
      costByMenuItemId: new Map([['item-pho-bo-001', 38000]]),
    });

    expect(plan.previousStatus).toBe('pending');
    expect(plan.nextStatus).toBe('cooking');
    expect(plan.items[0]?.unitCostVnd).toBe(38000);
    expect(plan.items[0]?.lineCostVnd).toBe(76000);
    expect(plan.items[0]?.unitPriceVnd).toBe(pendingOrderFixture.items[0]?.unitPriceVnd);
    expect(plan.statusEvent.actorType).toBe('staff');
    expect(plan.statusEvent.eventId).toBe(`${ORDER_ID_FIXTURE}__cooking`);
    expect(plan.statusEvent.previousStatus).toBe('pending');
    expect(plan.statusEvent.newStatus).toBe('cooking');
  });

  it('keeps the existing Cost when no recipe Cost is supplied', () => {
    const plan = buildOrderStatusMutationPlan({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      previousStatus: 'cooking',
      nextStatus: 'ready',
      actorUid: 'uid-kitchen-001',
      reason: null,
      now: '2026-09-12T07:10:00.000Z',
      order: cookingOrderFixture,
    });
    expect(plan.nextStatus).toBe('ready');
    expect(plan.items[0]?.unitCostVnd).toBe(38000);
  });
});

describe('chunkValues', () => {
  it('splits ids into Firestore in-query chunks of at most 30', () => {
    const ids = Array.from({ length: 65 }, (_, index) => `item-${index}`);
    const chunks = chunkValues(ids);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(30);
    expect(chunks[1]).toHaveLength(30);
    expect(chunks[2]).toHaveLength(5);
    expect(chunks.flat()).toEqual(ids);
  });

  it('returns no chunk for an empty list and rejects an invalid size', () => {
    expect(chunkValues([])).toEqual([]);
    expect(() => chunkValues(['a'], 0)).toThrow(RangeError);
  });
});

describe('recipe cost index and order mapping', () => {
  it('indexes only active recipes by menu item', () => {
    const recipes: Recipe[] = [
      recipeFixture,
      { ...recipeFixture, recipeId: 'r2', archivedAt: '2026-09-12T06:00:00.000Z' },
    ];
    const index = buildRecipeCostByMenuItemId(recipes);
    expect(index.size).toBe(1);
    expect(index.get('item-pho-bo-001')).toBe(38000);
  });

  it('maps a stored pending Order back to the frozen contract', () => {
    const order = mapStoredOrder(ORDER_ID_FIXTURE, pendingOrderFixture);
    expect(order.orderId).toBe(ORDER_ID_FIXTURE);
    expect(order.status).toBe('pending');
    expect(KITCHEN_IDEMPOTENCY_KEY_FIXTURE).toMatch(/^idem-/);
  });
});
