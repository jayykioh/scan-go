import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, Check, ChevronLeft, Clock, Gift, Minus, Plus, Search, ShoppingBag, Sparkles, Ticket, X } from 'lucide-react';
import { INDUSTRY_TEMPLATES } from '../mockData';
import { LoyaltyMember, MenuItem, Order, OrderItem, TableConfig, TenantConfig } from '../types';
import type { PublicOrderTracking } from '@contracts/order.contract';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import { resolveInterfaceLocale, translate } from '../data/adapters/i18n.adapter';

interface CustomerProps {
  tenantConfig: TenantConfig;
  menuItems: MenuItem[];
  orders: Order[];
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: React.Dispatch<React.SetStateAction<LoyaltyMember[]>>;
  simulationTableId: string;
  setSimulationTableId: (val: string) => void;
  tables: TableConfig[];
  directMenu?: boolean;
  /**
   * Server submission path. Orders are created only through the Ordering
   * callable; there is no browser fallback (REQ-ORD-004, NFR-SEC-002). The
   * demo simulator passes no handler and the submit control stays disabled.
   */
  onSubmitOrder?: (cart: OrderItem[], paymentMode: 'Pay-First' | 'Pay-Later') => Promise<void>;
  /** Browser connection state. Defaults to online for the demo simulator. */
  isOnline?: boolean;
  /** Adapter error surfaced from the menu or tracking listener. */
  menuError?: string | null;
  /** Server public tracking projection for the submitted Order. */
  tracking?: PublicOrderTracking | null;
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
  loyaltyMembers,
  setLoyaltyMembers,
  simulationTableId,
  setSimulationTableId,
  tables,
  directMenu = false,
  onSubmitOrder,
  isOnline = true,
  menuError = null,
}: CustomerProps) {
  // The Customer surface opens in the saved or browser locale. Owner menu
  // content is never passed through `t` (REQ-I18N-001).
  const [locale] = useState(() => resolveInterfaceLocale());
  const t = (key: I18nMessageKey) => translate(locale, key);
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
  const [connectionProblem, setConnectionProblem] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const template = INDUSTRY_TEMPLATES[tenantConfig.industry] || INDUSTRY_TEMPLATES.quan_an;
  const tableName = tables.find(table => table.id === simulationTableId)?.name || `${t('customer.table.badge')} ${simulationTableId}`;
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
    const modifierKeys = [...selectedModifiers].sort();
    const modifiers = modifierKeys.map(key => activeItem.toppings?.find(option => option.optionId === key)?.name ?? key);
    const selectedOptionIds = modifierKeys.filter(key => activeItem.toppings?.some(option => option.optionId === key));
    const id = `${activeItem.id}-${modifierKeys.join('|')}`;
    const price = activeItem.price + modifierPrice;
    setCart(prev => {
      const existing = prev.find(item => item.id === id);
      if (existing) {
        return prev.map(item => item.id === id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { id, menuId: activeItem.id, name: activeItem.name, price, quantity: 1, selectedModifiers: modifiers, selectedOptionIds }];
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
        name: customerName.trim() || t('customer.loyalty.newMember'),
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
      setOtpError(t('customer.loyalty.pointsNeeded'));
      return;
    }
    if (otpCode.length < 4) {
      setOtpError(t('customer.loyalty.otpRequired'));
      return;
    }
    const updated = { ...loyaltyProfile, points: Math.max(0, loyaltyProfile.points - 30), isVerified: true };
    setLoyaltyProfile(updated);
    setLoyaltyMembers(prev => prev.map(member => member.phone === updated.phone ? updated : member));
    setRedeemedPoints(true);
    setOtpError('');
  };

  const submitOrder = async () => {
    if (cart.length === 0 || isSubmitting) return;

    // Offline block: no Order is created and the UI shows a problem (REQ-ORD-004).
    if (!isOnline) {
      setConnectionProblem(t('customer.offline.submitMessage'));
      return;
    }

    setConnectionProblem(null);
    setSubmitError(null);

    if (!onSubmitOrder) {
      // No server submission path is wired here. The browser never creates an
      // Order locally (docs/RULES_FIREBASE.md §1).
      setSubmitError(t('customer.submit.linkOnly'));
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmitOrder(cart, tenantConfig.paymentMode);
    } catch (error) {
      setSubmitError((error as Error)?.message || t('customer.submit.failed'));
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    setCart([]);
    setShowCart(false);
    setStep('tracking');
  };

  if (step === 'table_pick') {
    return (
      <div className="h-full bg-[#f7f7f8] text-zinc-950 flex flex-col p-5">
        <div className="pt-8 pb-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-emerald-700 shadow-sm">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> {t('customer.table.ready')}
          </div>
          <h1 className="mt-5 text-[34px] leading-[0.95] font-black tracking-[-0.05em]">{t('customer.table.pickTitle')}</h1>
          <p className="mt-3 text-sm text-zinc-500">{t('customer.table.pickHint')}</p>
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
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-[11px] font-bold text-white">{t('customer.table.openShort')}</span>
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
                  {loyaltyProfile ? `${loyaltyProfile.points} ${t('customer.loyalty.points')}` : t('customer.member.short')}
                </button>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-sm border border-zinc-100">
                <Search className="h-4 w-4 text-zinc-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('customer.search.placeholder')} className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-zinc-400" />
              </div>
            </section>

            <section className="px-4 pt-4 space-y-4">
              <div className="rounded-[30px] bg-zinc-950 text-white p-5 overflow-hidden relative shadow-xl">
                <div className="absolute -right-10 -top-12 h-32 w-32 rounded-full bg-orange-500/40 blur-2xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-bold text-orange-200 uppercase tracking-[0.18em]">{t('customer.menu.today')}</p>
                    <h2 className="mt-1 text-[27px] leading-none font-black tracking-[-0.05em]">{t('customer.menu.headlineToday')}</h2>
                  </div>
                  <Sparkles className="h-6 w-6 text-orange-300 shrink-0" />
                </div>
                <div className="relative mt-4 flex gap-2 text-[11px] font-bold">
                  <span className="rounded-full bg-white/12 px-3 py-1">{filteredItems.length} {t('customer.menu.itemCount')}</span>
                  <span className="rounded-full bg-white/12 px-3 py-1">{tenantConfig.paymentMode === 'Pay-First' ? t('customer.menu.payFirst') : t('customer.menu.payLater')}</span>
                </div>
              </div>

              {tenantConfig.discountEnabled && (
                <div className="rounded-[24px] bg-white p-4 shadow-sm border border-zinc-100 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl bg-orange-100 flex items-center justify-center"><Ticket className="h-5 w-5 text-orange-600" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-zinc-950">{t('customer.promo.codePrefix')} {tenantConfig.discountCode}</p>
                    <p className="text-xs text-zinc-500 truncate">{t('customer.promo.condition').replace('{amount}', money(tenantConfig.discountAmount || 0))}</p>
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
                      <p className="text-sm font-black text-zinc-950">{t('customer.loyalty.title')}</p>
                      <p className="text-xs text-zinc-500 truncate">
                        {loyaltyProfile ? `${loyaltyProfile.points} ${t('customer.loyalty.pointsAccumulated')}` : t('customer.loyalty.loginPromptShort')}
                      </p>
                    </div>
                    <button 
                      onClick={() => setShowLoyalty(true)}
                      className="shrink-0 rounded-full bg-zinc-950 text-white px-3 py-1.5 text-[11px] font-bold"
                    >
                      {loyaltyProfile ? t('customer.loyalty.redeemGift') : t('customer.loyalty.login')}
                    </button>
                  </div>
                  {loyaltyProfile && (
                    <div className="pt-2 border-t border-zinc-100">
                      <div className="flex justify-between text-[11px] font-bold text-zinc-500 mb-1.5">
                        <span>{t('customer.loyalty.silverTier')}</span>
                        <span>{t('customer.loyalty.progressHint').replace('{points}', String(loyaltyProfile.points))}</span>
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
                    {type === 'Tất cả' ? t('customer.filter.all') : type}
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
                  <p className="font-black text-zinc-900">{t('customer.empty.noMatchTitle')}</p>
                  <p className="mt-1 text-sm text-zinc-500">{t('customer.empty.noMatchHint')}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {connectionProblem && step === 'menu' && (
        <div role="alert" className="absolute bottom-40 left-4 right-4 z-50 rounded-[20px] bg-red-600 px-4 py-3 text-white shadow-xl flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-xs font-bold leading-relaxed">{connectionProblem}</p>
        </div>
      )}

      {menuError && step === 'menu' && !connectionProblem && (
        <div role="alert" className="absolute bottom-40 left-4 right-4 z-50 rounded-[20px] bg-amber-600 px-4 py-3 text-white shadow-xl flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-xs font-bold leading-relaxed">{menuError}</p>
        </div>
      )}

      {activeCustomerOrders.length > 0 && step === 'menu' && (
        <button type="button" onClick={() => setStep('tracking')} className="absolute bottom-24 left-4 right-4 z-30 rounded-full bg-white/95 px-4 py-3 text-sm font-black text-zinc-950 shadow-lg border border-zinc-100 flex items-center justify-between backdrop-blur">
          <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-emerald-600" /> {t('customer.tracking.button')}</span>
          <span className="text-zinc-400">{activeCustomerOrders.length}</span>
        </button>
      )}

      {cart.length > 0 && step === 'menu' && (
        <button type="button" onClick={() => setShowCart(true)} className="absolute bottom-4 left-4 right-4 z-40 rounded-[24px] bg-zinc-950 px-4 py-3.5 text-white shadow-2xl flex items-center justify-between active:scale-[0.99] transition-transform">
          <span className="flex items-center gap-3 font-black"><ShoppingBag className="h-5 w-5" /> {totalQuantity} {t('customer.menu.itemCount')}</span>
          <span className="font-black">{money(finalTotal)}</span>
        </button>
      )}

      <AnimatePresence>
        {activeItem && (
          <ItemSheet locale={locale} item={activeItem} template={template} useTemplateModifiers={!directMenu} selectedModifiers={selectedModifiers} modifierPrice={modifierPrice} onToggleModifier={toggleModifier} onClose={() => setActiveItem(null)} onAdd={addActiveItemToCart} />
        )}
        {showCart && (
          <CartSheet locale={locale} cart={cart} cartTotal={cartTotal} finalTotal={finalTotal} promoDiscount={promoDiscount} loyaltyDiscount={loyaltyDiscount} paymentMode={tenantConfig.paymentMode} onQty={updateCartQty} onClose={() => setShowCart(false)} onSubmit={submitOrder} isOnline={isOnline} isSubmitting={isSubmitting} errorMessage={connectionProblem || submitError} />
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
  const closeLabel = translate(resolveInterfaceLocale(), 'common.close');
  return (
    <motion.div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/35 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" className="flex-1" onClick={onClose} aria-label={closeLabel} />
      <motion.div initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} className="max-h-[88%] overflow-y-auto rounded-t-[34px] bg-white p-4 shadow-2xl">
        {children}
      </motion.div>
    </motion.div>
  );
}

function ItemSheet({ item, template, useTemplateModifiers = true, selectedModifiers, modifierPrice, onToggleModifier, onClose, onAdd, locale = 'vi' }: any) {
  const t = (key: I18nMessageKey) => translate(locale, key);
  const groups = [...(useTemplateModifiers ? template.modifier_groups : []), ...(item.toppings?.length ? [{ name: 'Topping', required: false, options: item.toppings }] : [])];
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
              <span className="text-[11px] font-bold text-zinc-400">{group.required ? t('customer.item.required') : t('customer.item.optional')}</span>
            </div>
            {group.options.map((option: any) => {
              const optionKey = option.optionId ?? option.name;
              const checked = selectedModifiers.includes(optionKey);
              return (
                <button key={optionKey} type="button" onClick={() => onToggleModifier(optionKey, option.price)} className={`w-full rounded-[20px] px-4 py-3 flex items-center justify-between border ${checked ? 'bg-zinc-950 text-white border-zinc-950' : 'bg-zinc-50 text-zinc-900 border-zinc-100'}`}>
                  <span className="text-sm font-bold">{option.name}</span>
                  <span className="text-sm font-black">{option.price ? `+${money(option.price)}` : t('customer.item.free')}</span>
                </button>
              );
            })}
          </div>
        ))}

        <button type="button" onClick={onAdd} className="sticky bottom-0 w-full rounded-[24px] bg-zinc-950 px-4 py-4 text-white font-black flex items-center justify-between shadow-xl">
          <span>{t('customer.item.addToCart')}</span>
          <span>{money(item.price + modifierPrice)}</span>
        </button>
      </div>
    </Sheet>
  );
}

function CartSheet({ cart, cartTotal, finalTotal, promoDiscount, loyaltyDiscount, paymentMode, onQty, onClose, onSubmit, isOnline = true, isSubmitting = false, errorMessage = null, locale = 'vi' }: any) {
  const t = (key: I18nMessageKey) => translate(locale, key);
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[28px] font-black tracking-[-0.05em]">{t('customer.cart.title')}</h2>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-2">
          {cart.map((item: OrderItem) => (
            <div key={item.id} className="rounded-[24px] bg-zinc-50 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-sm text-zinc-950 line-clamp-1">{item.name}</p>
                <p className="text-xs text-zinc-500 line-clamp-1">{item.selectedModifiers?.join(', ') || t('customer.cart.default')}</p>
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
          <div className="flex justify-between text-sm text-zinc-300"><span>{t('customer.cart.subtotal')}</span><span>{money(cartTotal)}</span></div>
          {promoDiscount > 0 && <div className="flex justify-between text-sm text-emerald-300"><span>{t('customer.cart.promo')}</span><span>-{money(promoDiscount)}</span></div>}
          {loyaltyDiscount > 0 && <div className="flex justify-between text-sm text-emerald-300"><span>{t('customer.cart.redeemPoints')}</span><span>-{money(loyaltyDiscount)}</span></div>}
          <div className="flex justify-between border-t border-white/10 pt-3 text-lg font-black"><span>{t('customer.cart.totalShort')}</span><span>{money(finalTotal)}</span></div>
        </div>
        <p className="flex items-start gap-2 text-xs text-zinc-500"><AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" /> {paymentMode === 'Pay-First' ? t('customer.cart.payFirstCounter') : t('customer.cart.payLaterAfterMeal')}</p>
        {errorMessage && (
          <p role="alert" className="rounded-[18px] bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{errorMessage}</p>
        )}
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black shadow-xl disabled:opacity-50">{isSubmitting ? t('customer.cart.submitting') : isOnline ? t('customer.cart.submit') : t('common.offline')}</button>
      </div>
    </Sheet>
  );
}

function LoyaltySheet({ profile, phone, name, otp, otpError, redeemed, onPhone, onName, onOtp, onSave, onRedeem, onClose }: any) {
  const t = (key: I18nMessageKey) => translate(resolveInterfaceLocale(), key);
  return (
    <Sheet onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-[28px] font-black tracking-[-0.05em]">{t('customer.member.short')}</h2>
            <span className="text-[9px] font-bold uppercase text-zinc-400">{t('customer.loyalty.sheet.demo')}</span>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100"><X className="h-5 w-5" /></button>
        </div>
        {profile ? (
          <form onSubmit={onRedeem} className="space-y-4">
            <div className="rounded-[28px] bg-gradient-to-br from-zinc-950 to-zinc-800 p-5 text-white">
              <Gift className="h-6 w-6 text-orange-300" />
              <p className="mt-5 text-sm text-zinc-300">{profile.name}</p>
              <p className="text-[36px] font-black tracking-[-0.06em]">{profile.points} {t('customer.loyalty.points')}</p>
            </div>
            <input value={otp} onChange={e => onOtp(e.target.value)} inputMode="numeric" maxLength={4} placeholder={t('customer.loyalty.sheet.otpPlaceholder')} className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 text-center font-black tracking-[0.3em] outline-none border border-zinc-100" />
            {otpError && <p className="text-xs font-bold text-red-600">{otpError}</p>}
            <button type="submit" disabled={redeemed} className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black disabled:opacity-50">{redeemed ? t('customer.loyalty.sheet.redeemedOffer') : t('customer.loyalty.sheet.redeemOffer')}</button>
          </form>
        ) : (
          <form onSubmit={onSave} className="space-y-3">
            <input value={phone} onChange={e => onPhone(e.target.value.replace(/\D/g, ''))} inputMode="tel" placeholder={t('customer.loyalty.sheet.phone')} className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 font-bold outline-none border border-zinc-100" />
            <input value={name} onChange={e => onName(e.target.value)} placeholder={t('customer.loyalty.sheet.namePlaceholder')} className="w-full rounded-[22px] bg-zinc-50 px-4 py-3 font-bold outline-none border border-zinc-100" />
            <button type="submit" className="w-full rounded-[24px] bg-zinc-950 py-4 text-white font-black">{t('customer.loyalty.sheet.saveMember')}</button>
          </form>
        )}
      </div>
    </Sheet>
  );
}

function TrackingScreen({ orders, tableName, onBack }: { orders: Order[]; tableName: string; onBack: () => void }) {
  const t = (key: I18nMessageKey) => translate(resolveInterfaceLocale(), key);
  return (
    <div className="min-h-full p-4 space-y-4">
      <button type="button" onClick={onBack} className="mt-2 flex items-center gap-1 text-sm font-black text-zinc-500"><ChevronLeft className="h-4 w-4" /> {t('customer.tracking.menu')}</button>
      <div className="rounded-[32px] bg-zinc-950 text-white p-5">
        <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.16em]">{tableName}</p>
        <h1 className="mt-2 text-[31px] leading-none font-black tracking-[-0.06em]">{t('customer.tracking.titleShort')}</h1>
      </div>
      {orders.length === 0 ? (
        <div className="rounded-[28px] bg-white p-8 text-center border border-zinc-100">
          <Check className="mx-auto h-10 w-10 text-emerald-600" />
          <p className="mt-3 font-black text-zinc-950">{t('customer.tracking.doneTitleShort')}</p>
          <p className="mt-1 text-sm text-zinc-500">{t('customer.tracking.doneHintShort')}</p>
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
              ['pending', t('customer.status.pendingShort')],
              ['cooking', t('customer.status.cookingShort')],
              ['ready', t('customer.status.readyShort')],
              ['served', t('customer.status.servedShort')],
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
