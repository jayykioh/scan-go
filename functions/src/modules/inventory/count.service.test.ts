import { describe, expect, it } from 'vitest';
import {
  INVENTORY_STOCK_COUNT_MISSING_NOTE,
  buildLossFindings,
  buildStockCount,
  computeVarianceBaseUnits,
} from './count.service.js';
import {
  computeExpectedQuantity,
  type StockMovement,
} from '../../../../shared/contracts/inventory.contract.js';
import { stockCountFixture } from '../../../../shared/fixtures/inventory.fixture.js';

const NOW = '2026-09-13T00:00:00.000Z';

describe('inventory stock count (REQ-INV-003)', () => {
  it('computes expected quantity from stock-in, deduction, and restoration', () => {
    const movements: Array<Pick<StockMovement, 'quantityDelta'>> = [
      { quantityDelta: 1000 },
      { quantityDelta: -400 },
      { quantityDelta: -200 },
      { quantityDelta: 100 },
    ];
    expect(computeExpectedQuantity(movements)).toBe(500);
  });

  it('stores the variance with the count', () => {
    expect(computeVarianceBaseUnits(9400, 9500)).toBe(-100);
    const count = buildStockCount({
      countId: 'count-1',
      tenantId: 'tenant-a',
      ingredientId: 'ingredient-1',
      countedQuantityBaseUnits: 9400,
      expectedQuantityBaseUnits: 9500,
      reason: 'Kiểm kê sáng',
      actorUid: 'uid-owner',
      now: NOW,
    });
    expect(count.expectedQuantityBaseUnits).toBe(9500);
    expect(count.varianceBaseUnits).toBe(-100);
  });
});

describe('inventory loss review (REQ-INV-004, NFR-AI-001)', () => {
  it('cites the count, movements, and period for a complete count', () => {
    const findings = buildLossFindings({
      tenantId: stockCountFixture.tenantId,
      periodStart: '20260901',
      periodEnd: '20260907',
      ingredients: [{ ingredientId: stockCountFixture.ingredientId, name: 'Bánh phở' }],
      movements: [
        {
          movementId: 'order-pho-001__ingredient-noodle-001',
          ingredientId: stockCountFixture.ingredientId,
          quantityDelta: -400,
          createdAt: NOW,
        },
      ],
      counts: [stockCountFixture],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].countId).toBe(stockCountFixture.countId);
    expect(findings[0].movementIds).toEqual([
      'order-pho-001__ingredient-noodle-001',
    ]);
    expect(findings[0].periodStart).toBe('20260901');
    expect(findings[0].periodEnd).toBe('20260907');
    expect(findings[0].missingData).toBe(false);
  });

  it('states the limitation and invents no quantity when a count is missing', () => {
    const findings = buildLossFindings({
      tenantId: 'tenant-a',
      periodStart: '20260901',
      periodEnd: '20260907',
      ingredients: [{ ingredientId: 'ingredient-9', name: 'Thịt bò' }],
      movements: [
        {
          movementId: 'movement-9',
          ingredientId: 'ingredient-9',
          quantityDelta: -300,
          createdAt: NOW,
        },
      ],
      counts: [],
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].missingData).toBe(true);
    expect(findings[0].countId).toBeNull();
    expect(findings[0].expectedQuantityBaseUnits).toBeNull();
    expect(findings[0].missingDataNotes).toContain(
      INVENTORY_STOCK_COUNT_MISSING_NOTE,
    );
    expect(findings[0].sourceIds).toContain('movement-9');
  });
});
