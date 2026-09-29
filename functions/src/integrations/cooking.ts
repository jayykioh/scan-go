import { FieldValue, Firestore } from 'firebase-admin/firestore'
import { hasRole, idempotencyRef, JsonRecord, requireInteger, requireSafeId, requestHash } from '../shared/transaction.js'

/** REQ-INV-001, REQ-KDS-001: transaction-ready Inventory input from Dev 4. */
export interface CookingInventoryPlan {
  planId: string
  tenantId: string
  orderId: string
  kind: 'deduct-for-cooking'
  idempotencyKey: string
  movements: ReadonlyArray<{ ingredientId: string; quantityDelta: number; unit: string }>
}

export interface StartCookingRequest {
  tenantId: string
  orderId: string
  actorUid: string
  idempotencyKey: string
  inventoryPlan: CookingInventoryPlan
}

export interface StartCookingResult {
  orderId: string
  status: 'cooking'
  deducedMovementIds: ReadonlyArray<string>
  idempotent: boolean
}

const orderPath = (tenantId: string, orderId: string) => `tenants/${tenantId}/orders/${orderId}`

/**
 * Reads membership, Order, idempotency, and every ingredient before any write.
 * Firestore may rerun this callback; the tenant idempotency document makes its
 * committed effects exactly-once.
 */
export async function startCookingTransaction(db: Firestore, request: StartCookingRequest): Promise<StartCookingResult> {
  requireSafeId(request.tenantId, 'tenantId')
  requireSafeId(request.orderId, 'orderId')
  requireSafeId(request.actorUid, 'actorUid')
  requireSafeId(request.idempotencyKey, 'idempotencyKey')
  const plan = request.inventoryPlan
  if (plan.tenantId !== request.tenantId || plan.orderId !== request.orderId || plan.kind !== 'deduct-for-cooking') {
    throw new Error('InventoryMutationPlan does not target this cooking request')
  }
  if (plan.idempotencyKey !== request.idempotencyKey || plan.movements.length === 0) {
    throw new Error('InventoryMutationPlan must be non-empty and share the idempotency key')
  }

  const memberRef = db.doc(`tenants/${request.tenantId}/members/${request.actorUid}`)
  const orderRef = db.doc(orderPath(request.tenantId, request.orderId))
  const idemRef = idempotencyRef(db, request.tenantId, request.idempotencyKey)
  const ingredientRefs = plan.movements.map(movement => db.doc(`tenants/${request.tenantId}/ingredients/${requireSafeId(movement.ingredientId, 'ingredientId')}`))
  const movementIds = plan.movements.map(movement => `deduct_${request.orderId}_${movement.ingredientId}_${request.idempotencyKey}`)
  const movementRefs = movementIds.map(id => db.doc(`tenants/${request.tenantId}/stockMovements/${id}`))
  const requestFingerprint = requestHash({ orderId: request.orderId, actorUid: request.actorUid, plan })

  return db.runTransaction(async tx => {
    const reads = await Promise.all([
      tx.get(memberRef),
      tx.get(orderRef),
      tx.get(idemRef),
      ...ingredientRefs.map(ref => tx.get(ref)),
      ...movementRefs.map(ref => tx.get(ref)),
    ])
    const [memberSnapshot, orderSnapshot, idemSnapshot, ...remaining] = reads
    const ingredientSnapshots = remaining.slice(0, ingredientRefs.length)
    const movementSnapshots = remaining.slice(ingredientRefs.length)
    if (!memberSnapshot.exists || !hasRole(memberSnapshot.data() as JsonRecord, 'kitchen')) throw new Error('Kitchen role is required')

    if (idemSnapshot.exists) {
      const existing = idemSnapshot.data() as JsonRecord
      if (existing.requestHash !== requestFingerprint) throw new Error('Idempotency key was reused with another request')
      return { ...(existing.result as StartCookingResult), idempotent: true }
    }
    if (!orderSnapshot.exists) throw new Error('Order does not exist')
    const order = orderSnapshot.data() as JsonRecord
    if (order.status !== 'pending') throw new Error('Only pending orders can start cooking')
    if (order.visibleToKitchen === false) throw new Error('Pay-First order cannot enter Kitchen before payment')

    plan.movements.forEach((movement, index) => {
      const delta = requireInteger(movement.quantityDelta, 'quantityDelta', Number.MIN_SAFE_INTEGER)
      if (delta >= 0) throw new Error('Cooking deduction must be negative')
      const ingredient = ingredientSnapshots[index]
      if (!ingredient.exists) throw new Error(`Ingredient ${movement.ingredientId} does not exist`)
      const data = ingredient.data() as JsonRecord
      const stockQuantity = requireInteger(data.stockQuantity, 'ingredient.stockQuantity')
      if (data.isActive !== true || stockQuantity + delta < 0) throw new Error(`Insufficient stock for ${movement.ingredientId}`)
      if (movementSnapshots[index].exists) throw new Error(`Duplicate stock movement ${movementIds[index]}`)
    })

    tx.update(orderRef, {
      status: 'cooking',
      cookingAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      version: FieldValue.increment(1),
    })
    tx.set(orderRef.collection('statusEvents').doc(`cooking_${request.idempotencyKey}`), {
      tenantId: request.tenantId, orderId: request.orderId, from: 'pending', to: 'cooking',
      actorUid: request.actorUid, actorRole: 'Kitchen', idempotencyKey: request.idempotencyKey,
      occurredAt: FieldValue.serverTimestamp(),
    })
    plan.movements.forEach((movement, index) => {
      tx.update(ingredientRefs[index], { stockQuantity: FieldValue.increment(movement.quantityDelta), updatedAt: FieldValue.serverTimestamp() })
      tx.create(movementRefs[index], {
        tenantId: request.tenantId, orderId: request.orderId, ingredientId: movement.ingredientId,
        quantityDelta: movement.quantityDelta, unit: movement.unit, kind: 'deduction',
        planId: plan.planId, idempotencyKey: request.idempotencyKey, actorUid: request.actorUid,
        createdAt: FieldValue.serverTimestamp(),
      })
    })
    const result: StartCookingResult = { orderId: request.orderId, status: 'cooking', deducedMovementIds: movementIds, idempotent: false }
    tx.create(idemRef, {
      command: 'fulfilment-start-cooking', requestHash: requestFingerprint, result,
      createdAt: FieldValue.serverTimestamp(), expiresAt: null,
    })
    return result
  })
}
