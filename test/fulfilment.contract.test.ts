import assert from 'node:assert/strict'
import test from 'node:test'
import { kitchenQueue, prepareFulfilmentTransition, waiterQueue } from '../src/data/adapters/fulfilment.adapter'
import { inventoryMutationPlanDouble } from '../shared/fixtures/inventory.fixture'
import { payFirstAwaitingPaymentFixture, payLaterOrderFixture } from '../shared/fixtures/order.fixture'

test('Pay-First remains hidden and Pay-Later enters the Kitchen queue', () => {
  const queue = kitchenQueue([payFirstAwaitingPaymentFixture, payLaterOrderFixture])
  assert.deepEqual(queue.orders.map(order => order.orderId), [payLaterOrderFixture.orderId])
})

test('Kitchen prepares an Order mutation with the Inventory plan but performs no Inventory write', () => {
  let inventoryWrites = 0
  const prepared = prepareFulfilmentTransition({
    tenantId: 'tenant-demo',
    orderId: 'order-001',
    expectedStatus: 'pending',
    nextStatus: 'cooking',
    actorRole: 'Kitchen',
    idempotencyKey: 'start-order-001',
    inventoryPlan: inventoryMutationPlanDouble,
  })
  assert.deepEqual(prepared.orderMutation.inventoryPlan, inventoryMutationPlanDouble)
  assert.equal(inventoryWrites, 0)
})

test('Kitchen and Waiter transition boundaries reject role or lifecycle skips', () => {
  assert.throws(() => prepareFulfilmentTransition({
    tenantId: 'tenant-demo', orderId: 'order-001', expectedStatus: 'pending', nextStatus: 'served',
    actorRole: 'Waiter', idempotencyKey: 'skip',
  }), /Invalid transition/)
  assert.equal(waiterQueue([{ ...payLaterOrderFixture, status: 'ready' }]).orders.length, 1)
})

test('ready transition emits one deduplicable Waiter notification', () => {
  const prepared = prepareFulfilmentTransition({
    tenantId: 'tenant-demo', orderId: 'order-001', expectedStatus: 'cooking', nextStatus: 'ready',
    actorRole: 'Kitchen', idempotencyKey: 'ready-order-001',
  })
  assert.equal(prepared.notification?.audience, 'Waiter')
  assert.equal(prepared.notification?.dedupeKey, 'order-001:ready')
})
