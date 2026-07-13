import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { TenantConfig, MenuItem, Order, OrderItem, LoyaltyMember, TableConfig } from '../types';
import { INDUSTRY_TEMPLATES } from '../mockData';
import { 
  ShoppingBag, 
  Nfc, 
  Plus, 
  Minus, 
  Smartphone, 
  Clock, 
  Check, 
  ChevronRight, 
  AlertCircle,
  X,
  Ticket,
  Gift
} from 'lucide-react';

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
}

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
}: CustomerProps) {
  // Navigation / screen states
  const [custStep, setCustStep] = useState<'nfc_tap' | 'phone_prompt' | 'menu' | 'cart_summary' | 'order_tracking'>('nfc_tap');
  
  // State for optional phone registration
  const [phoneNumber, setPhoneNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyMember | null>(null);

  // States for active cart
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [activeItemForModifier, setActiveItemForModifier] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [modifierPriceSum, setModifierPriceSum] = useState(0);

  // States for OTP loyalty redemption
  const [showOtpRequired, setShowOtpRequired] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpVerified, setOtpVerified] = useState(false);
  const [redeemedPoints, setRedeemedPoints] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Coupon manual entry states
  const [typedCoupon, setTypedCoupon] = useState('');
  const [manualCouponApplied, setManualCouponApplied] = useState(false);
  const [couponError, setCouponError] = useState('');

  // Food type filters
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('Tất cả');

  const template = INDUSTRY_TEMPLATES[tenantConfig.industry] || INDUSTRY_TEMPLATES.quan_an;

  // Dynamically extract unique food types
  const availableTypes = [
    'Tất cả', 
    ...Array.from(new Set(menuItems.map(item => item.type || (['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Cà phê truyền thống', 'Đá xay', 'Trà sữa', 'Cà phê hiện đại', 'Trà trái cây'].some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn')).filter((t): t is string => !!t)))
  ];

  const displayedMenuItems = menuItems.filter(item => {
    const itemType = item.type || (['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Cà phê truyền thống', 'Đá xay', 'Trà sữa', 'Cà phê hiện đại', 'Trà trái cây'].some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn');
    if (selectedTypeFilter === 'Tất cả') return true;
    return itemType === selectedTypeFilter;
  });

  const handleNfcScan = (table: string) => {
    setSimulationTableId(table);
    setCustStep('phone_prompt');
  };

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneNumber.trim().length >= 9) {
      const existing = loyaltyMembers.find(m => m.phone === phoneNumber.trim());
      if (existing) {
        setLoyaltyProfile(existing);
      } else {
        const newProf: LoyaltyMember = {
          phone: phoneNumber.trim(),
          name: customerName.trim() || 'Khách Mới',
          points: 15,
          totalSpent: 0,
          visits: 1,
          isVerified: false,
        };
        setLoyaltyProfile(newProf);
        setLoyaltyMembers(prev => [...prev, newProf]);
      }
    }
    setCustStep('menu');
  };

  const handleSkipPhonePrompt = () => {
    setCustStep('menu');
  };

  const openModifiersModal = (item: MenuItem) => {
    setActiveItemForModifier(item);
    setSelectedModifiers([]);
    setModifierPriceSum(0);
  };

  const handleToggleModifierOpt = (optName: string, optPrice: number) => {
    if (selectedModifiers.includes(optName)) {
      setSelectedModifiers(prev => prev.filter(x => x !== optName));
      setModifierPriceSum(prev => prev - optPrice);
    } else {
      setSelectedModifiers(prev => [...prev, optName]);
      setModifierPriceSum(prev => prev + optPrice);
    }
  };

  const handleAddWithModifiers = () => {
    if (!activeItemForModifier) return;
    
    const itemUniqueId = `${activeItemForModifier.id}-${selectedModifiers.sort().join(',')}`;
    const existingCartItemIndex = cart.findIndex(i => {
      const iUniqueId = `${i.menuId}-${(i.selectedModifiers || []).sort().join(',')}`;
      return iUniqueId === itemUniqueId;
    });

    const calculatedPrice = activeItemForModifier.price + modifierPriceSum;

    if (existingCartItemIndex > -1) {
      setCart(prev => prev.map((item, idx) => {
        if (idx === existingCartItemIndex) {
          return { ...item, quantity: item.quantity + 1 };
        }
        return item;
      }));
    } else {
      const cartItem: OrderItem = {
        id: itemUniqueId,
        menuId: activeItemForModifier.id,
        name: activeItemForModifier.name,
        price: calculatedPrice,
        quantity: 1,
        selectedModifiers: selectedModifiers,
      };
      setCart(prev => [...prev, cartItem]);
    }

    setActiveItemForModifier(null);
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const nextQty = item.quantity + delta;
        return nextQty > 0 ? { ...item, quantity: nextQty } : null;
      }
      return item;
    }).filter((x): x is OrderItem => x !== null));
  };

  const handleRequestRedemption = () => {
    if (!loyaltyProfile) return;
    if (loyaltyProfile.points < 30 && !redeemedPoints) {
      setOtpError('Bạn cần tối thiểu 30 điểm để đổi ưu đãi giảm giá 20.000đ.');
      return;
    }
    setOtpError('');
    setShowOtpRequired(true);
  };

  const handleVerifyOtpCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode === '8888' || otpCode === '1234' || otpCode.length >= 4) {
      setOtpVerified(true);
      setRedeemedPoints(true);
      setShowOtpRequired(false);
      
      if (loyaltyProfile) {
        const updated = {
          ...loyaltyProfile,
          points: Math.max(0, loyaltyProfile.points - 30),
          isVerified: true
        };
        setLoyaltyProfile(updated);
        setLoyaltyMembers(prev => prev.map(m => m.phone === updated.phone ? updated : m));
      }
    } else {
      setOtpError('Mã OTP không đúng (Nhập 8888)');
    }
  };

  const totalQuantity = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  
  const isTargetSpecificDish = tenantConfig.discountTargetDishId && tenantConfig.discountTargetDishId !== 'all';
  const targetItemInCart = isTargetSpecificDish
    ? cart.find(item => item.menuId === tenantConfig.discountTargetDishId)
    : null;

  const qualifyingQuantity = isTargetSpecificDish ? (targetItemInCart ? targetItemInCart.quantity : 0) : totalQuantity;
  const qualifyingAmount = isTargetSpecificDish ? (targetItemInCart ? (targetItemInCart.price * targetItemInCart.quantity) : 0) : cartTotal;

  let isConditionSatisfied = false;
  if (tenantConfig.discountEnabled) {
    const minItems = tenantConfig.discountMinItems ?? 3;
    const minAmount = tenantConfig.discountMinAmount ?? 150000;
    
    if (tenantConfig.discountConditionType === 'amount') {
      isConditionSatisfied = qualifyingAmount >= minAmount;
    } else if (tenantConfig.discountConditionType === 'both') {
      isConditionSatisfied = qualifyingAmount >= minAmount && qualifyingQuantity >= minItems;
    } else {
      isConditionSatisfied = qualifyingQuantity >= minItems;
    }
  }

  const isCodeMatched = tenantConfig.discountTriggerType === 'manual' ? manualCouponApplied : true;
  const isPromoEligible = tenantConfig.discountEnabled && isConditionSatisfied && isCodeMatched;
  
  const promoDiscountAmount = isPromoEligible ? (tenantConfig.discountAmount ?? 15000) : 0;
  const loyaltyDiscountAmount = redeemedPoints ? 20000 : 0;
  const finalDiscount = loyaltyDiscountAmount + promoDiscountAmount;
  const finalTotal = Math.max(0, cartTotal - finalDiscount);

  const handleSubmitOrderToSystem = () => {
    if (cart.length === 0) return;

    const newOrder: Order = {
      id: `ord_${Date.now()}`,
      tableId: simulationTableId || '2',
      items: cart,
      total: finalTotal,
      status: 'pending',
      timestamp: new Date(),
      customerPhone: phoneNumber || undefined,
      isLoyaltyApplied: redeemedPoints,
      paymentMode: tenantConfig.paymentMode,
    };

    setOrders(prev => [...prev, newOrder]);
    setCart([]);
    setCustStep('order_tracking');
  };

  const activeCustomerOrders = orders.filter(
    o => o.tableId === simulationTableId && o.status !== 'paid'
  );

  // STEP 1: NFC STICKER SIMULATION
  if (custStep === 'nfc_tap') {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full" 
        id="cust-nfc-tap"
      >
        <div className="text-center mt-12 space-y-4">
          <div className="relative w-16 h-16 rounded-3xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto mb-4 overflow-hidden shadow-sm">
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="absolute inset-0 bg-zinc-900/5 rounded-3xl"
            />
            <Nfc className="w-6 h-6 text-zinc-900 relative z-10" />
          </div>
          <h3 className="text-2xl font-bold text-zinc-900 tracking-tight">Chạm Bàn Đặt Món</h3>
          <p className="text-xs text-[#8E8E93] max-w-[240px] mx-auto leading-relaxed">
            Chọn bàn của bạn.
          </p>
        </div>

        <div className="space-y-2 my-6 max-h-[220px] overflow-y-auto pr-1">
          {tables.map((table) => (
            <button 
              key={table.id}
              onClick={() => handleNfcScan(table.id)}
              className="w-full bg-white hover:bg-zinc-50 border border-zinc-200 hover:border-zinc-900 text-zinc-900 py-3 px-4 rounded-2xl flex justify-between items-center transition-colors group text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-zinc-900">{table.name}</span>
                <span className="text-xs text-zinc-400">Chạm để chọn</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors" />
            </button>
          ))}
        </div>

        <p className="text-xs text-zinc-400 text-center py-2">ScanGo NFC Simulator</p>
      </motion.div>
    );
  }

  // STEP 2: PHONE PROMPT FOR LOYALTY
  if (custStep === 'phone_prompt') {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full" 
        id="cust-phone-prompt"
      >
        <div>
          <div className="flex justify-between items-center mb-10">
            <span className="text-xs font-bold text-[#8E8E93] ">Hội viên</span>
            <button 
              onClick={handleSkipPhonePrompt}
              className="text-xs text-zinc-900 font-semibold hover:underline cursor-pointer"
            >
              Bỏ qua →
            </button>
          </div>

          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto mb-2 shadow-sm">
              <Gift className="w-5 h-5 text-zinc-900" />
            </div>
            <h4 className="text-xl font-bold text-zinc-900 tracking-tight">Tích Điểm Tự Động</h4>
            <p className="text-xs text-[#8E8E93] max-w-[240px] mx-auto leading-relaxed">
              Nhập số điện thoại để tích điểm.
            </p>
          </div>
        </div>

        <form onSubmit={handlePhoneSubmit} className="space-y-3 my-4">
          <div className="space-y-1">
            <input 
              type="tel"
              required
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="Nhập số điện thoại"
              className="w-full bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl px-4 py-3 text-sm text-center text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold placeholder:font-normal placeholder:text-[#AEAEB2]"
            />
          </div>

          <div className="space-y-1">
            <input 
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Họ tên của bạn (tùy chọn)"
              className="w-full bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl px-4 py-3 text-sm text-center text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm placeholder:text-[#AEAEB2]"
            />
          </div>
        </form>

        <div className="space-y-2">
          <motion.button 
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handlePhoneSubmit}
            disabled={phoneNumber.length < 9}
            className="w-full bg-zinc-950 hover:bg-zinc-900 disabled:opacity-40 disabled:pointer-events-none text-white py-3.5 rounded-2xl font-bold text-xs shadow-sm transition-all cursor-pointer"
          >
            Đồng ý
          </motion.button>
          
          <button 
            type="button"
            onClick={handleSkipPhonePrompt}
            className="w-full text-[#8E8E93] hover:text-zinc-900 py-1 text-xs font-semibold cursor-pointer transition-colors"
          >
            Gọi món không tích điểm
          </button>
        </div>
      </motion.div>
    );
  }

  // STEP 3: CONTACTLESS MAIN MENU
  if (custStep === 'menu') {
    return (
      <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="cust-menu">
        <div className="px-[13px] py-[13px] border-b border-[#B5C7D8]/60 flex justify-between items-center bg-[#F5F5F7]/80">
          <div>
            <div className="flex items-center gap-[4px]">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-[16px] font-semibold text-[#2D2B30] ">BÀN {simulationTableId.padStart(2, '0')}</span>
            </div>
            <h4 className="text-sm text-[#707070] font-medium tracking-wide mt-0.5">{tenantConfig.shopName}</h4>
          </div>
          
          {activeCustomerOrders.length > 0 && (
            <button 
              onClick={() => setCustStep('order_tracking')}
              className="bg-white border border-[#B5C7D8] text-zinc-900 text-xs px-2.5 py-1 rounded-[21px] font-semibold flex items-center gap-1 cursor-pointer hover:bg-gray-50 focus:outline-2 focus:outline-zinc-900"
            >
              <Clock className="w-3 h-3 text-zinc-900" /> THEO DÕI ĐƠN
            </button>
          )}
        </div>

        <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
          {/* Loyalty membership status */}
          {loyaltyProfile && (
            <div className="bg-[#F5F5F7] border border-[#B5C7D8] p-[13px] rounded-[21px] flex items-center justify-between text-sm text-[#454547]">
              <div className="space-y-[2px]">
                <p className="font-semibold text-[#2D2B30]">Chào {loyaltyProfile.name}!</p>
                <p className="text-xs text-[#808080] ">{loyaltyProfile.phone} • {loyaltyProfile.points} điểm</p>
              </div>
              <span className="text-xs bg-zinc-900 text-white px-2 py-0.5 rounded-[21px] font-bold tracking-wide ">Hội viên</span>
            </div>
          )}

          {/* Automatic discount campaign block */}
          {tenantConfig.discountEnabled && (
            <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] space-y-[4px] relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-[#2D2B30] flex items-center gap-1">
                  <Ticket className="w-3.5 h-3.5 text-zinc-900" /> Ưu Đãi Tự Động
                </span>
                {isPromoEligible ? (
                  <span className="text-xs bg-zinc-900 text-white font-semibold px-2 py-0.5 rounded-[21px] ">Đạt Điều Kiện</span>
                ) : (
                  <span className="text-xs bg-gray-200 text-gray-800 font-semibold px-2 py-0.5 rounded-[21px] leading-none">MÃ: {tenantConfig.discountCode}</span>
                )}
              </div>
              
              <p className="text-sm text-[#454547] leading-relaxed text-pretty">
                Giảm <span className="font-semibold text-zinc-900 ">-{tenantConfig.discountAmount?.toLocaleString()}đ</span> khi giỏ hàng có trên <span className="font-semibold ">{tenantConfig.discountMinItems} món</span> hoặc tổng đơn trên <span className="font-semibold ">{tenantConfig.discountMinAmount?.toLocaleString()}đ</span>.
              </p>

              {isPromoEligible ? (
                <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-xl mt-1 font-medium flex justify-between items-center">
                  <span>Giảm {tenantConfig.discountAmount?.toLocaleString()}đ đã áp dụng!</span>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </div>
              ) : (
                <div className="text-sm text-zinc-500 bg-white border border-zinc-200 p-2 rounded-xl mt-1 flex justify-between items-center font-medium">
                  <span>Thêm món để đủ điều kiện</span>
                  <span className="bg-[#F5F5F7] px-2 py-0.5 rounded-[21px] text-[#2D2B30] border border-[#B5C7D8] text-xs ">{totalQuantity} / {tenantConfig.discountMinItems} món</span>
                </div>
              )}
            </div>
          )}

          {/* Filters row conforming to Apple minimal styles */}
          {availableTypes.length > 1 && (
            <div className="flex gap-[4px] overflow-x-auto pb-1 scrollbar-none select-none">
              {availableTypes.map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedTypeFilter(type)}
                  className={`px-3 py-1 text-sm font-semibold rounded-[21px] transition-all flex-shrink-0 cursor-pointer border ${
                    selectedTypeFilter === type
                      ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                      : 'bg-[#F5F5F7] text-[#454547] border-[#B5C7D8] hover:bg-[#E5E5EA]'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          )}

          <div className="text-sm font-bold text-[#2D2B30] border-b border-[#B5C7D8]/50 pb-1 flex justify-between select-none">
            <span>Danh mục Thực đơn</span>
            <span className="text-xs text-[#808080] ">{displayedMenuItems.length} món</span>
          </div>

          {/* List display based on industry layout parameters */}
          {template.menu_layout === 'list_don_gian' ? (
            <div className="space-y-[4px]">
              {displayedMenuItems.map(item => {
                const itemType = item.type || (['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Cà phê truyền thống', 'Đá xay', 'Trà sữa', 'Cà phê hiện đại', 'Trà trái cây'].some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn');
                return (
                  <div 
                    key={item.id} 
                    className={`p-[13px] rounded-[21px] border border-[#B5C7D8] bg-white flex justify-between items-start gap-[13px] transition-all ${
                      !item.inStock ? 'opacity-40 grayscale' : 'hover:border-zinc-900'
                    }`}
                  >
                    <img src={item.image} alt={item.name} className="w-[50px] h-[50px] rounded-[21px] object-cover flex-shrink-0 border border-[#B5C7D8]/50" referrerPolicy="no-referrer" />
                    <div className="flex-grow space-y-[2px]">
                      <div className="flex items-center gap-[4px] flex-wrap">
                        <h5 className="text-[14px] font-semibold text-[#2D2B30] line-clamp-1">{item.name}</h5>
                        <span className="text-xs bg-[#F5F5F7] text-[#2D2B30] border border-[#B5C7D8] px-1.5 py-0.2 rounded-[21px] font-semibold font-sans">{itemType}</span>
                      </div>
                      <p className="text-sm text-[#808080] line-clamp-2 leading-relaxed text-pretty">{item.description}</p>
                      <span className="text-[14px] font-bold text-zinc-900 mt-1 block ">
                        {item.price.toLocaleString()}đ
                      </span>
                    </div>
                    
                    {item.inStock ? (
                      <button 
                        onClick={() => openModifiersModal(item)}
                        className="bg-zinc-900 hover:bg-zinc-900/90 active:scale-95 text-white w-[32px] h-[32px] rounded-[21px] flex items-center justify-center self-end flex-shrink-0 transition-colors cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
                        aria-label="Thêm món"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    ) : (
                      <span className="text-xs bg-[#F5F5F7] text-[#808080] border border-[#B5C7D8] px-2 py-1 rounded-[21px] font-semibold self-end">HẾT MÓN</span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : template.menu_layout === 'grid_bien_the' ? (
            <div className="grid grid-cols-2 gap-[13px]">
              {displayedMenuItems.map(item => {
                const itemType = item.type || (['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Cà phê truyền thống', 'Đá xay', 'Trà sữa', 'Cà phê hiện đại', 'Trà trái cây'].some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn');
                return (
                  <div 
                    key={item.id} 
                    className={`bg-white border border-[#B5C7D8] rounded-[21px] overflow-hidden p-[13px] flex flex-col justify-between h-[180px] transition-all ${
                      !item.inStock ? 'opacity-40 grayscale' : 'hover:border-zinc-900'
                    }`}
                  >
                    <div className="relative">
                      <img src={item.image} alt={item.name} className="w-full h-16 rounded-[21px] object-cover border border-[#B5C7D8]/50" referrerPolicy="no-referrer" />
                      {!item.inStock ? (
                        <span className="absolute top-1 right-1 bg-red-650 text-white text-[9px] px-1.5 py-0.2 rounded-[21px] font-bold">HẾT</span>
                      ) : (
                        <span className="absolute top-1 right-1 bg-white/95 text-xs text-[#2D2B30] border border-[#B5C7D8] px-1.5 py-0.2 rounded-[21px] font-semibold font-sans">{itemType}</span>
                      )}
                    </div>
                    
                    <div className="mt-1 flex-grow">
                      <h5 className="text-sm font-semibold text-[#2D2B30] line-clamp-1">{item.name}</h5>
                      <p className="text-xs text-[#808080] line-clamp-1 text-pretty">{item.description}</p>
                    </div>

                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-bold text-zinc-900 ">
                        {item.price.toLocaleString()}đ
                      </span>
                      {item.inStock && (
                        <button 
                          onClick={() => openModifiersModal(item)}
                          className="bg-zinc-900 hover:bg-zinc-900/90 text-white w-6 h-6 rounded-[21px] flex items-center justify-center active:scale-95 text-xs font-semibold cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-[13px]">
              {['Khai vị', 'Món chính / Lẩu', 'Món lai rai', 'Đồ uống'].map(cat => {
                const filtered = displayedMenuItems.filter(i => i.category === cat || (cat === 'Món chính / Lẩu' && i.category.includes('Lẩu')));
                if (filtered.length === 0) return null;

                return (
                  <div key={cat} className="space-y-[4px]">
                    <h6 className="text-xs font-bold text-[#2D2B30] bg-[#F5F5F7] px-2 py-0.5 rounded-[21px] w-fit border border-[#B5C7D8]">{cat.to()}</h6>
                    
                    <div className="space-y-[4px]">
                      {filtered.map(item => {
                        const itemType = item.type || (['Giải nhiệt', 'Đồ uống', 'Trà', 'Cà phê', 'Cà phê truyền thống', 'Đá xay', 'Trà sữa', 'Cà phê hiện đại', 'Trà trái cây'].some(word => item.category.includes(word) || item.name.includes(word)) ? 'Đồ uống' : 'Đồ ăn');
                        return (
                          <div 
                            key={item.id} 
                            className="p-[13px] bg-white border border-[#B5C7D8] rounded-[21px] flex items-center gap-[13px] justify-between transition-all hover:border-zinc-900"
                          >
                            <div className="flex items-center gap-[13px]">
                              <img src={item.image} alt={item.name} className="w-10 h-10 rounded-[21px] object-cover border border-[#B5C7D8]/50" referrerPolicy="no-referrer" />
                              <div className="space-y-[2px]">
                                <div className="flex items-center gap-[4px] flex-wrap">
                                  <h5 className="text-sm font-semibold text-[#2D2B30]">{item.name}</h5>
                                  <span className="text-[8px] bg-[#F5F5F7] text-[#2D2B30] border border-[#B5C7D8] px-1 rounded-[21px] font-semibold font-sans">{itemType}</span>
                                </div>
                                <span className="text-sm font-bold text-zinc-900 ">{item.price.toLocaleString()}đ</span>
                              </div>
                            </div>
                            
                            {item.inStock ? (
                              <button 
                                onClick={() => openModifiersModal(item)}
                                className="bg-zinc-900 hover:bg-zinc-900/90 text-white w-6 h-6 rounded-[21px] flex items-center justify-center font-bold active:scale-95 cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
                              >
                                +
                              </button>
                            ) : (
                              <span className="text-xs text-[#808080] font-bold ">HẾT</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Dynamic footer checkout button panel */}
        {cart.length > 0 && (
          <div className="bg-white p-[13px] border-t border-[#B5C7D8] flex justify-between items-center z-30 shadow-md">
            <div className="flex items-center gap-[13px]">
              <div className="relative bg-[#F5F5F7] p-2.5 border border-[#B5C7D8] rounded-[21px]">
                <ShoppingBag className="w-4 h-4 text-[#2D2B30]" />
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-900 text-white text-xs font-bold rounded-full flex items-center justify-center ">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              <div>
                <span className="text-xs text-[#808080] block font-bold select-none">Tạm tính</span>
                <span className="text-[14px] font-bold text-[#2D2B30] ">{cartTotal.toLocaleString()}đ</span>
              </div>
            </div>

            <button 
              onClick={() => setCustStep('cart_summary')}
              className="bg-zinc-900 hover:bg-zinc-900/95 text-white text-sm font-semibold px-4 py-2.5 rounded-[21px] active:scale-95 shadow-sm transition-all flex items-center gap-1 cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
            >
              Xem Giỏ Hàng <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Modifier Customizer sheet modal */}
        {activeItemForModifier && (
          <div className="absolute inset-0 bg-black/40 flex flex-col justify-end z-50">
            <div className="bg-white rounded-t-[21px] border-t border-[#B5C7D8] p-[13px] space-y-[13px] max-h-[85%] overflow-y-auto shadow-xl text-[#2D2B30]">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="text-[14px] font-bold text-[#2D2B30]">{activeItemForModifier.name}</h4>
                  <p className="text-sm text-zinc-900 font-bold mt-0.5 ">{activeItemForModifier.price.toLocaleString()}đ</p>
                </div>
                <button 
                  onClick={() => setActiveItemForModifier(null)}
                  className="w-8 h-8 rounded-full bg-[#F5F5F7] text-[#2D2B30] border border-[#B5C7D8] flex items-center justify-center cursor-pointer hover:bg-[#E5E5EA] focus:outline-2 focus:outline-zinc-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-[13px] text-sm ">
                {template.modifier_groups.map(group => (
                  <div key={group.name} className="space-y-[4px]">
                    <div className="flex justify-between items-center text-xs font-bold text-[#808080]">
                      <span>{group.name}</span>
                      {group.required ? (
                        <span className="text-[9px] bg-red-100 text-red-650 px-1.5 py-0.2 rounded-[21px] font-bold">Bắt buộc</span>
                      ) : (
                        <span className="text-[9px] text-gray-500 font-bold">Tùy chọn</span>
                      )}
                    </div>

                    <div className="space-y-[4px]">
                      {group.options.map(opt => {
                        const isChecked = selectedModifiers.includes(opt.name);
                        return (
                          <div 
                            key={opt.name}
                            onClick={() => handleToggleModifierOpt(opt.name, opt.price)}
                            className={`p-[13px] rounded-[21px] border transition-all cursor-pointer flex justify-between items-center ${
                              isChecked 
                                ? 'border-zinc-900 bg-zinc-900/5 text-zinc-900 font-bold' 
                                : 'border-[#B5C7D8] bg-white text-zinc-700 hover:bg-[#F5F5F7]'
                            }`}
                          >
                            <span className="font-medium">{opt.name}</span>
                            <span className="text-sm font-bold ">
                              {opt.price === 0 ? 'Miễn phí' : `+${opt.price.toLocaleString()}đ`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-[13px] border-t border-[#B5C7D8] flex justify-between items-center bg-white">
                <div>
                  <span className="text-xs text-[#808080] block font-bold">Đơn giá món</span>
                  <span className="text-[16px] font-bold text-[#2D2B30] ">
                    {(activeItemForModifier.price + modifierPriceSum).toLocaleString()}đ
                  </span>
                </div>
                
                <button 
                  onClick={handleAddWithModifiers}
                  className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm font-semibold px-4 py-2.5 rounded-[21px] transition-colors cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
                >
                  Thêm Vào Giỏ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // STEP 4: CART SUMMARY & OTP DISCOUNTS
  if (custStep === 'cart_summary') {
    return (
      <div className="flex-grow flex flex-col bg-white p-[13px] font-sans justify-between relative text-[#2D2B30] h-full" id="cust-cart-summary">
        {showOtpRequired && (
          <div className="absolute inset-0 bg-black/45 flex items-center justify-center p-4 z-50">
            <div className="bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] w-full space-y-[13px] text-center shadow-xl">
              <div className="w-12 h-12 rounded-full bg-[#F5F5F7] border border-[#B5C7D8] flex items-center justify-center mx-auto">
                <Smartphone className="w-6 h-6 text-zinc-900" />
              </div>
              <h5 className="text-[14px] font-bold text-[#2D2B30] border-b border-gray-150 pb-1 flex justify-center">Xác thực OTP</h5>
              <p className="text-sm text-[#707070] text-pretty leading-relaxed">
                Vui lòng nhập OTP (8888).
              </p>

              <form onSubmit={handleVerifyOtpCode} className="space-y-[13px]">
                <input 
                  type="password"
                  maxLength={4} 
                  required
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ''));
                    setOtpError('');
                  }}
                  className="w-32 bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] text-center tracking-[0.3em] text-[16px] py-1.5 text-[#2D2B30] font-black focus:outline-none focus:border-zinc-900 shadow-inner "
                  placeholder="••••"
                />

                {otpError && <p className="text-xs text-red-650 font-semibold block">{otpError}</p>}

                <div className="flex gap-2">
                  <button 
                    type="button"
                    onClick={() => setShowOtpRequired(false)}
                    className="flex-1 bg-[#F5F5F7] text-[#2D2B30] border border-[#B5C7D8] hover:bg-gray-150 text-sm py-1.5 rounded-[21px] font-semibold cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button 
                    type="submit"
                    className="flex-1 bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm py-1.5 rounded-[21px] font-semibold cursor-pointer focus:outline-2 focus:outline-zinc-900"
                  >
                    Xác nhận
                  </button>
                </div>
              </form>

              <p className="text-[9px] text-[#808080] select-none">💡 Nhập 8888 để vượt qua xác thực nhanh</p>
            </div>
          </div>
        )}

        <div>
          <div className="flex justify-between items-center border-b border-[#B5C7D8]/65 pb-2 mb-[13px] select-none">
            <button 
              onClick={() => setCustStep('menu')}
              className="text-sm text-zinc-900 font-semibold hover:underline cursor-pointer flex items-center"
            >
              ← Thực Đơn
            </button>
            <span className="text-sm font-bold text-[#2D2B30] tracking-tight ">Giỏ hàng bàn {simulationTableId}</span>
          </div>

          <div className="space-y-[4px] max-h-[220px] overflow-y-auto pr-1">
            {cart.map(item => (
              <div key={item.id} className="p-[13px] bg-[#F5F5F7]/40 border border-[#B5C7D8] rounded-[21px] flex justify-between items-center text-sm hover:border-zinc-900 transition-colors">
                <div className="space-y-0.5">
                  <h6 className="font-semibold text-[#2D2B30]">{item.name}</h6>
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <div className="text-xs text-[#808080]">
                      + {item.selectedModifiers.join(', ')}
                    </div>
                  )}
                  <span className="text-zinc-900 font-semibold mt-0.5 block ">{item.price.toLocaleString()}đ</span>
                </div>
                
                <div className="flex items-center gap-[4px]">
                  <button 
                    onClick={() => handleUpdateCartQty(item.id, -1)}
                    className="w-6 h-6 rounded-[21px] bg-white hover:bg-gray-100 border border-[#B5C7D8] flex items-center justify-center text-[#2D2B30] cursor-pointer"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="font-semibold text-[#2D2B30] text-xs w-4 text-center ">{item.quantity}</span>
                  <button 
                    onClick={() => handleUpdateCartQty(item.id, 1)}
                    className="w-6 h-6 rounded-[21px] bg-white hover:bg-gray-100 border border-[#B5C7D8] flex items-center justify-center text-[#2D2B30] cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-[13px] bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] my-[13px]">
          {tenantConfig.discountEnabled && (
            <div className="space-y-1.5 border-b border-[#B5C7D8]/40 pb-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-[#808080] font-bold">Mã Khuyến Mãi</span>
                {tenantConfig.discountTriggerType === 'auto' ? (
                  <span className="text-[9px] bg-emerald-50 text-emerald-800 border border-emerald-250 px-1.5 rounded-[21px] font-bold">Tự động áp dụng</span>
                ) : (
                  <span className="text-[9px] bg-gray-100 text-[#2D2B30] border border-[#B5C7D8] px-1.5 rounded-[21px] font-bold">Nhập mã tay</span>
                )}
              </div>

              {tenantConfig.discountTriggerType === 'manual' ? (
                <div className="space-y-1">
                  <div className="flex gap-1.5">
                    <input 
                      type="text"
                      placeholder="Mã giảm giá..."
                      value={typedCoupon}
                      onChange={(e) => {
                        setTypedCoupon(e.target.value);
                        setCouponError('');
                      }}
                      className="flex-1 bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1 text-sm font-semibold text-[#2D2B30] focus:outline-none focus:border-zinc-900 font-sans"
                    />
                    <button 
                      type="button"
                      onClick={() => {
                        if (typedCoupon.to() === tenantConfig.discountCode?.to()) {
                          setManualCouponApplied(true);
                          setCouponError('');
                        } else {
                          setManualCouponApplied(false);
                          setCouponError('Mã không trùng khớp!');
                        }
                      }}
                      className="bg-zinc-900 hover:bg-zinc-900/90 text-white font-bold text-xs px-3.5 py-1 rounded-[21px] cursor-pointer"
                    >
                      Áp dụng
                    </button>
                  </div>
                  {couponError && <p className="text-[9px] text-[#ef4444] font-semibold">{couponError}</p>}
                  {manualCouponApplied && (
                    <p className="text-[9px] text-emerald-700 font-semibold flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Khớp mã ưu đãi: {tenantConfig.discountCode}!
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-[#707070] italic">
                  Đã tự động cộng hưởng mã {tenantConfig.discountCode} khi đạt điều kiện.
                </div>
              )}
            </div>
          )}

          {loyaltyProfile && (
            <div className="flex justify-between items-center text-sm border-b border-[#B5C7D8]/40 pb-2">
              <div>
                <span className="text-[9px] text-[#808080] block font-bold">Loyalty Hub</span>
                <span className="text-[#2D2B30] font-semibold ">{loyaltyProfile.points} điểm khả dụng</span>
              </div>
              
              {!redeemedPoints ? (
                <button 
                  onClick={handleRequestRedemption}
                  className="bg-zinc-900 hover:bg-zinc-900 text-white font-bold text-[9px] px-2.5 py-1 rounded-[21px] cursor-pointer"
                >
                  ĐỔI GIẢM 20K (Tốn 30pt)
                </button>
              ) : (
                <div className="text-emerald-700 text-[9px] font-bold flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-[21px] border border-emerald-250">
                  <Check className="w-3 h-3" /> ĐÃ ĐỔI GIẢM 20K
                </div>
              )}
            </div>
          )}

          {/* Pricing summary matching design spec */}
          <div className="space-y-1 text-sm text-[#808080]">
            <div className="flex justify-between">
              <span>Hóa đơn cộng dồn:</span>
              <span className="font-semibold text-[#2D2B30] ">{cartTotal.toLocaleString()}đ</span>
            </div>
            
            {redeemedPoints && (
              <div className="flex justify-between text-zinc-900 font-semibold">
                <span>Ưu đãi thành viên đổi:</span>
                <span className="">-20.000đ</span>
              </div>
            )}

            {isPromoEligible && (
              <div className="flex justify-between text-zinc-900 font-semibold">
                <span>Ưu đãi giảm giá ({tenantConfig.discountCode}):</span>
                <span className="">-{promoDiscountAmount.toLocaleString()}đ</span>
              </div>
            )}

            <div className="flex justify-between text-[#2D2B30] text-[14px] font-bold pt-2 border-t border-[#B5C7D8]/35">
              <span>KHÁCH CẦN THANH TOÁN:</span>
              <span className="text-zinc-900 ">{finalTotal.toLocaleString()}đ</span>
            </div>
          </div>

          <div className="text-xs text-[#808080] flex items-center gap-1.5 leading-relaxed font-light select-none">
            <AlertCircle className="w-3.5 h-3.5 text-zinc-900 flex-shrink-0" />
            <span>Mô hình quán: {tenantConfig.paymentMode === 'Pay-First' ? 'Trả trước (Pay-First)' : 'Trả sau (Pay-Later)'}</span>
          </div>

          <button 
            type="button"
            onClick={handleSubmitOrderToSystem}
            className="w-full bg-zinc-900 hover:bg-zinc-900/90 active:translate-y-0.5 text-white rounded-[21px] py-3.5 font-semibold text-[14px] tracking-wide shadow-sm transition-all cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
          >
            {tenantConfig.paymentMode === 'Pay-First' ? 'THANH TOÁN & GỬI BẾP (PAY-FIRST)' : 'GỬI ĐƠN HÀNG LỢI THỜI GIAN'}
          </button>
        </div>
      </div>
    );
  }

  // STEP 5: ORDER TRACKING PROGRESS
  if (custStep === 'order_tracking') {
    return (
      <div className="flex-grow flex flex-col bg-white p-[13px] font-sans justify-between text-[#2D2B30] h-full" id="cust-order-tracking">
        <div>
          <div className="flex justify-between items-center border-b border-[#B5C7D8]/60 pb-2 mb-[13px] select-none">
            <h5 className="text-xs font-bold text-[#2D2B30] font-sans">TRẠNG THÁI GỌI MÓN REALTIME</h5>
            <button 
              onClick={() => setCustStep('menu')}
              className="text-xs text-zinc-900 font-semibold hover:underline bg-transparent px-2.5 py-1 rounded-[21px] cursor-pointer focus:outline-2 focus:outline-zinc-900"
            >
              Đặt thêm món+
            </button>
          </div>

          {activeCustomerOrders.length === 0 ? (
            <div className="bg-[#F5F5F7] p-[34px] rounded-[21px] border border-[#B5C7D8] text-center space-y-[13px]">
              <span className="text-2xl">✅</span>
              <p className="text-[14px] font-bold text-[#2D2B30]">Bữa ăn đã khép lại và thanh toán!</p>
              <p className="text-sm text-[#808080] leading-relaxed text-pretty">
                ScanGo Lite xin chân thành cảm ơn quý khách. Hãy tiếp tục chọn nhãn bàn để đặt thêm món mới tùy thích.
              </p>
            </div>
          ) : (
            <div className="space-y-[13px]">
              {activeCustomerOrders.map((order) => (
                <div key={order.id} className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] space-y-[13px] shadow-sm">
                  <div className="flex justify-between items-center text-sm border-b border-[#B5C7D8]/30 pb-2 select-none">
                    <span className="font-bold text-[#2D2B30] ">ĐƠN HÀNG #{order.id.slice(-6)}</span>
                    <span className="font-semibold text-zinc-900 ">{order.total.toLocaleString()}đ</span>
                  </div>

                  {/* Staged horizontal process circles matching Apple tracking style */}
                  <div className="pt-2 flex justify-between items-center relative text-xs font-sans">
                    <div className="absolute top-3 left-4 right-4 h-0.5 bg-[#B5C7D8]/40 z-0"></div>

                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-xs font-bold ${
                        ['pending', 'cooking', 'ready'].includes(order.status) 
                          ? 'bg-zinc-900 text-white ring-4 ring-zinc-900/10' 
                          : 'bg-[#F5F5F7] text-gray-400 border border-[#B5C7D8]'
                      }`}>
                        1
                      </div>
                      <span className="text-[#2D2B30] font-semibold">Nhận đơn</span>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-xs font-bold ${
                        ['cooking', 'ready'].includes(order.status) 
                          ? 'bg-zinc-900 text-white ring-4 ring-zinc-900/10' 
                          : 'bg-[#F5F5F7] text-gray-400 border border-[#B5C7D8]'
                      }`}>
                        2
                      </div>
                      <span className="text-[#2D2B30] font-semibold">Đang nấu</span>
                    </div>

                    <div className="flex flex-col items-center gap-1.5 z-10">
                      <div className={`w-5.5 h-5.5 rounded-full flex items-center justify-center text-xs font-bold ${
                        ['ready'].includes(order.status) 
                          ? 'bg-emerald-600 text-white animate-pulse ring-4 ring-emerald-50' 
                          : 'bg-[#F5F5F7] text-gray-400 border border-[#B5C7D8]'
                      }`}>
                        3
                      </div>
                      <span className="text-[#2D2B30] font-semibold">Bưng lên</span>
                    </div>
                  </div>

                  <div className="bg-[#F5F5F7] p-3 rounded-[21px] border border-[#B5C7D8] text-sm text-[#707070] leading-relaxed text-pretty">
                    {order.status === 'pending' && '⏳ Bếp chính của chúng tôi đã ghi nhận đơn và đang chuẩn bị chế biến đúng thứ tự.'}
                    {order.status === 'cooking' && '🔥 Đầu bếp đang đứng chế biến trực tiếp, món nóng thơm chuẩn vị sắp bưng ra.'}
                    {order.status === 'ready' && '🎉 Món ngon đã chín tới ngạt ngào! Nhân viên đang chuẩn bị khay bưng ra bàn.'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={() => {
            setCustStep('nfc_tap');
            setCart([]);
          }}
          className="w-full bg-white border border-[#B5C7D8] text-sm py-3 rounded-[21px] text-[#2D2B30] font-semibold hover:bg-[#F5F5F7] transition-colors cursor-pointer focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2"
        >
          Mock Chạm NFC Mới (Rời bàn / Thay bàn)
        </button>
      </div>
    );
  }

  return null;
}

