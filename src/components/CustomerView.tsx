import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, ChevronLeft, Clock, Gift, Minus, Plus, Search, ShoppingBag, Sparkles, Ticket, X } from 'lucide-react';
import { INDUSTRY_TEMPLATES } from '../mockData';
import { LoyaltyMember, MenuItem, Order, OrderItem, TableConfig, TenantConfig } from '../types';

interface CustomerProps {
  tenantConfig: TenantConfig;
  menuItems: MenuItem[];
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: React.Dispatch<React.SetStateAction<LoyaltyMember[]>>;
  simulationTableId: string;
  setSimulationTableId: (val: string) => void;
  tables: TableConfig[];
  directMenu?: boolean;
}

type CustomerStep = 'table_pick' | 'menu' | 'tracking';

const money = (value: number) => `${value.toLocaleString('vi-VN')}đ`;

const inferItemType = (item: MenuItem) => {
  if (item.type) return item.type;
  const drinkWords = ['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Trà sữa', 'Đá xay'];
  return drinkWords.some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn';
};

export default function CustomerView({
  tenantConfig,
  menuItems,
  orders,
  setOrders,
  loyaltyMembers,
  setLoyaltyMembers,
  simulationTableId,
  setSimulationTableId,
  tables,
  directMenu = false,
}: CustomerProps) {
  const [step, setStep] = useState<CustomerStep>(directMenu ? 'menu' : 'table_pick');
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [activeItem, setActiveItem] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [modifierPrice, setModifierPrice] = useState(0);
  const [selectedType, setSelectedType] = useState('Tất cả');
  const [query, setQuery] = useState('');
  const [showCart, setShowCart] = useState(false);
  const [showLoyalty, setShowLoyalty] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyMember | null>(null);
  const [redeemedPoints, setRedeemedPoints] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');

  const template = INDUSTRY_TEMPLATES[tenantConfig.industry] || INDUSTRY_TEMPLATES.quan_an;
  const tableName = tables.find(table => table.id === simulationTableId)?.name || `Bàn ${simulationTableId}`;
  const activeCustomerOrders = orders.filter(order => order.tableId === simulationTableId && order.status !== 'paid');
  const availableTypes = ['Tất cả', ...Array.from(new Set(menuItems.map(inferItemType)))];

  const filteredItems = menuItems.filter(item => {
    const matchesType = selectedType === 'Tất cả' || inferItemType(item) === selectedType;
    const matchesQuery = item.name.toLowerCase().includes(query.trim().toLowerCase());
    return matchesType && matchesQuery;
  });

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const isTargetSpecificDish = tenantConfig.discountTargetDishId && tenantConfig.discountTargetDishId !== 'all';
  const targetItemInCart = isTargetSpecificDish ? cart.find(item => item.menuId === tenantConfig.discountTargetDishId) : null;
  const qualifyingQuantity = isTargetSpecificDish ? targetItemInCart?.quantity || 0 : totalQuantity;
  const qualifyingAmount = isTargetSpecificDish ? (targetItemInCart?.price || 0) * (targetItemInCart?.quantity || 0) : cartTotal;

  const promoConditionMet = (() => {
    if (!tenantConfig.discountEnabled) return false;
    const minItems = tenantConfig.discountMinItems ?? 3;
    const minAmount = tenantConfig.discountMinAmount ?? 150000;
    if (tenantConfig.discountConditionType === 'amount') return qualifyingAmount >= minAmount;
    if (tenantConfig.discountConditionType === 'both') return qualifyingAmount >= minAmount && qualifyingQuantity >= minItems;
    return qualifyingQuantity >= minItems;
  })();

  const promoDiscount = promoConditionMet ? tenantConfig.discountAmount || 0 : 0;
  const loyaltyDiscount = redeemedPoints ? 20000 : 0;
  const finalTotal = Math.max(0, cartTotal - promoDiscount - loyaltyDiscount);

  const openItem = (item: MenuItem) => {
    if (!item.inStock) return;
    setActiveItem(item);
    setSelectedModifiers([]);
    setModifierPrice(0);
  };

  const toggleModifier = (name: string, price: number) => {
    if (selectedModifiers.includes(name)) {
      setSelectedModifiers(prev => prev.filter(value => value !== name));
      setModifierPrice(prev => prev - price);
      return;
    }
    setSelectedModifiers(prev => [...prev, name]);
    setModifierPrice(prev => prev + price);
  };

  const addActiveItemToCart = () => {
    if (!activeItem) return;
    const modifiers = [...selectedModifiers].sort();
    const id = `${activeItem.id}-${modifiers.join('|')}`;
    const price = activeItem.price + modifierPrice;
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id, menuId: activeItem.id, name: activeItem.name, price, quantity: 1, selectedModifiers: modifiers }];
    });
    setActiveItem(null);
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, quantity: item.quantity + delta } : item)
      .filter(item => item.quantity > 0));
  };

  const saveLoyaltyProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length < 9) return;
    const existing = loyaltyMembers.find(member => member.phone === phoneNumber.trim());
    if (existing) {
      setLoyaltyProfile(existing);
    } else {
      const created: LoyaltyMember = {
        phone: phoneNumber.trim(),
        name: customerName.trim() || 'Khách mới',
        points: 15,
        totalSpent: 0,
        visits: 1,
        isVerified: false,
      };
      setLoyaltyProfile(created);
      setLoyaltyMembers(prev => [...prev, created]);
    }
    setShowLoyalty(false);
  };

  const redeemWithOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loyaltyProfile) return;
    if (loyaltyProfile.points < 30) {
      setOtpError('Bạn cần 30 điểm để đổi ưu đãi.');
      return;
    }
    if (otpCode.length < 4) {
      setOtpError('Nhập OTP 4 số.');
      return;
    }
    const updated = { ...loyaltyProfile, points: Math.max(0, loyaltyProfile.points - 30), isVerified: true };
    setLoyaltyProfile(updated);
    setLoyaltyMembers(prev => prev.map(member => member.phone === updated.phone ? updated : member));
    setRedeemedPoints(true);
    setOtpError('');
  };

  const submitOrder = () => {
    if (cart.length === 0) return;
    const order: Order = {
      id: `ord_${Date.now()}`,
      tableId: simulationTableId,
      items: cart,
      total: finalTotal,
      status: 'pending',
      timestamp: new Date(),
      customerPhone: loyaltyProfile?.phone || phoneNumber || undefined,
      isLoyaltyApplied: redeemedPoints,
      paymentMode: tenantConfig.paymentMode,
      appliedDiscountCode: promoConditionMet ? tenantConfig.discountCode : undefined,
    };
    setOrders(prev => [...prev, order]);
    setCart([]);
    setShowCart(false);
    setStep('tracking');
  };

  if (step === 'table_pick') {
    return (
      <div className="h-full bg-[#f7f7f8] text-zinc-950 flex flex-col p-5">
        <div className="pt-8 pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-emerald-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> ScanGo ready
          </div>
          <h1 className="mt-5 text-[34px] leading-[0.95] font-black tracking-[-0.05em]">Chọn bàn để mở menu.</h1>
          <p className="mt-3 text-sm text-zinc-500">Mô phỏng QR/NFC. Link public sẽ mở thẳng menu theo bàn.</p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          {tables.map(table => (
            <button
              key={table.id}
              type="button"
              onClick={() => { setSimulationTableId(table.id); setStep('menu'); }}
              className="w-full rounded-[24px] bg-white p-4 text-left shadow-sm border border-zinc-100 flex items-center justify-between active:scale-[0.99] transition-transform"
            >
              <span className="font-bold text-zinc-950">{table.name}</span>
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-[11px] font-bold text-white">Mở menu</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#f7f7f8] text-zinc-950 flex flex-col overflow-hidden">
      <div className="relative flex-1 overflow-y-auto pb-28">
        {step === 'tracking' ? (
          <TrackingScreen orders={activeCustomerOrders} tableName={tableName} onBack={() => setStep('menu')} />
        ) : (
          <>
            <section className="sticky top-0 z-20 bg-[#f7f7f8]/90 backdrop-blur-xl px-4 pt-4 pb-3 border-b border-white/70">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.16em] truncate">{tableName}</p>
                  <h1 className="text-[22px] font-black tracking-[-0.04em] truncate">{tenantConfig.shopName}</h1>
                </div>
                <button type="button" onClick={() => setShowLoyalty(true)} className="shrink-0 rounded-full bg-white px-3 py-2 text-[11px] font-bold text-zinc-800 shadow-sm border border-zinc-100">
                  {loyaltyProfile ? `${loyaltyProfile.points} điểm` : 'Hội viên'}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-zinc-100">
                <Search className="h-4 w-4 text-zinc-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm món, đồ uống..." className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-zinc-400" />
              </div>
            </section>

            <section className="px-4 pt-4 space-y-4">
              <div className="rounded-[30px] bg-zinc-950 text-white p-5 overflow-hidden relative shadow-xl">
                <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-orange-500/40 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-orange-200 uppercase tracking-[0.18em]">Menu hôm nay</p>
                    <h2 className="mt-1 text-[27px] leading-none font-black tracking-[-0.05em]">Gọi món nhanh, bếp nhận ngay.</h2>
                  </div>
                  <Sparkles className="h-6 w-6 text-orange-300 shrink-0" />
                </div>
                <div className="relative mt-4 flex gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-white/12 px-3 py-1">{filteredItems.length} món</span>
                  <span className="rounded-full bg-white/12 px-3 py-1">{tenantConfig.paymentMode === 'Pay-First' ? 'Trả trước' : 'Trả sau'}</span>
                </div>
              </div>

              {tenantConfig.discountEnabled && (
                <div className="rounded-[24px] bg-white p-4 shadow-sm border border-zinc-100 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-100 flex items-center justify-center"><Ticket className="h-5 w-5 text-orange-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-zinc-950">Ưu đãi {tenantConfig.discountCode}</p>
                    <p className="text-xs text-zinc-500 truncate">Giảm {money(tenantConfig.discountAmount || 0)} khi đủ điều kiện</p>
                  </div>
                  {promoConditionMet && <Check className="h-5 w-5 text-emerald-600" />}
                </div>
              )}

              {tenantConfig.loyaltyEnabled && (
                <div className="rounded-[24px] bg-white p-4 shadow-sm border border-zinc-100 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                      <Gift className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-zinc-950">Khách hàng thân thiết</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {loyaltyProfile ? `${loyaltyProfile.points} điểm tích lũy` : 'Đăng nhập để nhận ưu đãi'}
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowLoyalty(true)}
                      className="shrink-0 rounded-full bg-zinc-950 text-white px-3 py-1.5 text-[11px] font-bold"
                    >
                      {loyaltyProfile ? 'Đổi quà' : 'Đăng nhập'}
                    </button>
                  </div>
                  {loyaltyProfile && (
                    <div className="pt-2 border-t border-zinc-100">
                      <div className="flex justify-between text-[11px] font-bold text-zinc-500 mb-1.5">
                        <span>Hạng Bạc</span>
                        <span>{loyaltyProfile.points}/30 điểm để nhận 20k</span>
                      </div>
                      <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (loyaltyProfile.points / 30) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
                {availableTypes.map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setSelectedType(type)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors ${selectedType === type ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-600 border border-zinc-100'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div className={template.menu_layout === 'grid_bien_the' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                {filteredItems.map(item => (
                  <MenuCard key={item.id} item={item} compact={template.menu_layout === 'grid_bien_the'} onOpen={() => openItem(item)} />
                ))}
              </div>

              {filteredItems.length === 0 && (
                <div className="rounded-[28px] bg-white p-8 text-center border border-zinc-100">
                  <p className="font-black text-zinc-900">Chưa có món phù hợp</p>
                  <p className="mt-1 text-sm text-zinc-500">Thử đổi bộ lọc hoặc tìm từ khóa khác.</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {activeCustomerOrders.length > 0 && step === 'menu' && (
        <button type="button" onClick={() => setStep('tracking')} className="absolute bottom-24 left-4 right-4 z-30 rounded-full bg-white/95 px-4 py-3 text-sm font-black text-zinc-950 shadow-lg border border-zinc-100 flex items-center justify-between backdrop-blur">
          <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-600" /> Theo dõi đơn</span>
          <span className="text-zinc-400">{activeCustomerOrders.length}</span>
        </button>
      )}

      {cart.length > 0 && step === 'menu' && (
        <button type="button" onClick={() => setShowCart(true)} className="absolute bottom-4 left-4 right-4 z-40 rounded-[24px] bg-zinc-950 px-4 py-3.5 text-white shadow-2xl flex items-center justify-between active:scale-[0.99] transition-transform">
          <span className="flex items-center gap-3 font-black"><ShoppingBag className="h-5 w-5" /> {totalQuantity} món</span>
          <span className="font-black">{money(finalTotal)}</span>
        </button>
      )}

      <AnimatePresence>
        {activeItem && (
          <ItemSheet item={activeItem} template={template} selectedModifiers={selectedModifiers} modifierPrice={modifierPrice} onToggleModifier={toggleModifier} onClose={() => setActiveItem(null)} onAdd={addActiveItemToCart} />
        )}
        {showCart && (
          <CartSheet cart={cart} cartTotal={cartTotal} finalTotal={finalTotal} promoDiscount={promoDiscount} loyaltyDiscount={loyaltyDiscount} paymentMode={tenantConfig.paymentMode} onQty={updateCartQty} onClose={() => setShowCart(false)} onSubmit={submitOrder} />
        )}
        {showLoyalty && (
          <LoyaltySheet profile={loyaltyProfile} phone={phoneNumber} name={customerName} otp={otpCode} otpError={otpError} redeemed={redeemedPoints} onPhone={setPhoneNumber} onName={setCustomerName} onOtp={(value: string) => { setOtpCode(value.replace(/\D/g, '')); setOtpError(''); }} onSave={saveLoyaltyProfile} onRedeem={redeemWithOtp} onClose={() => setShowLoyalty(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuCard({ item, compact, onOpen }: { item: MenuItem; compact: boolean; onOpen: () => void }) {
  if (compact) {
    return (
      <button type="button" onClick={onOpen} disabled={!item.inStock} className={`text-left rounded-[26px] bg-white p-2.5 shadow-sm border border-zinc-100 overflow-hidden ${!item.inStock ? 'opacity-45 grayscale' : 'active:scale-[0.99] transition-transform'}`}>
        <img src={item.image} alt={item.name} className="h-28 w-full rounded-[20px] object-cover" referrerPolicy="no-referrer" />
        <div className="mt-2 space-y-1">
          <p className="line-clamp-2 min-h-[34px] text-sm font-black leading-tight text-zinc-950">{item.name}</p>
          <div className="flex items-center justify-between">
            <span className="text-sm font-black">{money(item.price)}</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-white"><Plus className="h-4 w-4" /></span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <button type="button" onClick={onOpen} disabled={!item.inStock} className={`w-full rounded-[28px] bg-white p-3 text-left shadow-sm border border-zinc-100 flex gap-3 ${!item.inStock ? 'opacity-45 grayscale' : 'active:scale-[0.99] transition-transform'}`}>
      <img src={item.image} alt={item.name} className="h-24 w-24 rounded-[22px] object-cover shrink-0" referrerPolicy="no-referrer" />
      <div className="min-w-0 flex-1 py-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[15px] font-black leading-tight text-zinc-950">{item.name}</p>
            <p className="mt-1 line-clamp-1 text-xs font-medium text-zinc-500">{item.description}</p>
          </div>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-950 text-white shrink-0"><Plus className="h-4 w-4" /></span>
        </div>
        <p className="mt-3 text-base font-black">{money(item.price)}</p>
      </div>
    </button>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="flex-1" onClick={onClose} aria-label="Đóng" />
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} className="max-h-[88%] overflow-y-auto rounded-t-[34px] bg-white p-4 shadow-2xl">
        {children}
      </motion.div>
    </motion.div>
  );
}

function ItemSheet({ item, template, selectedModifiers, modifierPrice, onToggleModifier, onClose, onAdd }: any) {
  const groups = [...template.modifier_groups, ...(item.toppings?.length ? [{ name: 'Topping', required: false, options: item.toppings }] : [])];
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4">
        <div className="relative">
          <img src={item.image} alt={item.name} className="h-56 w-full rounded-[28px] object-cover" referrerPolicy="no-referrer" />
          <button type="button" onClick={onClose} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow"><X className="h-5 w-5" /></button>
        </div>
        <div>
          <p className="text-[26px] font-black leading-none tracking-[-0.04em] text-zinc-950">{item.name}</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.description}</p>
        </div>

        {groups.map((group: any) => (
          <div key={group.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-zinc-950">{group.name}</p>
              <span className="text-[11px] font-bold text-zinc-400">{group.required ? 'Bắt buộc' : 'Tùy chọn'}</span>
            </div>
            {group.options.map((option: any) => {
              const checked = selectedModifiers.includes(option.name);
              return (
                <button key={option.name} type="button" onClick={() => onToggleModifier(option.name, option.price)} className={`w-full rounded-[20px] px-4 py-3 flex items-center justify-between border ${checked ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-zinc-50 text-zinc-900 border-zinc-100'}`}>
                  <span className="text-sm font-bold">{option.name}</span>
                  <span className="text-sm font-black">{option.price ? `+${money(option.price)}` : 'Free'}</span>
                </button>
              );
            })}
          </div>
        ))}

        <button type="button" onClick={onAdd} className="sticky bottom-0 w-full rounded-[24px] bg-zinc-950 px-4 py-4 text-white font-black flex items-center justify-between shadow-xl">
          <span>Thêm vào giỏ</span>
          <span>{money(item.price + modifierPrice)}</span>
        </button>
      </div>
    </Sheet>
  );
}

function CartSheet({ cart, cartTotal, finalTotal, promoDiscount, loyaltyDiscount, paymentMode, onQty, onClose, onSubmit }: any) {
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-black tracking-[-0.05em]">Giỏ hàng</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2">
          {cart.map((item: OrderItem) => (
            <div key={item.id} className="rounded-[24px] bg-zinc-50 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-sm text-zinc-950 line-clamp-1">{item.name}</p>
                <p className="text-xs text-zinc-500 line-clamp-1">{item.selectedModifiers?.join(', ') || 'Mặc định'}</p>
                <p className="mt-1 text-sm font-black">{money(item.price)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onQty(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-zinc-200"><Minus className="h-4 w-4" /></button>
                <span className="w-5 text-center text-sm font-black">{item.quantity}</span>
                <button type="button" onClick={() => onQty(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white border border-zinc-200"><Plus className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-[26px] bg-zinc-950 text-white p-4 space-y-2">
          <div className="flex justify-between text-sm text-zinc-300"><span>Tạm tính</span><span>{money(cartTotal)}</span></div>
          {promoDiscount > 0 && <div className="flex justify-between text-sm text-emerald-300"><span>Ưu đãi</span><span>-{money(promoDiscount)}</span></div>}
          {loyaltyDiscount > 0 && <div className="flex justify-between text-sm text-emerald-300"><span>Đổi điểm</span><span>-{money(loyaltyDiscount)}</span></div>}
          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-black"><span>Tổng</span><span>{money(finalTotal)}</span></div>
        </div>
        <p className="flex items-start gap-2 text-xs text-zinc-500"><AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" /> {paymentMode === 'Pay-First' ? 'Thanh toán tại quầy để bếp nhận đơn.' : 'Bếp nhận đơn ngay, thanh toán sau bữa ăn.'}</p>
        <button type="button" onClick={onSubmit} className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black shadow-xl">Gửi đơn</button>
      </div>
    </Sheet>
  );
}

function LoyaltySheet({ profile, phone, name, otp, otpError, redeemed, onPhone, onName, onOtp, onSave, onRedeem, onClose }: any) {
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-black tracking-[-0.05em]">Hội viên</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"><X className="h-5 w-5" /></button>
        </div>
        {profile ? (
          <form onSubmit={onRedeem} className="space-y-4">
            <div className="rounded-[28px] bg-gradient-to-br from-zinc-950 to-zinc-800 p-5 text-white">
              <Gift className="h-6 w-6 text-orange-300" />
              <p className="mt-5 text-sm text-zinc-300">{profile.name}</p>
              <p className="text-[36px] font-black tracking-[-0.06em]">{profile.points} điểm</p>
            </div>
            <input value={otp} onChange={e => onOtp(e.target.value)} inputMode="numeric" maxLength={4} placeholder="OTP 8888" className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 text-center font-black tracking-[0.3em] outline-none border border-zinc-100" />
            {otpError && <p className="text-xs font-bold text-red-600">{otpError}</p>}
            <button type="submit" disabled={redeemed} className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black disabled:opacity-50">{redeemed ? 'Đã đổi ưu đãi' : 'Đổi 30 điểm giảm 20K'}</button>
          </form>
        ) : (
          <form onSubmit={onSave} className="space-y-3">
            <input value={phone} onChange={e => onPhone(e.target.value.replace(/\D/g, ''))} inputMode="tel" placeholder="Số điện thoại" className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 font-bold outline-none border border-zinc-100" />
            <input value={name} onChange={e => onName(e.target.value)} placeholder="Tên của bạn (tuỳ chọn)" className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 font-bold outline-none border border-zinc-100" />
            <button type="submit" className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black">Lưu hội viên</button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

function TrackingScreen({ orders, tableName, onBack }: { orders: Order[]; tableName: string; onBack: () => void }) {
  return (
    <div className="min-h-full p-4 space-y-4">
      <button type="button" onClick={onBack} className="mt-2 flex items-center gap-1 text-sm font-black text-zinc-500"><ChevronLeft className="h-4 w-4" /> Menu</button>
      <div className="rounded-[32px] bg-zinc-950 text-white p-5">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.16em]">{tableName}</p>
        <h1 className="mt-2 text-[31px] leading-none font-black tracking-[-0.06em]">Đơn của bạn</h1>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-[28px] bg-white p-8 text-center border border-zinc-100">
          <Check className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 font-black text-zinc-950">Bữa ăn đã hoàn tất</p>
          <p className="mt-1 text-sm text-zinc-500">Bạn có thể quay lại menu để gọi thêm.</p>
        </div>
      ) : orders.map(order => (
        <div key={order.id} className="rounded-[28px] bg-white p-4 shadow-sm border border-zinc-100 space-y-4">
          <div className="flex justify-between gap-3">
            <div>
              <p className="text-sm font-black">#{order.id.slice(-6).toUpperCase()}</p>
              <p className="text-xs text-zinc-500">{order.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}</p>
            </div>
            <span className="font-black">{money(order.total)}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-black">
            {[
              ['pending', 'Nhận'],
              ['cooking', 'Nấu'],
              ['ready', 'Xong'],
              ['served', 'Phục vụ'],
            ].map(([status, label], index) => {
              const activeIndex = ['pending', 'cooking', 'ready', 'served'].indexOf(order.status);
              const active = index <= Math.max(activeIndex, 0);
              return <div key={status} className={`rounded-full py-2 ${active ? 'bg-zinc-950 text-white' : 'bg-zinc-100 text-zinc-400'}`}>{label}</div>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
