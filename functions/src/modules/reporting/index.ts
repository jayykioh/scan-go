import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import { FieldPath } from 'firebase-admin/firestore';
import {
  REPORTING_CONTRACT_VERSION,
  dailyItemStatsSchema,
  dailyStatsSchema,
  dailyTableStatsSchema,
  reportingRebuildInputSchema,
  reportingRebuildResultSchema,
  reportingSummaryInputSchema,
  reportingSummaryResultSchema,
  type DailyItemStats,
  type DailyStats,
  type DailyTableStats,
  type PopularItem,
  type PopularTable,
  type ReportingRebuildInput,
  type ReportingRebuildResult,
  type ReportingSummaryInput,
  type ReportingSummaryResult,
} from '../../../../shared/contracts/reporting.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { runPerTenant } from '../../shared/scheduled.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  aggregateTotals,
  dayTotalsFromStats,
  assertReportingMember,
  assertReportingOwner,
  dayKeyFromIso,
  nowIso,
  parseReportingOrderSource,
  parseReportingPaymentSource,
  readBoundedPages,
  rebuildDailyStats,
  REPORTING_INVALID_MESSAGE,
  REPORTING_REBUILD_TRUNCATED_MESSAGE,
  resolvePeriodRange,
  shiftDayKey,
  type DailyStatsBundle,
  type ReportingOrderSource,
  type ReportingPaymentSource,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const SCHEDULE_OPTIONS = {
  region: FUNCTIONS_REGION,
  timeZone: 'Asia/Ho_Chi_Minh',
} as const;

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
/** Bounded source read for one rebuild. Large tenants paginate up to this cap. */
export const MAX_REBUILD_RECORDS = 5000;
/** Page size for the source traversal; one document is fetched past the cap. */
export const REBUILD_PAGE_SIZE = 1000;
const MAX_PERIOD_DAYS = 62;
const MAX_ITEMS_PER_DAY = 100;
const MAX_TABLES_PER_DAY = 100;

function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(
  schema: { safeParse: (value: unknown) => { success: boolean; data?: T } },
  data: unknown,
): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success || parsed.data === undefined) {
    throw new HttpsError('invalid-argument', REPORTING_INVALID_MESSAGE);
  }
  return parsed.data;
}

/** Convert a Firestore timestamp, Date, or ISO string into an ISO string. */
export function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (
    value &&
    typeof (value as { toDate?: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  throw new HttpsError('invalid-argument', REPORTING_INVALID_MESSAGE);
}

export function mapStoredOrderSource(
  orderId: string,
  data: DocumentData,
): ReportingOrderSource {
  return parseReportingOrderSource({
    orderId,
    status: data.status,
    tableId: data.tableId,
    tableNameSnapshot:
      typeof data.tableNameSnapshot === 'string'
        ? data.tableNameSnapshot
        : `Bàn ${data.tableId}`,
    createdAt: toIsoTimestamp(data.createdAt),
    paidAt: data.paidAt == null ? null : toIsoTimestamp(data.paidAt),
    cancelledAt:
      data.cancelledAt == null ? null : toIsoTimestamp(data.cancelledAt),
    items: Array.isArray(data.items)
      ? data.items.map((item: DocumentData) => {
          const quantity = Number(item.quantity ?? 0);
          const unitPriceVnd = Number(item.unitPriceVnd ?? 0);
          return {
            menuItemId: item.menuItemId,
            name: item.name,
            quantity,
            lineTotalVnd: item.lineTotalVnd ?? unitPriceVnd * quantity,
            lineCostVnd:
              item.lineCostVnd ??
              (item.unitCostVnd != null ? item.unitCostVnd * quantity : 0),
          };
        })
      : [],
  });
}

export function mapStoredPaymentSource(
  paymentId: string,
  data: DocumentData,
): ReportingPaymentSource {
  return parseReportingPaymentSource({
    paymentId,
    orderId: data.orderId,
    amountVnd: data.amountVnd,
    status: data.status,
    confirmedAt:
      data.confirmedAt == null ? null : toIsoTimestamp(data.confirmedAt),
    createdAt: toIsoTimestamp(data.createdAt),
    correctionKind: data.correctionKind ?? null,
  });
}

async function readTenantTimezone(
  db: Firestore,
  tenantId: string,
): Promise<string> {
  const snap = await db.doc(`tenants/${tenantId}`).get();
  const timezone = snap.get('timezone');
  return typeof timezone === 'string' && timezone.length > 0
    ? timezone
    : DEFAULT_TIMEZONE;
}

async function readSourcePage<TRecord>(
  db: Firestore,
  collectionPath: string,
  mapRecord: (id: string, data: DocumentData) => TRecord,
  after: QueryDocumentSnapshot | null,
): Promise<{
  lastDoc: QueryDocumentSnapshot | null;
  records: TRecord[];
}> {
  let query = db
    .collection(collectionPath)
    .orderBy('createdAt', 'desc')
    .limit(REBUILD_PAGE_SIZE);
  if (after) {
    query = query.startAfter(after);
  }
  const snap = await query.get();
  return {
    lastDoc: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null,
    records: snap.docs.map((docSnap) => mapRecord(docSnap.id, docSnap.data())),
  };
}

async function readSources(
  db: Firestore,
  tenantId: string,
): Promise<{
  orders: ReportingOrderSource[];
  payments: ReportingPaymentSource[];
  truncated: boolean;
}> {
  const [ordersRead, paymentsRead] = await Promise.all([
    readBoundedPages<QueryDocumentSnapshot, ReportingOrderSource>(
      (after) =>
        readSourcePage(
          db,
          `tenants/${tenantId}/orders`,
          mapStoredOrderSource,
          after,
        ),
      REBUILD_PAGE_SIZE,
      MAX_REBUILD_RECORDS,
    ),
    readBoundedPages<QueryDocumentSnapshot, ReportingPaymentSource>(
      (after) =>
        readSourcePage(
          db,
          `tenants/${tenantId}/payments`,
          mapStoredPaymentSource,
          after,
        ),
      REBUILD_PAGE_SIZE,
      MAX_REBUILD_RECORDS,
    ),
  ]);

  return {
    orders: ordersRead.records,
    payments: paymentsRead.records,
    truncated: ordersRead.truncated || paymentsRead.truncated,
  };
}

function mapStoredDailyStats(
  tenantId: string,
  dayKey: string,
  data: DocumentData,
): DailyStats {
  return dailyStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey,
    createdOrderCount: data.createdOrderCount ?? 0,
    cancelledOrderCount: data.cancelledOrderCount ?? 0,
    paidOrderCount: data.paidOrderCount ?? 0,
    reversedOrderCount: data.reversedOrderCount ?? 0,
    refundedOrderCount: data.refundedOrderCount ?? 0,
    revenueVnd: data.revenueVnd ?? 0,
    costVnd: data.costVnd ?? 0,
    grossProfitVnd: data.grossProfitVnd ?? 0,
    reversedVnd: data.reversedVnd ?? 0,
    refundedVnd: data.refundedVnd ?? 0,
    version: data.version ?? 1,
    updatedAt: data.updatedAt == null ? nowIso() : toIsoTimestamp(data.updatedAt),
  });
}

function mapStoredItemStats(
  tenantId: string,
  dayKey: string,
  itemId: string,
  data: DocumentData,
): DailyItemStats {
  return dailyItemStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey,
    itemId,
    itemName: data.itemName ?? itemId,
    paidQuantity: data.paidQuantity ?? 0,
    revenueVnd: data.revenueVnd ?? 0,
    costVnd: data.costVnd ?? 0,
    grossProfitVnd: data.grossProfitVnd ?? 0,
    reversedVnd: data.reversedVnd ?? 0,
    refundedVnd: data.refundedVnd ?? 0,
  });
}

function mapStoredTableStats(
  tenantId: string,
  dayKey: string,
  tableId: string,
  data: DocumentData,
): DailyTableStats {
  return dailyTableStatsSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    dayKey,
    tableId,
    tableName: data.tableName ?? tableId,
    createdOrderCount: data.createdOrderCount ?? 0,
    cancelledOrderCount: data.cancelledOrderCount ?? 0,
    paidOrderCount: data.paidOrderCount ?? 0,
    revenueVnd: data.revenueVnd ?? 0,
    costVnd: data.costVnd ?? 0,
    grossProfitVnd: data.grossProfitVnd ?? 0,
    reversedVnd: data.reversedVnd ?? 0,
    refundedVnd: data.refundedVnd ?? 0,
  });
}

function mergePopularItems(items: DailyItemStats[]): PopularItem[] {
  const byId = new Map<string, PopularItem>();
  for (const item of items) {
    const existing = byId.get(item.itemId);
    if (existing) {
      existing.paidQuantity += item.paidQuantity;
      existing.revenueVnd += item.revenueVnd;
      existing.costVnd += item.costVnd;
      existing.grossProfitVnd += item.grossProfitVnd;
    } else {
      byId.set(item.itemId, {
        itemId: item.itemId,
        itemName: item.itemName,
        paidQuantity: item.paidQuantity,
        revenueVnd: item.revenueVnd,
        costVnd: item.costVnd,
        grossProfitVnd: item.grossProfitVnd,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.revenueVnd - a.revenueVnd || b.paidQuantity - a.paidQuantity)
    .slice(0, 20);
}

function mergePopularTables(tables: DailyTableStats[]): PopularTable[] {
  const byId = new Map<string, PopularTable>();
  for (const table of tables) {
    const existing = byId.get(table.tableId);
    if (existing) {
      existing.createdOrderCount += table.createdOrderCount;
      existing.cancelledOrderCount += table.cancelledOrderCount;
      existing.paidOrderCount += table.paidOrderCount;
      existing.revenueVnd += table.revenueVnd;
      existing.costVnd += table.costVnd;
      existing.grossProfitVnd += table.grossProfitVnd;
      existing.reversedVnd += table.reversedVnd;
      existing.refundedVnd += table.refundedVnd;
    } else {
      byId.set(table.tableId, {
        tableId: table.tableId,
        tableName: table.tableName,
        createdOrderCount: table.createdOrderCount,
        cancelledOrderCount: table.cancelledOrderCount,
        paidOrderCount: table.paidOrderCount,
        revenueVnd: table.revenueVnd,
        costVnd: table.costVnd,
        grossProfitVnd: table.grossProfitVnd,
        reversedVnd: table.reversedVnd,
        refundedVnd: table.refundedVnd,
      });
    }
  }
  return [...byId.values()]
    .sort((a, b) => b.revenueVnd - a.revenueVnd)
    .slice(0, 50);
}

/**
 * Owner Reporting query (REQ-RPT-001). Reads the bounded daily materialization
 * and returns day, week, or month totals with popular items and table stats.
 * The caller must be an active tenant member.
 */
export const callableReportingGetSummary = onCall(
  CALL_OPTIONS,
  async (request): Promise<ReportingSummaryResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrInvalid<ReportingSummaryInput>(
      reportingSummaryInputSchema,
      request.data,
    );
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertReportingMember(memberSnap.exists ? memberSnap.data() : undefined);

    const timezone = await readTenantTimezone(db, input.tenantId);
    const anchorDay = input.anchorDay ?? dayKeyFromIso(nowIso(), timezone);
    const { fromDay, toDay } = resolvePeriodRange(input.period, anchorDay);

    const dailySnap = await db
      .collection(`tenants/${input.tenantId}/dailyStats`)
      .where(FieldPath.documentId(), '>=', fromDay)
      .where(FieldPath.documentId(), '<=', toDay)
      .limit(MAX_PERIOD_DAYS)
      .get();

    const days = dailySnap.docs.map((docSnap) =>
      mapStoredDailyStats(input.tenantId, docSnap.id, docSnap.data()),
    );

    const items: DailyItemStats[] = [];
    const tables: DailyTableStats[] = [];
    for (const day of days) {
      const [itemsSnap, tablesSnap] = await Promise.all([
        db
          .collection(
            `tenants/${input.tenantId}/dailyStats/${day.dayKey}/items`,
          )
          .limit(MAX_ITEMS_PER_DAY)
          .get(),
        db
          .collection(
            `tenants/${input.tenantId}/dailyStats/${day.dayKey}/tables`,
          )
          .limit(MAX_TABLES_PER_DAY)
          .get(),
      ]);
      for (const snap of itemsSnap.docs) {
        items.push(
          mapStoredItemStats(
            input.tenantId,
            day.dayKey,
            snap.id,
            snap.data(),
          ),
        );
      }
      for (const snap of tablesSnap.docs) {
        tables.push(
          mapStoredTableStats(
            input.tenantId,
            day.dayKey,
            snap.id,
            snap.data(),
          ),
        );
      }
    }

    return reportingSummaryResultSchema.parse({
      schemaVersion: REPORTING_CONTRACT_VERSION,
      tenantId: input.tenantId,
      period: input.period,
      fromDay,
      toDay,
      dayCount: days.length,
      totals: aggregateTotals(days),
      dailyBreakdown: [...days]
        .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
        .map((day) => ({
          dayKey: day.dayKey,
          totals: dayTotalsFromStats(day),
        })),
      popularItems: mergePopularItems(items),
      tables: mergePopularTables(tables),
    });
  },
);

async function applyRebuildBundles(
  db: Firestore,
  tenantId: string,
  bundles: DailyStatsBundle[],
): Promise<void> {
  let batch = db.batch();
  let writes = 0;
  const flush = async () => {
    if (writes > 0) {
      await batch.commit();
      batch = db.batch();
      writes = 0;
    }
  };

  for (const bundle of bundles) {
    const dayRef = db.doc(
      `tenants/${tenantId}/dailyStats/${bundle.doc.dayKey}`,
    );
    batch.set(dayRef, bundle.doc);
    writes += 1;
    for (const item of bundle.items) {
      batch.set(dayRef.collection('items').doc(item.itemId), item);
      writes += 1;
    }
    for (const table of bundle.tables) {
      batch.set(dayRef.collection('tables').doc(table.tableId), table);
      writes += 1;
    }
    if (writes >= 400) {
      await flush();
    }
  }
  await flush();
}

export async function runReportingRebuild(
  db: Firestore,
  input: ReportingRebuildInput,
): Promise<ReportingRebuildResult> {
  const timezone = await readTenantTimezone(db, input.tenantId);
  const { orders, payments, truncated } = await readSources(db, input.tenantId);
  if (truncated) {
    // Never write a partial aggregate: reject the incomplete rebuild and expose
    // the truncation so the caller can retry with a narrower day range.
    throw new HttpsError(
      'failed-precondition',
      REPORTING_REBUILD_TRUNCATED_MESSAGE,
      { truncated: true, orderCount: orders.length, paymentCount: payments.length },
    );
  }
  const now = nowIso();
  const bundles = rebuildDailyStats({
    tenantId: input.tenantId,
    timezone,
    fromDay: input.fromDay,
    toDay: input.toDay,
    orders,
    payments,
    now,
  });
  await applyRebuildBundles(db, input.tenantId, bundles);

  return reportingRebuildResultSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId: input.tenantId,
    fromDay: input.fromDay,
    toDay: input.toDay,
    rebuiltDayCount: bundles.length,
    orderCount: orders.length,
    paymentCount: payments.length,
    truncated: false,
    rebuiltAt: now,
  });
}

/**
 * Owner rebuild command (REQ-RPT-002). Rebuilds the materialized daily stats
 * for an inclusive tenant-local day range from immutable Orders and Payments.
 * The rebuild is idempotent, so it is also the repair path after a mismatch.
 */
export const callableReportingRebuildDailyStats = onCall(
  CALL_OPTIONS,
  async (request): Promise<ReportingRebuildResult> => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseOrInvalid<ReportingRebuildInput>(
      reportingRebuildInputSchema,
      request.data,
    );
    const isAdmin =
      (request.auth?.token as Record<string, unknown> | undefined)?.admin ===
      true;
    const db = getDb();

    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertReportingOwner(
      memberSnap.exists ? memberSnap.data() : undefined,
      isAdmin,
    );

    return runReportingRebuild(db, input);
  },
);

/**
 * Nightly safety net: rebuild the previous two tenant-local days for every
 * tenant. A failure for one tenant never blocks the others, and the run is
 * reported as failed so Cloud Scheduler retries it and the error is searchable.
 * The on-demand callable remains the repair tool (ADR 0005, REQ-RPT-002).
 */
export const scheduledReportingRebuildDailyStats = onSchedule(
  { ...SCHEDULE_OPTIONS, schedule: 'every day 04:00', retryCount: 3 },
  async () => {
    const db = getDb();
    const tenantsSnap = await db.collection('tenants').limit(1000).get();
    await runPerTenant(
      'scheduledReportingRebuildDailyStats',
      tenantsSnap.docs.map((tenantSnap) => tenantSnap.id),
      async (tenantId) => {
        const timezone = await readTenantTimezone(db, tenantId);
        const today = dayKeyFromIso(nowIso(), timezone);
        await runReportingRebuild(db, {
          tenantId,
          fromDay: shiftDayKey(today, -1),
          toDay: today,
        });
      },
    );
  },
);
