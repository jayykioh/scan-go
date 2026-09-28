import assert from 'node:assert/strict'
import test from 'node:test'
import { createOrderingAdapter } from '../src/data/adapters/ordering.adapter'
import { catalogQueryDouble, createOrderCommandSpy, tableQueryDouble } from '../shared/test-doubles/ordering.doubles'
import { payFirstAwaitingPaymentFixture, payLaterOrderFixture, publicTrackingFixture } from '../shared/fixtures/order.fixture'

const cart = {
  tableToken: 'table-token-active',
  paymentMode: 'Pay-Later' as const,
  lines: [{ menuItemId: 'menu-pho-bo', quantity: 2, modifierIds: ['them-thit'] }],
}

test('validates current Catalog prices and produces integer VND totals', async () => {
  const command = createOrderCommandSpy()
  const adapter = createOrderingAdapter({ tables: tableQueryDouble, catalog: catalogQueryDouble, commands: command.command })
  const result = await adapter.validateCart(cart)
  assert.equal(result.valid, true)
  if (result.valid) {
    assert.equal(result.totalVnd, 170000)
    assert.equal(Number.isSafeInteger(result.totalVnd), true)
  }
})

test('blocks offline submission before firing an Order command', async () => {
  const command = createOrderCommandSpy()
  const adapter = createOrderingAdapter({
    tables: tableQueryDouble,
    catalog: catalogQueryDouble,
    commands: command.command,
    isOnline: () => false,
  })
  const result = await adapter.submitOrder({ idempotencyKey: 'offline-attempt', cart })
  assert.deepEqual(result, {
    accepted: false,
    reason: 'OFFLINE',
    message: 'Mất kết nối. Đơn chưa được gửi, vui lòng thử lại khi có mạng.',
  })
  assert.equal(command.calls.length, 0)
})

test('rejects revoked or unknown table tokens without a command', async () => {
  const command = createOrderCommandSpy()
  const adapter = createOrderingAdapter({ tables: tableQueryDouble, catalog: catalogQueryDouble, commands: command.command })
  const result = await adapter.submitOrder({
    idempotencyKey: 'invalid-token',
    cart: { ...cart, tableToken: 'revoked' },
  })
  assert.equal(result.accepted, false)
  assert.equal(command.calls.length, 0)
})

test('rate-limit placeholder rejects before an Order command', async () => {
  const command = createOrderCommandSpy()
  const adapter = createOrderingAdapter({
    tables: tableQueryDouble,
    catalog: catalogQueryDouble,
    commands: command.command,
    rateLimit: { async allow() { return false } },
  })
  const result = await adapter.submitOrder({ idempotencyKey: 'rate-limited', cart })
  assert.equal(result.accepted, false)
  if (!result.accepted) assert.equal(result.reason, 'RATE_LIMITED')
  assert.equal(command.calls.length, 0)
})

test('publishes Pay-First, Pay-Later and public tracking fixtures', () => {
  assert.equal(payFirstAwaitingPaymentFixture.visibleToKitchen, false)
  assert.equal(payLaterOrderFixture.visibleToKitchen, true)
  assert.equal(publicTrackingFixture.trackingToken, payLaterOrderFixture.trackingToken)
})
