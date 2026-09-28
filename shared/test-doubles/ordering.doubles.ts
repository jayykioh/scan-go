import type { PublicMenuQuery } from '../contracts/catalog.contract'
import type { OrderSnapshot, SubmitOrderRequest } from '../contracts/order.contract'
import type { PublicTableQuery } from '../contracts/table.contract'
import { publicMenuFixture } from '../fixtures/catalog.fixture'
import { payLaterOrderFixture } from '../fixtures/order.fixture'
import { activeTableLinkFixture } from '../fixtures/table.fixture'

export const catalogQueryDouble: PublicMenuQuery = {
  async listPublicMenuItems(tenantId) {
    return publicMenuFixture.filter(item => item.tenantId === tenantId)
  },
}

export const tableQueryDouble: PublicTableQuery = {
  async resolveTableLink(token) {
    return token === activeTableLinkFixture.token ? activeTableLinkFixture : null
  },
}

export function createOrderCommandSpy(result: OrderSnapshot = payLaterOrderFixture) {
  const calls: SubmitOrderRequest[] = []
  return {
    calls,
    command: {
      async submit(request: SubmitOrderRequest) {
        calls.push(request)
        return result
      },
    },
  }
}
