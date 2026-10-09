/**
 * Demo seed script. Writes a complete, self-consistent restaurant dataset so
 * Catalog, Inventory, Table Access, Ordering, Payment, Reporting, and
 * Workforce screens have data to show.
 *
 * Safety:
 *  - The script only writes deterministic `seed-`-prefixed documents and never
 *    deletes or archives existing data.
 *  - On a real Firestore project it refuses to run without `--confirm`.
 *  - On the Firestore emulator it runs freely.
 *
 * Usage:
 *   npm run seed -- --owner-email owner@shop.vn                 (real project)
 *   npm run seed -- --owner-uid <uid> --confirm                 (real project)
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed -- --owner-uid demo
 */
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { CatalogMenuItem } from '../../../shared/contracts/catalog.contract.js';
import {
  INVENTORY_CONTRACT_VERSION,
  baseUnitForUnit,
  convertUnitCostToBase,
  type Ingredient,
  type Recipe,
  type RecipeLine,
} from '../../../shared/contracts/inventory.contract.js';
import {
  ORDER_CONTRACT_VERSION,
  type OrderLineSnapshot,
  type OrderSnapshot,
  type OrderStatus,
  type OrderStatusEvent,
  type PublicOrderTracking,
} from '../../../shared/contracts/order.contract.js';
import {
  PAYMENT_CONTRACT_VERSION,
  type PaymentMethod,
  type PaymentRecord,
  type VietQrInstruction,
} from '../../../shared/contracts/payment.contract.js';
import { TABLE_CONTRACT_VERSION } from '../../../shared/contracts/table.contract.js';
import {
  WORKFORCE_CONTRACT_VERSION,
  type Attendance,
  type Shift,
} from '../../../shared/contracts/workforce.contract.js';
import {
  dayKeyFromIso,
  rebuildDailyStats,
  shiftDayKey,
  type ReportingOrderSource,
  type ReportingPaymentSource,
} from '../modules/reporting/service.js';
import { hashPin } from '../modules/auth/service.js';
import {
  SEED_INGREDIENTS,
  SEED_INGREDIENT_PRICE_SOURCES,
  SEED_MENU_ITEMS,
  SEED_STAFF,
  SEED_TABLE_COUNT,
  SEED_TIMEZONE,
  seedTable,
} from './seed-data.js';
import {
  isSurveyStale,
  SURVEY_MAX_AGE_DAYS,
  SURVEY_OBSERVED_AT,
} from './market-prices/market-prices.js';
import { parseSeedArgs, DEFAULT_SEED_ORDERS_PER_DAY } from './seed-args.js';

const VIETNAM_UTC_OFFSET_HOURS = 7;
const BATCH_LIMIT = 400;
const PAYMENT_METHODS: readonly PaymentMethod[] = ['cash', 'vietQr'];
const VIETQR_BANK = {
  bankBin: '970436',
  accountNo: '0011002233445',
  accountName: 'NHA HANG DEMO SCANGO',
  template: 'compact2',
} as const;

interface PendingWrite {
  path: string;
  data: Record<string, unknown>;
}

interface OwnerIdentity {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface GeneratedOrder {
  order: Record<string, unknown>;
  events: OrderStatusEvent[];
  tracking: PublicOrderTracking;
  payment: PaymentRecord | null;
  source: ReportingOrderSource;
  paymentSource: ReportingPaymentSource | null;
}

function pad(value: number, size: number): string {
  return String(value).padStart(size, '0');
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function dayParts(dayKey: string): { year: number; month: number; day: number } {
  return {
    year: Number(dayKey.slice(0, 4)),
    month: Number(dayKey.slice(4, 6)),
    day: Number(dayKey.slice(6, 8)),
  };
}

/** Build a UTC ISO timestamp for a tenant-local wall time (Asia/Ho_Chi_Minh). */
function isoAtLocalHour(
  dayKey: string,
  hour: number,
  minute: number,
): string {
  const { year, month, day } = dayParts(dayKey);
  const utcMs = Date.UTC(
    year,
    month - 1,
    day,
    hour - VIETNAM_UTC_OFFSET_HOURS,
    minute,
    0,
    0,
  );
  return new Date(utcMs).toISOString();
}

function deterministicIndex(
  dayIndex: number,
  orderIndex: number,
  salt: number,
  modulo: number,
): number {
  const value = dayIndex * 7 + orderIndex * 13 + salt * 5;
  return ((value % modulo) + modulo) % modulo;
}

async function commitWrites(
  db: Firestore,
  writes: readonly PendingWrite[],
): Promise<number> {
  let committed = 0;
  for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(start, start + BATCH_LIMIT)) {
      batch.set(db.doc(write.path), write.data);
    }
    await batch.commit();
    committed += Math.min(BATCH_LIMIT, writes.length - start);
  }
  return committed;
}

async function resolveOwner(
  options: ReturnType<typeof parseSeedArgs>,
): Promise<OwnerIdentity> {  if (options.ownerUid) {
    return {
      uid: options.ownerUid,
      email: options.ownerEmail,
      displayName: null,
    };
  }
  if (options.dryRun) {
    return { uid: 'dry-run-owner', email: options.ownerEmail, displayName: null };
  }
  const email = options.ownerEmail as string;
  try {
    const user = await getAuth().getUserByEmail(email);
    return {
      uid: user.uid,
      email: user.email ?? email,
      displayName: user.displayName ?? null,
    };
  } catch {
    throw new Error(
      `Không tìm thấy tài khoản Firebase Auth cho ${email}. ` +
        'Kiểm tra email hoặc dùng --owner-uid.',
    );
  }
}

/**
 * Provision the Firebase Auth account for one demo Staff member. Reuse an
 * existing account for the same email so a repeated seed stays safe. When Auth
 * is unavailable (dry-run or no emulator), fall back to the synthetic uid.
 */
async function provisionStaffAuthUser(
  auth: Auth,
  staff: (typeof SEED_STAFF)[number],
): Promise<string> {
  try {
    const existing = await auth.getUserByEmail(staff.email);
    return existing.uid;
  } catch {
    try {
      const created = await auth.createUser({
        email: staff.email,
        password: staff.password,
        displayName: staff.displayName,
      });
      return created.uid;
    } catch {
      return staff.uid;
    }
  }
}

export function buildIngredient(
  tenantId: string,
  definition: (typeof SEED_INGREDIENTS)[number],
  now: string,
): Ingredient {
  return {
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    ingredientId: definition.id,
    tenantId,
    name: definition.name,
    baseUnit: baseUnitForUnit(definition.purchaseUnit),
    purchaseUnit: definition.purchaseUnit,
    countUnitLabel: definition.countUnitLabel ?? null,
    purchasePriceVnd: definition.purchasePriceVnd,
    unitCostVnd: convertUnitCostToBase(
      definition.purchasePriceVnd,
      definition.purchaseUnit,
    ),
    stockQuantity: definition.stockQuantity,
    lowStockThreshold: definition.lowStockThreshold,
    isActive: true,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildRecipe(
  tenantId: string,
  item: (typeof SEED_MENU_ITEMS)[number],
  ingredientById: Map<string, Ingredient>,
  now: string,
): Recipe {
  const lines: RecipeLine[] = item.recipe.map((line) => {
    const ingredient = ingredientById.get(line.ingredientId);
    if (!ingredient) {
      throw new Error(`Thiếu nguyên liệu ${line.ingredientId} cho ${item.id}.`);
    }
    const waste = line.wasteBaseUnits ?? 0;
    return {
      ingredientId: line.ingredientId,
      quantityBaseUnits: line.quantityBaseUnits,
      wasteBaseUnits: waste,
      unitCostVnd: ingredient.unitCostVnd,
      lineCostVnd: ingredient.unitCostVnd * (line.quantityBaseUnits + waste),
    };
  });
  return {
    schemaVersion: INVENTORY_CONTRACT_VERSION,
    recipeId: `seed-recipe-${item.id}`,
    tenantId,
    menuItemId: item.id,
    lines,
    costVnd: lines.reduce((sum, line) => sum + line.lineCostVnd, 0),
    costVersion: 1,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildMenuItem(
  tenantId: string,
  item: (typeof SEED_MENU_ITEMS)[number],
  recipe: Recipe,
  now: string,
): CatalogMenuItem & { version: number } {
  return {
    schemaVersion: 1,
    menuItemId: item.id,
    tenantId,
    name: item.name,
    description: item.description,
    category: item.category,
    type: item.type,
    priceVnd: item.priceVnd,
    costPriceVnd: recipe.costVnd,
    imagePath: item.imageUrl,
    modifierGroups: [...item.modifierGroups],
    recipeId: recipe.recipeId,
    isAvailable: true,
    stockCount: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export function buildPublicMenuItem(
  item: CatalogMenuItem,
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    menuItemId: item.menuItemId,
    tenantId: item.tenantId,
    name: item.name,
    description: item.description,
    category: item.category,
    type: item.type,
    priceVnd: item.priceVnd,
    imageUrl: item.imagePath,
    modifierGroups: item.modifierGroups,
    isAvailable: item.isAvailable,
    updatedAt: item.updatedAt,
  };
}

function buildVietQrInstruction(
  orderId: string,
  amountVnd: number,
): VietQrInstruction {
  return {
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    method: 'vietQr',
    bankBin: VIETQR_BANK.bankBin,
    accountNo: VIETQR_BANK.accountNo,
    accountName: VIETQR_BANK.accountName,
    template: VIETQR_BANK.template,
    amountVnd,
    addInfo: `SCANGO ${orderId}`,
    qrPayload:
      `https://img.vietqr.io/image/${VIETQR_BANK.bankBin}-` +
      `${VIETQR_BANK.accountNo}-${VIETQR_BANK.template}.png` +
      `?amount=${amountVnd}&addInfo=${encodeURIComponent(`SCANGO ${orderId}`)}`,
  };
}

function orderStatusFor(dayIndex: number, orderIndex: number): OrderStatus {
  if (dayIndex === 0) {
    if (orderIndex === 0) return 'pending';
    if (orderIndex === 1) return 'cooking';
    if (orderIndex === 2) return 'ready';
    if (orderIndex === 5) return 'cancelled';
    return 'paid';
  }
  return orderIndex === 5 ? 'cancelled' : 'paid';
}

function chooseItems(
  dayIndex: number,
  orderIndex: number,
): { item: (typeof SEED_MENU_ITEMS)[number]; quantity: number }[] {
  const targetCount = 1 + ((dayIndex + orderIndex) % 3);
  const picked = new Map<number, number>();
  let salt = 0;
  while (picked.size < targetCount && salt < 60) {
    const index = deterministicIndex(
      dayIndex,
      orderIndex,
      salt,
      SEED_MENU_ITEMS.length,
    );
    if (!picked.has(index)) {
      picked.set(index, 1 + deterministicIndex(dayIndex, orderIndex, salt + 1, 2));
    }
    salt += 1;
  }
  return [...picked.entries()].map(([index, quantity]) => ({
    item: SEED_MENU_ITEMS[index],
    quantity,
  }));
}

export function generateOrder(
  tenantId: string,
  ownerUid: string,
  dayIndex: number,
  orderIndex: number,
  now: string,
  dayKey: string,
  costByItemId: Map<string, number>,
): GeneratedOrder {
  const table = seedTable((dayIndex * 3 + orderIndex) % SEED_TABLE_COUNT + 1);
  const status = orderStatusFor(dayIndex, orderIndex);
  const orderId = `seed-order-${dayKey}-${orderIndex + 1}`;
  const createdAt =
    dayIndex === 0
      ? new Date(Date.parse(now) - (6 - orderIndex) * 11 * 60_000).toISOString()
      : isoAtLocalHour(dayKey, 10 + (orderIndex % 4), (orderIndex * 13) % 60);
  const paidAt =
    status === 'paid'
      ? addMinutes(createdAt, 20 + (orderIndex % 3) * 7)
      : null;
  const cancelledAt =
    status === 'cancelled' ? addMinutes(createdAt, 12) : null;
  const cookingAt =
    status === 'cooking' || status === 'ready' || status === 'paid'
      ? addMinutes(createdAt, 3)
      : null;
  const readyAt =
    status === 'ready' || status === 'paid'
      ? addMinutes(createdAt, 8)
      : null;
  const servedAt = status === 'paid' ? addMinutes(createdAt, 12) : null;

  const lines: OrderLineSnapshot[] = chooseItems(dayIndex, orderIndex).map(
    ({ item, quantity }, lineIndex) => {
      const unitCostVnd = costByItemId.get(item.id) ?? 0;
      return {
        lineId: `${item.id}-${lineIndex}`,
        menuItemId: item.id,
        name: item.name,
        modifiers: [],
        unitPriceVnd: item.priceVnd,
        quantity,
        lineTotalVnd: item.priceVnd * quantity,
        lineDiscountVnd: 0,
        isGift: false,
        unitCostVnd,
        lineCostVnd: unitCostVnd * quantity,
      };
    },
  );
  const totalVnd = lines.reduce((sum, line) => sum + line.lineTotalVnd, 0);
  const updatedAt = paidAt ?? cancelledAt ?? createdAt;
  const order: Record<string, unknown> = {
    schemaVersion: ORDER_CONTRACT_VERSION,
    orderId,
    tenantId,
    orderType: 'dineIn',
    tableId: table.tableId,
    tableNameSnapshot: table.name,
    status,
    paymentMode: 'payLater',
    items: lines,
    subtotalVnd: totalVnd,
    totalVnd,
    trackingToken: `seed-track-${dayKey}-${orderIndex + 1}`,
    idempotencyKey: `seed-idem-${dayKey}-${orderIndex + 1}`,
    createdAt,
    updatedAt,
    cookingAt,
    readyAt,
    servedAt,
    paidAt,
    cancelledAt,
    cancellationReason: cancelledAt ? 'Khách đổi ý' : null,
    version: 1,
  };

  const events: OrderStatusEvent[] = [];
  let previousStatus: OrderStatus | null = null;
  const pushEvent = (newStatus: OrderStatus, at: string): void => {
    events.push({
      schemaVersion: ORDER_CONTRACT_VERSION,
      eventId: `${orderId}-ev${events.length + 1}`,
      previousStatus,
      newStatus,
      actorType: 'system',
      actorUid: null,
      reason: null,
      createdAt: at,
    });
    previousStatus = newStatus;
  };
  pushEvent('pending', createdAt);
  if (cookingAt) pushEvent('cooking', cookingAt);
  if (readyAt) pushEvent('ready', readyAt);
  if (servedAt) pushEvent('served', servedAt);
  if (paidAt) pushEvent('paid', paidAt);
  if (cancelledAt) pushEvent('cancelled', cancelledAt);

  const tracking: PublicOrderTracking = {
    schemaVersion: ORDER_CONTRACT_VERSION,
    trackingToken: order.trackingToken as string,
    tenantId,
    orderId,
    orderType: 'dineIn',
    tableName: table.name,
    itemSummary: lines.reduce(
      (summary, line) =>
        summary === ''
          ? `${line.quantity}x ${line.name}`
          : `${summary}, ${line.quantity}x ${line.name}`,
      '',
    ),
    totalVnd,
    discountVnd: 0,
    status,
    createdAt,
    updatedAt,
  };

  const method = PAYMENT_METHODS[(dayIndex + orderIndex) % PAYMENT_METHODS.length];
  const payment: PaymentRecord | null = paidAt
    ? {
        schemaVersion: PAYMENT_CONTRACT_VERSION,
        paymentId: `payment_${orderId}`,
        tenantId,
        orderId,
        amountVnd: totalVnd,
        method,
        status: 'confirmed',
        vietQrInstruction:
          method === 'vietQr' ? buildVietQrInstruction(orderId, totalVnd) : null,
        actorUid: ownerUid,
        idempotencyKey: `seed-pay-${dayKey}-${orderIndex + 1}`,
        linkedPaymentId: null,
        correctionKind: null,
        reason: null,
        providerId: null,
        providerRef: null,
        confirmedAt: paidAt,
        createdAt: paidAt,
      }
    : null;

  const source: ReportingOrderSource = {
    orderId,
    status,
    tableId: table.tableId,
    tableNameSnapshot: table.name,
    createdAt,
    paidAt,
    cancelledAt,
    items: lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      lineTotalVnd: line.lineTotalVnd,
      lineDiscountVnd: line.lineDiscountVnd,
      isGift: line.isGift,
      lineCostVnd: line.lineCostVnd,
    })),
  };
  const paymentSource: ReportingPaymentSource | null = paidAt
    ? {
        paymentId: `payment_${orderId}`,
        orderId,
        amountVnd: totalVnd,
        status: 'confirmed',
        confirmedAt: paidAt,
        createdAt: paidAt,
        correctionKind: null,
      }
    : null;

  return { order, events, tracking, payment, source, paymentSource };
}

export interface SeedStaffIdentity {
  uid: string;
  roles: string[];
}

export function buildShifts(
  tenantId: string,
  now: string,
  todayKey: string,
  staff: readonly SeedStaffIdentity[],
): Shift[] {
  const shifts: Shift[] = [];
  staff.forEach((member, staffIndex) => {
    for (let offset = 1; offset <= 7; offset += 1) {
      const dayKey = shiftDayKey(todayKey, -offset);
      const startHour = 8 + (staffIndex % 2) * 2;
      const startAt = isoAtLocalHour(dayKey, startHour, 0);
      const endAt = isoAtLocalHour(dayKey, startHour + 8, 0);
      shifts.push({
        schemaVersion: WORKFORCE_CONTRACT_VERSION,
        shiftId: `seed-shift-${staffIndex + 1}-${offset}`,
        tenantId,
        staffUid: member.uid,
        date: dayKey,
        startAt,
        endAt,
        role: member.roles[0] ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
  return shifts;
}

export function buildAttendance(
  tenantId: string,
  shifts: readonly Shift[],
): Attendance[] {
  return shifts.map((shift) => ({
    schemaVersion: WORKFORCE_CONTRACT_VERSION,
    attendanceId: `attendance_${shift.staffUid}_${shift.date}`,
    tenantId,
    staffUid: shift.staffUid,
    shiftId: shift.shiftId,
    clockInAt: shift.startAt,
    clockOutAt: shift.endAt,
    source: 'staff',
    correctionState: 'none',
    requestedClockInAt: null,
    requestedClockOutAt: null,
    correctionReason: null,
    approverUid: null,
    history: [
      {
        at: shift.startAt,
        actorUid: shift.staffUid,
        action: 'clock_in',
        state: 'none',
        reason: null,
      },
      {
        at: shift.endAt,
        actorUid: shift.staffUid,
        action: 'clock_out',
        state: 'none',
        reason: null,
      },
    ],
    createdAt: shift.startAt,
    updatedAt: shift.endAt,
  }));
}

async function run(): Promise<void> {
  const options = parseSeedArgs(process.argv.slice(2));
  const useEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  const now = new Date().toISOString();

  if (!useEmulator && !options.confirm && !options.dryRun) {
    process.stdout.write(
      'Từ chối ghi lên Firestore thật khi chưa xác nhận.\n' +
        'Thêm --confirm để tiếp tục, hoặc --dry-run để chỉ xem kế hoạch.\n' +
        `Dự án: ${options.projectId}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!useEmulator) {
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= options.projectId;
  }
  initializeApp(
    useEmulator
      ? { projectId: options.projectId }
      : { credential: applicationDefault(), projectId: options.projectId },
  );
  const db = getFirestore();
  const owner = await resolveOwner(options);
  const tenantId = options.tenantId;

  const ingredientById = new Map(
    SEED_INGREDIENTS.map((definition) => [
      definition.id,
      buildIngredient(tenantId, definition, now),
    ]),
  );
  const recipesByItemId = new Map(
    SEED_MENU_ITEMS.map((item) => [
      item.id,
      buildRecipe(tenantId, item, ingredientById, now),
    ]),
  );
  const costByItemId = new Map(
    [...recipesByItemId].map(([itemId, recipe]) => [itemId, recipe.costVnd]),
  );

  const writes: PendingWrite[] = [];
  writes.push({
    path: `tenants/${tenantId}`,
    data: {
      shopName: options.shopName,
      industry: 'nha_hang',
      timezone: SEED_TIMEZONE,
      pricingTier: 'pro',
      paymentMode: 'payLater',
      onboardingChecklist: {
        shopName: now,
        industry: now,
        plan: now,
        paymentMode: now,
        tables: now,
        menu: now,
      },
      configOverrides: {},
      vietQr: VIETQR_BANK,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  writes.push({
    path: `tenants/${tenantId}/members/${owner.uid}`,
    data: {
      uid: owner.uid,
      membershipType: 'owner',
      roles: ['owner'],
      permissions: [],
      isActive: true,
      staffPinHash: null,
      pinFailedAttempts: 0,
      pinLockedUntil: null,
      sessionVersion: 1,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  const ownerProfile: Record<string, unknown> = {
    locale: 'vi',
    activeTenantId: tenantId,
    updatedAt: now,
  };
  // Never clobber an existing profile field with null.
  if (owner.email) ownerProfile.email = owner.email;
  if (owner.displayName) ownerProfile.displayName = owner.displayName;
  writes.push({
    path: `users/${owner.uid}`,
    data: ownerProfile,
  });
  const auth = options.dryRun ? null : getAuth();
  const resolvedStaff: Array<(typeof SEED_STAFF)[number]> = [];
  for (const staff of SEED_STAFF) {
    const staffUid =
      auth === null ? staff.uid : await provisionStaffAuthUser(auth, staff);
    resolvedStaff.push({ ...staff, uid: staffUid });
    writes.push({
      path: `tenants/${tenantId}/members/${staffUid}`,
      data: {
        uid: staffUid,
        email: staff.email,
        displayName: staff.displayName,
        membershipType: 'staff',
        roles: [...staff.roles],
        permissions: [...staff.permissions],
        isActive: true,
        staffPinHash: await hashPin(staff.pin),
        pinFailedAttempts: 0,
        pinLockedUntil: null,
        sessionVersion: 1,
        lastLoginAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    // A previous seed run created a membership under a synthetic uid. When the
    // real Auth uid is available, deactivate the legacy record so the Staff
    // list does not show a duplicate.
    if (staffUid !== staff.uid) {
      writes.push({
        path: `tenants/${tenantId}/members/${staff.uid}`,
        data: { isActive: false, updatedAt: now },
      });
    }
  }
  for (const ingredient of ingredientById.values()) {
    writes.push({
      path: `tenants/${tenantId}/ingredients/${ingredient.ingredientId}`,
      data: { ...ingredient, version: 1 },
    });
  }
  for (const recipe of recipesByItemId.values()) {
    writes.push({
      path: `tenants/${tenantId}/recipes/${recipe.recipeId}`,
      data: { ...recipe, version: 1 },
    });
  }
  for (const item of SEED_MENU_ITEMS) {
    const recipe = recipesByItemId.get(item.id) as Recipe;
    const menuItem = buildMenuItem(tenantId, item, recipe, now);
    writes.push({
      path: `tenants/${tenantId}/menuItems/${item.id}`,
      data: { ...menuItem },
    });
    writes.push({
      path: `tenants/${tenantId}/publicMenuItems/${item.id}`,
      data: buildPublicMenuItem(menuItem),
    });
  }
  for (let index = 1; index <= SEED_TABLE_COUNT; index += 1) {
    const table = seedTable(index);
    writes.push({
      path: `tenants/${tenantId}/tables/${table.tableId}`,
      data: {
        name: table.name,
        isActive: true,
        tokenVersion: 1,
        activeToken: table.token,
        qrPayload: `/menu/${table.token}`,
        nfcWritten: false,
        archivedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    });
    writes.push({
      path: `publicTableLinks/${table.token}`,
      data: {
        schemaVersion: TABLE_CONTRACT_VERSION,
        tenantId,
        tableId: table.tableId,
        tableName: table.name,
        tokenVersion: 1,
        isActive: true,
        createdAt: now,
        revokedAt: null,
      },
    });
  }

  const todayKey = dayKeyFromIso(now, SEED_TIMEZONE);
  const orderSources: ReportingOrderSource[] = [];
  const paymentSources: ReportingPaymentSource[] = [];
  const firstDayKey = shiftDayKey(todayKey, -(options.days - 1));
  // Distribute the requested total as evenly as possible across the days; the
  // default is a fixed per-day count when `--orders` is not given.
  const baseOrdersPerDay =
    options.orders > 0
      ? Math.floor(options.orders / options.days)
      : DEFAULT_SEED_ORDERS_PER_DAY;
  const remainder =
    options.orders > 0 ? options.orders % options.days : 0;
  for (let dayIndex = 0; dayIndex < options.days; dayIndex += 1) {
    const dayKey = shiftDayKey(todayKey, -dayIndex);
    const ordersPerDay = baseOrdersPerDay + (dayIndex < remainder ? 1 : 0);
    for (let orderIndex = 0; orderIndex < ordersPerDay; orderIndex += 1) {
      const generated = generateOrder(
        tenantId,
        owner.uid,
        dayIndex,
        orderIndex,
        now,
        dayKey,
        costByItemId,
      );
      writes.push({
        path: `tenants/${tenantId}/orders/${generated.order.orderId as string}`,
        data: generated.order,
      });
      for (const event of generated.events) {
        writes.push({
          path:
            `tenants/${tenantId}/orders/` +
            `${generated.order.orderId as string}/statusEvents/${event.eventId}`,
          data: { ...event },
        });
      }
      writes.push({
        path: `publicOrderTracking/${generated.tracking.trackingToken}`,
        data: { ...generated.tracking },
      });
      if (generated.payment) {
        writes.push({
          path: `tenants/${tenantId}/payments/${generated.payment.paymentId}`,
          data: { ...generated.payment },
        });
      }
      orderSources.push(generated.source);
      if (generated.paymentSource) {
        paymentSources.push(generated.paymentSource);
      }
    }
  }

  const bundles = rebuildDailyStats({
    tenantId,
    timezone: SEED_TIMEZONE,
    fromDay: firstDayKey,
    toDay: todayKey,
    orders: orderSources,
    payments: paymentSources,
    now,
  });
  for (const bundle of bundles) {
    const dayPath = `tenants/${tenantId}/dailyStats/${bundle.doc.dayKey}`;
    writes.push({ path: dayPath, data: { ...bundle.doc } });
    for (const item of bundle.items) {
      writes.push({
        path: `${dayPath}/items/${item.itemId}`,
        data: { ...item },
      });
    }
    for (const table of bundle.tables) {
      writes.push({
        path: `${dayPath}/tables/${table.tableId}`,
        data: { ...table },
      });
    }
  }

  const shifts = buildShifts(tenantId, now, todayKey, resolvedStaff);
  for (const shift of shifts) {
    writes.push({
      path: `tenants/${tenantId}/shifts/${shift.shiftId}`,
      data: { ...shift },
    });
  }
  for (const attendance of buildAttendance(tenantId, shifts)) {
    writes.push({
      path: `tenants/${tenantId}/attendance/${attendance.attendanceId}`,
      data: { ...attendance },
    });
  }

  const totalRevenue = paymentSources.reduce(
    (sum, payment) => sum + payment.amountVnd,
    0,
  );

  if (options.dryRun) {
    process.stdout.write(
      `Kế hoạch seed (dry-run):\n` +
        `  Tenant: ${tenantId} (${options.shopName})\n` +
        `  Chủ quán: ${owner.uid}\n` +
        `  Nguyên liệu: ${SEED_INGREDIENTS.length}\n` +
        `  Món ăn: ${SEED_MENU_ITEMS.length}\n` +
        `  Nhân viên: ${SEED_STAFF.length}\n` +
        `  Bàn: ${SEED_TABLE_COUNT}\n` +
        `  Đơn hàng: ${orderSources.length} trong ${options.days} ngày\n` +
        `  Payment: ${paymentSources.length}, doanh thu ${totalRevenue} VND\n` +
        `  Tổng lượt ghi: ${writes.length}\n` +
        formatPriceProvenance(),
    );
    return;
  }

  const committed = await commitWrites(db, writes);
  process.stdout.write(
    `Đã seed xong vào ${useEmulator ? 'emulator' : options.projectId}.\n` +
      `  Tenant: ${tenantId}\n` +
      `  Món ăn: ${SEED_MENU_ITEMS.length}, Nguyên liệu: ${SEED_INGREDIENTS.length}\n` +
      `  Bàn: ${SEED_TABLE_COUNT}, Nhân viên: ${SEED_STAFF.length}\n` +
      `  Đơn hàng: ${orderSources.length}, Payment: ${paymentSources.length}\n` +
      `  Doanh thu seed: ${totalRevenue} VND\n` +
      `  Tổng lượt ghi: ${committed}\n` +
      formatPriceProvenance() +
      `Chọn tenant ${tenantId} trong ứng dụng để xem dữ liệu.\n`,
  );
}

/**
 * Report where each Seed ingredient price came from. A surveyed retail price is
 * not a purchase cost, so the operator sees that rather than assuming the demo
 * Cost is an invoice figure.
 */
function formatPriceProvenance(): string {
  const fromSurvey = SEED_INGREDIENT_PRICE_SOURCES.filter(
    (entry) => entry.source === 'survey',
  );
  const overridden = SEED_INGREDIENT_PRICE_SOURCES.filter(
    (entry) => entry.source === 'override',
  );
  const fallback = SEED_INGREDIENT_PRICE_SOURCES.filter(
    (entry) => entry.source === 'seed-default',
  );

  let output =
    `  Nguồn giá: ${fromSurvey.length} khảo sát ${SURVEY_OBSERVED_AT}, ` +
    `${overridden.length} do người duyệt, ${fallback.length} giá mặc định\n`;

  if (isSurveyStale(SURVEY_OBSERVED_AT)) {
    output +=
      `  ! Khảo sát giá đã cũ hơn ${SURVEY_MAX_AGE_DAYS} ngày — ` +
      `chạy lại "npm run market:survey".\n`;
  }
  if (fromSurvey.length > 0) {
    output +=
      '  ! Giá khảo sát gần với giá vốn nhưng KHÔNG phải hoá đơn của quán. ' +
      'Thay bằng hoá đơn thật trước khi tin vào lãi gộp.\n';
  }
  return output;
}

const invokedDirectly =
  process.argv[1]?.endsWith('seed.ts') ||
  process.argv[1]?.endsWith('seed.js') ||
  false;

if (invokedDirectly) {
  run().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
