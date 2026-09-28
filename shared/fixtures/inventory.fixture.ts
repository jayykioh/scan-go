import type { InventoryMutationPlan } from '../contracts/inventory.contract'

export const inventoryMutationPlanDouble: InventoryMutationPlan = {
  planId: 'inventory-plan-order-001',
  tenantId: 'tenant-demo',
  orderId: 'order-001',
  kind: 'deduct-for-cooking',
  idempotencyKey: 'start-order-001',
  movements: [{ ingredientId: 'ingredient-beef', quantityDelta: -0.2, unit: 'kg' }],
}
