import { FieldValue, Firestore } from 'firebase-admin/firestore'
import { hasRole, idempotencyRef, JsonRecord, requireInteger, requireSafeId, requestHash } from '../shared/transaction.js'

/** REQ-INV-002, REQ-CAS-002: restoration references an immutable deduction ledger row. */
export interface CancellationRestoration {
  ingredientId: string
  quantityDelta: number
  unit: string
  sourceMovementId: string
}

export interface CancellationRequest {
  tenantId: string
  orderId: string
  actorUid: string
  actorRole: 'Cashier' | 'Owner'
  idempotencyKey: string
  reason: string
  restorations: ReadonlyArray<CancellationRestoration>
}

export interface CancellationResult {
  orderId: string
  status: 'cancelled'
  reason: string
  restoredMovementIds: ReadonlyArray<string>
  auditEventId: string
  idempotent: boolean
}

export async function cancelUnpaidOrderTransaction(db: Firestore, request: CancellationRequest): Promise<CancellationResult> {
  requireSafeId(request.tenantId, 'tenantId')
  requireSafeId(request.orderId, 'orderId')
  requireSafeId(request.actorUid, 'actorUid')
  requireSafeId(request.idempotencyKey, 'idempotencyKey')
  if (!request.reason.trim() || request.reason.trim().length > 500) throw new Error('Cancellation reason is required')
  if (request.restorations.length === 0) throw new Error('At least one stock restoration is required')
  const memberRef = db.doc(`tenants/${request.tenantId}/members/${request.actorUid}`)
  const orderRef = db.doc(`tenants/${request.tenantId}/orders/${request.orderId}`)
  const idemRef = idempotencyRef(db, request.tenantId, request.idempotencyKey)
  const ingredientRefs = request.restorations.map(item => db.doc(`tenants/${request.tenantId}/ingredients/${requireSafeId(item.ingredientId, 'ingredientId')}`))
  const sourceRefs = request.restorations.map(item => db.doc(`tenants/${request.tenantId}/stockMovements/${requireSafeId(item.sourceMovementId, 'sourceMovementId')}`))
  const restoredMovementIds = request.restorations.map(item => `restore_${item.sourceMovementId}`)
  const restoreRefs = restoredMovementIds.map(id => db.doc(`tenants/${request.tenantId}/stockMovements/${id}`))
  const auditEventId = `cancel_${request.orderId}_${request.idempotencyKey}`
  const auditRef = db.doc(`tenants/${request.tenantId}/audit/${auditEventId}`)
  const fingerprint = requestHash({ ...request, reason: request.reason.trim() })

  return db.runTransaction(async tx => {
    const reads = await Promise.all([
      tx.get(memberRef), tx.get(orderRef), tx.get(idemRef),
      ...ingredientRefs.map(ref => tx.get(ref)),
      ...sourceRefs.map(ref => tx.get(ref)),
      ...restoreRefs.map(ref => tx.get(ref)),
    ])
    const [memberSnapshot, orderSnapshot, idemSnapshot, ...remaining] = reads
    const ingredientSnapshots = remaining.slice(0, ingredientRefs.length)
    const sourceSnapshots = remaining.slice(ingredientRefs.length, ingredientRefs.length * 2)
    const restoreSnapshots = remaining.slice(ingredientRefs.length * 2)
    const requiredRole = request.actorRole.toLowerCase()
    if (!memberSnapshot.exists || !hasRole(memberSnapshot.data() as JsonRecord, requiredRole)) throw new Error(`${request.actorRole} role is required`)
    if (idemSnapshot.exists) {
      const existing = idemSnapshot.data() as JsonRecord
      if (existing.requestHash !== fingerprint) throw new Error('Idempotency key was reused with another request')
      return { ...(existing.result as CancellationResult), idempotent: true }
    }
    if (!orderSnapshot.exists) throw new Error('Order does not exist')
    const order = orderSnapshot.data() as JsonRecord
    if (order.status === 'paid' || order.status === 'cancelled') throw new Error('Only unpaid active orders can be cancelled')

    request.restorations.forEach((restoration, index) => {
      const delta = requireInteger(restoration.quantityDelta, 'quantityDelta', 1)
      const ingredient = ingredientSnapshots[index]
      const source = sourceSnapshots[index]
      if (!ingredient.exists || !source.exists) throw new Error('Ingredient or original deduction movement is missing')
      const sourceData = source.data() as JsonRecord
      if (sourceData.orderId !== request.orderId || sourceData.ingredientId !== restoration.ingredientId || sourceData.kind !== 'deduction') {
        throw new Error('Restoration must reference this order deduction')
      }
      if (sourceData.quantityDelta !== -delta) throw new Error('Restoration quantity must exactly reverse the deduction')
      if (restoreSnapshots[index].exists) throw new Error('A restoration already exists for this deduction')
    })

    tx.update(orderRef, {
      status: 'cancelled', cancellationReason: request.reason.trim(), cancelledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(), version: FieldValue.increment(1),
    })
    tx.set(orderRef.collection('statusEvents').doc(`cancelled_${request.idempotencyKey}`), {
      tenantId: request.tenantId, orderId: request.orderId, from: order.status, to: 'cancelled',
      actorUid: request.actorUid, actorRole: request.actorRole, reason: request.reason.trim(),
      idempotencyKey: request.idempotencyKey, occurredAt: FieldValue.serverTimestamp(),
    })
    request.restorations.forEach((restoration, index) => {
      tx.update(ingredientRefs[index], { stockQuantity: FieldValue.increment(restoration.quantityDelta), updatedAt: FieldValue.serverTimestamp() })
      tx.create(restoreRefs[index], {
        tenantId: request.tenantId, orderId: request.orderId, ingredientId: restoration.ingredientId,
        quantityDelta: restoration.quantityDelta, unit: restoration.unit, kind: 'restoration',
        sourceMovementId: restoration.sourceMovementId, idempotencyKey: request.idempotencyKey,
        actorUid: request.actorUid, createdAt: FieldValue.serverTimestamp(),
      })
    })
    tx.create(auditRef, {
      actorUid: request.actorUid, actorRole: request.actorRole, action: 'order.cancelled', targetType: 'order',
      targetId: request.orderId, reason: request.reason.trim(), requestId: request.idempotencyKey,
      createdAt: FieldValue.serverTimestamp(),
    })
    const result: CancellationResult = { orderId: request.orderId, status: 'cancelled', reason: request.reason.trim(), restoredMovementIds, auditEventId, idempotent: false }
    tx.create(idemRef, { command: 'ordering-cancel', requestHash: fingerprint, result, createdAt: FieldValue.serverTimestamp(), expiresAt: null })
    return result
  })
}
