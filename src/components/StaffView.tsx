import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { StaffPinDeniedState } from '@contracts/identity.contract';
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
  listReadyOrders,
  markServed,
  playNotificationTone,
  subscribeTenantNotifications,
} from '../data/adapters/fulfilment.adapter';
import { toViewOrder } from '../data/adapters/view-mappers';
import { usePersistentState } from '../hooks/usePersistentState';
import { StaffAccount, TenantConfig, TableConfig, Order } from '../types';
import {
  toStaffPinDeniedState,
  toStaffSessionView,
  verifyStaffPin,
  type StaffSessionView,
} from '../data/adapters/auth.adapter';
import KitchenView from './KitchenView';
import CashierView from './CashierView';
import InventoryPanel from './InventoryPanel';
import StaffOrderEntry from './StaffOrderEntry';
import { Boxes, ChefHat, ClipboardList, Coffee, CreditCard, LogOut, CheckCircle, Bell, Volume2, VolumeX } from 'lucide-react';

interface StaffViewProps {
  staffAccounts: StaffAccount[];
  currentStaff: StaffSessionView | null;
  setCurrentStaff: React.Dispatch<React.SetStateAction<StaffSessionView | null>>;
  tenantConfig: TenantConfig;
  tables: TableConfig[];
  /** Tenant the Staff PIN is scoped to. Server verification rejects mismatches. */
  tenantId?: string;
  /** Device identifier bound into the server-issued Staff session. */
  deviceId?: string;
  /** Name shown when the account list has no matching entry (real Staff login). */
  fallbackName?: string;
}

const DEFAULT_TENANT_ID = 'demo-tenant';
const DEFAULT_DEVICE_ID = 'simulator-staff-device';

const TABS: { key: 'kitchen' | 'inventory' | 'order' | 'waiter' | 'cashier'; label: string; icon: React.ReactNode; roleKey: 'isKitchen' | 'isWaiter' | 'isCashier' }[] = [
  { key: 'kitchen', label: 'Bếp', icon: <ChefHat className="w-5 h-5" />, roleKey: 'isKitchen' },
  { key: 'inventory', label: 'Kho', icon: <Boxes className="w-5 h-5" />, roleKey: 'isKitchen' },
  { key: 'order', label: 'Lên món', icon: <ClipboardList className="w-5 h-5" />, roleKey: 'isCashier' },
  { key: 'waiter', label: 'Phục vụ', icon: <Bell className="w-5 h-5" />, roleKey: 'isWaiter' },
  { key: 'cashier', label: 'Thu ngân', icon: <CreditCard className="w-5 h-5" />, roleKey: 'isCashier' },
];

export default function StaffView({
  staffAccounts,
  currentStaff,
  setCurrentStaff,
  tenantConfig,
  tables,
  tenantId = DEFAULT_TENANT_ID,
  deviceId = DEFAULT_DEVICE_ID,
  fallbackName,
}: StaffViewProps) {
  const [pinInput, setPinInput] = useState('');
  const [denied, setDenied] = useState<StaffPinDeniedState | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<'kitchen' | 'inventory' | 'order' | 'waiter' | 'cashier'>('kitchen');
  const [serveError, setServeError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
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

  const readyOrders = useMemo(() => orders.filter(o => o.status === 'ready'), [orders]);
  const servedOrders = useMemo(() => orders.filter(o => o.status === 'served'), [orders]);

  // Waiter reads the bounded `ready` queue from the Fulfilment query.
  const refreshReadyQueue = useCallback(async () => {
    if (!currentStaff) return;
    try {
      const result = await listReadyOrders();
      setOrders(result.orders.map(toViewOrder));
      setServeError(null);
    } catch (error) {
      setServeError(
        error instanceof Error ? error.message : 'Không tải được hàng đợi phục vụ.',
      );
    }
  }, [currentStaff]);

  // Server-written notification effects drive one visible banner and, when
  // sound is enabled, one audible tone. Dedupe keeps a retried event silent
  // (REQ-NOT-001).
  const handleNotificationEvents = useCallback(
    (events: NotificationEvent[]) => {
      const waiterEvents = events.filter(event => event.channel === 'waiter');
      if (waiterEvents.length === 0) return;
      const latest = waiterEvents[0];
      setNotificationState(prev => {
        const { state, effect } = applyNotificationEvent(prev, latest, soundEnabled);
        if (effect.isVisible) {
          setNotificationToast(latest);
          playNotificationTone(effect.isAudible);
          window.setTimeout(() => setNotificationToast(null), 4000);
        }
        return state;
      });
      void refreshReadyQueue();
    },
    [soundEnabled, refreshReadyQueue],
  );

  const currentStaffUid = currentStaff?.uid;
  useEffect(() => {
    if (!currentStaffUid) return;
    const unsubscribe = subscribeTenantNotifications(tenantId, handleNotificationEvents);
    return () => unsubscribe();
  }, [currentStaffUid, tenantId, handleNotificationEvents]);

  useEffect(() => {
    if (!currentStaff?.roles.isWaiter) return;
    void refreshReadyQueue();
  }, [currentStaff, refreshReadyQueue]);

  const getTableName = (order: Order) =>
    order.tableName ?? tables.find(t => t.id === order.tableId)?.name ?? order.tableId;

  useEffect(() => {
    if (currentStaff) {
      const firstTab = TABS.filter(t => currentStaff.roles[t.roleKey])[0];
      if (firstTab) setActiveTab(firstTab.key);
    }
  }, [currentStaff]);

  // The server verifies the hashed PIN, lockout, and tenant scope. The client
  // only sends the PIN and renders the returned session or denied state.
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verifying) return;
    setVerifying(true);
    setDenied(null);
    try {
      const session = await verifyStaffPin({
        tenantId,
        deviceId,
        pin: pinInput,
      });
      const displayName =
        staffAccounts.find((account) => account.id === session.uid)?.name ??
        fallbackName;
      const view = toStaffSessionView(session, displayName);
      setCurrentStaff(view);
      setPinInput('');

      const availableTabs = TABS.filter(t => view.roles[t.roleKey]);
      if (availableTabs.length > 0) setActiveTab(availableTabs[0].key);
    } catch (error) {
      setDenied(toStaffPinDeniedState(error));
      setPinInput('');
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    setCurrentStaff(null);
    setPinInput('');
    setDenied(null);
  };

  const showDeniedState = denied !== null && denied.reason !== 'invalid_pin';

  // The server authorizes the Waiter and Ordering changes `ready → served`
  // once. The local view updates only from the committed result
  // (REQ-WAI-001, NFR-RT-001).
  const handleServeOrder = async (orderId: string) => {
    setServeError(null);
    try {
      await markServed(orderId);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
      void refreshReadyQueue();
    } catch {
      setServeError('Không thể xác nhận phục vụ. Vui lòng thử lại.');
    }
  };

  if (!currentStaff) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full"
      >
        <div className="space-y-4 mt-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto shadow-sm">
            <Coffee className="w-5 h-5 text-zinc-900" />
          </div>
          <h3 className="text-2xl font-bold text-[#2D2B30] text-center tracking-tight">Nhân viên</h3>
          <p className="text-xs text-[#8E8E93] text-center max-w-[240px] mx-auto leading-relaxed">
            Nhập mã PIN cá nhân để bắt đầu ca làm việc
          </p>

          <form onSubmit={handleLogin} className="space-y-3 mt-4">
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pinInput}
              onChange={e => { setPinInput(e.target.value); setDenied(null); }}
              placeholder="Mã PIN"
              disabled={verifying || showDeniedState}
              className="w-full text-center text-lg font-mono tracking-[8px] bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] p-3 text-[#2D2B30] placeholder:text-[#C7C7CC] placeholder:tracking-normal focus:outline-2 focus:outline-[#155BD0] disabled:opacity-60"
              autoFocus
            />
            {denied && !showDeniedState && (
              <p role="alert" className="text-red-500 text-xs text-center">{denied.message}</p>
            )}
            {showDeniedState && (
              <div
                role="alert"
                className="rounded-[21px] border border-red-200 bg-red-50 px-4 py-3 text-center"
              >
                <p className="text-xs font-semibold text-red-700">{denied.message}</p>
                {denied.lockedUntil && (
                  <p className="mt-1 text-[10px] font-mono text-red-600">
                    Khoá đến {new Date(denied.lockedUntil).toLocaleTimeString('vi-VN')}
                  </p>
                )}
              </div>
            )}
            <button
              type="submit"
              disabled={verifying || showDeniedState}
              className="w-full bg-[#155BD0] hover:bg-[#155BD0]/90 text-white font-semibold text-sm py-3 rounded-[21px] transition-colors cursor-pointer focus:outline-2 focus:outline-[#155BD0] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {verifying ? 'Đang xác minh...' : 'Đăng nhập'}
            </button>
          </form>
        </div>
      </motion.div>
    );
  }

  const availableTabs = TABS.filter(t => currentStaff.roles[t.roleKey]);
  const showTabBar = availableTabs.length > 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#B5C7D8]/20">
        <div>
          <p className="text-[11px] text-[#8E8E93]">{tenantConfig.shopName}</p>
          <p className="text-sm font-semibold">{currentStaff.name}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSoundEnabled(prev => !prev)}
            className="text-[#8E8E93] hover:text-[#155BD0] transition-colors p-2 cursor-pointer"
            title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}
            aria-label={soundEnabled ? 'Tắt âm thanh thông báo' : 'Bật âm thanh thông báo'}
          >
            {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button
            onClick={handleLogout}
            className="text-[#8E8E93] hover:text-red-500 transition-colors p-2 cursor-pointer"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* One visible notification banner per server effect */}
      <AnimatePresence>
        {notificationToast && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-4 mt-3 rounded-[21px] border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center"
          >
            <p className="text-xs font-semibold text-emerald-800">
              {notificationToast.kind === 'orderReady' ? 'Món đã sẵn sàng' : 'Đơn mới'} • Bàn {notificationToast.tableName}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'kitchen' && (
          <KitchenView
            tenantConfig={tenantConfig}
            setMenuItems={() => {}}
            onboardCompleted={true}
            setOnboardCompleted={() => {}}
            tables={tables}
            embedded
            tenantId={tenantId}
          />
        )}

        {activeTab === 'inventory' && <InventoryPanel embedded />}

        {activeTab === 'order' && (
          <StaffOrderEntry
            tenantId={tenantId}
            tenantConfig={tenantConfig}
            tables={tables}
          />
        )}

        {activeTab === 'waiter' && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-emerald-600" />
                Món cần phục vụ
                {readyOrders.length > 0 && (
                  <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full">{readyOrders.length}</span>
                )}
              </h3>
            </div>

            {serveError && (
              <p role="alert" className="text-red-500 text-xs text-center">{serveError}</p>
            )}

            {readyOrders.length === 0 && servedOrders.length === 0 && (
              <p className="text-[#8E8E93] text-xs text-center py-8">Chưa có đơn hàng nào.</p>
            )}

            {readyOrders.map(order => (
              <div key={order.id} className="bg-[#F5F5F7] border border-emerald-200 p-4 rounded-[21px] shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-[12px]">{order.orderType === 'takeaway' ? 'Mang về' : `Bàn ${getTableName(order)}`}</span>
                  <span className="text-[10px] text-[#8E8E93]">#{order.id.slice(-6)}</span>
                </div>
                <div className="text-[11px] text-[#707070] space-y-1 mb-3">
                  {order.items.map(item => (
                    <div key={item.menuId} className="flex justify-between">
                      <span>{item.quantity}x {item.name}</span>
                      <span className="tabular-nums">{item.price.toLocaleString()}đ</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => handleServeOrder(order.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] py-2.5 rounded-[21px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  Đã phục vụ
                </button>
              </div>
            ))}

            {servedOrders.length > 0 && (
              <>
                <div className="text-[11px] font-bold text-[#8E8E93] uppercase tracking-wider pt-2">Đã phục vụ</div>
                {servedOrders.map(order => (
                  <div key={order.id} className="bg-white border border-[#B5C7D8] p-3 rounded-[21px] opacity-60">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[11px]">{order.orderType === 'takeaway' ? 'Mang về' : `Bàn ${getTableName(order)}`}</span>
                      <span className="text-[10px] text-green-600">✓ Hoàn tất</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'cashier' && (
          <CashierView
            tenantConfig={tenantConfig}
            tables={tables}
            loyaltyMembers={[]}
            tenantId={tenantId}
            embedded
          />
        )}
      </div>

      {/* Tab bar */}
      {showTabBar && (
        <div className="flex border-t border-[#B5C7D8]/20 bg-white">
          {availableTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center py-2 text-[10px] font-semibold transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? 'text-[#155BD0]'
                  : 'text-[#8E8E93]'
              }`}
            >
              {tab.icon}
              <span className="mt-0.5">{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
