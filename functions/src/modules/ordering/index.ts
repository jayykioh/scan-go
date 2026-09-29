import { createHash, randomUUID } from 'node:crypto'
import { FieldValue, Firestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { idempotencyRef, JsonRecord, requireInteger, requireSafeId, requestHash } from '../../shared/transaction.js'

interface CreateOrderLineInput { menuItemId: string; quantity: number; modifierIds: string[] }
interface CreateOrderInput { tableToken: string; paymentMode: 'Pay-First' | 'Pay-Later'; idempotencyKey: string; lines: CreateOrderLineInput[] }
interface CreatedOrderResult { orderId: string; trackingToken: string; status: 'pending'; totalVnd: number; idempotent: boolean }

const asRecord = (value: unknown): JsonRecord => value !== null && typeof value === 'object' ? value as JsonRecord : {}
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

/** REQ-ORD-001, REQ-ORD-002, REQ-ORD-004, NFR-SEC-002, NFR-DATA-001. */
export async function createOrderTransaction(db: Firestore, input: CreateOrderInput): Promise<CreatedOrderResult> {
  requireSafeId(input.tableToken, 'tableToken')
  requireSafeId(input.idempotencyKey, 'idempotencyKey')
  if (input.paymentMode !== 'Pay-First' && input.paymentMode !== 'Pay-Later') throw new Error('Invalid payment mode')
  if (!Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > 50) throw new Error('Cart must contain 1 to 50 lines')
  input.lines.forEach(line => {
    requireSafeId(line.menuItemId, 'menuItemId')
    requireInteger(line.quantity, 'quantity', 1)
    if (!Array.isArray(line.modifierIds) || line.modifierIds.length > 20) throw new Error('Invalid modifiers')
    line.modifierIds.forEach(modifierId => requireSafeId(modifierId, 'modifierId'))
  })
  const tableRef = db.doc(`publicTableLinks/${input.tableToken}`)
  const requestFingerprint = requestHash(input)
  const orderId = db.collection('_orderIds').doc().id
  const trackingToken = randomUUID().split('-').join('')

  return db.runTransaction(async tx => {
    const tableSnapshot = await tx.get(tableRef)
    if (!tableSnapshot.exists) throw new Error('Table link is invalid or revoked')
    const table = tableSnapshot.data() as JsonRecord
    if (table.isActive !== true) throw new Error('Table link is invalid or revoked')
    const tenantId = requireSafeId(String(table.tenantId ?? ''), 'table.tenantId')
    const tableId = requireSafeId(String(table.tableId ?? ''), 'table.tableId')
    const tableName = String(table.tableName ?? '')
    if (!tableName || tableName.length > 100) throw new Error('Table link is incomplete')
    const scopedOrderRef = db.collection(`tenants/${tenantId}/orders`).doc(orderId)
    const idemRef = idempotencyRef(db, tenantId, input.idempotencyKey)
    const rateBucket = Math.floor(Date.now() / 60_000)
    const rateRef = db.doc(`publicOrderRateLimits/${tokenHash(input.tableToken)}_${rateBucket}`)
    const menuRefs = input.lines.map(line => db.doc(`tenants/${tenantId}/publicMenuItems/${line.menuItemId}`))

    // All transaction reads are complete before the first write below.
    const reads = await Promise.all([tx.get(idemRef), tx.get(rateRef), ...menuRefs.map(ref => tx.get(ref))])
    const [idemSnapshot, rateSnapshot, ...menuSnapshots] = reads
    if (idemSnapshot.exists) {
      const existing = idemSnapshot.data() as JsonRecord
      if (existing.requestHash !== requestFingerprint) throw new Error('Idempotency key was reused with another request')
      return { ...(existing.result as CreatedOrderResult), idempotent: true }
    }
    const used = rateSnapshot.exists ? requireInteger((rateSnapshot.data() as JsonRecord).count, 'rateLimit.count') : 0
    if (used >= 5) throw new Error('Rate limit exceeded; try again shortly')

    const items = input.lines.map((line, index) => {
      const snapshot = menuSnapshots[index]
      if (!snapshot.exists) throw new Error('A menu item is no longer available')
      const item = snapshot.data() as JsonRecord
      if (item.isAvailable !== true) throw new Error('A menu item is no longer available')
      const unitPriceVnd = requireInteger(item.priceVnd, 'publicMenuItem.priceVnd')
      const modifiers = Array.isArray(item.modifiers) ? item.modifiers.map(asRecord) : []
      const chosen = line.modifierIds.map(modifierId => modifiers.find(modifier => modifier.id === modifierId))
      if (chosen.some(modifier => modifier === undefined)) throw new Error('A selected modifier is no longer available')
      const modifierTotalVnd = chosen.reduce((sum, modifier) => sum + requireInteger(modifier?.priceDeltaVnd, 'modifier.priceDeltaVnd'), 0)
      const lineTotalVnd = (unitPriceVnd + modifierTotalVnd) * line.quantity
      requireInteger(lineTotalVnd, 'lineTotalVnd')
      return {
        lineId: `${line.menuItemId}_${index}`, menuItemId: line.menuItemId, name: String(item.name ?? ''),
        modifiers: chosen.map(modifier => ({ id: String(modifier?.id), name: String(modifier?.name), priceDeltaVnd: modifier?.priceDeltaVnd })),
        unitPriceVnd, quantity: line.quantity, lineTotalVnd,
      }
    })
    const totalVnd = items.reduce((sum, item) => sum + item.lineTotalVnd, 0)
    requireInteger(totalVnd, 'totalVnd')
    const visibleToKitchen = input.paymentMode === 'Pay-Later'
    const result: CreatedOrderResult = { orderId: scopedOrderRef.id, trackingToken, status: 'pending', totalVnd, idempotent: false }
    const trackingRef = db.doc(`publicOrderTracking/${trackingToken}`)
    tx.create(scopedOrderRef, {
      tenantId, tableId, tableNameSnapshot: tableName, status: 'pending', paymentMode: input.paymentMode,
      paymentConfirmed: false, visibleToKitchen, items, subtotalVnd: totalVnd, totalVnd,
      trackingTokenHash: tokenHash(trackingToken), idempotencyKey: input.idempotencyKey, version: 1,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    tx.create(trackingRef, {
      tenantId, orderId: scopedOrderRef.id, tableName, status: 'pending', totalVnd,
      itemSummary: items.map(item => ({ name: item.name, quantity: item.quantity })),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    })
    tx.create(idemRef, { command: 'ordering-create-order', requestHash: requestFingerprint, result, createdAt: FieldValue.serverTimestamp(), expiresAt: null })
    tx.set(rateRef, { count: used + 1, bucket: rateBucket, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return result
  })
}

export const createOrderCallable = (db: Firestore) => onCall<CreateOrderInput>({ enforceAppCheck: true }, async request => {
  try {
    return await createOrderTransaction(db, request.data)
  } catch (error) {
    throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid order request')
  }
})
