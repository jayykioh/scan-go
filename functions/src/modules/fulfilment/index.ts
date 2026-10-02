import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
  FULFILMENT_CONTRACT_VERSION,
  fulfilmentCommandResultSchema,
  type FulfilmentCommand,
  type FulfilmentCommandResult,
  type FulfilmentMarkServedInput,
  type KitchenTransitionTarget,
  type ServedTransitionTarget,
} from '../../../../shared/contracts/fulfilment.contract.js';
import {
  ORDER_CONTRACT_VERSION,
  orderListResultSchema,
  orderTenantListInputSchema,
  type OrderSnapshot,
  type OrderStatus,
} from '../../../../shared/contracts/order.contract.js';
import {
  type Ingredient,
  type InventoryDeductionPlan,
  type Recipe,
} from '../../../../shared/contracts/inventory.contract.js';
import {
  applyOrderNotificationPlan,
  buildOrderNotificationEvent,
} from './notification.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import {
  applyOrderStatusMutationPlan,
  buildOrderStatusMutationPlan,
} from '../ordering/index.js';
import {
  applyInventoryDeductionPlan,
  buildInventoryDeductionPlan,
  ingredientCollectionPath,
  recipeCollectionPath,
  toIngredient,
  toRecipe,
} from '../inventory/service.js';
import {
  assertFulfilmentIdempotencyMatch,
  assertKitchenOrOwnerMember,
  assertKitchenTransition,
  assertWaiterOrOwnerMember,
  assertWaiterTransition,
  buildFulfilmentRequestHash,
  buildRecipeCostByMenuItemId,
  chunkValues,
  FULFILMENT_ORDER_NOT_FOUND_MESSAGE,
  FULFILMENT_WAITER_DENIED_MESSAGE,
  FULFILMENT_WAITER_QUEUE_INVALID_MESSAGE,
  mapStoredOrder,
  nowIso,
  parseMarkReadyInput,
  parseMarkServedInput,
  parseStartCookingInput,
  requireUid,
  type FulfilmentIdempotencyRecord,
} from './service.js';

const CALL_OPTIONS = { region: 'us-central1', cors: true } as const;

interface KitchenCommandArgs {
  tenantId: string;
  orderId: string;
  actorUid: string;
  target: 'cooking' | 'ready';
  idempotencyKey: string;
  requestHash: string;
}

/**
 * Coordinate one Kitchen transition. Ordering owns the Order mutation plan,
 * Inventory owns the deduction plan, and Fulfilment commits both in one
 * transaction so status and stock change exactly once (REQ-KDS-001,
 * REQ-INV-001, docs/data-model.md §9).
 */
async function runKitchenCommand(
  args: KitchenCommandArgs,
): Promise<FulfilmentCommandResult> {
  const db = getDb();
  const { tenantId, orderId } = args;
  const memberRef: DocumentReference = db.doc(
    `tenants/${tenantId}/members/${args.actorUid}`,
  );
  const orderRef = db.doc(`tenants/${tenantId}/orders/${orderId}`);
  const idempotencyRef = db.doc(
    `tenants/${tenantId}/idempotency/${args.idempotencyKey}`,
  );

  const outcome = await db.runTransaction<{
    replayed: boolean;
    order: FulfilmentCommandResult['order'];
    deduction: InventoryDeductionPlan | null;
    movementIds: string[];
  }>(async (transaction) => {
    // All reads precede all writes (RULES_FIREBASE §4).
    const memberSnap = await transaction.get(memberRef);
    const idempotencySnap = await transaction.get(idempotencyRef);
    const freshOrderSnap = await transaction.get(orderRef);
    assertKitchenOrOwnerMember(memberSnap.data());
    if (!freshOrderSnap.exists) {
      throw new HttpsError('not-found', FULFILMENT_ORDER_NOT_FOUND_MESSAGE);
    }

    const existing = idempotencySnap.data() as
      | FulfilmentIdempotencyRecord
      | undefined;
    if (existing) {
      assertFulfilmentIdempotencyMatch(existing, args.requestHash);
      return {
        replayed: true,
        order: mapStoredOrder(orderId, freshOrderSnap.data() ?? {}),
        deduction: null,
        movementIds: [],
      };
    }

    const order = mapStoredOrder(orderId, freshOrderSnap.data() ?? {});
    assertKitchenTransition(order.status, args.target);

    // Recipes are read inside the same transaction as the stock deduction, so a
    // recipe change cannot commit a wrong deduction (REQ-INV-001). Firestore
    // `in` filters accept at most 30 values, so menu item ids are chunked and
    // every chunk result is merged.
    const recipes: Recipe[] = [];
    if (args.target === 'cooking') {
      const menuItemIds = Array.from(
        new Set(order.items.map((item) => item.menuItemId)),
      );
      for (const chunk of chunkValues(menuItemIds)) {
        const recipeSnaps = await transaction.get(
          db
            .collection(recipeCollectionPath(tenantId))
            .where('menuItemId', 'in', chunk),
        );
        recipes.push(
          ...recipeSnaps.docs.map((docSnap) =>
            toRecipe(docSnap.id, docSnap.data()),
          ),
        );
      }
    }
    const recipesByMenuItemId = new Map(
      recipes.map((recipe) => [recipe.menuItemId, recipe]),
    );
    const costByMenuItemId = buildRecipeCostByMenuItemId(recipes);

    let deduction: InventoryDeductionPlan | null = null;
    if (args.target === 'cooking') {
      const ingredientIds = Array.from(
        new Set(recipes.flatMap((recipe) => recipe.lines.map((line) => line.ingredientId))),
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
      deduction = buildInventoryDeductionPlan({
        tenantId,
        orderId,
        idempotencyKey: args.idempotencyKey,
        items: order.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
        })),
        recipesByMenuItemId,
        ingredientsById,
        now: nowIso(),
      });
    }

    const now = nowIso();
    const plan = buildOrderStatusMutationPlan({
      tenantId,
      orderId,
      previousStatus: order.status,
      nextStatus: args.target,
      actorUid: args.actorUid,
      reason: null,
      now,
      order,
      costByMenuItemId: args.target === 'cooking' ? costByMenuItemId : undefined,
    });

    if (deduction) {
      applyInventoryDeductionPlan(transaction, db, deduction, args.actorUid);
    }
    applyOrderStatusMutationPlan(transaction, db, plan);
    if (args.target === 'ready') {
      // A ready transition raises exactly one Waiter notification effect. The
      // deterministic event id dedupes a transaction retry (REQ-NOT-001).
      applyOrderNotificationPlan(
        transaction,
        db,
        buildOrderNotificationEvent({
          tenantId,
          kind: 'orderReady',
          order: { ...order, status: args.target, updatedAt: now },
          now,
        }),
      );
    }
    transaction.set(idempotencyRef, {
      command: args.target === 'cooking' ? 'startCooking' : 'markReady',
      requestHash: args.requestHash,
      tenantId,
      orderId,
      status: 'applied',
      createdAt: now,
    } satisfies FulfilmentIdempotencyRecord);
    writeAuditEventInTransaction(transaction, {
      tenantId,
      actorUid: args.actorUid,
      actorType: 'staff',
      role: 'kitchen',
      action: args.target === 'cooking' ? 'CookingStarted' : 'OrderReady',
      targetType: 'order',
      targetId: orderId,
      requestId: args.idempotencyKey,
      detail: {
        previousStatus: order.status,
        newStatus: args.target,
        movementIds: deduction?.lines.map((line) => line.movementId) ?? [],
      },
    });

    return {
      replayed: false,
      order: mapStoredOrder(orderId, {
        ...(freshOrderSnap.data() ?? {}),
        status: plan.nextStatus,
        items: plan.items,
        updatedAt: plan.updatedAt,
      }),
      deduction,
      movementIds: deduction?.lines.map((line) => line.movementId) ?? [],
    };
  });

  const command: FulfilmentCommand =
    args.target === 'cooking' ? 'startCooking' : 'markReady';
  return fulfilmentCommandResultSchema.parse({
    schemaVersion: FULFILMENT_CONTRACT_VERSION,
    command,
    status: outcome.replayed ? 'replayed' : 'applied',
    order: outcome.order,
    deduction: outcome.deduction,
    movementIds: outcome.movementIds,
    appliedAt: nowIso(),
  });
}

/**
 * Kitchen command: `pending → cooking`. Inventory deducts each configured
 * ingredient once inside the same transaction that changes the Order status.
 */
export const callableFulfilmentStartCooking = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseStartCookingInput(request.data);
    return runKitchenCommand({
      tenantId: input.tenantId,
      orderId: input.orderId,
      actorUid: uid,
      target: 'cooking',
      idempotencyKey: input.idempotencyKey,
      requestHash: buildFulfilmentRequestHash(
        'startCooking',
        input.tenantId,
        input.orderId,
      ),
    });
  },
);

/** Kitchen command: `cooking → ready`. It changes only the Order status. */
export const callableFulfilmentMarkReady = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseMarkReadyInput(request.data);
    return runKitchenCommand({
      tenantId: input.tenantId,
      orderId: input.orderId,
      actorUid: uid,
      target: 'ready',
      idempotencyKey: input.idempotencyKey,
      requestHash: buildFulfilmentRequestHash(
        'markReady',
        input.tenantId,
        input.orderId,
      ),
    });
  },
);

/**
 * Coordinate one Waiter transition. Fulfilment authorizes the Waiter and
 * validates `ready → served`; Ordering owns the Order mutation plan
 * (REQ-WAI-001, docs/module/fulfilment.md). The plan commits inside one
 * transaction so the status changes exactly once.
 */
async function runWaiterCommand(
  args: { tenantId: string; orderId: string; actorUid: string } & {
    idempotencyKey: string;
    requestHash: string;
  },
): Promise<FulfilmentCommandResult> {
  const db = getDb();
  const { tenantId, orderId } = args;
  const memberRef: DocumentReference = db.doc(
    `tenants/${tenantId}/members/${args.actorUid}`,
  );
  const orderRef = db.doc(`tenants/${tenantId}/orders/${orderId}`);
  const idempotencyRef = db.doc(
    `tenants/${tenantId}/idempotency/${args.idempotencyKey}`,
  );

  const outcome = await db.runTransaction<{
    replayed: boolean;
    order: FulfilmentCommandResult['order'];
  }>(async (transaction) => {
    // All reads precede all writes (RULES_FIREBASE §4).
    const memberSnap = await transaction.get(memberRef);
    const idempotencySnap = await transaction.get(idempotencyRef);
    const orderSnap = await transaction.get(orderRef);
    assertWaiterOrOwnerMember(memberSnap.exists ? memberSnap.data() : undefined);
    if (!orderSnap.exists) {
      throw new HttpsError('not-found', FULFILMENT_ORDER_NOT_FOUND_MESSAGE);
    }

    const existing = idempotencySnap.data() as
      | FulfilmentIdempotencyRecord
      | undefined;
    if (existing) {
      assertFulfilmentIdempotencyMatch(existing, args.requestHash);
      return {
        replayed: true,
        order: mapStoredOrder(orderId, orderSnap.data() ?? {}),
      };
    }

    const order = mapStoredOrder(orderId, orderSnap.data() ?? {});
    assertWaiterTransition(order.status, 'served');

    const now = nowIso();
    const plan = buildOrderStatusMutationPlan({
      tenantId,
      orderId,
      previousStatus: order.status,
      nextStatus: 'served',
      actorUid: args.actorUid,
      reason: null,
      now,
      order,
    });

    applyOrderStatusMutationPlan(transaction, db, plan);
    transaction.set(idempotencyRef, {
      command: 'markServed',
      requestHash: args.requestHash,
      tenantId,
      orderId,
      status: 'applied',
      createdAt: now,
    } satisfies FulfilmentIdempotencyRecord);
    writeAuditEventInTransaction(transaction, {
      tenantId,
      actorUid: args.actorUid,
      actorType: 'staff',
      role: 'waiter',
      action: 'OrderServed',
      targetType: 'order',
      targetId: orderId,
      requestId: args.idempotencyKey,
      detail: { previousStatus: order.status, newStatus: 'served' },
    });

    return {
      replayed: false,
      order: mapStoredOrder(orderId, {
        ...(orderSnap.data() ?? {}),
        status: 'served',
        items: plan.items,
        updatedAt: plan.updatedAt,
      }),
    };
  });

  return fulfilmentCommandResultSchema.parse({
    schemaVersion: FULFILMENT_CONTRACT_VERSION,
    command: 'markServed',
    status: outcome.replayed ? 'replayed' : 'applied',
    order: outcome.order,
    deduction: null,
    movementIds: [],
    appliedAt: nowIso(),
  });
}

/**
 * Waiter command: `ready → served` only. Payment and menu actions stay denied
 * because Waiter never holds those roles (REQ-WAI-001).
 */
export const callableFulfilmentMarkServed = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input: FulfilmentMarkServedInput = parseMarkServedInput(request.data);
    return runWaiterCommand({
      tenantId: input.tenantId,
      orderId: input.orderId,
      actorUid: uid,
      idempotencyKey: input.idempotencyKey,
      requestHash: buildFulfilmentRequestHash(
        'markServed',
        input.tenantId,
        input.orderId,
      ),
    });
  },
);

/** Waiter queue is bounded (docs/RULES_FIREBASE.md §6). */
export const WAITER_READY_QUEUE_LIMIT = 50;

/**
 * Waiter query: bounded `ready` queue. Fulfilment owns Waiter workflow
 * coordination, so the query lives here; Ordering owns the Order documents and
 * Fulfilment never mutates them outside the coordinate functions above
 * (REQ-WAI-001, NFR-RT-001).
 */
export const callableFulfilmentListReady = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const parsed = orderTenantListInputSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError(
        'invalid-argument',
        FULFILMENT_WAITER_QUEUE_INVALID_MESSAGE,
      );
    }
    const { tenantId } = parsed.data;

    const db = getDb();
    const memberSnap = await db.doc(`tenants/${tenantId}/members/${uid}`).get();
    assertWaiterOrOwnerMember(memberSnap.exists ? memberSnap.data() : undefined);

    const snap = await db
      .collection(`tenants/${tenantId}/orders`)
      .where('status', '==', 'ready')
      .orderBy('createdAt', 'desc')
      .limit(WAITER_READY_QUEUE_LIMIT)
      .get();

    return orderListResultSchema.parse({
      schemaVersion: ORDER_CONTRACT_VERSION,
      orders: snap.docs.map((docSnap) =>
        mapStoredOrder(docSnap.id, docSnap.data()),
      ),
    });
  },
);
