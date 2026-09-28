import type { TableLinkContext } from '../contracts/table.contract'

export const activeTableLinkFixture: TableLinkContext = {
  token: 'table-token-active',
  tenantId: 'tenant-demo',
  tableId: '1',
  tableName: 'Bàn 01',
  active: true,
}

export const revokedTableLinkFixture: TableLinkContext = {
  ...activeTableLinkFixture,
  token: 'table-token-revoked',
  active: false,
}
