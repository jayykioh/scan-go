import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  where,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  dailyItemStatsSchema,
  dailyStatsSchema,
  dailyTableStatsSchema,
  reportingSummaryResultSchema,
  REPORTING_CONTRACT_VERSION,
  type DailyItemStats,
  type DailyStats,
  type DailyTableStats,
  type PopularItem,
  type PopularTable,
  type ReportingPeriod,
  type ReportingSummaryResult,
} from '@contracts/reporting.contract';
import {
  loyaltyConfigResultSchema,
  type LoyaltyConfig,
} from '@contracts/loyalty.contract';
import {
  promotionSchema,
  type Promotion,
} from '@contracts/promotion.contract';
import {
  getFirebaseAuth,
  getFirebaseFirestore,
} from '../services/firebase/client';

/**
 * Direct Firestore reads for surfaces where the security rules already grant
 * tenant members read access. Commands and reads that join permission-filtered
 * data stay on the server callables. See docs/RULES_FIREBASE.md.
 */

const MAX_PERIOD_DAYS = 62;
const MAX_ITEMS_PER_DAY = 100;
const MAX_TABLES_PER_DAY = 100;
const PROMOTION_READ_LIMIT = 100;
const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

function requireDb(): Firestore {
  const db = getFirebaseFirestore();
  if (!db) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return db;
}

async function requireTenantId(): Promise<string> {
  const uid = getFirebaseAuth()?.currentUser?.uid;
  if (!uid) {
    throw new Error('Chưa đăng nhập.');
  }
  const snapshot = await getDoc(doc(requireDb(), 'users', uid));
  const activeTenantId = snapshot.exists() ? snapshot.get('activeTenantId') : null;
  if (typeof activeTenantId !== 'string' || activeTenantId.length === 0) {
    throw new Error('Chưa chọn cửa hàng.');
  }
  return activeTenantId;
}

/** Tenant-local `yyyymmdd` day key for the current instant. */
function tenantToday(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return parts.replaceAll('-', '');
}

async function readTenantToday(
  db: Firestore,
  tenantId: string,
): Promise<string> {
  const snap = await getDoc(doc(db, 'tenants', tenantId));
  const timezone = snap.exists() ? snap.get('timezone') : null;
  return tenantToday(
    typeof timezone === 'string' && timezone.length > 0
      ? timezone
      : DEFAULT_TIMEZONE,
  );
}

function toIsoTimestamp(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value) {
    const asDate = (value as { toDate: () => Date }).toDate();
    if (asDate instanceof Date && !Number.isNaN(asDate.getTime())) {
      return asDate.toISOString();
    }
  }
  return new Date(0).toISOString();
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

/** Inclusive tenant-local day range for a period; week starts on Monday. */
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
    updatedAt: toIsoTimestamp(data.updatedAt),
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

function pickTotals(day: DailyStats) {
  return {
    createdOrderCount: day.createdOrderCount,
    cancelledOrderCount: day.cancelledOrderCount,
    paidOrderCount: day.paidOrderCount,
    reversedOrderCount: day.reversedOrderCount,
    refundedOrderCount: day.refundedOrderCount,
    revenueVnd: day.revenueVnd,
    costVnd: day.costVnd,
    grossProfitVnd: day.grossProfitVnd,
    reversedVnd: day.reversedVnd,
    refundedVnd: day.refundedVnd,
  };
}

function aggregateTotals(days: DailyStats[]) {
  const totals = {
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
  };
  for (const day of days) {
    const picked = pickTotals(day);
    totals.createdOrderCount += picked.createdOrderCount;
    totals.cancelledOrderCount += picked.cancelledOrderCount;
    totals.paidOrderCount += picked.paidOrderCount;
    totals.reversedOrderCount += picked.reversedOrderCount;
    totals.refundedOrderCount += picked.refundedOrderCount;
    totals.revenueVnd += picked.revenueVnd;
    totals.costVnd += picked.costVnd;
    totals.grossProfitVnd += picked.grossProfitVnd;
    totals.reversedVnd += picked.reversedVnd;
    totals.refundedVnd += picked.refundedVnd;
  }
  return totals;
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
 * Read the materialized daily stats and aggregate them on the client. The rules
 * allow an active tenant member to read `dailyStats` and its `items`/`tables`
 * subcollections, so no server round-trip is needed (REQ-RPT-001, ADR 0005).
 */
export async function readReportingSummary(
  period: ReportingPeriod,
  anchorDay?: string,
): Promise<ReportingSummaryResult> {
  const db = requireDb();
  const tenantId = await requireTenantId();
  const resolvedAnchor = anchorDay ?? (await readTenantToday(db, tenantId));
  const { fromDay, toDay } = resolvePeriodRange(period, resolvedAnchor);

  const dailySnap = await getDocs(
    query(
      collection(db, 'tenants', tenantId, 'dailyStats'),
      where('__name__', '>=', fromDay),
      where('__name__', '<=', toDay),
      limit(MAX_PERIOD_DAYS),
    ),
  );

  const days = dailySnap.docs.map((docSnap) =>
    mapStoredDailyStats(tenantId, docSnap.id, docSnap.data()),
  );

  const items: DailyItemStats[] = [];
  const tables: DailyTableStats[] = [];
  for (const day of days) {
    const [itemsSnap, tablesSnap] = await Promise.all([
      getDocs(
        query(
          collection(db, 'tenants', tenantId, 'dailyStats', day.dayKey, 'items'),
          limit(MAX_ITEMS_PER_DAY),
        ),
      ),
      getDocs(
        query(
          collection(
            db,
            'tenants',
            tenantId,
            'dailyStats',
            day.dayKey,
            'tables',
          ),
          limit(MAX_TABLES_PER_DAY),
        ),
      ),
    ]);
    for (const snap of itemsSnap.docs) {
      items.push(mapStoredItemStats(tenantId, day.dayKey, snap.id, snap.data()));
    }
    for (const snap of tablesSnap.docs) {
      tables.push(
        mapStoredTableStats(tenantId, day.dayKey, snap.id, snap.data()),
      );
    }
  }

  return reportingSummaryResultSchema.parse({
    schemaVersion: REPORTING_CONTRACT_VERSION,
    tenantId,
    period,
    fromDay,
    toDay,
    dayCount: days.length,
    totals: aggregateTotals(days),
    dailyBreakdown: [...days]
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey))
      .map((day) => ({
        dayKey: day.dayKey,
        totals: pickTotals(day),
      })),
    popularItems: mergePopularItems(items),
    tables: mergePopularTables(tables),
  });
}

/** Read the tenant Promotion definitions directly (REQ-PRO-001). */
export async function readPromotions(): Promise<Promotion[]> {
  const db = requireDb();
  const tenantId = await requireTenantId();
  const snapshot = await getDocs(
    query(
      collection(db, 'tenants', tenantId, 'promotions'),
      orderBy('priority', 'desc'),
      limit(PROMOTION_READ_LIMIT),
    ),
  );
  return snapshot.docs.map((docSnap) =>
    promotionSchema.parse({
      schemaVersion: 1,
      promotionId: docSnap.id,
      tenantId,
      ...docSnap.data(),
    }),
  );
}

/** Read the tenant Loyalty configuration directly (REQ-LOY-001). */
export async function readLoyaltyConfig(): Promise<LoyaltyConfig> {
  const db = requireDb();
  const tenantId = await requireTenantId();
  const snapshot = await getDoc(
    doc(db, 'tenants', tenantId, 'loyaltyConfig', 'default'),
  );
  if (!snapshot.exists()) {
    return loyaltyConfigResultSchema.parse({
      schemaVersion: 1,
      config: {
        schemaVersion: 1,
        tenantId,
        earnRateVnd: 10000,
        pointsPerEarnRate: 1,
        welcomePoints: 0,
        updatedAt: new Date(0).toISOString(),
      },
    }).config;
  }
  return loyaltyConfigResultSchema.parse({
    schemaVersion: 1,
    config: {
      schemaVersion: 1,
      tenantId,
      ...snapshot.data(),
      updatedAt: toIsoTimestamp(snapshot.get('updatedAt')),
    },
  }).config;
}
