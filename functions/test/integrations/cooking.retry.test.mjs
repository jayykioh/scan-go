import assert from 'node:assert/strict'
import test from 'node:test'
import { startCookingTransaction } from '../../lib/integrations/cooking.js'

class FakeRef {
  constructor(path) { this.path = path }
  collection(name) { return new FakeCollection(`${this.path}/${name}`) }
}
class FakeCollection {
  constructor(path) { this.path = path }
  doc(id) { return new FakeRef(`${this.path}/${id}`) }
}
class FakeTx {
  constructor(store, writes) { this.store = store; this.writes = writes }
  async get(ref) { const data = this.store.get(ref.path); return { exists: data !== undefined, data: () => data } }
  update(ref, data) { this.writes.push(['update', ref.path, data]) }
  set(ref, data) { this.writes.push(['set', ref.path, data]) }
  create(ref, data) { this.writes.push(['create', ref.path, data]) }
}
class FakeFirestore {
  constructor(seed) { this.store = new Map(Object.entries(seed)); this.committedWrites = [] }
  doc(path) { return new FakeRef(path) }
  collection(path) { return new FakeCollection(path) }
  async runTransaction(callback) {
    const writes = []
    const result = await callback(new FakeTx(this.store, writes))
    for (const [kind, path, data] of writes) {
      if (kind === 'create' && this.store.has(path)) throw new Error(`duplicate ${path}`)
      if (kind !== 'update') this.store.set(path, data)
    }
    this.committedWrites.push(...writes)
    return result
  }
}

const request = {
  tenantId: 'tenantdemo', orderId: 'order001', actorUid: 'kitchen01', idempotencyKey: 'startorder001',
  inventoryPlan: {
    planId: 'plan001', tenantId: 'tenantdemo', orderId: 'order001', kind: 'deduct-for-cooking', idempotencyKey: 'startorder001',
    movements: [{ ingredientId: 'beef0001', quantityDelta: -200, unit: 'g' }],
  },
}

test('cooking transaction records one deduction and returns idempotently on retry', async () => {
  const db = new FakeFirestore({
    'tenants/tenantdemo/members/kitchen01': { isActive: true, roles: ['kitchen'] },
    'tenants/tenantdemo/orders/order001': { status: 'pending', visibleToKitchen: true, version: 1 },
    'tenants/tenantdemo/ingredients/beef0001': { isActive: true, stockQuantity: 500 },
  })
  const first = await startCookingTransaction(db, request)
  assert.equal(first.idempotent, false)
  assert.equal(first.status, 'cooking')
  assert.equal(db.committedWrites.filter(([, path]) => path.includes('/stockMovements/deduct_')).length, 1)
  const retry = await startCookingTransaction(db, request)
  assert.equal(retry.idempotent, true)
  assert.equal(db.committedWrites.filter(([, path]) => path.includes('/stockMovements/deduct_')).length, 1)
})
