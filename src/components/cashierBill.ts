import type { LoyaltyMemberView } from '@contracts/loyalty.contract';
import type { Order, OrderItem } from '../types';

/** One printed bill line: the same dish across Orders folded into one row. */
export interface BillLine {
  key: string;
  name: string;
  quantity: number;
  unitPriceVnd: number;
  totalVnd: number;
}

/**
 * One table's unpaid Orders as the Customer reads them: one bill (REQ-CAS-004).
 *
 * shortcut: the bill is derived from the unpaid snapshot, so the settled
 * history still prints one row per Order until the server carries an invoice
 * id; add that id when a shop needs one receipt per table visit.
 */
export interface TableBill {
  /** `table:<tableId>` for a dine-in table, `order:<orderId>` for takeaway. */
  key: string;
  tableId: string;
  tableName: string;
  /** The bill's Orders, oldest first. */
  orders: Order[];
  lines: BillLine[];
  /** What the lines add up to before any per-Order discount. */
  lineTotalVnd: number;
  /** The server's sum over Orders, so promotions and discounts stay applied. */
  totalVnd: number;
  discountVnd: number;
  orderCount: number;
  itemCount: number;
}

export interface BillSettlement {
  settledOrderIds: string[];
  failedOrderId: string | null;
  error: unknown;
}

function lineKey(item: OrderItem): string {
  const modifiers = item.selectedModifiers?.join(',') ?? '';
  return [item.menuId, item.price, modifiers].join('|');
}

/**
 * Fold every dish of the bill into one line. A different modifier set is a
 * different dish, so it keeps its own line.
 */
export function mergeBillLines(orders: Order[]): BillLine[] {
  const lines = new Map<string, BillLine>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = lineKey(item);
      const existing = lines.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalVnd = existing.unitPriceVnd * existing.quantity;
        continue;
      }
      lines.set(key, {
        key,
        name: item.name,
        quantity: item.quantity,
        unitPriceVnd: item.price,
        totalVnd: item.price * item.quantity,
      });
    }
  }
  return [...lines.values()];
}

function buildBill(
  key: string,
  tableId: string,
  tableName: string,
  orders: Order[],
): TableBill {
  const lines = mergeBillLines(orders);
  const lineTotalVnd = lines.reduce((sum, line) => sum + line.totalVnd, 0);
  const totalVnd = orders.reduce((sum, order) => sum + order.total, 0);
  return {
    key,
    tableId,
    tableName,
    orders,
    lines,
    lineTotalVnd,
    totalVnd,
    // A per-Order Promotion already lowered `total`, so the bill prints the
    // difference rather than showing lines that do not add up.
    discountVnd: Math.max(0, lineTotalVnd - totalVnd),
    orderCount: orders.length,
    itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
  };
}

/**
 * The till's bills: one per open table, oldest first, and one per takeaway
 * Order because those Customers share no table (REQ-CAS-004).
 */
export function groupUnpaidBills(orders: Order[]): TableBill[] {
  const unpaid = orders
    .filter((order) => order.status !== 'paid')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const groups = new Map<string, Order[]>();
  for (const order of unpaid) {
    const key =
      order.orderType === 'takeaway'
        ? `order:${order.id}`
        : `table:${order.tableId}`;
    const group = groups.get(key);
    if (group) group.push(order);
    else groups.set(key, [order]);
  }
  return [...groups.entries()].map(([key, group]) =>
    buildBill(
      key,
      group[0].tableId,
      // The newest Order carries the freshest table-name snapshot.
      group[group.length - 1].tableName ?? `Bàn ${group[0].tableId}`,
      group,
    ),
  );
}

/**
 * The name the bill prints. Only when exactly one Loyalty member appears among
 * its Orders — a later round ordered without the member still keeps the name,
 * but two different members at one table print none.
 */
export function resolveBillCustomerName(
  members: LoyaltyMemberView[],
  bill: TableBill,
): string | null {
  const memberIds = new Set(
    bill.orders
      .map((order) => order.loyaltyMemberId ?? null)
      .filter((memberId): memberId is string => memberId !== null),
  );
  if (memberIds.size !== 1) return null;
  const [memberId] = [...memberIds];
  const name = members.find((member) => member.memberId === memberId)?.displayName;
  return name && name.trim().length > 0 ? name : null;
}

/**
 * Settle every Order of one bill, oldest first. A failure stops the run, so a
 * denied or offline request never fires one callable per Order; the Orders
 * already settled stay settled and the remaining bill stays payable.
 */
export async function settleTableBill(
  bill: TableBill,
  settle: (order: Order) => Promise<unknown>,
): Promise<BillSettlement> {
  const settledOrderIds: string[] = [];
  for (const order of bill.orders) {
    try {
      await settle(order);
      settledOrderIds.push(order.id);
    } catch (error) {
      return { settledOrderIds, failedOrderId: order.id, error };
    }
  }
  return { settledOrderIds, failedOrderId: null, error: null };
}
