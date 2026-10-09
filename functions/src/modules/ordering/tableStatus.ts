import {
  deriveTableServiceState,
  type TableServiceStatus,
} from '../../../../shared/contracts/tableStatus.contract.js';
import {
  TAKEAWAY_TABLE_ID,
  type OrderStatus,
} from '../../../../shared/contracts/order.contract.js';

/**
 * One stored Order row reduced to what the floor plan needs. Deliberately not a
 * full Order: the plan must not carry money, Customer identity, or Order lines
 * into a screen that a reduced Staff role can open (REQ-TBL-003, NFR-SEC-001).
 */
export interface TableStatusOrderRow {
  tableId: unknown;
  status: unknown;
  paidAt: unknown;
  createdAt: unknown;
}

/** Order statuses that keep a table busy (docs/module/ordering.md). */
export const ACTIVE_TABLE_ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'cooking',
  'ready',
  'served',
];

interface Bucket {
  activeOrderCount: number;
  readyOrderCount: number;
  unsettledOrderCount: number;
  oldestActiveOrderAt: string | null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Fold live Orders into one service state per table. Tables with no open Order
 * simply do not appear here; the screen paints them "trống" without needing a
 * row, so the projection stays as small as the number of busy tables.
 */
export function aggregateTableServiceStatus(
  rows: TableStatusOrderRow[],
): TableServiceStatus[] {
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const tableId = readString(row.tableId);
    if (!tableId || tableId === TAKEAWAY_TABLE_ID) {
      continue;
    }
    const bucket = buckets.get(tableId) ?? {
      activeOrderCount: 0,
      readyOrderCount: 0,
      unsettledOrderCount: 0,
      oldestActiveOrderAt: null,
    };
    bucket.activeOrderCount += 1;
    if (row.status === 'ready') {
      bucket.readyOrderCount += 1;
    }
    // A served Order with no settled payment is the one the guest owes for.
    if (row.status === 'served' && readString(row.paidAt) === null) {
      bucket.unsettledOrderCount += 1;
    }
    const createdAt = readString(row.createdAt);
    if (
      createdAt &&
      (bucket.oldestActiveOrderAt === null ||
        createdAt < bucket.oldestActiveOrderAt)
    ) {
      bucket.oldestActiveOrderAt = createdAt;
    }
    buckets.set(tableId, bucket);
  }

  return [...buckets.entries()]
    .map(([tableId, bucket]) => ({
      tableId,
      state: deriveTableServiceState(bucket),
      activeOrderCount: bucket.activeOrderCount,
      readyOrderCount: bucket.readyOrderCount,
      unsettledOrderCount: bucket.unsettledOrderCount,
      oldestActiveOrderAt: bucket.oldestActiveOrderAt,
    }))
    .sort((left, right) => left.tableId.localeCompare(right.tableId));
}
