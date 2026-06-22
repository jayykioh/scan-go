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
}

export default function CashierView({
  tenantConfig,
  tables,
  orders,
  setOrders,
  loyaltyMembers,
  setLoyaltyMembers,
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
  if (!cashierActiveShift) {
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
            Nhập mã mật khẩu PIN cá nhân của ca trực để tiếp tục.
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
            className="w-32 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-center tracking-[0.4em] font-mono text-xl py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold"
          />
          {cashierPinError ? (
            <p className="text-[10px] text-red-650 font-medium">{cashierPinError}</p>
          ) : (
            <p className="text-[10px] text-[#8E8E93] font-medium">Nhập số bất kỳ để trải nghiệm thử</p>
          )}
        </form>

        <motion.button 
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleCashierLogin}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-3.5 rounded-2xl font-semibold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
        >
          Xác nhận đăng nhập
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
          <span className="w-2.5 h-2.5 rounded-full bg-[#155BD0] animate-pulse"></span>
          <span className="text-[12px] font-bold text-[#2D2B30] uppercase tracking-wider">Trạm Quầy Thu Ngân</span>
        </div>
        <span className="text-[11px] bg-[#155BD0] text-white font-semibold rounded-[21px] px-2.5 py-0.5 tabular-nums">
          {activeUnpaidOrders.length} Đơn Chưa Thanh Toán
        </span>
      </div>

      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        <div className="text-[10px] font-bold text-[#808080] uppercase tracking-wider select-none flex justify-between">
          <span>Hóa đơn theo bàn ăn đang trực</span>
          <span className="text-[10px] text-[#155BD0] font-mono lowercase">auto-sync</span>
        </div>

        {activeUnpaidOrders.length === 0 ? (
          <div className="bg-[#F5F5F7]/40 p-[34px] rounded-[21px] border border-[#B5C7D8] text-center space-y-[4px] shadow-sm select-none">
            <span className="text-2xl">💵</span>
            <div className="text-[14px] font-bold text-[#2D2B30]">Doanh thu đã thu hoàn tất!</div>
            <p className="text-[12px] text-[#808080] leading-relaxed text-pretty">
              Không có bàn nào nợ tiền hoặc đang mở đặt món phát sinh.
            </p>
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
                  className="rounded-[21px] border border-[#B5C7D8] bg-white overflow-hidden shadow-xs hover:border-[#155BD0] transition-colors"
                >
                  <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/45 flex justify-between items-center text-[#2D2B30] select-none">
                    <span className="text-[12px] font-bold text-[#2D2B30] flex items-center gap-[4px] uppercase">
                      <Table className="w-4 h-4 text-[#155BD0]" />
                      {tableName}
                    </span>
                    <span className="text-[10px] text-[#808080] font-mono tracking-wider font-semibold uppercase tabular-nums">
                      #{order.id.slice(-6)} • {order.status === 'ready' ? '🍽️ HOÀN THÀNH MÓN' : '⏳ CHỜ CHẾ BIẾN'}
                    </span>
                  </div>

                  <div className="p-[13px] space-y-[13px] text-[#2D2B30]">
                    {/* Item lines */}
                    <div className="space-y-1.5 border-b border-[#B5C7D8]/20 pb-2.5">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between text-[12px] font-mono tabular-nums text-[#454547]">
                          <span className="font-sans font-medium text-[#2D2B30]">
                            {item.name} <span className="text-[#808080] ml-1 font-semibold text-[10px]">x{item.quantity}</span>
                          </span>
                          <span>{item.price.toLocaleString()}đ</span>
                        </div>
                      ))}
                    </div>

                    {/* Member loyalty banner */}
                    {hasLoyaltyPhone && (
                      <div className="bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8] flex items-center justify-between text-[11px] text-[#454547]">
                        <div className="flex items-center gap-[4px]">
                          <Smile className="w-3.5 h-3.5 text-[#155BD0]" />
                          <span className="font-semibold text-[#2D2B30]">
                            Hội viên: {loyaltyInfo?.name || 'Khách Vãng Lai'}
                          </span>
                        </div>
                        <span className="font-mono text-[#808080] text-[10px] tabular-nums">+{Math.floor(order.total / 10000)}đ tích</span>
                      </div>
                    )}

                    {/* Footer values and buttons */}
                    <div className="flex justify-between items-center select-none text-[#2D2B30]">
                      <div className="space-y-[1px]">
                        <span className="text-[10px] text-[#808080] block uppercase tracking-wider font-bold">Thực Khách Trả</span>
                        <span className="text-[16px] font-bold text-[#155BD0] font-mono tabular-nums">
                          {order.total.toLocaleString()}đ
                        </span>
                      </div>

                      <div className="flex gap-[4px]">
                        <button 
                          type="button"
                          onClick={() => handleCancelOrder(order.id)}
                          className="bg-white border border-red-250 text-[#ef4444] hover:bg-red-50 p-2 rounded-[21px] transition-colors cursor-pointer focus:outline-2 focus:outline-offset-2 focus:outline-red-650"
                          title="Hủy hóa đơn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <button 
                          type="button"
                          onClick={() => handleSettleOrder(order.id)}
                          className="bg-[#155BD0] hover:bg-[#155BD0]/90 text-white font-semibold text-[11px] px-[13px] py-2 rounded-[21px] flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-2 focus:outline-[#155BD0]"
                        >
                          💸 Thu tiền mặt/QR
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
          <div className="text-[12px] font-bold text-[#2D2B30] uppercase tracking-wider flex items-center gap-[4px] select-none">
            <CheckCircle className="w-4 h-4 text-[#155BD0]" />
            Hội viên trung thành hệ thống
          </div>
          
          <div className="space-y-[4px]">
            {loyaltyMembers.map(member => (
              <div key={member.phone} className="flex justify-between items-center bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] text-[12px] hover:bg-[#E5E5EA] transition-colors">
                <div className="space-y-[2px]">
                  <p className="font-semibold text-[#2D2B30]">{member.name}</p>
                  <p className="text-[10px] text-[#808080] font-mono tabular-nums">SĐT: {member.phone}</p>
                </div>
                <div className="text-right space-y-[2px]">
                  <span className="text-[10px] bg-[#155BD0]/10 text-[#155BD0] px-2 py-0.5 rounded-[21px] font-bold tabular-nums">
                    {member.points} pt
                  </span>
                  <p className="text-[9px] text-[#808080] font-mono tabular-nums">Ghé thăm: {member.visits} lần</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
