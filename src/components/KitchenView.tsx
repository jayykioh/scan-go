import React, { useCallback, useEffect, useState } from 'react';
import type { Order as AppOrder } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import {
  applyNotificationEvent,
  initialNotificationState,
  NOTIFICATION_SOUND_STORAGE_KEY,
  notificationPreferenceSchema,
  readSoundEnabled,
  type NotificationEvent,
  type NotificationState,
} from '@contracts/notification.contract';
import {
  listKitchenOrders,
  markReady,
  playNotificationTone,
  setKitchenItemAvailability,
  startCooking,
  subscribeKitchenAvailability,
  subscribeTenantNotifications,
} from '../data/adapters/fulfilment.adapter';
import { toPublicMenuItem, toViewOrder } from '../data/adapters/view-mappers';
import { usePersistentState } from '../hooks/usePersistentState';
import { TenantConfig, Order, MenuItem, TableConfig } from '../types';
import { 
  Flame, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  X, 
  UtensilsCrossed,
  Volume2,
  VolumeX
} from 'lucide-react';

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
  const [availability, setAvailability] = useState<MenuItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [notificationState, setNotificationState] = useState<NotificationState>(
    initialNotificationState,
  );
  const [notificationToast, setNotificationToast] = useState<NotificationEvent | null>(null);
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
      const kitchenEvents = events.filter(event => event.channel === 'kitchen');
      if (kitchenEvents.length === 0) return;
      const latest = kitchenEvents[0];
      setNotificationState(prev => {
        const { state, effect } = applyNotificationEvent(prev, latest, soundEnabled);
        if (effect.isVisible) {
          setNotificationToast(latest);
          playNotificationTone(effect.isAudible);
          window.setTimeout(() => setNotificationToast(null), 4000);
        }
        return state;
      });
      // A bounded event signals a new Order; refresh the server queue.
      void refreshQueue();
    },
    [soundEnabled, refreshQueue],
  );

  useEffect(() => {
    void refreshQueue();
    const unsubscribe = subscribeTenantNotifications(tenantId, handleNotificationEvents, (error) =>
      setQueueError(error.message),
    );
    return () => unsubscribe();
  }, [tenantId, handleNotificationEvents, refreshQueue]);

  // Kitchen observes the public-safe menu projection to toggle availability.
  useEffect(() => {
    if (!tenantId) return;
    const unsubscribe = subscribeKitchenAvailability(
      tenantId,
      (items) => setAvailability(items.map(toPublicMenuItem)),
      (error) => setQueueError(error.message),
    );
    return () => unsubscribe();
  }, [tenantId]);

  const handleKitchenSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (activePin.length !== 4) {
      setPinError('Vui lòng nhập đủ 4 số để nhận ca.');
      return;
    }
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

  const handleKitchenDisableStock = async (id: string) => {
    const current = availability.find((item) => item.id === id);
    if (!current) return;
    try {
      await setKitchenItemAvailability(id, !current.inStock);
      setAvailability((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, inStock: !item.inStock } : item,
        ),
      );
      setMenuItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, inStock: !item.inStock } : item,
        ),
      );
    } catch (error) {
      setQueueError(
        error instanceof Error ? error.message : 'Không đổi được tình trạng món.',
      );
    }
  };

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

  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="kitchen-main">
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

      <AnimatePresence>
        {notificationToast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-3 mt-3 rounded-[21px] border border-amber-200 bg-amber-50 px-4 py-2.5 text-center"
          >
            <p className="text-xs font-semibold text-amber-800">
              Đơn mới • Bàn {notificationToast.tableName}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {queueError && (
        <p role="alert" className="mx-3 mt-3 rounded-[21px] border border-red-200 bg-red-50 px-4 py-2.5 text-center text-xs font-semibold text-red-700">
          {queueError}
        </p>
      )}

      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        <div className="flex justify-between items-center text-xs font-bold text-[#808080] select-none">
          <span>Hàng đợi</span>
          <span className="text-xs text-zinc-900 lowercase">sync</span>
        </div>

        {kitchenQueue.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center select-none">
            <div className="w-14 h-14 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-zinc-900">Bếp đã rảnh!</p>
            <p className="text-xs text-zinc-400 mt-1">Chờ đơn mới từ khách</p>
          </div>
        ) : (
          <div className="space-y-[13px]">
            {kitchenQueue.map((order, index) => {
              const isCooking = order.status === 'cooking';
              const tableName = tables.find(t => t.id === order.tableId)?.name || `Bàn ${order.tableId}`;
              
              return (
                <div 
                  key={order.id} 
                  className={`rounded-[21px] border shadow-xs transition-all overflow-hidden ${
                    isCooking 
                      ? 'border-zinc-900 bg-white' 
                      : 'border-[#B5C7D8] bg-[#F5F5F7]/30'
                  }`}
                >
                  {/* Card head banner */}
                  <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/50 flex justify-between items-center select-none text-[#2D2B30]">
                    <span className="text-sm font-bold text-[#2D2B30] flex items-center gap-[4px] select-none">
                      <UtensilsCrossed className="w-4 h-4 text-zinc-900" />
                      {tableName}
                    </span>
                    <span className="text-xs text-[#808080] font-semibold ">
                      TICKET #{index + 1} • {isCooking ? '🍳 ĐANG NẤU' : '⏳ CHỜ NẤU'}
                    </span>
                  </div>

                  {/* Dish items lists */}
                  <div className="p-[13px] space-y-[13px] text-[#2D2B30]">
                    <div className="space-y-[4px]">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between items-start text-sm border-b border-[#B5C7D8]/20 pb-2.5 last:border-b-0">
                          <div className="text-[#2D2B30] space-y-[2px]">
                            <p className="font-semibold text-[#2D2B30]">
                              {item.name} <span className="text-zinc-900 font-bold ml-1 ">x{item.quantity}</span>
                            </p>
                            
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <div className="flex flex-wrap gap-[4px] mt-1">
                                {item.selectedModifiers.map(mod => (
                                  <span key={mod} className="text-xs bg-white border border-[#B5C7D8] text-[#454547] rounded-[21px] px-2 py-0.2">
                                    • {mod}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-3 border-t border-zinc-100">
                      {!isCooking ? (
                        <button 
                          type="button"
                          onClick={() => void handleUpdateStatus(order.id, 'cooking')}
                          disabled={pendingOrderId === order.id}
                          className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <Flame className="w-4 h-4" />
                          Bắt đầu nấu
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => void handleUpdateStatus(order.id, 'ready')}
                          disabled={pendingOrderId === order.id}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Xong
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Availability board: Kitchen can stop one item through Catalog. */}
        {availability.length > 0 && (
          <div className="mt-[13px] space-y-[4px]">
            <div className="flex justify-between items-center text-xs font-bold text-[#808080] select-none">
              <span>Tình trạng món</span>
              <span className="text-xs text-zinc-900 lowercase">catalog</span>
            </div>
            {availability.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void handleKitchenDisableStock(item.id)}
                className={`w-full rounded-[21px] border px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                  item.inStock
                    ? 'border-[#B5C7D8] bg-white text-[#2D2B30]'
                    : 'border-zinc-300 bg-[#F5F5F7] text-[#808080]'
                }`}
              >
                <span className="font-semibold truncate">{item.name}</span>
                <span className={`text-[10px] font-bold ${item.inStock ? 'text-emerald-600' : 'text-red-600'}`}>
                  {item.inStock ? 'ĐANG BÁN' : 'TẠM HẾT'}
                </span>
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}


