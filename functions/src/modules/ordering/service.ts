import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  ORDER_CONTRACT_VERSION,
  orderArchivePlanSchema,
  orderCancelInputSchema,
  orderCartLineInputSchema,
  orderCorrectionMutationPlanSchema,
  orderSnapshotSchema,
  orderStaffCreateInputSchema,
  orderSubmitInputSchema,
  publicOrderTrackingSchema,
  TAKEAWAY_TABLE_ID,
  TAKEAWAY_TABLE_NAME,
  type OrderArchivePlan,
  type OrderCancelInput,
  type OrderCorrectionMutationPlan,
  type OrderLineSnapshot,
  type OrderSnapshot,
  type OrderStaffCreateInput,
  type OrderStatus,
  type OrderSubmitInput,
  type OrderType,
  type PublicOrderTracking,
} from '../../../../shared/contracts/order.contract.js';
import {
  computeRetentionCutoff,
  isRetentionEligible,
} from '../../../../shared/config/retention.js';
import { stableRequestHash } from '../../shared/idempotency.js';
import {
  catalogModifierGroupSchema,
  publicMenuItemSchema,
  type PublicMenuItem,
} from '../../../../shared/contracts/catalog.contract.js';
import type {
  PromotionEvaluationResult,
  PromotionSnapshot,
} from '../../../../shared/contracts/promotion.contract.js';

export const ORDER_INVALID_CART_MESSAGE = 'Giỏ hàng không hợp lệ.';
export const ORDER_INVALID_TOKEN_MESSAGE = 'Link bàn không còn khả dụng.';
export const ORDER_INVALID_TABLE_MESSAGE = 'Bàn không hợp lệ hoặc đã đóng.';
export const ORDER_ITEM_CHANGED_MESSAGE =
  'Món ăn đã thay đổi. Vui lòng tải lại thực đơn.';
export const ORDER_IDEMPOTENCY_CONFLICT_MESSAGE =
  'Yêu cầu đã được gửi trước đó. Vui lòng thử lại.';
export const ORDER_NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng.';
export const ORDER_NOT_CANCELLABLE_MESSAGE =
  'Đơn hàng đã thanh toán, không thể huỷ.';
export const ORDER_ALREADY_CANCELLED_MESSAGE = 'Đơn hàng đã được huỷ trước đó.';

export function nowIso(): string {
  return new Date().toISOString();
}

/** Parse a strict callable payload or reject with invalid-argument. */
export function parseOrderSubmitInput(data: unknown): OrderSubmitInput {
  return parseInput<OrderSubmitInput>(orderSubmitInputSchema, data);
}

export function parseOrderCancelInput(data: unknown): OrderCancelInput {
  return parseInput<OrderCancelInput>(orderCancelInputSchema, data);
}

export function parseOrderStaffCreateInput(
  data: unknown,
): OrderStaffCreateInput {
  return parseInput<OrderStaffCreateInput>(orderStaffCreateInputSchema, data);
}

/**
 * Resolve the real Table or the reserved takeaway label for a staff Order
 * (REQ-ORD-005). A takeaway Order never reads a Table document.
 */
export function resolveStaffOrderTable(input: {
  orderType: OrderType;
  tableId: string | null;
  tableName?: string;
}): { tableId: string; tableName: string } {
  if (input.orderType === 'takeaway') {
    return { tableId: TAKEAWAY_TABLE_ID, tableName: TAKEAWAY_TABLE_NAME };
  }
  if (!input.tableId || !input.tableName) {
    throw new HttpsError('invalid-argument', ORDER_INVALID_TABLE_MESSAGE);
  }
  return { tableId: input.tableId, tableName: input.tableName };
}

/** The request hash binds one idempotency key to one staff create request. */
export function buildOrderStaffCreateRequestHash(
  input: OrderStaffCreateInput,
): string {
  return stableRequestHash({
    command: 'staffCreateOrder',
    tenantId: input.tenantId,
    orderType: input.orderType,
    tableId: input.orderType === 'takeaway' ? TAKEAWAY_TABLE_ID : input.tableId,
    paymentMode: input.paymentMode,
    lines: input.lines,
    // A retry with a different code is a different request, not a replay.
    promotionCode: input.promotionCode ?? null,
    loyaltyMemberId: input.loyaltyMemberId ?? null,
  });
}

/**
 * Only an unpaid Order is cancellable. A paid Order must use reversal or refund,
 * and a cancelled Order is not cancellable twice (REQ-CAS-002, REQ-PAY-001).
 */
export function assertUnpaidCancellableOrder(order: {
  status: OrderStatus;
}): void {
  if (order.status === 'paid') {
    throw new HttpsError('failed-precondition', ORDER_NOT_CANCELLABLE_MESSAGE);
  }
  if (order.status === 'cancelled') {
    throw new HttpsError('already-exists', ORDER_ALREADY_CANCELLED_MESSAGE);
  }
}

/** The request hash binds one idempotency key to one cancellation request. */
export function buildOrderCancelRequestHash(input: {
  tenantId: string;
  orderId: string;
  reason: string;
}): string {
  return stableRequestHash({
    command: 'cancelUnpaidOrder',
    tenantId: input.tenantId,
    orderId: input.orderId,
    reason: input.reason,
  });
}

function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
  }
  return parsed.data;
}

export interface ModifierSelection {
  optionId: string;
  name: string;
  priceDeltaVnd: number;
}

/**
 * Resolve the requested option IDs against one public menu item. Selection
 * count must respect group min/max; unknown or duplicate options fail.
 */
export function resolveSelectedModifiers(
  item: PublicMenuItem,
  selectedOptionIds: string[],
): ModifierSelection[] {
  const requested = new Set(selectedOptionIds);
  if (requested.size !== selectedOptionIds.length) {
    throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
  }

  const selected: ModifierSelection[] = [];
  for (const group of item.modifierGroups) {
    const groupOptions = group.options;
    const chosen = groupOptions.filter((option) =>
      requested.has(option.optionId),
    );
    const min = group.isRequired ? Math.max(1, group.minSelections) : group.minSelections;
    if (chosen.length < min) {
      throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
    }
    if (group.maxSelections !== null && chosen.length > group.maxSelections) {
      throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
    }
    if (group.selectionType === 'single' && chosen.length > 1) {
      throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
    }
    for (const option of chosen) {
      selected.push({
        optionId: option.optionId,
        name: option.name,
        priceDeltaVnd: option.priceDeltaVnd,
      });
    }
  }

  const knownIds = new Set(
    item.modifierGroups.flatMap((group) =>
      group.options.map((option) => option.optionId),
    ),
  );
  for (const optionId of selectedOptionIds) {
    if (!knownIds.has(optionId)) {
      throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
    }
  }

  return selected;
}

export function parsePublicMenuItem(
  menuItemId: string,
  data: DocumentData,
): PublicMenuItem {
  return publicMenuItemSchema.parse({
    schemaVersion: data.schemaVersion ?? 1,
    menuItemId,
    tenantId: data.tenantId,
    name: data.name,
    description: data.description ?? null,
    category: data.category,
    type: data.type ?? null,
    priceVnd: data.priceVnd,
    imageUrl: data.imageUrl ?? null,
    modifierGroups: (data.modifierGroups ?? []).map((group: unknown) =>
      catalogModifierGroupSchema.parse(group),
    ),
    isAvailable: data.isAvailable === true,
    updatedAt: data.updatedAt,
  });
}

export interface BuildCartInput {
  publicItems: Map<string, PublicMenuItem>;
  lines: OrderSubmitInput['lines'];
  /** Optional per-item Cost from the tenant-private item, when available. */
  costByMenuItemId?: Map<string, number>;
}

/**
 * Build immutable line snapshots from current public menu prices and integer
 * VND arithmetic. Every quantity change recomputes the line and order totals
 * from the current menu (REQ-ORD-001, NFR-DATA-001).
 */
export function buildOrderLines(input: BuildCartInput): OrderLineSnapshot[] {
  return input.lines.map((line, index) => {
    const parsed = orderCartLineInputSchema.safeParse(line);
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', ORDER_INVALID_CART_MESSAGE);
    }
    const item = input.publicItems.get(line.menuItemId);
    if (!item || !item.isAvailable) {
      throw new HttpsError('failed-precondition', ORDER_ITEM_CHANGED_MESSAGE);
    }

    const modifiers = resolveSelectedModifiers(item, line.selectedOptionIds);
    const modifierTotal = modifiers.reduce(
      (sum, modifier) => sum + modifier.priceDeltaVnd,
      0,
    );
    const unitPriceVnd = item.priceVnd + modifierTotal;
    const lineTotalVnd = unitPriceVnd * line.quantity;
    const unitCostVnd = input.costByMenuItemId?.get(line.menuItemId) ?? 0;
    const lineCostVnd = unitCostVnd * line.quantity;

    return {
      lineId: `${item.menuItemId}-${index}`,
      menuItemId: item.menuItemId,
      name: item.name,
      modifiers,
      unitPriceVnd,
      quantity: line.quantity,
      lineTotalVnd,
      lineDiscountVnd: 0,
      isGift: false,
      unitCostVnd,
      lineCostVnd,
    };
  });
}

/**
 * Apply a server Promotion evaluation to the immutable Order lines
 * (REQ-PRO-001, REQ-PRO-003).
 *
 * Cash discounts land on the paid lines. A gift line is appended with a zero
 * line total and its real Cost, so the Kitchen makes it and Reporting sees
 * zero revenue with a real Cost. The Customer never paid the gift, so it is
 * never added to the subtotal.
 */
export function applyPromotionToOrderLines(
  input: {
    lines: OrderLineSnapshot[];
    evaluation: PromotionEvaluationResult;
    publicItems: Map<string, PublicMenuItem>;
    costByMenuItemId?: Map<string, number>;
  },
): OrderLineSnapshot[] {
  const discountByMenuItemId = new Map(
    input.evaluation.lines.map((line) => [line.menuItemId, line.lineDiscountVnd]),
  );
  const discounted = input.lines.map((line) => ({
    ...line,
    lineDiscountVnd: Math.min(
      discountByMenuItemId.get(line.menuItemId) ?? 0,
      line.lineTotalVnd,
    ),
  }));
  if (input.evaluation.giftLines.length === 0) {
    return discounted;
  }
  const giftLines = input.evaluation.giftLines.map((gift, index) => {
    const item = input.publicItems.get(gift.menuItemId);
    if (!item || !item.isAvailable) {
      throw new HttpsError(
        'failed-precondition',
        ORDER_ITEM_CHANGED_MESSAGE,
      );
    }
    const unitCostVnd = input.costByMenuItemId?.get(gift.menuItemId) ?? 0;
    return {
      lineId: `gift-${gift.menuItemId}-${index}`,
      menuItemId: gift.menuItemId,
      name: item.name,
      modifiers: [],
      unitPriceVnd: item.priceVnd,
      quantity: gift.quantity,
      lineTotalVnd: 0,
      lineDiscountVnd: 0,
      isGift: true,
      unitCostVnd,
      lineCostVnd: unitCostVnd * gift.quantity,
    } satisfies OrderLineSnapshot;
  });
  return [...discounted, ...giftLines];
}

/** Sum line totals with integer VND arithmetic. */
export function computeOrderTotal(lines: OrderLineSnapshot[]): number {
  return lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);
}

export function summarizeItems(lines: OrderLineSnapshot[]): string {
  return lines
    .map((line) => {
      const modifierLabel =
        line.modifiers.length > 0
          ? ` (${line.modifiers.map((modifier) => modifier.name).join(', ')})`
          : '';
      return `${line.quantity}x ${line.name}${modifierLabel}`;
    })
    .join(', ');
}

export interface BuildOrderInput {
  orderId: string;
  tenantId: string;
  orderType?: OrderType;
  tableId: string;
  tableName: string;
  paymentMode: OrderSnapshot['paymentMode'];
  lines: OrderLineSnapshot[];
  trackingToken: string;
  idempotencyKey: string;
  now: string;
  /** The applied Promotion, when the server evaluated one (REQ-PRO-001). */
  promotion?: {
    discountVnd: number;
    promotionSnapshot: PromotionSnapshot | null;
    loyaltyMemberId: string | null;
    pointsRedeemed: number;
  };
}

/**
 * Build the immutable Order snapshot. `subtotalVnd` sums the line totals, a
 * gift line contributing zero; `totalVnd` subtracts the Promotion discount so
 * the recorded total is exactly what the Customer was told (REQ-PRO-001).
 */
export function buildOrderSnapshot(input: BuildOrderInput): OrderSnapshot {
  const subtotalVnd = computeOrderTotal(input.lines);
  const discountVnd = Math.min(input.promotion?.discountVnd ?? 0, subtotalVnd);
  return orderSnapshotSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    orderId: input.orderId,
    tenantId: input.tenantId,
    orderType: input.orderType ?? 'dineIn',
    tableId: input.tableId,
    tableNameSnapshot: input.tableName,
    status: 'pending',
    paymentMode: input.paymentMode,
    items: input.lines,
    subtotalVnd,
    discountVnd,
    promotionSnapshot: input.promotion?.promotionSnapshot ?? null,
    loyaltyMemberId: input.promotion?.loyaltyMemberId ?? null,
    pointsRedeemed: input.promotion?.pointsRedeemed ?? 0,
    totalVnd: subtotalVnd - discountVnd,
    trackingToken: input.trackingToken,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/** Build the public tracking projection from an immutable Order snapshot. */
export function buildPublicOrderTracking(
  order: OrderSnapshot,
  updatedAt: string = order.updatedAt,
): PublicOrderTracking {
  return publicOrderTrackingSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    trackingToken: order.trackingToken,
    tenantId: order.tenantId,
    orderId: order.orderId,
    orderType: order.orderType,
    tableName: order.tableNameSnapshot,
    itemSummary: summarizeItems(order.items),
    totalVnd: order.totalVnd,
    discountVnd: order.discountVnd,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt,
  });
}

export interface IdempotencyRecord {
  command: string;
  requestHash: string;
  orderId: string;
  trackingToken: string;
  status: 'applied';
  createdAt: string;
}

/**
 * Compare a stored idempotency record with the incoming request hash. The same
 * key with the same hash replays; the same key with a different hash fails.
 */
export function assertIdempotencyMatch(
  record: IdempotencyRecord,
  requestHash: string,
): void {
  if (record.requestHash !== requestHash) {
    throw new HttpsError(
      'already-exists',
      ORDER_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
  }
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return (
    value === 'pending' ||
    value === 'cooking' ||
    value === 'ready' ||
    value === 'served' ||
    value === 'paid' ||
    value === 'cancelled'
  );
}

export const ORDER_ARCHIVE_COLLECTION = 'archivedOrders';

export function orderArchivePath(tenantId: string, orderId: string): string {
  return `tenants/${tenantId}/${ORDER_ARCHIVE_COLLECTION}/${orderId}`;
}

export interface OrderArchiveCandidate {
  orderId: string;
  status: OrderStatus;
  paidAt: string | null;
  createdAt: string;
  archivedAt: string | null;
}

export interface BuildOrderArchivePlanInput {
  tenantId: string;
  /** Candidate Orders already filtered by status and the createdAt cutoff. */
  candidates: OrderArchiveCandidate[];
  now: string;
  retentionYears: number;
}

/**
 * Compose the immutable archive plan for paid Orders older than the retention
 * window. Orders already archived, unpaid, or cancelled are protected and never
 * appear in the plan (NFR-RET-001).
 */
export function buildOrderArchivePlan(
  input: BuildOrderArchivePlanInput,
): OrderArchivePlan {
  const cutoffAt = computeRetentionCutoff(input.now, input.retentionYears);
  const lines = input.candidates
    .filter(
      (candidate) =>
        candidate.status === 'paid' &&
        candidate.archivedAt === null &&
        isRetentionEligible(candidate.createdAt, cutoffAt),
    )
    .map((candidate) => ({
      orderId: candidate.orderId,
      paidAt: candidate.paidAt ?? candidate.createdAt,
      archivePath: orderArchivePath(input.tenantId, candidate.orderId),
    }));

  return orderArchivePlanSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    tenantId: input.tenantId,
    cutoffAt,
    retentionYears: input.retentionYears,
    lines,
    createdAt: input.now,
  });
}

export interface BuildOrderCorrectionInput {
  tenantId: string;
  orderId: string;
  kind: 'reversal' | 'refund';
  now: string;
}

/**
 * Compose the linked Order mutation for a paid-order correction. Ordering owns
 * the Order write and only records the correction instant; the Order status
 * stays `paid` and the original financial record is untouched
 * (REQ-PAY-001, docs/module/ordering.md).
 */
export function buildOrderCorrectionMutationPlan(
  input: BuildOrderCorrectionInput,
): OrderCorrectionMutationPlan {
  return orderCorrectionMutationPlanSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    tenantId: input.tenantId,
    orderId: input.orderId,
    kind: input.kind,
    correctedAt: input.now,
    updatedAt: input.now,
  });
}
