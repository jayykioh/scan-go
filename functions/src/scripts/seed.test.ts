import { describe, expect, it } from 'vitest';
import {
  catalogMenuItemSchema,
  publicMenuItemSchema,
} from '../../../shared/contracts/catalog.contract.js';
import {
  ingredientSchema,
  recipeSchema,
} from '../../../shared/contracts/inventory.contract.js';
import {
  orderStatusEventSchema,
  publicOrderTrackingSchema,
} from '../../../shared/contracts/order.contract.js';
import { paymentRecordSchema } from '../../../shared/contracts/payment.contract.js';
import {
  attendanceSchema,
  shiftSchema,
} from '../../../shared/contracts/workforce.contract.js';
import { toCatalogMenuItem } from '../modules/catalog/service.js';
import { mapStoredOrder } from '../modules/fulfilment/service.js';
import {
  dayKeyFromIso,
  rebuildDailyStats,
  reportingOrderSourceSchema,
  reportingPaymentSourceSchema,
  shiftDayKey,
} from '../modules/reporting/service.js';
import {
  SEED_INGREDIENTS,
  SEED_MENU_ITEMS,
  SEED_STAFF,
  SEED_TABLE_COUNT,
  SEED_TIMEZONE,
} from './seed-data.js';
import {
  buildAttendance,
  buildIngredient,
  buildMenuItem,
  buildPublicMenuItem,
  buildRecipe,
  buildShifts,
  generateOrder,
} from './seed.js';

const TENANT = 'demo-test';
const NOW = '2026-10-01T00:00:00.000Z';

function fixture() {
  const ingredientById = new Map(
    SEED_INGREDIENTS.map((definition) => [
      definition.id,
      buildIngredient(TENANT, definition, NOW),
    ]),
  );
  const recipesByItemId = new Map(
    SEED_MENU_ITEMS.map((item) => [
      item.id,
      buildRecipe(TENANT, item, ingredientById, NOW),
    ]),
  );
  const costByItemId = new Map(
    [...recipesByItemId].map(([itemId, recipe]) => [itemId, recipe.costVnd]),
  );
  return { ingredientById, recipesByItemId, costByItemId };
}

describe('seed dataset', () => {
  it('uses every ingredient in at least one recipe', () => {
    const { recipesByItemId } = fixture();
    const used = new Set<string>();
    for (const recipe of recipesByItemId.values()) {
      for (const line of recipe.lines) {
        used.add(line.ingredientId);
      }
    }
    expect(used.size).toBe(SEED_INGREDIENTS.length);
    expect(SEED_TABLE_COUNT).toBe(10);
    expect(SEED_STAFF).toHaveLength(4);
  });

  it('builds contract-valid ingredients and recipes', () => {
    const { ingredientById, recipesByItemId } = fixture();
    for (const ingredient of ingredientById.values()) {
      expect(ingredientSchema.safeParse(ingredient).success).toBe(true);
      expect(ingredient.stockQuantity).toBeGreaterThanOrEqual(0);
    }
    for (const recipe of recipesByItemId.values()) {
      expect(recipeSchema.safeParse(recipe).success).toBe(true);
      const lineSum = recipe.lines.reduce(
        (sum, line) => sum + line.lineCostVnd,
        0,
      );
      expect(recipe.costVnd).toBe(lineSum);
    }
  });

  it('builds contract-valid private and public menu items', () => {
    const { recipesByItemId } = fixture();
    for (const item of SEED_MENU_ITEMS) {
      const recipe = recipesByItemId.get(item.id);
      expect(recipe).toBeDefined();
      const menuItem = buildMenuItem(TENANT, item, recipe!, NOW);
      expect(
        catalogMenuItemSchema.safeParse(toCatalogMenuItem(item.id, menuItem))
          .success,
      ).toBe(true);
      expect(menuItem.costPriceVnd).toBe(recipe!.costVnd);
      expect(menuItem.imagePath).toBe(item.imageUrl);
      const publicItem = buildPublicMenuItem(menuItem);
      expect(publicMenuItemSchema.safeParse(publicItem).success).toBe(true);
      expect(publicItem.imageUrl).toBe(item.imageUrl);
    }
  });
});

describe('seed order generation', () => {
  it('produces contract-valid orders, events, tracking, and payments', () => {
    const { costByItemId } = fixture();
    const today = dayKeyFromIso(NOW, SEED_TIMEZONE);
    for (const dayIndex of [0, 1, 5]) {
      const dayKey = shiftDayKey(today, -dayIndex);
      for (let orderIndex = 0; orderIndex < 6; orderIndex += 1) {
        const generated = generateOrder(
          TENANT,
          'owner-uid',
          dayIndex,
          orderIndex,
          NOW,
          dayKey,
          costByItemId,
        );
        const orderId = generated.order.orderId as string;
        expect(() => mapStoredOrder(orderId, generated.order)).not.toThrow();
        for (const event of generated.events) {
          expect(orderStatusEventSchema.safeParse(event).success).toBe(true);
        }
        expect(
          publicOrderTrackingSchema.safeParse(generated.tracking).success,
        ).toBe(true);
        if (generated.payment) {
          expect(paymentRecordSchema.safeParse(generated.payment).success).toBe(
            true,
          );
        }
        expect(
          reportingOrderSourceSchema.safeParse(generated.source).success,
        ).toBe(true);
        if (generated.paymentSource) {
          expect(
            reportingPaymentSourceSchema.safeParse(generated.paymentSource)
              .success,
          ).toBe(true);
        }
      }
    }
  });

  it('rebuilds daily stats that match the seeded payments', () => {
    const { costByItemId } = fixture();
    const today = dayKeyFromIso(NOW, SEED_TIMEZONE);
    const days = 3;
    const orders = [];
    const payments = [];
    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const dayKey = shiftDayKey(today, -dayIndex);
      for (let orderIndex = 0; orderIndex < 6; orderIndex += 1) {
        const generated = generateOrder(
          TENANT,
          'owner-uid',
          dayIndex,
          orderIndex,
          NOW,
          dayKey,
          costByItemId,
        );
        orders.push(generated.source);
        if (generated.paymentSource) {
          payments.push(generated.paymentSource);
        }
      }
    }
    const bundles = rebuildDailyStats({
      tenantId: TENANT,
      timezone: SEED_TIMEZONE,
      fromDay: shiftDayKey(today, -(days - 1)),
      toDay: today,
      orders,
      payments,
      now: NOW,
    });
    expect(bundles).toHaveLength(days);
    const expectedRevenue = payments.reduce(
      (sum, payment) => sum + payment.amountVnd,
      0,
    );
    const actualRevenue = bundles.reduce(
      (sum, bundle) => sum + bundle.doc.revenueVnd,
      0,
    );
    expect(actualRevenue).toBe(expectedRevenue);
    expect(
      bundles.reduce((sum, bundle) => sum + bundle.doc.paidOrderCount, 0),
    ).toBe(payments.length);
  });
});

describe('seed workforce generation', () => {
  it('builds contract-valid shifts and attendance', () => {
    const today = dayKeyFromIso(NOW, SEED_TIMEZONE);
    const shifts = buildShifts(TENANT, NOW, today);
    expect(shifts).toHaveLength(SEED_STAFF.length * 7);
    for (const shift of shifts) {
      expect(shiftSchema.safeParse(shift).success).toBe(true);
    }
    const attendance = buildAttendance(TENANT, shifts);
    expect(attendance).toHaveLength(shifts.length);
    for (const record of attendance) {
      expect(attendanceSchema.safeParse(record).success).toBe(true);
      expect(record.clockOutAt).not.toBeNull();
    }
  });
});
