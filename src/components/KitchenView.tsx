import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Order as AppOrder } from '../types';
import { motion } from 'motion/react';
import {
  applyNotificationEvent,
  initialNotificationState,
  NOTIFICATION_BANNER_MS,
  NOTIFICATION_SOUND_STORAGE_KEY,
  notificationPreferenceSchema,
  readSoundEnabled,
  seedNotificationState,
  type NotificationEvent,
  type NotificationState,
} from '@contracts/notification.contract';
import {
  listKitchenAvailability,
  listKitchenOrders,
  markReady,
  playNotificationTone,
  requestNotificationPermission,
  setKitchenCategoryAvailability,
  setKitchenItemAvailability,
  showDesktopNotification,
  startCooking,
  subscribeKitchenAvailability,
  subscribeTenantNotifications,
} from '../data/adapters/fulfilment.adapter';
import {
  toAvailabilityMenuItem,
  toOwnerMenuItem,
  toPublicMenuItem,
  toViewOrder,
} from '../data/adapters/view-mappers';
import { useStoreSlice, useStoreTenantId } from '../data/tenantStore';
import { usePersistentState } from '../hooks/usePersistentState';
import { useOperationTables } from '../hooks/useOperationTables';
import { resolvePlanLayout } from '../pages/dashboard/tables/tablePlan';
import OperationTableBoard, {
  summarizeOrdersByTable,
  type OperationTableState,
} from './OperationTableBoard';
import InventoryPanel from './InventoryPanel';
import NotificationDialog from './NotificationDialog';
import { TenantConfig, Order, MenuItem, TableConfig } from '../types';
import { 
  Flame, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  X,
  Volume2,
  VolumeX,
  ClipboardList,
  UtensilsCrossed,
  Boxes
} from 'lucide-react';

/** A ticket that waited this long turns amber, then red (REQ-KDS-001). */
const KITCHEN_WARN_MINUTES = 10;
const KITCHEN_LATE_MINUTES = 20;

/** One clock for the whole queue: the wait label never re-renders per card. */
const KITCHEN_CLOCK_MS = 60_000;

/** The Kitchen's three areas (REQ-KDS-002). */
const KITCHEN_TABS = [
  {
    key: 'queue' as const,
    label: 'Hàng đợi',
    icon: <ClipboardList className="h-4 w-4" />,
  },
  {
    key: 'availability' as const,
    label: 'Tình trạng món',
    icon: <UtensilsCrossed className="h-4 w-4" />,
  },
  {
    key: 'inventory' as const,
    label: 'Kho nguyên liệu',
    icon: <Boxes className="h-4 w-4" />,
  },
];

const KITCHEN_WAIT_TONE_CLASS = {
  calm: 'text-[#5B5B60]',
  warn: 'text-amber-700 font-bold',
  late: 'text-red-600 font-bold',
} as const;

/** Whole minutes a ticket has waited, floored at zero for clock skew. */
export function kitchenWaitMinutes(placedAt: Date, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - placedAt.getTime()) / 60_000));
}

/** Waiting tone, so the longest wait is the loudest tile (REQ-KDS-001). */
export function kitchenWaitTone(minutes: number): 'calm' | 'warn' | 'late' {
  if (minutes >= KITCHEN_LATE_MINUTES) return 'late';
  if (minutes >= KITCHEN_WARN_MINUTES) return 'warn';
  return 'calm';
}

interface KitchenProps {
  tenantConfig: TenantConfig;
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  onboardCompleted: boolean;
  setOnboardCompleted: (val: boolean) => void;
  tables?: TableConfig[];
  embedded?: boolean;
  /** Tenant scope for the Kitchen queue and notification listener. */
  tenantId?: string;
}

/**
 * A Pay-First Order is hidden from Kitchen until Payment records a confirmed
 * settlement. Ordering stores the server-authoritative `paidAt`; the UI gate
 * mirrors that rule and the server query remains authoritative (REQ-ORD-002).
 */
export function isKitchenQueueOrder(order: AppOrder): boolean {
  if (order.status !== 'pending' && order.status !== 'cooking') {
    return false;
  }
  if (order.paymentMode === 'Pay-First') {
    return Boolean(order.paidAt);
  }
  return true;
}

/**
 * Floor-plan state for the Kitchen queue: how many Orders each table is
 * waiting on, and the wait tone of its oldest one (REQ-KDS-001, REQ-UX-003).
 */
export function kitchenBoardStates(
  orders: Order[],
  nowMs: number,
): Map<string, OperationTableState> {
  const states = new Map<string, OperationTableState>();
  for (const [tableId, summary] of summarizeOrdersByTable(
    orders.filter(isKitchenQueueOrder),
  )) {
    const waited = summary.oldestAt
      ? kitchenWaitMinutes(summary.oldestAt, nowMs)
      : 0;
    states.set(tableId, {
      state: 'occupied',
      count: summary.count,
      detail: `chờ ${waited}p`,
      tone: kitchenWaitTone(waited),
    });
  }
  return states;
}

/**
 * Merge the live available set with the full active list and group by category.
 * An unavailable item stays visible so Kitchen can turn it back on. The live
 * set wins once it has reported at least once (REQ-KDS-002).
 */
export function buildKitchenAvailabilityGroups(
  catalogItems: MenuItem[],
  availableItems: MenuItem[],
  availabilityReady: boolean,
): Array<[string, MenuItem[]]> {
  const availableIds = new Set(availableItems.map((item) => item.id));
  const byId = new Map<string, MenuItem>();
  for (const item of catalogItems) {
    byId.set(item.id, {
      ...item,
      inStock: availabilityReady ? availableIds.has(item.id) : item.inStock,
    });
  }
  for (const item of availableItems) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }
  const groups = new Map<string, MenuItem[]>();
  for (const item of byId.values()) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }
  return [...groups.entries()];
}

export default function KitchenView({
  tenantConfig,
  setMenuItems,
  onboardCompleted,
  setOnboardCompleted,
  tables = [],
  embedded = false,
  tenantId = 'demo-tenant',
}: KitchenProps) {
  const [activeShift, setActiveShift] = useState(false);
  const [activePin, setActivePin] = useState('');
  const [pinError, setPinError] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [storedMenuItems, menuState] = useStoreSlice('menuItems');
  const storeTenantId = useStoreTenantId();
  const useSharedCatalog = storeTenantId === tenantId;
  const useDemoFallback = !storeTenantId && tenantId === 'demo-tenant';
  const [fallbackAvailability, setFallbackAvailability] = useState<MenuItem[]>([]);
  const [fallbackCatalogAvailability, setFallbackCatalogAvailability] =
    useState<MenuItem[]>([]);
  const [fallbackAvailabilityReady, setFallbackAvailabilityReady] = useState(false);
  const catalogAvailability = useMemo(() => {
    if (!useSharedCatalog) return fallbackCatalogAvailability;
    return storedMenuItems
      .filter((item) => item.archivedAt === null)
      .map(toOwnerMenuItem);
  }, [fallbackCatalogAvailability, storedMenuItems, useSharedCatalog]);
  const availability = useMemo(() => {
    if (!useSharedCatalog) return fallbackAvailability;
    return storedMenuItems
      .filter((item) => item.archivedAt === null && item.isAvailable)
      .map(toOwnerMenuItem);
  }, [fallbackAvailability, storedMenuItems, useSharedCatalog]);
  const availabilityReady = useSharedCatalog
    ? !menuState.loading
    : fallbackAvailabilityReady;
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [notificationToast, setNotificationToast] = useState<NotificationEvent | null>(null);
  // Dedupe lives in a ref, not state: a side effect inside a state updater
  // replays the tone every time React invokes the updater twice (REQ-NOT-001).
  const notificationStateRef = useRef<NotificationState>(initialNotificationState);
  const firstSnapshotRef = useRef(true);
  const [soundEnabled, setSoundEnabled] = usePersistentState<boolean>(
    NOTIFICATION_SOUND_STORAGE_KEY,
    true,
    {
      deserialize: (raw) => {
        try {
          return notificationPreferenceSchema.parse(JSON.parse(raw)).soundEnabled;
        } catch {
          return readSoundEnabled(undefined);
        }
      },
      serialize: (value) => JSON.stringify({ soundEnabled: value }),
    },
  );

  // Kitchen reads its bounded queue from the Fulfilment query. The server owns
  // the Order transition and the Pay-First gate (REQ-KDS-001, REQ-ORD-002).
  const refreshQueue = useCallback(async () => {
    if (!tenantId) return;
    try {
      const result = await listKitchenOrders();
      setOrders(result.orders.map(toViewOrder));
      setQueueError(null);
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Không tải được hàng đợi bếp.',
      );
    }
  }, [tenantId]);

  const handleNotificationEvents = useCallback(
    (events: NotificationEvent[]) => {
      // The first snapshot is the stored backlog, i.e. the queue. Seeding the
      // dedupe window with it keeps reopening Kitchen silent (REQ-NOT-001).
      if (firstSnapshotRef.current) {
        firstSnapshotRef.current = false;
        notificationStateRef.current = seedNotificationState(
          events.map(event => event.eventId),
        );
        return;
      }
      const kitchenEvents = events.filter(event => event.channel === 'kitchen');
      if (kitchenEvents.length === 0) return;
      const latest = kitchenEvents[0];
      const { state, effect } = applyNotificationEvent(
        notificationStateRef.current,
        latest,
        soundEnabled,
      );
      notificationStateRef.current = state;
      if (effect.isVisible) {
        setNotificationToast(latest);
        playNotificationTone(effect.isAudible);
        // The stored table name already reads "Bàn 1".
        void showDesktopNotification('Đơn mới', latest.tableName);
        window.setTimeout(() => setNotificationToast(null), NOTIFICATION_BANNER_MS);
      }
      // A bounded event signals a new Order; refresh the server queue.
      void refreshQueue();
    },
    [soundEnabled, refreshQueue],
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), KITCHEN_CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshQueue();
    const unsubscribe = subscribeTenantNotifications(tenantId, handleNotificationEvents, (error) =>
      setQueueError(error.message),
    );
    return () => unsubscribe();
  }, [tenantId, handleNotificationEvents, refreshQueue]);

  // Kitchen observes the public-safe menu projection to toggle availability.
  useEffect(() => {
    if (!tenantId || useSharedCatalog || !useDemoFallback) return;
    const unsubscribe = subscribeKitchenAvailability(
      tenantId,
      (items) => {
        setFallbackAvailability(items.map(toPublicMenuItem));
        setFallbackAvailabilityReady(true);
      },
      (error) => setQueueError(error.message),
    );
    return () => unsubscribe();
  }, [tenantId, useSharedCatalog, useDemoFallback]);

  // The live projection only holds available items. This one-shot list adds the
  // unavailable items, so a category can be turned back on (REQ-KDS-002).
  useEffect(() => {
    if (!tenantId || useSharedCatalog || !useDemoFallback) return;
    let cancelled = false;
    (async () => {
      try {
        const items = await listKitchenAvailability();
        if (!cancelled) {
          setFallbackCatalogAvailability(items.map(toAvailabilityMenuItem));
        }
      } catch (error) {
        if (!cancelled) {
          setQueueError(
            error instanceof Error
              ? error.message
              : 'Không tải được tình trạng món.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, useSharedCatalog, useDemoFallback]);

  const handleKitchenSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (activePin.length !== 4) {
      setPinError('Vui lòng nhập đủ 4 số để nhận ca.');
      return;
    }
    // A tap is the gesture browsers require before they allow notifications.
    requestNotificationPermission();
    setActiveShift(true);
    setPinError('');
    setOnboardCompleted(true);
  };

  // Kitchen transitions are server commands. The UI updates from the committed
  // result and never mutates a local Order (REQ-KDS-001).
  const handleUpdateStatus = async (id: string, nextStatus: 'cooking' | 'ready') => {
    setPendingOrderId(id);
    try {
      const result =
        nextStatus === 'cooking' ? await startCooking(id) : await markReady(id);
      setOrders((prev) =>
        prev.map((order) => (order.id === id ? toViewOrder(result.order) : order)),
      );
      setQueueError(null);
      // A ready Order leaves the Kitchen queue; a cooking Order stays.
      if (nextStatus === 'ready') {
        void refreshQueue();
      }
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Không cập nhật được đơn.',
      );
    } finally {
      setPendingOrderId(null);
    }
  };

  const handleKitchenToggleItem = async (item: MenuItem) => {
    const next = !item.inStock;
    try {
      await setKitchenItemAvailability(item.id, next);
      setMenuItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, inStock: next } : row)),
      );
      if (!useSharedCatalog) {
        setFallbackCatalogAvailability((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, inStock: next } : row,
          ),
        );
      }
      setQueueError(null);
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Không đổi được tình trạng món.',
      );
    }
  };

  const handleKitchenToggleCategory = async (
    category: string,
    nextAvailable: boolean,
  ) => {
    setPendingCategory(category);
    try {
      await setKitchenCategoryAvailability(category, nextAvailable);
      setMenuItems((prev) =>
        prev.map((row) =>
          row.category === category ? { ...row, inStock: nextAvailable } : row,
        ),
      );
      if (!useSharedCatalog) {
        setFallbackCatalogAvailability((prev) =>
          prev.map((row) =>
            row.category === category
              ? { ...row, inStock: nextAvailable }
              : row,
          ),
        );
      }
      setQueueError(null);
    } catch (error) {
      setQueueError(
        error instanceof Error
          ? error.message
          : 'Không đổi được tình trạng danh mục.',
      );
    } finally {
      setPendingCategory(null);
    }
  };

  // Merge the live available set with the full active list so a Kitchen user
  // can turn an item or category off and back on (REQ-KDS-002).
  const availabilityGroups = useMemo(
    () =>
      buildKitchenAvailabilityGroups(
        catalogAvailability,
        availability,
        availabilityReady,
      ),
    [availability, availabilityReady, catalogAvailability],
  );

  // The operating floor plan groups the queue by table (REQ-KDS-001). These
  // hooks run before the sign-in early return, so they must not depend on the
  // queue slice computed below it.
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'queue' | 'availability' | 'inventory'
  >('queue');
  const { tables: operationTables } = useOperationTables(tables);
  const layout = useMemo(
    () => resolvePlanLayout(operationTables),
    [operationTables],
  );
  const boardStates = useMemo(
    () => kitchenBoardStates(orders, nowMs),
    [orders, nowMs],
  );

  // Sign in screen matching Apple security design
  if (!embedded && !activeShift) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full" 
        id="kitchen-signin"
      >
        <div className="space-y-4 mt-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto shadow-sm">
            <Flame className="w-5 h-5 text-zinc-900" />
          </div>
          <h3 className="text-2xl font-bold text-[#2D2B30] text-center tracking-tight">KDS Nhà Bếp</h3>
          <p className="text-xs text-[#8E8E93] text-center max-w-[240px] mx-auto leading-relaxed">
            Vui lòng nhập mã PIN.
          </p>
        </div>

        <form onSubmit={handleKitchenSignIn} className="space-y-3 text-center my-6">
          <input 
            type="password" 
            value={activePin}
            onChange={(e) => {
              setActivePin(e.target.value.replace(/\D/g, ''));
              setPinError('');
            }}
            placeholder="••••"
            maxLength={4}
            className="w-32 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-center tracking-[0.4em] text-xl py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold"
          />
          <p role={pinError ? 'alert' : undefined} className={`text-xs font-medium ${pinError ? 'text-red-700' : 'text-[#8E8E93]'}`}>
            {pinError || 'Nhập mã PIN 4 số để bắt đầu'}
          </p>
        </form>

        <motion.button 
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleKitchenSignIn}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-3.5 rounded-2xl font-semibold text-xs shadow-sm transition-all cursor-pointer"
        >
          Đăng nhập
        </motion.button>
      </motion.div>
    );
  }

  const kitchenQueue = orders.filter(isKitchenQueueOrder);
  const visibleQueue = selectedTableId
    ? kitchenQueue.filter((order) => order.tableId === selectedTableId)
    : kitchenQueue;

  // The page runs full-width on a tablet and one column on a phone, so the
  // queue/availability split keys off the container width, not the viewport
  // (REQ-KDS-002).
  return (
    <div className="@container flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="kitchen-main">
      {/* Header Info */}
      <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/60 flex justify-between items-center select-none">
        <div className="flex items-center gap-[4px]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-sm font-bold text-[#2D2B30] ">KDS Nhà Bếp</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSoundEnabled(prev => !prev)}
            className="text-[#808080] hover:text-zinc-900 transition-colors p-1.5 cursor-pointer"
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            aria-label={soundEnabled ? 'Tắt âm thanh thông báo' : 'Bật âm thanh thông báo'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <span className="text-sm bg-zinc-900 text-white font-semibold rounded-[21px] px-2.5 py-0.5 ">
            {kitchenQueue.length} Đơn Chờ
          </span>
        </div>
      </div>

      <NotificationDialog
        open={notificationToast !== null}
        title="Đơn mới"
        tableName={notificationToast?.tableName ?? ''}
        items={
          orders.find(order => order.id === notificationToast?.orderId)?.items
        }
        onClose={() => setNotificationToast(null)}
      />

      {queueError && (
        <p role="alert" className="mx-3 mt-3 rounded-[21px] border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-700">
          {queueError}
        </p>
      )}

      {/* Tabs (REQ-KDS-002): the queue and its floor plan, the menu state, and
          the ingredient in/out the Kitchen records. */}
      <div
        role="tablist"
        aria-label="Khu vực bếp"
        className="flex shrink-0 border-b border-[#B5C7D8]/60 bg-white select-none"
      >
        {KITCHEN_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-1 whitespace-nowrap px-1 py-2.5 text-[11px] font-bold uppercase tracking-normal transition-colors cursor-pointer sm:gap-1.5 sm:px-2 sm:tracking-wider ${
              activeTab === tab.key
                ? 'border-b-2 border-zinc-900 text-zinc-900'
                : 'border-b-2 border-transparent text-[#808080]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'queue' && (
        <div className="flex-grow overflow-y-auto p-[13px] bg-white">
          {/* The ticket grid measures this column (REQ-KDS-002). */}
          <div className="@container min-w-0 space-y-[13px]">
          <div className="flex justify-between items-center text-xs font-bold text-[#808080] select-none">
            <span>
              Hàng đợi
              {selectedTableId && (
                <span className="ml-2 text-[#2D2B30]">
                  {operationTables.find((t) => t.tableId === selectedTableId)?.name}
                </span>
              )}
            </span>
            {selectedTableId ? (
              <button
                type="button"
                onClick={() => setSelectedTableId(null)}
                className="text-xs font-bold text-zinc-900 lowercase cursor-pointer"
              >
                xem tất cả
              </button>
            ) : (
              <span className="text-xs text-zinc-900 lowercase">sync</span>
            )}
          </div>

        {visibleQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center select-none">
            <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-zinc-900">
              {selectedTableId ? 'Bàn này chưa có đơn' : 'Bếp đã rảnh!'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {selectedTableId ? 'Bấm "xem tất cả" để xem hàng đợi' : 'Chờ đơn mới từ khách'}
            </p>
          </div>
        ) : (
          <div className="grid gap-[13px] @md:grid-cols-2 @3xl:grid-cols-3">
            {visibleQueue.map((order) => {
              const isCooking = order.status === 'cooking';
              const tableName = order.tableName ?? tables.find(t => t.id === order.tableId)?.name ?? `Bàn ${order.tableId}`;
              // The queue arrives oldest first, so #1 is the next to cook. The
              // position counts the whole queue, not the filtered slice.
              const position = kitchenQueue.findIndex((row) => row.id === order.id) + 1;
              const waitMinutes = kitchenWaitMinutes(order.timestamp, nowMs);
              const placedAt = order.timestamp.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <article
                  key={order.id}
                  className={`flex flex-col overflow-hidden rounded-[21px] border transition-all @md:aspect-square ${
                    isCooking
                      ? 'border-zinc-900 bg-white'
                      : 'border-[#B5C7D8] bg-[#F5F5F7]/30'
                  }`}
                >
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#B5C7D8]/50 bg-[#F5F5F7] px-[13px] py-2.5 select-none">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 rounded-full bg-zinc-950 px-2 py-0.5 font-mono text-xs font-bold text-white">
                        #{position}
                      </span>
                      <span className="truncate text-sm font-bold text-[#2D2B30]">{tableName}</span>
                    </span>
                    <span className={`shrink-0 text-[10px] font-bold ${isCooking ? 'text-amber-700' : 'text-[#5B5B60]'}`}>
                      {isCooking ? 'ĐANG NẤU' : 'CHỜ NẤU'}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-2 px-[13px] pt-2 font-mono text-[11px] select-none">
                    <span className="text-[#5B5B60]">{placedAt}</span>
                    <span className={KITCHEN_WAIT_TONE_CLASS[kitchenWaitTone(waitMinutes)]}>
                      chờ {waitMinutes}p
                    </span>
                  </div>

                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-[13px] text-[#2D2B30]">
                    {order.items.map(item => (
                      <div key={item.id} className="space-y-[2px]">
                        <p className="text-sm font-semibold text-[#2D2B30]">
                          {item.name} <span className="ml-1 font-bold text-zinc-900">x{item.quantity}</span>
                        </p>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <div className="flex flex-wrap gap-[4px]">
                            {item.selectedModifiers.map(mod => (
                              <span key={mod} className="rounded-[21px] border border-[#B5C7D8] bg-white px-2 py-0.5 text-[11px] text-[#454547]">
                                {mod}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}

                    {order.customerNote && (
                      <div className="rounded-xl bg-amber-50 px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                          Yêu cầu của khách
                        </p>
                        <p className="mt-0.5 whitespace-pre-line text-xs font-semibold text-amber-900">
                          {order.customerNote}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 border-t border-zinc-100 p-[13px] pt-2.5">
                    {!isCooking ? (
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(order.id, 'cooking')}
                        disabled={pendingOrderId === order.id}
                        aria-label={`Bắt đầu nấu ${tableName}, đơn #${position}`}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <Flame className="w-4 h-4" />
                        Bắt đầu nấu
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleUpdateStatus(order.id, 'ready')}
                        disabled={pendingOrderId === order.id}
                        aria-label={`Xong ${tableName}, đơn #${position}`}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="w-4 h-4" />
                        Xong
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

          {/* Order cards stay on top and the floor plan sits below them: the
              cook reads the tickets first, then taps a table to jump to it
              (REQ-UX-003). */}
          <OperationTableBoard
            placements={layout.placements}
            columns={layout.columns}
            rows={layout.rows}
            states={boardStates}
            selectedTableId={selectedTableId}
            onSelect={(table) =>
              setSelectedTableId((current) =>
                current === table.tableId ? null : table.tableId,
              )
            }
          />
          </div>
        </div>
      )}

      {activeTab === 'availability' && (
        <div className="flex-grow overflow-y-auto p-[13px] bg-white">
        {availabilityGroups.length === 0 && (
          <p className="py-12 text-center text-sm font-bold text-zinc-400">
            Chưa có món nào để đổi tình trạng.
          </p>
        )}

        {/* Availability board: Kitchen toggles one item or a whole category. */}
        {availabilityGroups.length > 0 && (
          <div className="mx-auto min-w-0 max-w-3xl space-y-[13px]">
            <div className="flex justify-between items-center text-xs font-bold text-[#808080] select-none">
              <span>Tình trạng món</span>
              <span className="text-xs text-zinc-900 lowercase">catalog</span>
            </div>
            {availabilityGroups.map(([category, items]) => {
              const allAvailable = items.every((item) => item.inStock);
              return (
                <div key={category} className="space-y-[4px]">
                  <div className="flex items-center justify-between gap-2 rounded-[21px] bg-[#F5F5F7] px-4 py-2">
                    <span className="truncate text-xs font-bold text-[#2D2B30]">
                      {category}
                    </span>
                    <button
                      type="button"
                      disabled={pendingCategory === category}
                      onClick={() =>
                        void handleKitchenToggleCategory(category, !allAvailable)
                      }
                      className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
                        allAvailable
                          ? 'bg-red-50 text-red-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {pendingCategory === category
                        ? 'Đang lưu'
                        : allAvailable
                          ? 'Tắt cả mục'
                          : 'Bật cả mục'}
                    </button>
                  </div>
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`${item.inStock ? 'Tắt' : 'Bật'} món ${item.name}`}
                      onClick={() => void handleKitchenToggleItem(item)}
                      className={`w-full rounded-[21px] border px-4 py-2.5 flex items-center justify-between gap-2 text-sm transition-colors ${
                        item.inStock
                          ? 'border-[#B5C7D8] bg-white text-[#2D2B30]'
                          : 'border-zinc-300 bg-[#F5F5F7] text-[#808080]'
                      }`}
                    >
                      <span className="font-semibold truncate">{item.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`text-[10px] font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-600'}`}>
                          {item.inStock ? 'ĐANG BÁN' : 'TẠM HẾT'}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${item.inStock ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {item.inStock ? 'Tắt' : 'Bật'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}

      {activeTab === 'inventory' && (
        <div className="flex-grow overflow-y-auto bg-white">
          <InventoryPanel embedded />
        </div>
      )}
    </div>
  );
}


