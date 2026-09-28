/** Public-safe Catalog projection. No recipe cost or internal stock quantity leaks. */
export interface PublicMenuItem {
  id: string
  tenantId: string
  name: string
  description: string
  category: string
  imageUrl: string
  unitPriceVnd: number
  available: boolean
  modifiers: ReadonlyArray<{
    id: string
    name: string
    priceDeltaVnd: number
  }>
}

export interface PublicMenuQuery {
  listPublicMenuItems(tenantId: string): Promise<ReadonlyArray<PublicMenuItem>>
}
