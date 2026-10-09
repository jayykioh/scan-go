import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import { stableRequestHash } from '../../shared/idempotency.js';
import {
  fulfilmentMarkReadyInputSchema,
  fulfilmentMarkServedInputSchema,
  fulfilmentStartCookingInputSchema,
  type FulfilmentMarkReadyInput,
  type FulfilmentMarkServedInput,
  type FulfilmentStartCookingInput,
  type KitchenTransitionTarget,
  type ServedTransitionTarget,
} from '../../../../shared/contracts/fulfilment.contract.js';
import {
  ORDER_CONTRACT_VERSION,
  orderSnapshotSchema,
  type OrderLineSnapshot,
  type OrderSnapshot,
  type OrderStatus,
} from '../../../../shared/contracts/order.contract.js';
import type { Recipe } from '../../../../shared/contracts/inventory.contract.js';

export const FULFILMENT_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const FULFILMENT_KITCHEN_DENIED_MESSAGE =
  'Chỉ bếp hoặc chủ cửa hàng thực hiện được thao tác này.';
export const FULFILMENT_WAITER_DENIED_MESSAGE =
  'Chỉ phục vụ hoặc chủ cửa hàng thực hiện được thao tác này.';
export const FULFILMENT_WAITER_QUEUE_INVALID_MESSAGE =
  'Yêu cầu tải hàng đợi phục vụ không hợp lệ.';
export const FULFILMENT_INVALID_MESSAGE = 'Yêu cầu bếp không hợp lệ.';
export const FULFILMENT_INVALID_TRANSITION_MESSAGE =
  'Trạng thái đơn hàng không hợp lệ cho thao tác này.';
export const FULFILMENT_ORDER_NOT_FOUND_MESSAGE = 'Không tìm thấy đơn hàng.';
export const FULFILMENT_IDEMPOTENCY_CONFLICT_MESSAGE =
  'Yêu cầu đã được gửi trước đó. Vui lòng thử lại.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', FULFILMENT_MEMBER_DENIED_MESSAGE);
  }
}

/**
 * Kitchen authorization. Owner is allowed; a Staff membership must carry the
 * `kitchen` role. Cashier, Waiter, inactive Staff, and another Tenant fail
 * (REQ-KDS-001, REQ-ACL-001).
 */
export function assertKitchenOrOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  const isOwner = memberData?.membershipType === 'owner';
  const roles: unknown[] = Array.isArray(memberData?.roles)
    ? memberData.roles
    : [];
  if (!isOwner && !roles.includes('kitchen')) {
    throw new HttpsError(
      'permission-denied',
      FULFILMENT_KITCHEN_DENIED_MESSAGE,
    );
  }
}

/**
 * Waiter authorization. Owner is allowed; a Staff membership must carry the
 * `waiter` role. Kitchen, Cashier, inactive Staff, and another Tenant fail
 * (REQ-WAI-001, REQ-ACL-001).
 */
export function assertWaiterOrOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  const isOwner = memberData?.membershipType === 'owner';
  const roles: unknown[] = Array.isArray(memberData?.roles)
    ? memberData.roles
    : [];
  if (!isOwner && !roles.includes('waiter')) {
    throw new HttpsError(
      'permission-denied',
      FULFILMENT_WAITER_DENIED_MESSAGE,
    );
  }
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', FULFILMENT_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseStartCookingInput(
  data: unknown,
): FulfilmentStartCookingInput {
  return parseOrInvalid<FulfilmentStartCookingInput>(
    fulfilmentStartCookingInputSchema,
    data,
  );
}

export function parseMarkReadyInput(data: unknown): FulfilmentMarkReadyInput {
  return parseOrInvalid<FulfilmentMarkReadyInput>(
    fulfilmentMarkReadyInputSchema,
    data,
  );
}

export function parseMarkServedInput(data: unknown): FulfilmentMarkServedInput {
  return parseOrInvalid<FulfilmentMarkServedInput>(
    fulfilmentMarkServedInputSchema,
    data,
  );
}

/** Kitchen may perform `pending → cooking` and `cooking → ready` only. */
export function assertKitchenTransition(
  from: OrderStatus,
  to: KitchenTransitionTarget,
): void {
  const allowed =
    (from === 'pending' && to === 'cooking') ||
    (from === 'cooking' && to === 'ready');
  if (!allowed) {
    throw new HttpsError(
      'failed-precondition',
      FULFILMENT_INVALID_TRANSITION_MESSAGE,
    );
  }
}

/** Waiter may perform `ready → served` only. */
export function assertWaiterTransition(
  from: OrderStatus,
  to: ServedTransitionTarget,
): void {
  if (from !== 'ready' || to !== 'served') {
    throw new HttpsError(
      'failed-precondition',
      FULFILMENT_INVALID_TRANSITION_MESSAGE,
    );
  }
}

export function buildFulfilmentRequestHash(
  command: 'startCooking' | 'markReady' | 'markServed',
  tenantId: string,
  orderId: string,
): string {
  return stableRequestHash({ command, tenantId, orderId });
}

export interface FulfilmentIdempotencyRecord {
  command: 'startCooking' | 'markReady' | 'markServed';
  requestHash: string;
  tenantId: string;
  orderId: string;
  status: 'applied';
  createdAt: string;
}

/**
 * Compare a stored Fulfilment idempotency record with the incoming request
 * hash. The same key with the same hash replays without new effects.
 */
export function assertFulfilmentIdempotencyMatch(
  record: FulfilmentIdempotencyRecord,
  requestHash: string,
): void {
  if (record.requestHash !== requestHash) {
    throw new HttpsError(
      'already-exists',
      FULFILMENT_IDEMPOTENCY_CONFLICT_MESSAGE,
    );
  }
}

/**
 * Rebuild the frozen Order contract from a stored document. The mutation plan
 * adds server lifecycle timestamps (`cookingAt`, `readyAt`, ...) that are not
 * part of the snapshot contract, so this projection drops unknown fields.
 *
 * An Order written before the Promotion snapshot existed carries no discount
 * fields, so it normalizes to zero discount and no gift line (REQ-PRO-001).
 */
export function mapStoredOrder(
  orderId: string,
  data: DocumentData,
): OrderSnapshot {
  return orderSnapshotSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    orderId,
    tenantId: data.tenantId,
    orderType: data.orderType ?? 'dineIn',
    tableId: data.tableId,
    tableNameSnapshot: data.tableNameSnapshot,
    status: data.status,
    paymentMode: data.paymentMode,
    items: (data.items ?? []).map((line: DocumentData) => ({
      ...line,
      lineDiscountVnd: line.lineDiscountVnd ?? 0,
      isGift: line.isGift ?? false,
    })) as OrderLineSnapshot[],
    subtotalVnd: data.subtotalVnd,
    discountVnd: data.discountVnd ?? 0,
    promotionSnapshot: data.promotionSnapshot ?? null,
    loyaltyMemberId: data.loyaltyMemberId ?? null,
    pointsRedeemed: data.pointsRedeemed ?? 0,
    totalVnd: data.totalVnd,
    trackingToken: data.trackingToken,
    idempotencyKey: data.idempotencyKey,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

/** Firestore `in` filters accept at most 30 equality values. */
export const RECIPE_QUERY_IN_LIMIT = 30;

/**
 * Split menu item ids into Firestore `in`-query sized chunks. Firestore rejects
 * an `in` filter with more than 30 values, so an Order with many menu items is
 * queried in several chunks and the recipe results are merged (REQ-INV-001).
 */
export function chunkValues<T>(
  values: T[],
  size: number = RECIPE_QUERY_IN_LIMIT,
): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new RangeError('chunk size must be a positive integer');
  }
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/** Resolve the recipe Cost per menu item for Order line Cost snapshots. */
export function buildRecipeCostByMenuItemId(
  recipes: Recipe[],
): Map<string, number> {
  const costByMenuItemId = new Map<string, number>();
  for (const recipe of recipes) {
    if (recipe.archivedAt === null) {
      costByMenuItemId.set(recipe.menuItemId, recipe.costVnd);
    }
  }
  return costByMenuItemId;
}
