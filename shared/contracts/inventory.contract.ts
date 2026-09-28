/** Dev 4-owned input consumed by Fulfilment composition. */
export interface InventoryMutationPlan {
  planId: string
  tenantId: string
  orderId: string
  kind: 'deduct-for-cooking' | 'restore-for-cancellation'
  idempotencyKey: string
  movements: ReadonlyArray<{
    ingredientId: string
    quantityDelta: number
    unit: string
  }>
}
