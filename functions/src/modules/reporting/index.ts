import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import type {
  DocumentData,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';
import {
  REPORTING_CONTRACT_VERSION,
  reportingRebuildInputSchema,
  reportingRebuildResultSchema,
  type ReportingRebuildInput,
  type ReportingRebuildResult,
} from '../../../../shared/contracts/reporting.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { runPerTenant } from '../../shared/scheduled.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  assertReportingOwner,
  dayKeyFromIso,
  nowIso,
  parseReportingOrderSource,
  parseReportingPaymentSource,
  readBoundedPages,
  rebuildDailyStats,
  REPORTING_INVALID_MESSAGE,
  REPORTING_REBUILD_TRUNCATED_MESSAGE,
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
            lineDiscountVnd: item.lineDiscountVnd ?? 0,
            isGift: item.isGift ?? false,
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
