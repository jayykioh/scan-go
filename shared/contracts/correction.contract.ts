export interface CancellationRestoration {
  ingredientId: string
  quantityDelta: number
  unit: string
  sourceMovementId: string
}

export interface CancellationResult {
  orderId: string
  status: 'cancelled'
  reason: string
  restoredMovementIds: ReadonlyArray<string>
  auditEventId: string
}
