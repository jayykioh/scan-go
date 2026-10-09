import { randomBytes } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type {
  DocumentData,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from 'firebase-admin/firestore';
import {
  ORDER_CONTRACT_VERSION,
  orderCancellationResultSchema,
  orderListResultSchema,
  orderPaymentMutationPlanSchema,
  orderStatusMutationPlanSchema,
  orderSubmitResultSchema,
  orderTenantListInputSchema,
  orderTrackingInputSchema,
  orderTrackingResultSchema,
  type OrderArchivePlan,
  type OrderCancellationResult,
  type OrderCorrectionMutationPlan,
  type OrderSnapshot,
  type OrderStatus,
  type OrderStatusEvent,
  type OrderStatusMutationPlan,
  type OrderPaymentMutationPlan,
  type OrderSubmitResult,
} from '../../../../shared/contracts/order.contract.js';
import type { Ingredient } from '../../../../shared/contracts/inventory.contract.js';
import {
  TABLE_STATUS_CONTRACT_VERSION,
  tableStatusListResultSchema,
} from '../../../../shared/contracts/tableStatus.contract.js';
import {
  ACTIVE_TABLE_ORDER_STATUSES,
  aggregateTableServiceStatus,
} from './tableStatus.js';
import {
  applyInventoryRestorationPlan,
  buildInventoryRestorationPlan,
  ingredientCollectionPath,
  toIngredient,
  type RecordedDeduction,
} from '../inventory/service.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { assertRateLimit } from '../../shared/rateLimit.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { stableRequestHash } from '../../shared/idempotency.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  resolvePublicOrderRateLimit,
} from '../table-access/service.js';
import {
  assertIdempotencyMatch,
  assertUnpaidCancellableOrder,
  applyPromotionToOrderLines,
  buildOrderCancelRequestHash,
  buildOrderLines,
  buildOrderSnapshot,
  buildOrderStaffCreateRequestHash,
  buildPublicOrderTracking,
  isOrderStatus,
  nowIso,
  ORDER_IDEMPOTENCY_CONFLICT_MESSAGE,
  ORDER_INVALID_TABLE_MESSAGE,
  ORDER_INVALID_TOKEN_MESSAGE,
  ORDER_NOT_FOUND_MESSAGE,
  parseOrderCancelInput,
  parseOrderStaffCreateInput,
  parseOrderSubmitInput,
  parsePublicMenuItem,
  resolveStaffOrderTable,
  type IdempotencyRecord,
} from './service.js';
import {
  evaluatePromotionForCart,
  loadActivePromotions,
  type PromotionEvaluationOutcome,
  loadPromotionFacts,
  requiredPromotionMenuItemIds,
  resolveTenantTimezone,
} from '../promotion/service.js';
import { loadSubscriptionState } from '../subscription/service.js';
import type { PromotionCartLine } from '../../../../shared/contracts/promotion.contract.js';
import {
  buildLoyaltyRedeemPlan,
  buildLoyaltyRedeemReversalPlan,
  buildLoyaltyRequestHash,
  loyaltyMemberPath,
  loyaltyTransactionPath,
  mapStoredLoyaltyMember,
} from '../loyalty/service.js';
import { loyaltyRedeemReversalTransactionId } from '../../../../shared/contracts/loyalty.contract.js';
import type { PublicMenuItem } from '../../../../shared/contracts/catalog.contract.js';

// Module public API: Config's scheduled retention job composes the archive plan
// through Ordering, and Payment composes the linked correction plan through
// Ordering (NFR-RET-001, REQ-PAY-001).
export {
  buildOrderArchivePlan,
  buildOrderCorrectionMutationPlan,
} from './service.js';
import { mapStoredOrder } from '../fulfilment/service.js';
import {
  applyOrderNotificationPlan,
  buildOrderNotificationEvent,
} from '../fulfilment/notification.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;

/** Unpaid and Kitchen queues stay bounded (docs/RULES_FIREBASE.md §6). */
export const ORDER_LIST_LIMIT = 50;

const ORDERING_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
const ORDERING_CASHIER_DENIED_MESSAGE =
  'Chỉ thu ngân hoặc chủ cửa hàng xem được danh sách này.';
const ORDERING_KITCHEN_DENIED_MESSAGE =
  'Chỉ bếp hoặc chủ cửa hàng xem được danh sách này.';
const ORDERING_INVALID_MESSAGE = 'Yêu cầu không hợp lệ.';
const ORDER_PROMOTION_MEMBER_MISSING_MESSAGE =
  'Không tìm thấy hội viên để trừ điểm.';

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function assertActiveOrderingMember(
  memberData: Record<string, unknown> | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', ORDERING_MEMBER_DENIED_MESSAGE);
  }
}

function hasOrderingRole(
  memberData: Record<string, unknown>,
  role: string,
): boolean {
  const roles: unknown[] = Array.isArray(memberData.roles)
    ? memberData.roles
    : [];
  return memberData.membershipType === 'owner' || roles.includes(role);
}

const ORDERING_CANCEL_DENIED_MESSAGE =
  'Chỉ thu ngân hoặc chủ cửa hàng huỷ được đơn hàng.';

/**
 * Cancellation authorization. Owner is allowed; a Staff membership must carry
 * the `cashier` role (REQ-CAS-002, REQ-ACL-001).
 */
function assertCashierOrOwner(memberData: DocumentData | undefined): void {
  assertActiveOrderingMember(memberData);
  if (!memberData || !hasOrderingRole(memberData, 'cashier')) {
    throw new HttpsError('permission-denied', ORDERING_CANCEL_DENIED_MESSAGE);
  }
}

const ORDERING_CREATE_DENIED_MESSAGE =
  'Chỉ thu ngân hoặc chủ cửa hàng tạo được đơn hàng.';

/**
 * Staff order-entry authorization. Owner is allowed; a Staff membership must
 * carry the `cashier` role (REQ-ORD-005, REQ-ACL-001).
 */
function assertCashierOrOwnerCreate(
  memberData: DocumentData | undefined,
): void {
  assertActiveOrderingMember(memberData);
  if (!memberData || !hasOrderingRole(memberData, 'cashier')) {
    throw new HttpsError('permission-denied', ORDERING_CREATE_DENIED_MESSAGE);
  }
}

function parseOrderTenantListInput(data: unknown): { tenantId: string } {
  const parsed = orderTenantListInputSchema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ORDERING_INVALID_MESSAGE);
  }
  return parsed.data;
}

function generateTrackingToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Evaluate the tenant Promotion for one cart before the Order transaction.
 *
 * Every read happens here, outside the transaction, so the transaction stays a
 * pure write (RULES_FIREBASE §4). The evaluation result is frozen and becomes
 * part of the immutable Order snapshot (REQ-PRO-001).
 */
async function evaluateOrderPromotion(params: {
  db: Firestore;
  tenantId: string;
  lines: readonly PromotionCartLine[];
  promotionCode: string | null;
  loyaltyMemberId: string | null;
  now: string;
  publicItems: Map<string, PublicMenuItem>;
  costByMenuItemId: Map<string, number>;
}): Promise<PromotionEvaluationOutcome> {
  const { db, tenantId, lines, now } = params;
  const entitlements = (await loadSubscriptionState(db, tenantId)).entitlements;
  const promotions = entitlements.features.includes('promotions')
    ? await loadActivePromotions(db, tenantId)
    : [];

  // A gift candidate is usually not in the cart, so resolve it here with its
  // private Cost before the transaction (REQ-PRO-003).
  const missingIds = requiredPromotionMenuItemIds(lines, promotions).filter(
    (menuItemId) => !params.publicItems.has(menuItemId),
  );
  if (missingIds.length > 0) {
    const publicSnaps = await db.getAll(
      ...missingIds.map((menuItemId) =>
        db.doc(`tenants/${tenantId}/publicMenuItems/${menuItemId}`),
      ),
    );
    const privateSnaps = await db.getAll(
      ...missingIds.map((menuItemId) =>
        db.doc(`tenants/${tenantId}/menuItems/${menuItemId}`),
      ),
    );
    publicSnaps.forEach((snap, index) => {
      const parsed = parsePublicMenuItem(missingIds[index], snap.data() ?? {});
      if (parsed) {
        params.publicItems.set(missingIds[index], parsed);
      }
    });
    privateSnaps.forEach((snap, index) => {
      const cost = readCostVnd(snap);
      if (cost !== null) {
        params.costByMenuItemId.set(missingIds[index], cost);
      }
    });
  }

  const timezone = resolveTenantTimezone(
    (await db.doc(`tenants/${tenantId}`).get()).get('timezone'),
  );
  const facts = await loadPromotionFacts(db, {
    tenantId,
    lines,
    promotions,
    loyaltyMemberId: params.loyaltyMemberId,
    now,
    timezone,
    publicItems: params.publicItems,
  });
  return evaluatePromotionForCart(db, tenantId, lines, {
    code: params.promotionCode,
    loyaltyMemberId: params.loyaltyMemberId,
    now,
    facts,
    promotions,
    entitlements,
  });
}

/**
 * Spend the Loyalty points a Promotion redeemed, inside the Order transaction.
 *
 * The member is re-read inside the transaction and the plan re-checks the
 * balance, so two Orders racing for the same points cannot overdraw the member
 * (REQ-PRO-004). A replayed Order returns before this runs.
 */
async function applyLoyaltyRedemptionPlan(
  transaction: Transaction,
  db: Firestore,
  tenantId: string,
  outcome: PromotionEvaluationOutcome,
  idempotencyKey: string,
  now: string,
): Promise<void> {
  const memberId = outcome.loyaltyMemberId;
  if (memberId === null) {
    return;
  }
  const memberRef = db.doc(loyaltyMemberPath(tenantId, memberId));
  const memberSnap = await transaction.get(memberRef);
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', ORDER_PROMOTION_MEMBER_MISSING_MESSAGE);
  }
  const member = mapStoredLoyaltyMember(
    memberId,
    tenantId,
    memberSnap.data() ?? {},
  );
  const plan = buildLoyaltyRedeemPlan({
    tenantId,
    member,
    points: outcome.result.pointsRedeemed,
    orderId: null,
    idempotencyKey,
    requestHash: buildLoyaltyRequestHash({
      tenantId,
      memberId,
      action: 'redeem',
      points: outcome.result.pointsRedeemed,
      amountVnd: 0,
    }),
    actorUid: null,
    now,
  });
  transaction.set(
    db.doc(loyaltyTransactionPath(tenantId, plan.transaction.transactionId)),
    plan.transaction,
  );
  transaction.set(memberRef, plan.nextMember);
}

/**
 * Restore the points one cancelled Order redeemed. The deterministic ledger id
 * means a retried cancellation can never credit the member twice
 * (REQ-PRO-004, REQ-CAS-002).
 */
async function applyLoyaltyRedeemReversalPlan(
  transaction: Transaction,
  db: Firestore,
  tenantId: string,
  order: OrderSnapshot,
  reason: string,
  idempotencyKey: string,
  actorUid: string,
  now: string,
): Promise<void> {
  if (order.pointsRedeemed <= 0 || order.loyaltyMemberId === null) {
    return;
  }
  const reversalRef = db.doc(
    loyaltyTransactionPath(
      tenantId,
      loyaltyRedeemReversalTransactionId(order.orderId),
    ),
  );
  const existingSnap = await transaction.get(reversalRef);
  if (existingSnap.exists) {
    return;
  }
  const memberRef = db.doc(loyaltyMemberPath(tenantId, order.loyaltyMemberId));
  const memberSnap = await transaction.get(memberRef);
  if (!memberSnap.exists) {
    return;
  }
  const member = mapStoredLoyaltyMember(
    order.loyaltyMemberId,
    tenantId,
    memberSnap.data() ?? {},
  );
  const plan = buildLoyaltyRedeemReversalPlan({
    tenantId,
    member,
    orderId: order.orderId,
    pointsRedeemed: order.pointsRedeemed,
    reason,
    idempotencyKey,
    requestHash: buildLoyaltyRequestHash({
      tenantId,
      memberId: order.loyaltyMemberId,
      action: 'reverse',
      points: order.pointsRedeemed,
      amountVnd: 0,
    }),
    actorUid,
    now,
  });
  transaction.set(reversalRef, plan.transaction);
  transaction.set(memberRef, plan.nextMember);
}

/**
 * Public callable: create one Pay-First or Pay-Later Order from an active Table
 * link and the current public menu. The server owns prices, costs, totals,
 * status, and idempotency (REQ-ORD-001, REQ-ORD-002, NFR-SEC-002).
 */
export const callableOrderSubmit = onCall(CALL_OPTIONS, async (request) => {
  assertAppCheck(request);
  const input = parseOrderSubmitInput(request.data);

  const db = getDb();

  // Rate limit per opaque table token before any read or write.
  assertRateLimit(
    `order-submit:${input.token}`,
    await resolvePublicOrderRateLimit(db),
  );

  const linkSnap = await db.doc(`publicTableLinks/${input.token}`).get();
  if (!linkSnap.exists || linkSnap.get('isActive') !== true) {
    throw new HttpsError('permission-denied', ORDER_INVALID_TOKEN_MESSAGE);
  }
  const tenantId = linkSnap.get('tenantId');
  const tableId = linkSnap.get('tableId');
  const tableName = linkSnap.get('tableName');
  if (
    typeof tenantId !== 'string' ||
    typeof tableId !== 'string' ||
    typeof tableName !== 'string'
  ) {
    throw new HttpsError('permission-denied', ORDER_INVALID_TOKEN_MESSAGE);
  }

  const requestHash = stableRequestHash({
    tenantId,
    paymentMode: input.paymentMode,
    lines: input.lines,
    tokenVersion: linkSnap.get('tokenVersion'),
    // A retry with a different code is a different request, not a replay.
    promotionCode: input.promotionCode ?? null,
    loyaltyMemberId: input.loyaltyMemberId ?? null,
  });

  const orderRef = db.collection(`tenants/${tenantId}/orders`).doc();
  const idempotencyRef = db.doc(
    `tenants/${tenantId}/idempotency/${input.idempotencyKey}`,
  );
  const trackingToken = generateTrackingToken();
  const trackingRef = db.doc(`publicOrderTracking/${trackingToken}`);

  // Read every public menu item and its private Cost before the transaction.
  const publicItemRefs = Array.from(
    new Set(input.lines.map((line) => line.menuItemId)),
  ).map((menuItemId) => ({
    menuItemId,
    ref: db.doc(`tenants/${tenantId}/publicMenuItems/${menuItemId}`),
    privateRef: db.doc(`tenants/${tenantId}/menuItems/${menuItemId}`),
  }));

  const publicSnaps = await db.getAll(
    ...publicItemRefs.map((entry) => entry.ref),
  );
  const privateSnaps = await db.getAll(
    ...publicItemRefs.map((entry) => entry.privateRef),
  );

  const publicItems = new Map(
    publicItemRefs.map((entry, index) => [
      entry.menuItemId,
      parsePublicMenuItem(entry.menuItemId, publicSnaps[index]?.data() ?? {}),
    ]),
  );
  for (const [menuItemId, item] of publicItems) {
    if (!item.isAvailable || item.tenantId !== tenantId) {
      throw new HttpsError('failed-precondition', `Món ${menuItemId} không khả dụng.`);
    }
  }

  // Private Cost snapshots are read outside the transaction; a missing private
  // item contributes zero Cost without leaking anything to the public path.
  const costByMenuItemId = new Map<string, number>();
  publicItemRefs.forEach((entry, index) => {
    const cost = readCostVnd(privateSnaps[index]);
    if (cost !== null) {
      costByMenuItemId.set(entry.menuItemId, cost);
    }
  });

  // The Promotion is evaluated once, before the transaction, and frozen into
  // the Order snapshot so the recorded total is the total the Customer saw.
  const promotionOutcome = await evaluateOrderPromotion({
    db,
    tenantId,
    lines: input.lines,
    promotionCode: input.promotionCode ?? null,
    loyaltyMemberId: input.loyaltyMemberId ?? null,
    now: nowIso(),
    publicItems,
    costByMenuItemId,
  });

  const result = await db.runTransaction<OrderSubmitResult>(
    async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const idempotencySnap = await transaction.get(idempotencyRef);
      const existing = idempotencySnap.data() as IdempotencyRecord | undefined;
      if (existing) {
        assertIdempotencyMatch(existing, requestHash);
        const existingOrderSnap = await transaction.get(
          db.doc(`tenants/${tenantId}/orders/${existing.orderId}`),
        );
        const existingTrackingSnap = await transaction.get(
          db.doc(`publicOrderTracking/${existing.trackingToken}`),
        );
        if (!existingOrderSnap.exists || !existingTrackingSnap.exists) {
          throw new HttpsError(
            'internal',
            ORDER_IDEMPOTENCY_CONFLICT_MESSAGE,
          );
        }
        return {
          schemaVersion: ORDER_CONTRACT_VERSION,
          status: 'created',
          order: mapStoredOrder(existing.orderId, existingOrderSnap.data() ?? {}),
          tracking:
            existingTrackingSnap.data() as OrderSubmitResult['tracking'],
          replayed: true,
        };
      }

      const now = nowIso();
      const baseLines = buildOrderLines({
        publicItems,
        lines: input.lines,
        costByMenuItemId,
      });
      const lines = applyPromotionToOrderLines({
        lines: baseLines,
        evaluation: promotionOutcome.result,
        publicItems,
        costByMenuItemId,
      });
      // A point redemption spends Loyalty points in the same transaction that
      // creates the Order, so an Order can never exist without its deduction
      // (REQ-PRO-004, REQ-LOY-001).
      if (promotionOutcome.result.pointsRedeemed > 0) {
        applyLoyaltyRedemptionPlan(
          transaction,
          db,
          tenantId,
          promotionOutcome,
          input.idempotencyKey,
          now,
        );
      }
      const order = buildOrderSnapshot({
        orderId: orderRef.id,
        tenantId,
        tableId,
        tableName,
        paymentMode: input.paymentMode,
        lines,
        trackingToken,
        idempotencyKey: input.idempotencyKey,
        now,
        promotion: {
          discountVnd: promotionOutcome.result.discountVnd,
          promotionSnapshot: promotionOutcome.result.appliedPromotion,
          loyaltyMemberId: promotionOutcome.loyaltyMemberId,
          pointsRedeemed: promotionOutcome.result.pointsRedeemed,
        },
      });
      const tracking = buildPublicOrderTracking(order, now);

      const statusEvent: OrderStatusEvent = {
        schemaVersion: ORDER_CONTRACT_VERSION,
        eventId: orderRef.id,
        previousStatus: null,
        newStatus: 'pending',
        actorType: 'customer',
        actorUid: null,
        reason: null,
        createdAt: now,
      };

      transaction.set(orderRef, order);
      transaction.set(
        orderRef.collection('statusEvents').doc(statusEvent.eventId),
        statusEvent,
      );
      transaction.set(trackingRef, tracking);
      if (order.paymentMode === 'payLater') {
        // A new Pay-Later Order raises one Kitchen notification. A Pay-First
        // Order stays hidden from Kitchen until Payment confirms it
        // (REQ-ORD-002, REQ-NOT-001).
        applyOrderNotificationPlan(
          transaction,
          db,
          buildOrderNotificationEvent({
            tenantId,
            kind: 'orderCreated',
            order,
            now,
          }),
        );
      }
      transaction.set(idempotencyRef, {
        command: 'submit',
        requestHash,
        orderId: orderRef.id,
        trackingToken,
        status: 'applied',
        createdAt: now,
      } satisfies IdempotencyRecord);

      return {
        schemaVersion: ORDER_CONTRACT_VERSION,
        status: 'created',
        order,
        tracking,
        replayed: false,
      };
    },
  );

  return orderSubmitResultSchema.parse(result);
});

/**
 * Staff callable: create one Order for a table or for takeaway. Owner and
 * Cashier only. The server owns every price and total, actors are recorded,
 * and a retry never duplicates the Order (REQ-ORD-005, REQ-ORD-001).
 */
export const callableOrderStaffCreate = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrderStaffCreateInput(request.data);

    const db = getDb();
    assertRateLimit(
      `staff-order-create:${input.tenantId}:${uid}`,
      await resolvePublicOrderRateLimit(db),
    );

    // Resolve the real Table for a dine-in Order before any write.
    let tableName: string | undefined;
    if (input.orderType === 'dineIn' && input.tableId) {
      const tableSnap = await db
        .doc(`tenants/${input.tenantId}/tables/${input.tableId}`)
        .get();
      const storedName = tableSnap.get('name');
      if (
        !tableSnap.exists ||
        tableSnap.get('isActive') !== true ||
        tableSnap.get('archivedAt') != null ||
        typeof storedName !== 'string'
      ) {
        throw new HttpsError('failed-precondition', ORDER_INVALID_TABLE_MESSAGE);
      }
      tableName = storedName;
    }
    const { tableId, tableName: resolvedTableName } = resolveStaffOrderTable({
      orderType: input.orderType,
      tableId: input.tableId,
      tableName,
    });

    const requestHash = buildOrderStaffCreateRequestHash(input);
    const orderRef = db.collection(`tenants/${input.tenantId}/orders`).doc();
    const idempotencyRef = db.doc(
      `tenants/${input.tenantId}/idempotency/${input.idempotencyKey}`,
    );
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const trackingToken = generateTrackingToken();
    const trackingRef = db.doc(`publicOrderTracking/${trackingToken}`);

    // Read every menu item and its private Cost before the transaction.
    const publicItemRefs = Array.from(
      new Set(input.lines.map((line) => line.menuItemId)),
    ).map((menuItemId) => ({
      menuItemId,
      ref: db.doc(`tenants/${input.tenantId}/publicMenuItems/${menuItemId}`),
      privateRef: db.doc(`tenants/${input.tenantId}/menuItems/${menuItemId}`),
    }));

    const publicSnaps = await db.getAll(
      ...publicItemRefs.map((entry) => entry.ref),
    );
    const privateSnaps = await db.getAll(
      ...publicItemRefs.map((entry) => entry.privateRef),
    );

    const publicItems = new Map(
      publicItemRefs.map((entry, index) => [
        entry.menuItemId,
        parsePublicMenuItem(entry.menuItemId, publicSnaps[index]?.data() ?? {}),
      ]),
    );
    for (const [menuItemId, item] of publicItems) {
      if (!item.isAvailable || item.tenantId !== input.tenantId) {
        throw new HttpsError(
          'failed-precondition',
          `Món ${menuItemId} không khả dụng.`,
        );
      }
    }

    const costByMenuItemId = new Map<string, number>();
    publicItemRefs.forEach((entry, index) => {
      const cost = readCostVnd(privateSnaps[index]);
      if (cost !== null) {
        costByMenuItemId.set(entry.menuItemId, cost);
      }
    });

    // Staff order entry applies the same server evaluation as the Customer
    // path, so a promotion never depends on who typed the order.
    const promotionOutcome = await evaluateOrderPromotion({
      db,
      tenantId: input.tenantId,
      lines: input.lines,
      promotionCode: input.promotionCode ?? null,
      loyaltyMemberId: input.loyaltyMemberId ?? null,
      now: nowIso(),
      publicItems,
      costByMenuItemId,
    });

    const result = await db.runTransaction<OrderSubmitResult>(
      async (transaction) => {
        // All reads precede all writes (RULES_FIREBASE §4).
        const memberSnap = await transaction.get(memberRef);
        assertCashierOrOwnerCreate(memberSnap.data());
        const idempotencySnap = await transaction.get(idempotencyRef);
        const existing = idempotencySnap.data() as
          | IdempotencyRecord
          | undefined;
        if (existing) {
          assertIdempotencyMatch(existing, requestHash);
          const existingOrderSnap = await transaction.get(
            db.doc(`tenants/${input.tenantId}/orders/${existing.orderId}`),
          );
          const existingTrackingSnap = await transaction.get(
            db.doc(`publicOrderTracking/${existing.trackingToken}`),
          );
          if (!existingOrderSnap.exists || !existingTrackingSnap.exists) {
            throw new HttpsError(
              'internal',
              ORDER_IDEMPOTENCY_CONFLICT_MESSAGE,
            );
          }
          return {
            schemaVersion: ORDER_CONTRACT_VERSION,
            status: 'created',
            order: mapStoredOrder(
              existing.orderId,
              existingOrderSnap.data() ?? {},
            ),
            tracking:
              existingTrackingSnap.data() as OrderSubmitResult['tracking'],
            replayed: true,
          };
        }

        const now = nowIso();
        const baseLines = buildOrderLines({
          publicItems,
          lines: input.lines,
          costByMenuItemId,
        });
        const lines = applyPromotionToOrderLines({
          lines: baseLines,
          evaluation: promotionOutcome.result,
          publicItems,
          costByMenuItemId,
        });
        if (promotionOutcome.result.pointsRedeemed > 0) {
          applyLoyaltyRedemptionPlan(
            transaction,
            db,
            input.tenantId,
            promotionOutcome,
            input.idempotencyKey,
            now,
          );
        }
        const order = buildOrderSnapshot({
          orderId: orderRef.id,
          tenantId: input.tenantId,
          orderType: input.orderType,
          tableId,
          tableName: resolvedTableName,
          paymentMode: input.paymentMode,
          lines,
          trackingToken,
          idempotencyKey: input.idempotencyKey,
          now,
          promotion: {
            discountVnd: promotionOutcome.result.discountVnd,
            promotionSnapshot: promotionOutcome.result.appliedPromotion,
            loyaltyMemberId: promotionOutcome.loyaltyMemberId,
            pointsRedeemed: promotionOutcome.result.pointsRedeemed,
          },
        });
        const tracking = buildPublicOrderTracking(order, now);

        const statusEvent: OrderStatusEvent = {
          schemaVersion: ORDER_CONTRACT_VERSION,
          eventId: orderRef.id,
          previousStatus: null,
          newStatus: 'pending',
          actorType: 'staff',
          actorUid: uid,
          reason: null,
          createdAt: now,
        };

        transaction.set(orderRef, order);
        transaction.set(
          orderRef.collection('statusEvents').doc(statusEvent.eventId),
          statusEvent,
        );
        transaction.set(trackingRef, tracking);
        if (order.paymentMode === 'payLater') {
          applyOrderNotificationPlan(
            transaction,
            db,
            buildOrderNotificationEvent({
              tenantId: input.tenantId,
              kind: 'orderCreated',
              order,
              now,
            }),
          );
        }
        transaction.set(idempotencyRef, {
          command: 'staffCreateOrder',
          requestHash,
          orderId: orderRef.id,
          trackingToken,
          status: 'applied',
          createdAt: now,
        } satisfies IdempotencyRecord);
        writeAuditEventInTransaction(transaction, {
          tenantId: input.tenantId,
          actorUid: uid,
          actorType: 'staff',
          role: memberSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
          action: 'OrderCreatedByStaff',
          targetType: 'order',
          targetId: orderRef.id,
          detail: {
            orderType: order.orderType,
            tableId: order.tableId,
            totalVnd: order.totalVnd,
          },
        });

        return {
          schemaVersion: ORDER_CONTRACT_VERSION,
          status: 'created',
          order,
          tracking,
          replayed: false,
        };
      },
    );

    return orderSubmitResultSchema.parse(result);
  },
);

/** Read integer VND Cost from a private item snapshot, or null when absent. */
function readCostVnd(snap: DocumentSnapshot | undefined): number | null {
  if (!snap?.exists) {
    return null;
  }
  const cost = snap.get('costPriceVnd');
  return typeof cost === 'number' && Number.isInteger(cost) && cost >= 0
    ? cost
    : null;
}

/**
 * Public query: read one tracking projection by its opaque token. The Customer
 * never reads the tenant orders collection (NFR-PRIV-001).
 */
export const callableOrderGetTracking = onCall(CALL_OPTIONS, async (request) => {
  assertAppCheck(request);
  const parsed = orderTrackingInputSchema.safeParse(request.data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', ORDER_NOT_FOUND_MESSAGE);
  }

  const db = getDb();
  const snap = await db.doc(`publicOrderTracking/${parsed.data.trackingToken}`).get();
  if (!snap.exists) {
    return orderTrackingResultSchema.parse({
      schemaVersion: ORDER_CONTRACT_VERSION,
      tracking: null,
    });
  }
  const data = snap.data() ?? {};
  if (!isOrderStatus(data.status) || data.tenantId === undefined) {
    throw new HttpsError('internal', ORDER_NOT_FOUND_MESSAGE);
  }
  return orderTrackingResultSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    tracking: data,
  });
});

/** Reserved collection names for Fulfilment and Payment plans (P0-008/009). */
export const ORDER_STATUS_EVENT_COLLECTION = 'statusEvents';
export const ORDER_TRACKING_COLLECTION = 'publicOrderTracking';

export interface BuildOrderStatusMutationInput {
  tenantId: string;
  orderId: string;
  previousStatus: OrderStatus;
  nextStatus: OrderStatus;
  actorUid: string;
  reason: string | null;
  now: string;
  /** Fresh Order snapshot read inside the shared transaction. */
  order: OrderSnapshot;
  /**
   * Optional recipe-resolved unit Cost per menu item. When present, the plan
   * snapshots the Cost onto the Order lines at cooking start
   * (docs/module/inventory.md).
   */
  costByMenuItemId?: Map<string, number>;
}

/**
 * Build the validated Order mutation plan without touching Firestore. Ordering
 * owns the shape; Fulfilment applies it inside the shared transaction
 * (docs/module/ordering.md). The plan also carries the public tracking
 * projection so one commit updates Customer views (REQ-ORD-003, NFR-RT-001).
 */
export function buildOrderStatusMutationPlan(
  input: BuildOrderStatusMutationInput,
): OrderStatusMutationPlan {
  const items = input.order.items.map((item) => {
    const cost = input.costByMenuItemId?.get(item.menuItemId);
    if (cost === undefined || !Number.isInteger(cost) || cost < 0) {
      return item;
    }
    return {
      ...item,
      unitCostVnd: cost,
      lineCostVnd: cost * item.quantity,
    };
  });

  const statusEvent: OrderStatusEvent = {
    schemaVersion: ORDER_CONTRACT_VERSION,
    eventId: `${input.orderId}__${input.nextStatus}`,
    previousStatus: input.previousStatus,
    newStatus: input.nextStatus,
    actorType: 'staff',
    actorUid: input.actorUid,
    reason: input.reason,
    createdAt: input.now,
  };

  const tracking = buildPublicOrderTracking(
    { ...input.order, status: input.nextStatus, items, updatedAt: input.now },
    input.now,
  );

  return orderStatusMutationPlanSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    tenantId: input.tenantId,
    orderId: input.orderId,
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
    statusEvent,
    items,
    tracking,
    lifecycleAt: input.now,
    updatedAt: input.now,
  });
}

/**
 * Apply an Order mutation plan. Only Ordering code writes Order documents, so
 * the coordinator calls this function inside its transaction. The public
 * tracking projection commits in the same transaction for Customer views.
 */
export function applyOrderStatusMutationPlan(
  transaction: Transaction,
  db: Firestore,
  plan: OrderStatusMutationPlan,
): void {
  const orderRef = db.doc(
    `tenants/${plan.tenantId}/orders/${plan.orderId}`,
  );
  transaction.set(
    orderRef,
    {
      status: plan.nextStatus,
      items: plan.items,
      updatedAt: plan.updatedAt,
      [`${plan.nextStatus}At`]: plan.lifecycleAt,
      // A cancellation stores the mandatory Cashier reason on the Order
      // (REQ-CAS-002, docs/data-model.md).
      ...(plan.nextStatus === 'cancelled' && plan.statusEvent.reason
        ? { cancellationReason: plan.statusEvent.reason }
        : {}),
    },
    { merge: true },
  );
  transaction.set(
    orderRef.collection(ORDER_STATUS_EVENT_COLLECTION).doc(plan.statusEvent.eventId),
    plan.statusEvent,
  );
  transaction.set(
    db.doc(`${ORDER_TRACKING_COLLECTION}/${plan.tracking.trackingToken}`),
    plan.tracking,
  );
}

export interface BuildOrderPaymentMutationInput {
  tenantId: string;
  orderId: string;
  /** Fresh Order snapshot read inside the shared Payment transaction. */
  order: OrderSnapshot;
  paymentMethod: 'cash' | 'vietQr';
  actorUid: string;
  now: string;
}

/**
 * Build the validated Order mutation for a confirmed Payment. Ordering owns
 * every Order write, so Payment applies this plan inside the shared settlement
 * transaction (docs/module/ordering.md). A Pay-Later Order moves to `paid`; a
 * Pay-First Order keeps its preparation status and records `paidAt`, which
 * releases it to Kitchen (REQ-CAS-001, REQ-ORD-002).
 */
export function buildOrderPaymentMutationPlan(
  input: BuildOrderPaymentMutationInput,
): OrderPaymentMutationPlan {
  const isPayFirst = input.order.paymentMode === 'payFirst';
  const nextStatus: OrderStatus = isPayFirst ? input.order.status : 'paid';
  const statusChanged = nextStatus !== input.order.status;

  const statusEvent: OrderStatusEvent | null = statusChanged
    ? {
        schemaVersion: ORDER_CONTRACT_VERSION,
        eventId: `${input.orderId}__paid`,
        previousStatus: input.order.status,
        newStatus: nextStatus,
        actorType: 'staff',
        actorUid: input.actorUid,
        reason: null,
        createdAt: input.now,
      }
    : null;

  const tracking = buildPublicOrderTracking(
    { ...input.order, status: nextStatus, updatedAt: input.now },
    input.now,
  );

  return orderPaymentMutationPlanSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    tenantId: input.tenantId,
    orderId: input.orderId,
    previousStatus: input.order.status,
    nextStatus,
    paymentMethod: input.paymentMethod,
    paidAt: input.now,
    statusEvent,
    tracking,
    updatedAt: input.now,
  });
}

/**
 * Apply the Payment settlement plan. Only Ordering code writes Order documents,
 * so Payment calls this function inside its transaction. The status event and
 * public tracking projection commit atomically with the payment record.
 */
export function applyOrderPaymentMutationPlan(
  transaction: Transaction,
  db: Firestore,
  plan: OrderPaymentMutationPlan,
): void {
  const orderRef = db.doc(`tenants/${plan.tenantId}/orders/${plan.orderId}`);
  transaction.set(
    orderRef,
    {
      status: plan.nextStatus,
      paymentMethod: plan.paymentMethod,
      paidAt: plan.paidAt,
      updatedAt: plan.updatedAt,
    },
    { merge: true },
  );
  if (plan.statusEvent) {
    transaction.set(
      orderRef
        .collection(ORDER_STATUS_EVENT_COLLECTION)
        .doc(plan.statusEvent.eventId),
      plan.statusEvent,
    );
  }
  transaction.set(
    db.doc(`${ORDER_TRACKING_COLLECTION}/${plan.tracking.trackingToken}`),
    plan.tracking,
  );
}

/**
 * Apply the retention archive plan. Only Ordering code writes Order documents,
 * so the scheduled job calls this inside the shared transaction. The archive
 * copy and the source `archivedAt` marker commit together, and a retry is a
 * no-op because already-archived Orders are excluded from the plan
 * (NFR-RET-001, docs/data-model.md §10).
 */
export function applyOrderArchivePlan(
  transaction: Transaction,
  db: Firestore,
  plan: OrderArchivePlan,
  sourceDataByOrderId: Map<string, DocumentData>,
): void {
  for (const line of plan.lines) {
    const source = sourceDataByOrderId.get(line.orderId);
    if (!source) {
      continue;
    }
    transaction.set(db.doc(line.archivePath), {
      ...source,
      archiveMetadata: {
        retentionYears: plan.retentionYears,
        cutoffAt: plan.cutoffAt,
        archivedAt: plan.createdAt,
      },
    });
    transaction.set(
      db.doc(`tenants/${plan.tenantId}/orders/${line.orderId}`),
      { archivedAt: plan.createdAt, updatedAt: plan.createdAt },
      { merge: true },
    );
  }
}

/**
 * Apply the linked Order correction mutation. The Order status stays `paid`;
 * only the correction instant is recorded so the compensating Payment stays the
 * authoritative correction record (REQ-PAY-001).
 */
export function applyOrderCorrectionMutationPlan(
  transaction: Transaction,
  db: Firestore,
  plan: OrderCorrectionMutationPlan,
): void {
  transaction.set(
    db.doc(`tenants/${plan.tenantId}/orders/${plan.orderId}`),
    {
      [`${plan.kind}At`]: plan.correctedAt,
      updatedAt: plan.updatedAt,
    },
    { merge: true },
  );
}

export interface KitchenEligibilityOrder {
  status: OrderStatus;
  paymentMode: OrderSnapshot['paymentMode'];
  paidAt: string | null;
}

/**
 * Kitchen queue eligibility. A Pay-Later Order is eligible immediately; a
 * Pay-First Order stays hidden until Payment records `paidAt`
 * (REQ-ORD-002, docs/module/ordering.md).
 */
export function isKitchenEligibleOrder(order: KitchenEligibilityOrder): boolean {
  if (order.status !== 'pending' && order.status !== 'cooking') {
    return false;
  }
  if (order.paymentMode === 'payLater') {
    return true;
  }
  return typeof order.paidAt === 'string' && order.paidAt.length > 0;
}

/** Cashier query: tenant-scoped unpaid Orders for manual settlement. */
export const callableOrderListUnpaid = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseOrderTenantListInput(request.data);
  const db = getDb();
  const memberSnap = await db
    .doc(`tenants/${input.tenantId}/members/${uid}`)
    .get();
  const memberData = memberSnap.data();
  assertActiveOrderingMember(memberData);
  if (!memberData || !hasOrderingRole(memberData, 'cashier')) {
    throw new HttpsError('permission-denied', ORDERING_CASHIER_DENIED_MESSAGE);
  }

  const snap = await db
    .collection(`tenants/${input.tenantId}/orders`)
    .where('status', 'in', ['pending', 'cooking', 'ready', 'served'])
    .orderBy('createdAt', 'desc')
    .limit(ORDER_LIST_LIMIT)
    .get();

  return orderListResultSchema.parse({
    schemaVersion: ORDER_CONTRACT_VERSION,
    orders: snap.docs.map((docSnap) =>
      mapStoredOrder(docSnap.id, docSnap.data()),
    ),
  });
});

/**
 * Floor-plan query: one service state per busy table, folded from live Orders
 * (REQ-TBL-003). Any active member may read it because the projection carries
 * no money, no Customer identity, and no Order line; the screen polls it, so it
 * is always computed from source instead of from a projection that could drift.
 */
export const callableOrderListTableStatus = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrderTenantListInput(request.data);
    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveOrderingMember(memberSnap.data());

    const snap = await db
      .collection(`tenants/${input.tenantId}/orders`)
      .where('status', 'in', ACTIVE_TABLE_ORDER_STATUSES)
      .orderBy('createdAt', 'desc')
      .limit(ORDER_LIST_LIMIT)
      .get();

    return tableStatusListResultSchema.parse({
      schemaVersion: TABLE_STATUS_CONTRACT_VERSION,
      tenantId: input.tenantId,
      generatedAt: nowIso(),
      tables: aggregateTableServiceStatus(
        snap.docs.map((docSnap) => ({
          tableId: docSnap.get('tableId'),
          status: docSnap.get('status'),
          paidAt: docSnap.get('paidAt'),
          createdAt: docSnap.get('createdAt'),
        })),
      ),
    });
  },
);

/**
 * Kitchen query: bounded pending/cooking queue. Pay-First Orders without a
 * confirmed Payment never appear (REQ-ORD-002, Pay-First gate).
 */
export const callableOrderListKitchen = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrderTenantListInput(request.data);
    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    const memberData = memberSnap.data();
    assertActiveOrderingMember(memberData);
    if (!memberData || !hasOrderingRole(memberData, 'kitchen')) {
      throw new HttpsError('permission-denied', ORDERING_KITCHEN_DENIED_MESSAGE);
    }

    const snap = await db
      .collection(`tenants/${input.tenantId}/orders`)
      .where('status', 'in', ['pending', 'cooking'])
      .orderBy('createdAt', 'desc')
      .limit(ORDER_LIST_LIMIT)
      .get();

    const orders = snap.docs
      .filter((docSnap) =>
        isKitchenEligibleOrder({
          status: docSnap.get('status') as OrderStatus,
          paymentMode: docSnap.get('paymentMode'),
          paidAt: (docSnap.get('paidAt') as string | null) ?? null,
        }),
      )
      .map((docSnap) => mapStoredOrder(docSnap.id, docSnap.data()));

    return orderListResultSchema.parse({
      schemaVersion: ORDER_CONTRACT_VERSION,
      orders,
    });
  },
);

export const ORDER_STOCK_MOVEMENT_COLLECTION = 'stockMovements';

/**
 * Cashier command: cancel one unpaid Order with a mandatory reason. Ordering
 * owns the Order state change; Inventory owns the restoration plan. One
 * transaction stops fulfilment, restores each recorded deduction exactly once,
 * records the idempotency key, and appends the audit event (REQ-CAS-002,
 * REQ-INV-002, docs/data-model.md §9).
 */
export const callableOrderCancelUnpaid = onCall(
  CALL_OPTIONS,
  async (request): Promise<OrderCancellationResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrderCancelInput(request.data);
    const db = getDb();
    const { tenantId, orderId } = input;

    const memberRef = db.doc(`tenants/${tenantId}/members/${uid}`);
    const orderRef = db.doc(`tenants/${tenantId}/orders/${orderId}`);
    const idempotencyRef = db.doc(
      `tenants/${tenantId}/idempotency/${input.idempotencyKey}`,
    );
    const requestHash = buildOrderCancelRequestHash(input);

    const outcome = await db.runTransaction<{
      replayed: boolean;
      order: OrderSnapshot;
      restoredMovementIds: string[];
    }>(async (transaction) => {
      // All reads precede all writes (RULES_FIREBASE §4).
      const memberSnap = await transaction.get(memberRef);
      const idempotencySnap = await transaction.get(idempotencyRef);
      const orderSnap = await transaction.get(orderRef);
      assertCashierOrOwner(memberSnap.data());
      if (!orderSnap.exists) {
        throw new HttpsError('not-found', ORDER_NOT_FOUND_MESSAGE);
      }

      const order = mapStoredOrder(orderId, orderSnap.data() ?? {});
      const existing = idempotencySnap.data() as IdempotencyRecord | undefined;
      if (existing) {
        assertIdempotencyMatch(existing, requestHash);
        return { replayed: true, order, restoredMovementIds: [] };
      }
      assertUnpaidCancellableOrder(order);

      // Read the recorded deductions for the Order, then the current stock for
      // every affected ingredient, still before any write.
      const movementSnaps = await transaction.get(
        db
          .collection(`tenants/${tenantId}/${ORDER_STOCK_MOVEMENT_COLLECTION}`)
          .where('orderId', '==', orderId),
      );
      const deductions: RecordedDeduction[] = [];
      for (const movementSnap of movementSnaps.docs) {
        if (movementSnap.get('reason') !== 'order_deduction') {
          continue;
        }
        const ingredientId = movementSnap.get('ingredientId');
        const delta = movementSnap.get('quantityDelta');
        if (
          typeof ingredientId === 'string' &&
          typeof delta === 'number' &&
          delta < 0
        ) {
          deductions.push({
            ingredientId,
            quantityBaseUnits: -delta,
          });
        }
      }
      const ingredientIds = Array.from(
        new Set(deductions.map((deduction) => deduction.ingredientId)),
      );
      const ingredientRefs = ingredientIds.map((ingredientId) =>
        db.doc(`${ingredientCollectionPath(tenantId)}/${ingredientId}`),
      );
      const ingredientSnaps =
        ingredientRefs.length > 0
          ? await transaction.getAll(...ingredientRefs)
          : [];
      const ingredientsById = new Map<string, Ingredient>();
      ingredientSnaps.forEach((snap, index) => {
        const ingredientId = ingredientIds[index];
        if (snap.exists && ingredientId) {
          ingredientsById.set(
            ingredientId,
            toIngredient(ingredientId, snap.data() ?? {}),
          );
        }
      });

      const now = nowIso();
      const restoration = buildInventoryRestorationPlan({
        tenantId,
        orderId,
        idempotencyKey: input.idempotencyKey,
        deductions,
        ingredientsById,
        now,
      });
      const plan = buildOrderStatusMutationPlan({
        tenantId,
        orderId,
        previousStatus: order.status,
        nextStatus: 'cancelled',
        actorUid: uid,
        reason: input.reason,
        now,
        order,
      });

      // Restoring redeemed points is a read-then-write, so it must run before
      // the Inventory restoration writes anything (RULES_FIREBASE §4).
      await applyLoyaltyRedeemReversalPlan(
        transaction,
        db,
        tenantId,
        order,
        input.reason,
        input.idempotencyKey,
        uid,
        now,
      );

      applyInventoryRestorationPlan(transaction, db, restoration, uid);
      applyOrderStatusMutationPlan(transaction, db, plan);
      transaction.set(idempotencyRef, {
        command: 'cancelUnpaidOrder',
        requestHash,
        orderId,
        trackingToken: order.trackingToken,
        status: 'applied',
        createdAt: now,
      } satisfies IdempotencyRecord);
      writeAuditEventInTransaction(transaction, {
        tenantId,
        actorUid: uid,
        actorType: memberSnap.get('membershipType') === 'owner' ? 'owner' : 'staff',
        role: memberSnap.get('membershipType') === 'owner' ? 'owner' : 'cashier',
        action: 'OrderCancelled',
        targetType: 'order',
        targetId: orderId,
        requestId: input.idempotencyKey,
        reason: input.reason,
        detail: {
          previousStatus: order.status,
          restoredMovementIds: restoration.lines.map((line) => line.movementId),
        },
      });

      return {
        replayed: false,
        order: mapStoredOrder(orderId, {
          ...(orderSnap.data() ?? {}),
          status: 'cancelled',
          items: plan.items,
          updatedAt: plan.updatedAt,
          cancellationReason: input.reason,
        }),
        restoredMovementIds: restoration.lines.map((line) => line.movementId),
      };
    });

    return orderCancellationResultSchema.parse({
      schemaVersion: ORDER_CONTRACT_VERSION,
      status: outcome.replayed ? 'replayed' : 'cancelled',
      order: outcome.order,
      restoredMovementIds: outcome.restoredMovementIds,
    });
  },
);
