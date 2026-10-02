import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  INVENTORY_CONTRACT_VERSION,
  computeExpectedQuantity,
  lossFindingSchema,
  recordStockCountInputSchema,
  stockCountSchema,
  type LossFinding,
  type RecordStockCountInput,
  type StockCount,
} from '../../../../shared/contracts/inventory.contract.js';

export const INVENTORY_COUNT_INVALID_MESSAGE = 'Dữ liệu kiểm kê không hợp lệ.';
export const INVENTORY_COUNT_INGREDIENT_MISSING_MESSAGE =
  'Không tìm thấy nguyên liệu để kiểm kê.';
export const INVENTORY_STOCK_COUNT_MISSING_NOTE =
  'Chưa có kiểm kê cho nguyên liệu này trong kỳ.';

export function parseRecordStockCountInput(
  data: unknown,
): RecordStockCountInput {
  const schema: ZodType<RecordStockCountInput> =
    recordStockCountInputSchema as unknown as ZodType<RecordStockCountInput>;
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', INVENTORY_COUNT_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function stockCountCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/stockCounts`;
}

/** Variance is counted minus expected; a negative value is a shortage. */
export function computeVarianceBaseUnits(
  countedQuantityBaseUnits: number,
  expectedQuantityBaseUnits: number,
): number {
  return countedQuantityBaseUnits - expectedQuantityBaseUnits;
}

/** Rebuild a StockCount contract from a stored document. */
export function toStockCount(countId: string, data: DocumentData): StockCount {
  return stockCountSchema.parse({
    schemaVersion: data.schemaVersion ?? INVENTORY_CONTRACT_VERSION,
    countId,
    tenantId: data.tenantId,
    ingredientId: data.ingredientId,
    countedQuantityBaseUnits: data.countedQuantityBaseUnits ?? 0,
    expectedQuantityBaseUnits: data.expectedQuantityBaseUnits ?? 0,
    varianceBaseUnits: data.varianceBaseUnits ?? 0,
    reason: data.reason ?? null,
    actorUid: data.actorUid ?? null,
    createdAt: data.createdAt,
  });
}

export interface BuildStockCountInput {
  countId: string;
  tenantId: string;
  ingredientId: string;
  countedQuantityBaseUnits: number;
  expectedQuantityBaseUnits: number;
  reason: string | null;
  actorUid: string | null;
  now: string;
}

export function buildStockCount(input: BuildStockCountInput): StockCount {
  return stockCountSchema.parse({
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    countId: input.countId,
    tenantId: input.tenantId,
    ingredientId: input.ingredientId,
    countedQuantityBaseUnits: input.countedQuantityBaseUnits,
    expectedQuantityBaseUnits: input.expectedQuantityBaseUnits,
    varianceBaseUnits: computeVarianceBaseUnits(
      input.countedQuantityBaseUnits,
      input.expectedQuantityBaseUnits,
    ),
    reason: input.reason,
    actorUid: input.actorUid,
    createdAt: input.now,
  });
}

export interface LossMovementInput {
  movementId: string;
  ingredientId: string;
  quantityDelta: number;
  createdAt: string;
}

export interface LossIngredientInput {
  ingredientId: string;
  name: string;
}

export interface BuildLossFindingsInput {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  ingredients: LossIngredientInput[];
  movements: LossMovementInput[];
  counts: StockCount[];
}

/**
 * Grounded loss review (REQ-INV-004, NFR-AI-001). Every finding cites the count,
 * movements, and period. When a count is missing the finding states the
 * limitation and never invents a quantity.
 */
export function buildLossFindings(
  input: BuildLossFindingsInput,
): LossFinding[] {
  const names = new Map<string, string>();
  for (const ingredient of input.ingredients) {
    names.set(ingredient.ingredientId, ingredient.name);
  }

  const movementsByIngredient = new Map<string, LossMovementInput[]>();
  for (const movement of input.movements) {
    if (!names.has(movement.ingredientId)) {
      names.set(movement.ingredientId, movement.ingredientId);
    }
    const list = movementsByIngredient.get(movement.ingredientId) ?? [];
    list.push(movement);
    movementsByIngredient.set(movement.ingredientId, list);
  }

  const latestCountByIngredient = new Map<string, StockCount>();
  for (const count of input.counts) {
    const current = latestCountByIngredient.get(count.ingredientId);
    if (!current || count.createdAt >= current.createdAt) {
      latestCountByIngredient.set(count.ingredientId, count);
    }
  }

  const ingredientIds = [...names.keys()].sort();
  const findings: LossFinding[] = [];
  for (const ingredientId of ingredientIds) {
    const movements = (movementsByIngredient.get(ingredientId) ?? [])
      .slice()
      .sort((left, right) => left.movementId.localeCompare(right.movementId));
    const count = latestCountByIngredient.get(ingredientId);
    const movementIds = movements.map((movement) => movement.movementId);
    const name = names.get(ingredientId) ?? ingredientId;

    if (!count) {
      if (movements.length === 0) {
        continue;
      }
      findings.push(
        lossFindingSchema.parse({
          schemaVersion: INVENTORY_CONTRACT_VERSION,
          findingId: `loss_${ingredientId}`,
          tenantId: input.tenantId,
          ingredientId,
          ingredientName: name,
          countId: null,
          countQuantityBaseUnits: null,
          expectedQuantityBaseUnits: null,
          varianceBaseUnits: null,
          movementIds,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          sourceIds: movementIds,
          missingData: true,
          missingDataNotes: [INVENTORY_STOCK_COUNT_MISSING_NOTE],
          message: `${name}: ${INVENTORY_STOCK_COUNT_MISSING_NOTE}`,
        }),
      );
      continue;
    }

    const sourceIds = [count.countId, ...movementIds];
    findings.push(
      lossFindingSchema.parse({
        schemaVersion: INVENTORY_CONTRACT_VERSION,
        findingId: `loss_${count.countId}`,
        tenantId: input.tenantId,
        ingredientId,
        ingredientName: name,
        countId: count.countId,
        countQuantityBaseUnits: count.countedQuantityBaseUnits,
        expectedQuantityBaseUnits: count.expectedQuantityBaseUnits,
        varianceBaseUnits: count.varianceBaseUnits,
        movementIds,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sourceIds,
        missingData: false,
        missingDataNotes: [],
        message: `${name}: lệch ${count.varianceBaseUnits} đơn vị gốc so với ${count.countId}.`,
      }),
    );
  }
  return findings.slice(0, 200);
}

export { computeExpectedQuantity };
