import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8')

test('public projections are readable while public listing and writes stay blocked', () => {
  assert.match(rules, /match \/publicTableLinks\/\{token\}/)
  assert.match(rules, /allow get: if resource\.data\.isActive == true/)
  assert.match(rules, /match \/tenants\/\{tenantId\}\/publicMenuItems\/\{itemId\}/)
  assert.match(rules, /allow write: if false/)
  assert.match(rules, /match \/publicOrderTracking\/\{trackingToken\}/)
})

test('client Order writes are denied', () => {
  const orderBlock = rules.slice(rules.indexOf('match /tenants/{tenantId}/orders/{orderId}'))
  assert.match(orderBlock, /allow write: if false/)
})
