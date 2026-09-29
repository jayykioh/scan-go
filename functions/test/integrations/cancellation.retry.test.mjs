import assert from 'node:assert/strict'
import test from 'node:test'
import { cancelUnpaidOrderTransaction } from '../../lib/integrations/cancellation.js'

class Ref { constructor(path) { this.path = path } collection(name) { return new Collection(`${this.path}/${name}`) } }
class Collection { constructor(path) { this.path = path } doc(id) { return new Ref(`${this.path}/${id}`) } }
class Tx {
  constructor(store, writes) { this.store = store; this.writes = writes }
  async get(ref) { const data = this.store.get(ref.path); return { exists: data !== undefined, data: () => data } }
  update(ref, data) { this.writes.push(['update', ref.path, data]) }
  set(ref, data) { this.writes.push(['set', ref.path, data]) }
  create(ref, data) { this.writes.push(['create', ref.path, data]) }
}
class FirestoreFake {
  constructor(seed) { this.store = new Map(Object.entries(seed)); this.writes = [] }
  doc(path) { return new Ref(path) } collection(path) { return new Collection(path) }
  async runTransaction(callback) {
    const pending = []; const result = await callback(new Tx(this.store, pending))
    for (const [kind, path, data] of pending) { if (kind === 'create' && this.store.has(path)) throw new Error('duplicate'); if (kind !== 'update') this.store.set(path, data) }
    this.writes.push(...pending); return result
  }
}

test('unpaid cancellation restores every source deduction exactly once and creates audit data', async () => {
  const db = new FirestoreFake({
    'tenants/tenantdemo/members/cashier01': { isActive: true, roles: ['cashier'] },
    'tenants/tenantdemo/orders/order0001': { status: 'cooking', version: 2 },
    'tenants/tenantdemo/ingredients/beef0001': { isActive: true, stockQuantity: 300 },
    'tenants/tenantdemo/stockMovements/deduct0001': { orderId: 'order0001', ingredientId: 'beef0001', kind: 'deduction', quantityDelta: -200 },
  })
  const request = {
    tenantId: 'tenantdemo', orderId: 'order0001', actorUid: 'cashier01', actorRole: 'Cashier', idempotencyKey: 'cancel0001', reason: 'Khách đổi ý',
    restorations: [{ ingredientId: 'beef0001', quantityDelta: 200, unit: 'g', sourceMovementId: 'deduct0001' }],
  }
  const first = await cancelUnpaidOrderTransaction(db, request)
  assert.equal(first.status, 'cancelled')
  assert.equal(first.reason, 'Khách đổi ý')
  assert.equal(db.writes.filter(([, path]) => path.includes('/stockMovements/restore_')).length, 1)
  assert.equal(db.writes.filter(([, path]) => path.includes('/audit/cancel_')).length, 1)
  const retry = await cancelUnpaidOrderTransaction(db, request)
  assert.equal(retry.idempotent, true)
  assert.equal(db.writes.filter(([, path]) => path.includes('/stockMovements/restore_')).length, 1)
})
