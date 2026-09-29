import type { PublicMenuItem, PublicMenuQuery } from '../../../shared/contracts/catalog.contract'
import type {
  CartValidation,
  CartValidationRequest,
  OrderSnapshot,
  OrderStatus,
  SubmitOrderRequest,
  SubmitOrderResult,
} from '../../../shared/contracts/order.contract'
import type { PublicTableQuery, TableLinkContext } from '../../../shared/contracts/table.contract'

export interface PublicMenuResult {
  table: TableLinkContext
  items: ReadonlyArray<PublicMenuItem>
}

export interface OrderCommandPort {
  submit(request: SubmitOrderRequest, validation: Extract<CartValidation, { valid: true }>): Promise<OrderSnapshot>
}

export interface OrderingAdapter {
  loadPublicMenu(tableToken: string): Promise<PublicMenuResult | null>
  validateCart(request: CartValidationRequest): Promise<CartValidation>
  submitOrder(request: SubmitOrderRequest): Promise<SubmitOrderResult>
  subscribePublicTracking?(trackingToken: string, onUpdate: (update: { status: OrderStatus; updatedAtUtc: string }) => void): () => void
}

export interface OrderingAdapterDependencies {
  tables: PublicTableQuery
  catalog: PublicMenuQuery
  commands: OrderCommandPort
  isOnline?: () => boolean
  rateLimit?: { allow(tableToken: string): Promise<boolean> }
  tracking?: { subscribe(trackingToken: string, onUpdate: (update: { status: OrderStatus; updatedAtUtc: string }) => void): () => void }
}

const invalid = (code: Extract<CartValidation, { valid: false }>['code'], message: string): CartValidation => ({
  valid: false,
  code,
  message,
})

const isIntegerVnd = (value: number) => Number.isSafeInteger(value) && value >= 0

export function createOrderingAdapter(dependencies: OrderingAdapterDependencies): OrderingAdapter {
  const loadPublicMenu = async (tableToken: string): Promise<PublicMenuResult | null> => {
    const table = await dependencies.tables.resolveTableLink(tableToken)
    if (!table?.active) return null
    const items = await dependencies.catalog.listPublicMenuItems(table.tenantId)
    return { table, items }
  }

  const validateCart = async (request: CartValidationRequest): Promise<CartValidation> => {
    if (request.lines.length === 0) return invalid('EMPTY_CART', 'Giỏ hàng đang trống.')
    if (!(await (dependencies.rateLimit?.allow(request.tableToken) ?? Promise.resolve(true)))) {
      return invalid('RATE_LIMITED', 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.')
    }

    const publicMenu = await loadPublicMenu(request.tableToken)
    if (!publicMenu) return invalid('INVALID_TABLE_TOKEN', 'Link bàn không hợp lệ hoặc đã bị thu hồi.')

    const validatedLines = []
    for (const line of request.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity <= 0) {
        return invalid('INVALID_QUANTITY', 'Số lượng món phải là số nguyên dương.')
      }
      const item = publicMenu.items.find(candidate => candidate.id === line.menuItemId)
      if (!item?.available) return invalid('ITEM_UNAVAILABLE', 'Một món trong giỏ hiện không còn phục vụ.')
      if (!isIntegerVnd(item.unitPriceVnd)) return invalid('INVALID_VND_AMOUNT', 'Giá món phải là số nguyên VND.')

      const selectedModifiers = line.modifierIds.map(modifierId => item.modifiers.find(modifier => modifier.id === modifierId))
      if (selectedModifiers.some(modifier => !modifier)) {
        return invalid('ITEM_UNAVAILABLE', 'Một lựa chọn món không còn khả dụng.')
      }
      const modifierTotalVnd = selectedModifiers.reduce((sum, modifier) => sum + (modifier?.priceDeltaVnd ?? 0), 0)
      const lineTotalVnd = (item.unitPriceVnd + modifierTotalVnd) * line.quantity
      if (![modifierTotalVnd, lineTotalVnd].every(isIntegerVnd)) {
        return invalid('INVALID_VND_AMOUNT', 'Tổng tiền phải là số nguyên VND.')
      }
      validatedLines.push({
        menuItemId: item.id,
        name: item.name,
        quantity: line.quantity,
        unitPriceVnd: item.unitPriceVnd,
        modifierNames: selectedModifiers.map(modifier => modifier!.name),
        modifierTotalVnd,
        lineTotalVnd,
      })
    }

    const totalVnd = validatedLines.reduce((sum, line) => sum + line.lineTotalVnd, 0)
    if (!isIntegerVnd(totalVnd)) return invalid('INVALID_VND_AMOUNT', 'Tổng tiền phải là số nguyên VND.')
    return {
      valid: true,
      tenantId: publicMenu.table.tenantId,
      tableId: publicMenu.table.tableId,
      paymentMode: request.paymentMode,
      lines: validatedLines,
      totalVnd,
    }
  }

  return {
    loadPublicMenu,
    validateCart,
    async submitOrder(request) {
      if (!(dependencies.isOnline?.() ?? true)) {
        return { accepted: false, reason: 'OFFLINE', message: 'Mất kết nối. Đơn chưa được gửi, vui lòng thử lại khi có mạng.' }
      }
      const validation = await validateCart(request.cart)
      if (!validation.valid) return { accepted: false, reason: validation.code, message: validation.message }
      const order = await dependencies.commands.submit(request, validation)
      return { accepted: true, order }
    },
    subscribePublicTracking: dependencies.tracking?.subscribe.bind(dependencies.tracking),
  }
}
