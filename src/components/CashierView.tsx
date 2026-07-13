import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TenantConfig, TableConfig, Order, LoyaltyMember } from '../types';
import { 
  CreditCard, 
  Table, 
  CheckCircle, 
  Smile, 
  Trash2,
  DollarSign,
  AlertTriangle
} from 'lucide-react';

interface CashierProps {
  tenantConfig: TenantConfig;
  tables: TableConfig[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: React.Dispatch<React.SetStateAction<LoyaltyMember[]>>;
  embedded?: boolean;
}

export default function CashierView({
  tenantConfig,
  tables,
  orders,
  setOrders,
  loyaltyMembers,
  setLoyaltyMembers,
  embedded = false,
}: CashierProps) {
  const [cashierActiveShift, setCashierActiveShift] = useState(false);
  const [cashierPin, setCashierPin] = useState('');
  const [cashierPinError, setCashierPinError] = useState('');

  const handleCashierLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (cashierPin.length >= 4) {
      setCashierActiveShift(true);
      setCashierPinError('');
    } else {
      setCashierPinError('Vui lòng nhập mã PIN đủ 4 số!');
    }
  };

  const handleSettleOrder = (orderId: string) => {
    // Collect order phone to accumulate loyalty points
    const activeOrderObj = orders.find(o => o.id === orderId);
    
    if (activeOrderObj && activeOrderObj.customerPhone) {
      const spentAmount = activeOrderObj.total;
      const additionalPoints = Math.floor(spentAmount / 10000); // 1 point per 10k spendings
      
      setLoyaltyMembers(prev => prev.map(member => {
        if (member.phone === activeOrderObj.customerPhone) {
          return {
            ...member,
            points: member.points + additionalPoints,
            totalSpent: member.totalSpent + spentAmount,
            visits: member.visits + 1
          };
        }
        return member;
      }));
    }

    setOrders(prev => prev.map(o => {
      if (o.id === orderId) {
        return { ...o, status: 'paid' };
      }
      return o;
    }));
  };

  const handleCancelOrder = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
  };

  // Login Screen
  if (!embedded && !cashierActiveShift) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full" 
        id="cashier-login"
      >
        <div className="space-y-4 mt-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto shadow-sm">
            <CreditCard className="w-5 h-5 text-zinc-900" />
          </div>
          <h3 className="text-2xl font-bold text-[#2D2B30] text-center tracking-tight">Thu Ngân</h3>
          <p className="text-xs text-[#8E8E93] text-center max-w-[240px] mx-auto leading-relaxed">
            Vui lòng nhập mã PIN.
          </p>
        </div>

        <form onSubmit={handleCashierLogin} className="space-y-3 text-center my-6">
          <input 
            type="password" 
            value={cashierPin}
            onChange={(e) => {
              setCashierPin(e.target.value.replace(/\D/g, ''));
              setCashierPinError('');
            }}
            placeholder="••••"
            maxLength={4}
            className="w-32 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-center tracking-[0.4em] text-xl py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold"
          />
          {cashierPinError ? (
            <p className="text-xs text-red-650 font-medium">{cashierPinError}</p>
          ) : (
            <p className="text-xs text-[#8E8E93] font-medium">Nhập số bất kỳ để trải nghiệm thử</p>
          )}
        </form>

        <motion.button 
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleCashierLogin}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-3.5 rounded-2xl font-semibold text-xs shadow-sm transition-all cursor-pointer"
        >
          Đăng nhập
        </motion.button>
      </motion.div>
    );
  }

  // Active unsettled orders logic
  const activeUnpaidOrders = orders.filter(o => o.status !== 'paid');

  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="cashier-main">
      <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/60 flex justify-between items-center select-none">
        <div className="flex items-center gap-[4px]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-sm font-bold text-[#2D2B30] ">Thu Ngân</span>
        </div>
        <span className="text-sm bg-zinc-900 text-white font-semibold rounded-[21px] px-2.5 py-0.5 ">
          {activeUnpaidOrders.length} Đơn Nợ
        </span>
      </div>

      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        <div className="text-xs font-bold text-[#808080] select-none flex justify-between">
          <span>Hóa đơn</span>
          <span className="text-xs text-zinc-900 lowercase">sync</span>
        </div>

        {activeUnpaidOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center select-none">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-zinc-900">Tất cả đã thanh toán!</p>
            <p className="text-xs text-zinc-400 mt-1">Không có bàn nào nợ tiền</p>
          </div>
        ) : (
          <div className="space-y-[13px]">
            {activeUnpaidOrders.map((order) => {
              const tableName = tables.find(t => t.id === order.tableId)?.name || `Bàn ${order.tableId}`;
              const hasLoyaltyPhone = !!order.customerPhone;
              const loyaltyInfo = loyaltyMembers.find(m => m.phone === order.customerPhone);

              return (
                <div 
                  key={order.id} 
                  className="rounded-[21px] border border-[#B5C7D8] bg-white overflow-hidden shadow-xs hover:border-zinc-900 transition-colors"
                >
                  <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-100 flex justify-between items-center select-none">
                    <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-blue-500" />
                      {tableName}
                    </span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      order.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                      order.status === 'cooking' ? 'bg-amber-100 text-amber-700' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>
                      {order.status === 'ready' ? 'Sẵn sàng' : order.status === 'cooking' ? 'Đang nấu' : 'Chờ'}
                    </span>
                  </div>

                  <div className="p-[13px] space-y-[13px] text-[#2D2B30]">
                    {/* Item lines */}
                    <div className="space-y-1.5 border-b border-[#B5C7D8]/20 pb-2.5">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between text-sm text-[#454547]">
                          <span className="font-sans font-medium text-[#2D2B30]">
                            {item.name} <span className="text-[#808080] ml-1 font-semibold text-xs ">x{item.quantity}</span>
                          </span>
                          <span>{item.price.toLocaleString()}đ</span>
                        </div>
                      ))}
                    </div>

                    {/* Member loyalty banner */}
                    {hasLoyaltyPhone && (
                      <div className="bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8] flex items-center justify-between text-sm text-[#454547]">
                        <div className="flex items-center gap-[4px]">
                          <Smile className="w-3.5 h-3.5 text-zinc-900" />
                          <span className="font-semibold text-[#2D2B30]">
                            Hội viên: {loyaltyInfo?.name || 'Khách Vãng Lai'}
                          </span>
                        </div>
                        <span className="text-[#808080] text-xs ">+{Math.floor(order.total / 10000)}đ tích</span>
                      </div>
                    )}

                    {/* Payment row */}
                    <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
                      <div>
                        <span className="text-xs text-zinc-400 block font-bold">Tổng tiền</span>
                        <span className="text-xl font-bold text-zinc-900 ">
                          {order.total.toLocaleString()}đ
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <button 
                          type="button"
                          onClick={() => handleCancelOrder(order.id)}
                          className="p-2 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Hủy hóa đơn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <button 
                          type="button"
                          onClick={() => handleSettleOrder(order.id)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Thu tiền
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Loyalty details list for cashier verification */}
        <div className="bg-white border border-[#B5C7D8] p-[13px] rounded-[21px] shadow-sm text-[#2D2B30] space-y-[13px]">
          <div className="text-sm font-bold text-[#2D2B30] flex items-center gap-[4px] select-none">
            <CheckCircle className="w-4 h-4 text-zinc-900" />
            Hội viên trung thành hệ thống
          </div>
          
          <div className="space-y-[4px]">
            {loyaltyMembers.map(member => (
              <div key={member.phone} className="flex justify-between items-center bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] text-sm hover:bg-[#E5E5EA] transition-colors">
                <div className="space-y-[2px]">
                  <p className="font-semibold text-[#2D2B30]">{member.name}</p>
                  <p className="text-xs text-[#808080] ">SĐT: {member.phone}</p>
                </div>
                <div className="text-right space-y-[2px]">
                  <span className="text-xs bg-zinc-900/10 text-zinc-900 px-2 py-0.5 rounded-[21px] font-bold ">
                    {member.points} pt
                  </span>
                  <p className="text-[9px] text-[#808080] ">Ghé thăm: {member.visits} lần</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


