import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import {
  REPORTING_CONTRACT_VERSION,
  dailyItemStatsSchema,
  dailyStatsSchema,
  dailyTableStatsSchema,
  reportingTotalsSchema,
  type DailyItemStats,
  type DailyStats,
  type DailyTableStats,
  type ReportingPeriod,
  type ReportingTotals,
} from '../../../../shared/contracts/reporting.contract.js';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
  vndSchema,
} from '../../../../shared/validation.js';

export const REPORTING_INVALID_MESSAGE = 'Yêu cầu báo cáo không hợp lệ.';
export const REPORTING_MEMBER_DENIED_MESSAGE =
  'Bạn không thuộc cửa hàng này.';
export const REPORTING_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng hoặc quản trị viên xem được báo cáo này.';
export const REPORTING_INVALID_RANGE_MESSAGE =
  'Khoảng ngày báo cáo không hợp lệ.';
export const REPORTING_REBUILD_TRUNCATED_MESSAGE =
  'Dữ liệu nguồn vượt giới hạn đọc nên không thể dựng lại đầy đủ.';

export function nowIso(): string {
  return new Date().toISOString();
}

const dayKeyRegex = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Convert a server UTC timestamp into the tenant-local `yyyymmdd` day key.
 * Time is stored UTC and rendered in the tenant IANA timezone (RULES §4).
 */
export function dayKeyFromIso(
  iso: string,
  timezone: string,
): string {
  if (!dayKeyRegex.test(iso.slice(0, 10))) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date(iso));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (!year || !month || !day) {
    throw new Error(`Cannot resolve day key for ${iso} in ${timezone}`);
  }
  return `${year}${month}${day}`;
}

function parseDayKey(dayKey: string): Date {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(4, 6));
  const day = Number(dayKey.slice(6, 8));
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDayKey(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

function addDays(dayKey: string, amount: number): string {
  const date = parseDayKey(dayKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return formatDayKey(date);
}

function compareDayKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Resolve the inclusive tenant-local day range for a period. Week starts on
 * Monday; month covers the whole calendar month (REQ-RPT-001).
 */
export function resolvePeriodRange(
  period: ReportingPeriod,
  anchorDay: string,
): { fromDay: string; toDay: string } {
  const anchor = parseDayKey(anchorDay);
  if (period === 'day') {
    return { fromDay: anchorDay, toDay: anchorDay };
  }
  if (period === 'week') {
    const isoDay = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();
    const monday = addDays(anchorDay, -(isoDay - 1));
    return { fromDay: monday, toDay: addDays(monday, 6) };
  }
  const first = formatDayKey(
    new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
  );
  const last = formatDayKey(
    new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)),
  );
  return { fromDay: first, toDay: last };
}

/** Enumerate every tenant-local day key in an inclusive range. */
export function enumerateDayKeys(fromDay: string, toDay: string): string[] {
  if (compareDayKeys(fromDay, toDay) > 0) {
    throw new Error(REPORTING_INVALID_RANGE_MESSAGE);
  }
  const days: string[] = [];
  let cursor = fromDay;
  // Bound the loop defensively; a valid report range is at most a year.
  for (let i = 0; i < 366; i += 1) {
    days.push(cursor);
    if (cursor === toDay) {
      break;
    }
    cursor = addDays(cursor, 1);
    if (compareDayKeys(cursor, toDay) > 0) {
      break;
    }
  }
  if (days[days.length - 1] !== toDay) {
    throw new Error(REPORTING_INVALID_RANGE_MESSAGE);
  }
  return days;
}

/** Shift one tenant-local day key by a positive or negative whole day count. */
export function shiftDayKey(dayKey: string, amount: number): string {
  return addDays(dayKey, amount);
}

const orderItemSourceSchema = z.strictObject({
  menuItemId: z.string().min(1),
  name: z.string().min(1),
  quantity: nonNegativeIntSchema,
  lineTotalVnd: vndSchema,
  lineCostVnd: vndSchema,
});

export const reportingOrderSourceSchema = z.strictObject({
  orderId: z.string().min(1),
  status: z.string().min(1),
  tableId: z.string().min(1),
  tableNameSnapshot: z.string().min(1),
  createdAt: isoUtcTimestampSchema,
  paidAt: isoUtcTimestampSchema.nullable(),
  cancelledAt: isoUtcTimestampSchema.nullable(),
  items: z.array(orderItemSourceSchema).max(500),
});

export type ReportingOrderSource = z.infer<typeof reportingOrderSourceSchema>;

export const reportingPaymentSourceSchema = z.strictObject({
  paymentId: z.string().min(1),
  orderId: z.string().min(1),
  amountVnd: vndSchema,
  status: z.enum(['confirmed', 'reversed', 'refunded']),
  confirmedAt: isoUtcTimestampSchema.nullable(),
  createdAt: isoUtcTimestampSchema,
  correctionKind: z.enum(['reversal', 'refund']).nullable().optional(),
});

export type ReportingPaymentSource = z.infer<
  typeof reportingPaymentSourceSchema
>;

export function parseReportingOrderSource(
  value: unknown,
): ReportingOrderSource {
  return reportingOrderSourceSchema.parse(value);
}

export function parseReportingPaymentSource(
  value: unknown,
): ReportingPaymentSource {
  return reportingPaymentSourceSchema.parse(value);
}

interface ItemAccumulator {
  itemId: string;
  itemName: string;
  paidQuantity: number;
  revenueVnd: number;
  costVnd: number;
  reversedVnd: number;
  refundedVnd: number;
}

interface TableAccumulator {
  tableId: string;
  tableName: string;
  createdOrderCount: number;
  cancelledOrderCount: number;
  paidOrderCount: number;
  revenueVnd: number;
  costVnd: number;
  reversedVnd: number;
  refundedVnd: number;
}

interface DayAccumulator extends ReportingTotals {
  dayKey: string;
  items: Map<string, ItemAccumulator>;
  tables: Map<string, TableAccumulator>;
}

function emptyAccumulator(dayKey: string): DayAccumulator {
  return {
    dayKey,
    createdOrderCount: 0,
    cancelledOrderCount: 0,
    paidOrderCount: 0,
    reversedOrderCount: 0,
    refundedOrderCount: 0,
    revenueVnd: 0,
    costVnd: 0,
    grossProfitVnd: 0,
    reversedVnd: 0,
    refundedVnd: 0,
    items: new Map(),
    tables: new Map(),
  };
}

function accumulatorFor(
  days: Map<string, DayAccumulator>,
  dayKey: string,
): DayAccumulator {
  const existing = days.get(dayKey);
  if (existing) {
    return existing;
  }
  const created = emptyAccumulator(dayKey);
  days.set(dayKey, created);
  return created;
}

function itemAccumulatorFor(
  acc: DayAccumulator,
  itemId: string,
  itemName: string,
): ItemAccumulator {
  const existing = acc.items.get(itemId);
  if (existing) {
    return existing;
  }
  const created: ItemAccumulator = {
    itemId,
    itemName,
    paidQuantity: 0,
    revenueVnd: 0,
    costVnd: 0,
    reversedVnd: 0,
    refundedVnd: 0,
  };
  acc.items.set(itemId, created);
  return created;
}

function tableAccumulatorFor(
  acc: DayAccumulator,
  tableId: string,
  tableName: string,
): TableAccumulator {
  const existing = acc.tables.get(tableId);
  if (existing) {
    return existing;
  }
  const created: TableAccumulator = {
    tableId,
    tableName,
    createdOrderCount: 0,
    cancelledOrderCount: 0,
    paidOrderCount: 0,
    revenueVnd: 0,
    costVnd: 0,
    reversedVnd: 0,
    refundedVnd: 0,
  };
  acc.tables.set(tableId, created);
  return created;
}

function orderCostVnd(order: ReportingOrderSource | undefined): number {
  if (!order) {
    return 0;
  }
  return order.items.reduce((sum, item) => sum + item.lineCostVnd, 0);
}

function finaliseAccumulator(
  acc: DayAccumulator,
  tenantId: string,
  version: number,
  updatedAt: string,
): {
  doc: DailyStats;
  items: DailyItemStats[];
  tables: DailyTableStats[];
} {
  const doc = dailyStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey: acc.dayKey,
    createdOrderCount: acc.createdOrderCount,
    cancelledOrderCount: acc.cancelledOrderCount,
    paidOrderCount: acc.paidOrderCount,
    reversedOrderCount: acc.reversedOrderCount,
    refundedOrderCount: acc.refundedOrderCount,
    revenueVnd: acc.revenueVnd,
    costVnd: acc.costVnd,
    grossProfitVnd:
      acc.revenueVnd - acc.costVnd - acc.reversedVnd - acc.refundedVnd,
    reversedVnd: acc.reversedVnd,
    refundedVnd: acc.refundedVnd,
    version,
    updatedAt,
  });

  const items: DailyItemStats[] = [...acc.items.values()].map((item) =>
    dailyItemStatsSchema.parse({
      schemaVersion: REPORTING_CONTRACT_VERSION,
      tenantId,
      dayKey: acc.dayKey,
      itemId: item.itemId,
      itemName: item.itemName,
      paidQuantity: item.paidQuantity,
      revenueVnd: item.revenueVnd,
      costVnd: item.costVnd,
      grossProfitVnd:
        item.revenueVnd - item.costVnd - item.reversedVnd - item.refundedVnd,
      reversedVnd: item.reversedVnd,
      refundedVnd: item.refundedVnd,
    }),
  );

  const tables: DailyTableStats[] = [...acc.tables.values()].map((table) =>
    dailyTableStatsSchema.parse({
      schemaVersion: REPORTING_CONTRACT_VERSION,
      tenantId,
      dayKey: acc.dayKey,
      tableId: table.tableId,
      tableName: table.tableName,
      createdOrderCount: table.createdOrderCount,
      cancelledOrderCount: table.cancelledOrderCount,
      paidOrderCount: table.paidOrderCount,
      revenueVnd: table.revenueVnd,
      costVnd: table.costVnd,
      grossProfitVnd:
        table.revenueVnd - table.costVnd - table.reversedVnd - table.refundedVnd,
      reversedVnd: table.reversedVnd,
      refundedVnd: table.refundedVnd,
    }),
  );

  return { doc, items, tables };
}

export interface RebuildDailyStatsInput {
  tenantId: string;
  timezone: string;
  fromDay: string;
  toDay: string;
  orders: ReportingOrderSource[];
  payments: ReportingPaymentSource[];
  now: string;
}

export interface DailyStatsBundle {
  doc: DailyStats;
  items: DailyItemStats[];
  tables: DailyTableStats[];
}

export interface BoundedPage<TDoc, TRecord> {
  lastDoc: TDoc | null;
  records: TRecord[];
}

export interface BoundedReadResult<TRecord> {
  records: TRecord[];
  truncated: boolean;
}

/**
 * Traverse source pages until the collection ends or the hard record cap is
 * reached. Exceeding the cap sets `truncated` instead of silently dropping
 * records, so a rebuild can reject an incomplete read (REQ-RPT-002).
 */
export async function readBoundedPages<TDoc, TRecord>(
  fetchPage: (after: TDoc | null) => Promise<BoundedPage<TDoc, TRecord>>,
  pageSize: number,
  maxRecords: number,
): Promise<BoundedReadResult<TRecord>> {
  const records: TRecord[] = [];
  let cursor: TDoc | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.records.length === 0) {
      return { records, truncated: false };
    }
    for (const record of page.records) {
      if (records.length >= maxRecords) {
        return { records, truncated: true };
      }
      records.push(record);
    }
    if (page.records.length < pageSize) {
      return { records, truncated: false };
    }
    cursor = page.lastDoc;
  }
}

/**
 * Rebuild every tenant-local day in the inclusive range from immutable Orders
 * and Payments. The result is deterministic for the same sources, so a repeated
 * rebuild is idempotent (REQ-RPT-002, ADR 0005).
 */
export function rebuildDailyStats(
  input: RebuildDailyStatsInput,
): DailyStatsBundle[] {
  const days = enumerateDayKeys(input.fromDay, input.toDay);
  const accumulators = new Map<string, DayAccumulator>();
  for (const dayKey of days) {
    accumulators.set(dayKey, emptyAccumulator(dayKey));
  }
  const orderById = new Map<string, ReportingOrderSource>();

  for (const rawOrder of input.orders) {
    const order = parseReportingOrderSource(rawOrder);
    orderById.set(order.orderId, order);
    const createdDay = dayKeyFromIso(order.createdAt, input.timezone);
    if (accumulators.has(createdDay)) {
      const acc = accumulatorFor(accumulators, createdDay);
      acc.createdOrderCount += 1;
      const table = tableAccumulatorFor(
        acc,
        order.tableId,
        order.tableNameSnapshot,
      );
      table.createdOrderCount += 1;
    }
    if (
      order.status === 'cancelled' &&
      order.cancelledAt &&
      !order.paidAt
    ) {
      const cancelledDay = dayKeyFromIso(order.cancelledAt, input.timezone);
      if (accumulators.has(cancelledDay)) {
        const acc = accumulatorFor(accumulators, cancelledDay);
        acc.cancelledOrderCount += 1;
        const table = tableAccumulatorFor(
          acc,
          order.tableId,
          order.tableNameSnapshot,
        );
        table.cancelledOrderCount += 1;
      }
    }
  }

  for (const rawPayment of input.payments) {
    const payment = parseReportingPaymentSource(rawPayment);
    const eventIso = payment.confirmedAt ?? payment.createdAt;
    const eventDay = dayKeyFromIso(eventIso, input.timezone);
    if (!accumulators.has(eventDay)) {
      continue;
    }
    const acc = accumulatorFor(accumulators, eventDay);
    const order = orderById.get(payment.orderId);
    const cost = orderCostVnd(order);

    if (payment.status === 'confirmed') {
      acc.paidOrderCount += 1;
      acc.revenueVnd += payment.amountVnd;
      acc.costVnd += cost;
      if (order) {
        const table = tableAccumulatorFor(
          acc,
          order.tableId,
          order.tableNameSnapshot,
        );
        table.paidOrderCount += 1;
        table.revenueVnd += payment.amountVnd;
        table.costVnd += cost;
        for (const item of order.items) {
          const itemAcc = itemAccumulatorFor(acc, item.menuItemId, item.name);
          itemAcc.paidQuantity += item.quantity;
          itemAcc.revenueVnd += item.lineTotalVnd;
          itemAcc.costVnd += item.lineCostVnd;
        }
      }
      continue;
    }

    // Compensating entries record their own day and keep gross figures intact.
    if (payment.status === 'reversed') {
      acc.reversedOrderCount += 1;
      acc.reversedVnd += payment.amountVnd;
    } else {
      acc.refundedOrderCount += 1;
      acc.refundedVnd += payment.amountVnd;
    }
    if (order) {
      const table = tableAccumulatorFor(
        acc,
        order.tableId,
        order.tableNameSnapshot,
      );
      if (payment.status === 'reversed') {
        table.reversedVnd += payment.amountVnd;
      } else {
        table.refundedVnd += payment.amountVnd;
      }
      for (const item of order.items) {
        const itemAcc = itemAccumulatorFor(acc, item.menuItemId, item.name);
        if (payment.status === 'reversed') {
          itemAcc.reversedVnd += item.lineTotalVnd;
        } else {
          itemAcc.refundedVnd += item.lineTotalVnd;
        }
      }
    }
  }

  return days.map((dayKey) => {
    const acc = accumulators.get(dayKey) ?? emptyAccumulator(dayKey);
    return finaliseAccumulator(acc, input.tenantId, 1, input.now);
  });
}

/** Reporting reads and rebuilds require an active tenant membership. */
export function assertReportingMember(
  memberData: DocumentData | undefined,
): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', REPORTING_MEMBER_DENIED_MESSAGE);
  }
}

/**
 * Only the Owner, or a server-verified ADMIN, may rebuild materialized stats
 * (REQ-RPT-002, NFR-PRIV-001).
 */
export function assertReportingOwner(
  memberData: DocumentData | undefined,
  isAdmin: boolean,
): void {
  if (isAdmin) {
    return;
  }
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', REPORTING_MEMBER_DENIED_MESSAGE);
  }
  if (memberData.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', REPORTING_OWNER_DENIED_MESSAGE);
  }
}

export function aggregateTotals(docs: DailyStats[]): ReportingTotals {
  return reportingTotalsSchema.parse(
    docs.reduce(
      (total, doc) => ({
        createdOrderCount: total.createdOrderCount + doc.createdOrderCount,
        cancelledOrderCount:
          total.cancelledOrderCount + doc.cancelledOrderCount,
        paidOrderCount: total.paidOrderCount + doc.paidOrderCount,
        reversedOrderCount:
          total.reversedOrderCount + doc.reversedOrderCount,
        refundedOrderCount:
          total.refundedOrderCount + doc.refundedOrderCount,
        revenueVnd: total.revenueVnd + doc.revenueVnd,
        costVnd: total.costVnd + doc.costVnd,
        grossProfitVnd: total.grossProfitVnd + doc.grossProfitVnd,
        reversedVnd: total.reversedVnd + doc.reversedVnd,
        refundedVnd: total.refundedVnd + doc.refundedVnd,
      }),
      {
        createdOrderCount: 0,
        cancelledOrderCount: 0,
        paidOrderCount: 0,
        reversedOrderCount: 0,
        refundedOrderCount: 0,
        revenueVnd: 0,
        costVnd: 0,
        grossProfitVnd: 0,
        reversedVnd: 0,
        refundedVnd: 0,
      } satisfies ReportingTotals,
    ),
  );
}

export interface ReconcileInput {
  stats: DailyStats;
  tenantId: string;
  timezone: string;
  orders: ReportingOrderSource[];
  payments: ReportingPaymentSource[];
  now: string;
}

/**
 * Reconcile one stored day against freshly rebuilt source records. Source
 * records always win after a disagreement (docs/module/reporting.md).
 */
export function reconcileDailyStats(input: ReconcileInput): {
  matches: boolean;
  differences: string[];
} {
  const [rebuilt] = rebuildDailyStats({
    tenantId: input.tenantId,
    timezone: input.timezone,
    fromDay: input.stats.dayKey,
    toDay: input.stats.dayKey,
    orders: input.orders,
    payments: input.payments,
    now: input.now,
  });
  const differences: string[] = [];
  const comparedFields: Array<keyof ReportingTotals> = [
    'createdOrderCount',
    'cancelledOrderCount',
    'paidOrderCount',
    'reversedOrderCount',
    'refundedOrderCount',
    'revenueVnd',
    'costVnd',
    'grossProfitVnd',
    'reversedVnd',
    'refundedVnd',
  ];
  for (const field of comparedFields) {
    if (input.stats[field] !== rebuilt.doc[field]) {
      differences.push(
        `${field}: stored=${input.stats[field]} source=${rebuilt.doc[field]}`,
      );
    }
  }
  return { matches: differences.length === 0, differences };
}
