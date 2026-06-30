import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StaffAccount, TenantConfig, TableConfig, Order, MenuItem, LoyaltyMember } from '../types';
import KitchenView from './KitchenView';
import CashierView from './CashierView';
import { ChefHat, Coffee, CreditCard, LogOut, CheckCircle, Bell } from 'lucide-react';

interface StaffViewProps {
  staffAccounts: StaffAccount[];
  currentStaff: StaffAccount | null;
  setCurrentStaff: React.Dispatch<React.SetStateAction<StaffAccount | null>>;
  setStaffAccounts: React.Dispatch<React.SetStateAction<StaffAccount[]>>;
  tenantConfig: TenantConfig;
  tables: TableConfig[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: React.Dispatch<React.SetStateAction<LoyaltyMember[]>>;
}

const TABS: { key: 'kitchen' | 'waiter' | 'cashier'; label: string; icon: React.ReactNode; roleKey: 'isKitchen' | 'isWaiter' | 'isCashier' }[] = [
  { key: 'kitchen', label: 'Bếp', icon: <ChefHat className="w-5 h-5" />, roleKey: 'isKitchen' },
  { key: 'waiter', label: 'Phục vụ', icon: <Bell className="w-5 h-5" />, roleKey: 'isWaiter' },
  { key: 'cashier', label: 'Thu ngân', icon: <CreditCard className="w-5 h-5" />, roleKey: 'isCashier' },
];

export default function StaffView({
  staffAccounts,
  currentStaff,
  setCurrentStaff,
  setStaffAccounts,
  tenantConfig,
  tables,
  orders,
  setOrders,
  menuItems,
  setMenuItems,
  loyaltyMembers,
  setLoyaltyMembers,
}: StaffViewProps) {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [activeTab, setActiveTab] = useState<'kitchen' | 'waiter' | 'cashier'>('kitchen');

  const readyOrders = useMemo(() => orders.filter(o => o.status === 'ready'), [orders]);
  const servedOrders = useMemo(() => orders.filter(o => o.status === 'served'), [orders]);

  const getTableName = (tableId: string) => tables.find(t => t.id === tableId)?.name || tableId;

  useEffect(() => {
    if (currentStaff) {
      const firstTab = TABS.filter(t => currentStaff.roles[t.roleKey])[0];
      if (firstTab) setActiveTab(firstTab.key);
    }
  }, [currentStaff]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const match = staffAccounts.find(a => a.pin === pinInput && a.isActive);
    if (match) {
      setCurrentStaff(match);
      setPinError('');

      const availableTabs = TABS.filter(t => match.roles[t.roleKey]);
      if (availableTabs.length > 0) setActiveTab(availableTabs[0].key);
    } else {
      setPinError('Mã PIN không hợp lệ!');
    }
  };

  const handleLogout = () => {
    setCurrentStaff(null);
    setPinInput('');
  };

  const handleServeOrder = (orderId: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'served' } : o));
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
              onChange={e => { setPinInput(e.target.value); setPinError(''); }}
              placeholder="Mã PIN"
              className="w-full text-center text-lg font-mono tracking-[8px] bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] p-3 text-[#2D2B30] placeholder:text-[#C7C7CC] placeholder:tracking-normal focus:outline-2 focus:outline-[#155BD0]"
              autoFocus
            />
            {pinError && <p className="text-red-500 text-xs text-center">{pinError}</p>}
            <button
              type="submit"
              className="w-full bg-[#155BD0] hover:bg-[#155BD0]/90 text-white font-semibold text-sm py-3 rounded-[21px] transition-colors cursor-pointer focus:outline-2 focus:outline-[#155BD0]"
            >
              Đăng nhập
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
        <button
          onClick={handleLogout}
          className="text-[#8E8E93] hover:text-red-500 transition-colors p-2 cursor-pointer"
          title="Đăng xuất"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'kitchen' && (
          <KitchenView
            tenantConfig={tenantConfig}
            orders={orders}
            setOrders={setOrders}
            menuItems={menuItems}
            setMenuItems={setMenuItems}
            onboardCompleted={true}
            setOnboardCompleted={() => {}}
            tables={tables}
            embedded
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

            {readyOrders.length === 0 && servedOrders.length === 0 && (
              <p className="text-[#8E8E93] text-xs text-center py-8">Chưa có đơn hàng nào.</p>
            )}

            {readyOrders.map(order => (
              <div key={order.id} className="bg-[#F5F5F7] border border-emerald-200 p-4 rounded-[21px] shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-[12px]">Bàn {getTableName(order.tableId)}</span>
                  <span className="text-[10px] text-[#8E8E93]">#{order.id.slice(-6)}</span>
                </div>
                <div className="text-[11px] text-[#707070] space-y-1 mb-3">
                  {order.items.map(item => (
                    <div key={item.menuItemId} className="flex justify-between">
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
                      <span className="font-semibold text-[11px]">Bàn {getTableName(order.tableId)}</span>
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
            orders={orders}
            setOrders={setOrders}
            loyaltyMembers={loyaltyMembers}
            setLoyaltyMembers={setLoyaltyMembers}
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
