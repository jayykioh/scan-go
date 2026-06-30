import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TenantConfig, Order, MenuItem, TableConfig } from '../types';
import { 
  Flame, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  X, 
  UtensilsCrossed
} from 'lucide-react';

interface KitchenProps {
  tenantConfig: TenantConfig;
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  onboardCompleted: boolean;
  setOnboardCompleted: (val: boolean) => void;
  tables?: TableConfig[];
  embedded?: boolean;
}

export default function KitchenView({
  tenantConfig,
  orders,
  setOrders,
  menuItems,
  setMenuItems,
  onboardCompleted,
  setOnboardCompleted,
  tables = [],
  embedded = false,
}: KitchenProps) {
  const [activeShift, setActiveShift] = useState(false);
  const [activePin, setActivePin] = useState('');

  const handleKitchenSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveShift(true);
    setOnboardCompleted(true);
  };

  const handleUpdateStatus = (id: string, nextStatus: 'cooking' | 'ready') => {
    setOrders(prev => prev.map(order => {
      if (order.id === id) {
        return {
          ...order,
          status: nextStatus
        };
      }
      return order;
    }));
  };

  const handleKitchenDisableStock = (id: string) => {
    setMenuItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, inStock: !item.inStock };
      }
      return item;
    }));
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
            Nhập mã PIN cá nhân của đầu bếp đầu ca để tự động đồng bộ vé gọi món.
          </p>
        </div>

        <form onSubmit={handleKitchenSignIn} className="space-y-3 text-center my-6">
          <input 
            type="password" 
            value={activePin}
            onChange={(e) => setActivePin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            maxLength={4}
            className="w-32 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-center tracking-[0.4em] font-mono text-xl py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold"
          />
          <p className="text-[10px] text-[#8E8E93] font-medium">Nhập số bất kỳ để bắt đầu</p>
        </form>

        <motion.button 
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleKitchenSignIn}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-3.5 rounded-2xl font-semibold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
        >
          Nhận ca chế biến
        </motion.button>
      </motion.div>
    );
  }

  const kitchenQueue = orders.filter(o => o.status === 'pending' || o.status === 'cooking');

  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="kitchen-main">
      {/* Header Info */}
      <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/60 flex justify-between items-center select-none">
        <div className="flex items-center gap-[4px]">
          <span className="w-2.5 h-2.5 rounded-full bg-[#155BD0] animate-pulse"></span>
          <span className="text-[12px] font-bold text-[#2D2B30] uppercase tracking-wider">Trạm KDS Nhà Bếp</span>
        </div>
        <span className="text-[11px] bg-[#155BD0] text-white font-semibold rounded-[21px] px-2.5 py-0.5 tabular-nums">
          {kitchenQueue.length} Đơn Đang Chờ
        </span>
      </div>

      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        <div className="flex justify-between items-center text-[10px] font-bold text-[#808080] uppercase tracking-wider select-none">
          <span>Hàng Đợi Chế biến Realtime</span>
          <span className="text-[10px] text-[#155BD0] font-mono lowercase">máy chủ scan-go</span>
        </div>

        {kitchenQueue.length === 0 ? (
          <div className="bg-[#F5F5F7]/40 p-[34px] rounded-[21px] border border-[#B5C7D8] text-center space-y-[4px] select-none shadow-sm">
            <span className="text-2xl">👨‍🍳</span>
            <div className="text-[14px] font-bold text-[#2D2B30]">Bếp đã khép các Ticket!</div>
            <p className="text-[12px] text-[#808080] leading-relaxed text-pretty">
              Hoàn thành tốt nhiệm vụ. Chờ khách đặt thêm bún phở hoặc cafe qua dán góc bàn.
            </p>
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
                      ? 'border-[#155BD0] bg-white' 
                      : 'border-[#B5C7D8] bg-[#F5F5F7]/30'
                  }`}
                >
                  {/* Card head banner */}
                  <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/50 flex justify-between items-center select-none text-[#2D2B30]">
                    <span className="text-[12px] font-bold text-[#2D2B30] flex items-center gap-[4px] uppercase select-none">
                      <UtensilsCrossed className="w-4 h-4 text-[#155BD0]" />
                      {tableName}
                    </span>
                    <span className="text-[10px] text-[#808080] font-mono tracking-wider font-semibold uppercase tabular-nums">
                      TICKET #{index + 1} • {isCooking ? '🍳 ĐANG NẤU' : '⏳ CHỜ NẤU'}
                    </span>
                  </div>

                  {/* Dish items lists */}
                  <div className="p-[13px] space-y-[13px] text-[#2D2B30]">
                    <div className="space-y-[4px]">
                      {order.items.map(item => (
                        <div key={item.id} className="flex justify-between items-start text-[12px] border-b border-[#B5C7D8]/20 pb-2.5 last:border-b-0">
                          <div className="text-[#2D2B30] space-y-[2px]">
                            <p className="font-semibold text-[#2D2B30]">
                              {item.name} <span className="text-[#155BD0] font-bold font-mono ml-1 tabular-nums">x{item.quantity}</span>
                            </p>
                            
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <div className="flex flex-wrap gap-[4px] mt-1">
                                {item.selectedModifiers.map(mod => (
                                  <span key={mod} className="text-[10px] bg-white border border-[#B5C7D8] text-[#454547] rounded-[21px] px-2 py-0.2">
                                    • {mod}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-[4px] pt-[13px] border-t border-[#B5C7D8]/40">
                      {!isCooking ? (
                        <button 
                          type="button"
                          onClick={() => handleUpdateStatus(order.id, 'cooking')}
                          className="flex-1 bg-[#155BD0] hover:bg-[#155BD0]/90 text-white font-semibold text-[11px] py-2 rounded-[21px] uppercase tracking-wide cursor-pointer focus:outline-2 focus:outline-[#155BD0]"
                        >
                          🍳 Đứng nấu món
                        </button>
                      ) : (
                        <button 
                          type="button"
                          onClick={() => handleUpdateStatus(order.id, 'ready')}
                          className="flex-1 bg-[#2D2B30] hover:bg-[#155BD0] text-white font-semibold text-[11px] py-2 rounded-[21px] uppercase tracking-wide cursor-pointer focus:outline-2 focus:outline-[#155BD0]"
                        >
                          ✓ Chín / Gọi phục vụ
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Quick Stock toggle list for Chefs */}
        <div className="bg-white border border-[#B5C7D8] p-[13px] rounded-[21px] shadow-sm text-[#2D2B30] space-y-[13px]">
          <div className="text-[12px] font-bold text-[#2D2B30] uppercase tracking-wider flex items-center gap-[4px] select-none">
            <AlertCircle className="w-4 h-4 text-[#155BD0]" />
            Khóa món ăn hết hàng
          </div>
          
          <div className="space-y-[4px]">
            {menuItems.map(item => (
              <div key={item.id} className="flex justify-between items-center bg-[#F5F5F7] p-2.5 rounded-[21px] border border-[#B5C7D8] text-[12px] hover:bg-[#E5E5EA] transition-colors">
                <div className="text-[#2D2B30] truncate max-w-[170px] font-medium">{item.name}</div>
                <button 
                  type="button"
                  onClick={() => handleKitchenDisableStock(item.id)}
                  className={`px-3 py-1 rounded-[21px] text-[10px] font-bold cursor-pointer transition-colors focus:outline-2 focus:outline-[#155BD0] ${
                    item.inStock 
                      ? 'bg-white text-[#2D2B30] border border-[#B5C7D8] hover:bg-[#155BD0] hover:text-white' 
                      : 'bg-red-50 text-red-650 border border-red-200'
                  }`}
                >
                  {item.inStock ? 'HẾT MÓN (BÁO)' : 'CÒN MÓN (MỞ)'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
