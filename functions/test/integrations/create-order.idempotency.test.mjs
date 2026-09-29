import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrderTransaction } from '../../lib/modules/ordering/index.js'

let generated = 0
class Ref { constructor(path) { this.path = path; this.id = path.split('/').at(-1) } collection(name) { return new Collection(`${this.path}/${name}`) } }
class Collection { constructor(path) { this.path = path } doc(id = `generated${++generated}`) { return new Ref(`${this.path}/${id}`) } }
class Tx {
  constructor(store, writes) { this.store = store; this.writes = writes }
  async get(ref) { const data = this.store.get(ref.path); return { exists: data !== undefined, data: () => data } }
  set(ref, data) { this.writes.push(['set', ref.path, data]) }
  create(ref, data) { this.writes.push(['create', ref.path, data]) }
}
class Db {
  constructor(seed) { this.store = new Map(Object.entries(seed)); this.writes = [] }
  doc(path) { return new Ref(path) } collection(path) { return new Collection(path) }
  async runTransaction(callback) {
    const writes = []; const result = await callback(new Tx(this.store, writes))
    for (const [kind, path, data] of writes) { if (kind === 'create' && this.store.has(path)) throw new Error('duplicate'); this.store.set(path, data) }
    this.writes.push(...writes); return result
  }
}

test('Pay-Later creation snapshots current public prices and creates one tracking projection', async () => {
  const db = new Db({
    'publicTableLinks/tabletoken001': { isActive: true, tenantId: 'tenantdemo', tableId: 'table0001', tableName: 'Bàn 01' },
    'tenants/tenantdemo/publicMenuItems/pho00001': {
      isAvailable: true, name: 'Phở bò', priceVnd: 65000,
      modifiers: [{ id: 'meat0001', name: 'Thêm thịt', priceDeltaVnd: 20000 }],
    },
  })
  const input = { tableToken: 'tabletoken001', paymentMode: 'Pay-Later', idempotencyKey: 'createorder001', lines: [{ menuItemId: 'pho00001', quantity: 2, modifierIds: ['meat0001'] }] }
  const first = await createOrderTransaction(db, input)
  assert.equal(first.status, 'pending')
  assert.equal(first.totalVnd, 170000)
  assert.equal(db.writes.filter(([, path]) => path.startsWith('tenants/tenantdemo/orders/')).length, 1)
  assert.equal(db.writes.filter(([, path]) => path.startsWith('publicOrderTracking/')).length, 1)
  const retry = await createOrderTransaction(db, input)
  assert.equal(retry.idempotent, true)
  assert.equal(db.writes.filter(([, path]) => path.startsWith('tenants/tenantdemo/orders/')).length, 1)
})
