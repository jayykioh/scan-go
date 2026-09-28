/** Result of resolving a revocable token. Raw token state remains Table-owned. */
export interface TableLinkContext {
  token: string
  tenantId: string
  tableId: string
  tableName: string
  active: boolean
  expiresAtUtc?: string
}

export interface PublicTableQuery {
  resolveTableLink(token: string): Promise<TableLinkContext | null>
}
