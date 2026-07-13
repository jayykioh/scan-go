import React, { useState } from 'react';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig, StaffAccount } from '../types';
import { INDUSTRY_TEMPLATES } from '../mockData';
import { 
  Building2, 
  Sparkles, 
  TrendingUp, 
  Package, 
  MessageSquare, 
  SmartphoneNfc, 
  Check, 
  DollarSign, 
  AlertCircle, 
  ArrowRight, 
  ChevronRight, 
  Users, 
  Layers,
  ShoppingBag,
  RefreshCw,
  Plus,
  QrCode,
  Edit2,
  Trash2,
  Flame,
  Ticket,
  Star,
  Gift,
  PlusCircle,
  Save,
  Trash,
  Coffee,
  Receipt,
  UtensilsCrossed,
  CreditCard
} from 'lucide-react';

interface OwnerProps {
  tenantConfig: TenantConfig;
  setTenantConfig: React.Dispatch<React.SetStateAction<TenantConfig>>;
  menuItems: MenuItem[];
  setMenuItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
  orders: Order[];
  loyaltyMembers: LoyaltyMember[];
  onTriggerNfcTag: (tableId: string) => void;
  onboardCompleted: boolean;
  setOnboardCompleted: (val: boolean) => void;
  setViewMode: React.Dispatch<React.SetStateAction<'login' | 'grid' | 'owner' | 'cashier' | 'kitchen' | 'customer' | 'solo' | 'staff'>>;
  setSimulationTableId: (val: string) => void;
  tables: TableConfig[];
  setTables: React.Dispatch<React.SetStateAction<TableConfig[]>>;
  staffAccounts: StaffAccount[];
  setStaffAccounts: React.Dispatch<React.SetStateAction<StaffAccount[]>>;
}

export default function OwnerView({
  tenantConfig,
  setTenantConfig,
  menuItems,
  setMenuItems,
  orders,
  loyaltyMembers,
  onTriggerNfcTag,
  onboardCompleted,
  setOnboardCompleted,
  setViewMode,
  setSimulationTableId,
  tables,
  setTables,
  staffAccounts,
  setStaffAccounts,
}: OwnerProps) {
  const [activeTab, setActiveTab] = useState<'kpi' | 'menu' | 'nfc' | 'ai' | 'staff'>('kpi');
  
  // Onboarding parameters
  const [tempShopName, setTempShopName] = useState('Phở Kinh Kỳ');
  const [tempIndustry, setTempIndustry] = useState<'quan_an' | 'quan_cafe' | 'nha_hang' | 'tiem_banh' | 'tra_sua'>('quan_an');
  const [tempTier, setTempTier] = useState<'Free' | 'Lite' | 'Pro'>('Pro');
  const [tempPayMode, setTempPayMode] = useState<'Pay-First' | 'Pay-Later'>('Pay-Later');
  const [onboardStep, setOnboardStep] = useState(1);

  // Dish Management parameters
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Form Fields
  const [formName, setFormName] = useState('');
  const [formPrice, setFormPrice] = useState(30000);
  const [formCostPrice, setFormCostPrice] = useState(12000);
  const [formCategory, setFormCategory] = useState('Món nước');
  const [formType, setFormType] = useState('Đồ ăn');
  const [formDescription, setFormDescription] = useState('');
  const [formImage, setFormImage] = useState('');
  const [formStockCount, setFormStockCount] = useState(50);
  const [formToppings, setFormToppings] = useState<{ name: string; price: number }[]>([]);
  const [newToppingName, setNewToppingName] = useState('');
  const [newToppingPrice, setNewToppingPrice] = useState(0);

  // Promos
  const [promoCode, setPromoCode] = useState(tenantConfig.discountCode || 'MUANHIEU15K');
  const [promoMinItems, setPromoMinItems] = useState(tenantConfig.discountMinItems || 3);
  const [promoMinAmount, setPromoMinAmount] = useState(tenantConfig.discountMinAmount || 150000);
  const [promoAmount, setPromoAmount] = useState(tenantConfig.discountAmount || 15000);
  const [promoEnabled, setPromoEnabled] = useState(tenantConfig.discountEnabled !== false);
  const [promoTriggerType, setPromoTriggerType] = useState<'auto' | 'manual'>(tenantConfig.discountTriggerType || 'auto');
  const [promoConditionType, setPromoConditionType] = useState<'amount' | 'quantity' | 'both'>(tenantConfig.discountConditionType || 'quantity');
  const [promoTargetDishId, setPromoTargetDishId] = useState<string>(tenantConfig.discountTargetDishId || 'all');

  // Tables
  const [newTableName, setNewTableName] = useState('');
  const [editingTableId, setEditingTableId] = useState<string | null>(null);
  const [editingTableOriginalName, setEditingTableOriginalName] = useState('');

  // Staff management
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPin, setNewStaffPin] = useState('');
  const [newStaffRoles, setNewStaffRoles] = useState({ isKitchen: false, isWaiter: false, isCashier: false });
  const [showAddStaff, setShowAddStaff] = useState(false);

  const handleAddStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName.trim() || newStaffPin.length < 3) return;
    if (!newStaffRoles.isKitchen && !newStaffRoles.isWaiter && !newStaffRoles.isCashier) return;
    setStaffAccounts(prev => [...prev, {
      id: String(Date.now()),
      name: newStaffName.trim(),
      pin: newStaffPin,
      roles: { ...newStaffRoles },
      isActive: true,
    }]);
    setNewStaffName('');
    setNewStaffPin('');
    setNewStaffRoles({ isKitchen: false, isWaiter: false, isCashier: false });
    setShowAddStaff(false);
  };

  const handleToggleStaffActive = (id: string) => {
    setStaffAccounts(prev => prev.map(a => a.id === id ? { ...a, isActive: !a.isActive } : a));
  };

  const handleDeleteStaff = (id: string) => {
    setStaffAccounts(prev => prev.filter(a => a.id !== id));
  };

  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    const nextId = String(Date.now());
    const addedTable: TableConfig = {
      id: nextId,
      name: newTableName.trim()
    };
    setTables(prev => [...prev, addedTable]);
    setNewTableName('');
  };

  const handleStartEditingTable = (id: string, name: string) => {
    setEditingTableId(id);
    setEditingTableOriginalName(name);
  };

  const handleSaveTableName = (id: string) => {
    if (!editingTableOriginalName.trim()) return;
    setTables(prev => prev.map(t => t.id === id ? { ...t, name: editingTableOriginalName.trim() } : t));
    setEditingTableId(null);
    setEditingTableOriginalName('');
  };

  const handleDeleteTable = (id: string) => {
    if (tables.length <= 1) {
      return;
    }
    setTables(prev => prev.filter(t => t.id !== id));
  };

  // Chatbot parameters
  const [chatInput, setChatInput] = useState('');
  const [aiChatLogs, setAiChatLogs] = useState<Array<{ sender: 'user' | 'assistant'; text: string }>>([
    { sender: 'assistant', text: 'Chào Chủ quán! Bộ não AI ScanGo đã sẵn sàng. Bạn muốn xem phân tích lời/lỗ hay tìm món bán chạy nhất hôm nay?' }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // QR Modal table selected
  const [selectedQrTableId, setSelectedQrTableId] = useState<string | null>(null);

  // Statistical calculations from paid orders
  const totalRevenue = orders.reduce((sum, order) => sum + (order.status === 'paid' ? order.total : 0), 0);
  const totalOrdersCount = orders.length;
  
  const totalCost = orders.reduce((sum, order) => {
    if (order.status !== 'paid') return sum;
    return sum + order.items.reduce((itemSum, item) => {
      const originalItem = menuItems.find(m => m.id === item.menuId);
      const itemCost = originalItem ? originalItem.costPrice : (item.price * 0.4); 
      return itemSum + (itemCost * item.quantity);
    }, 0);
  }, 0);

  const netProfit = totalRevenue - totalCost;

  // Unsplash Quick presets
  const PRESET_IMAGES = [
    { label: '🍜 Món nước', url: 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600' },
    { label: '☕ Cà phê', url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=600' },
    { label: '🥐 Tiệm bánh', url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&q=80&w=600' },
    { label: '🍹 Đồ uống', url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&q=80&w=600' },
  ];

  // Best seller metrics
  const itemSalesMap: Record<string, { id: string; name: string; category: string; quantity: number, price: number, image: string }> = {};
  
  menuItems.forEach(m => {
    let baselineQty = 12;
    if (m.id === 'qa1') baselineQty = 48;
    if (m.id === 'qa3') baselineQty = 35;
    if (m.id === 'qa2') baselineQty = 24;
    if (m.id === 'qc1') baselineQty = 39;
    if (m.id === 'qc3') baselineQty = 31;

    itemSalesMap[m.id] = {
      id: m.id,
      name: m.name,
      category: m.category,
      quantity: baselineQty,
      price: m.price,
      image: m.image
    };
  });

  orders.forEach(order => {
    order.items.forEach(it => {
      if (itemSalesMap[it.menuId]) {
        itemSalesMap[it.menuId].quantity += it.quantity;
      } else {
        itemSalesMap[it.menuId] = {
          id: it.menuId,
          name: it.name,
          category: 'Món ăn',
          quantity: it.quantity,
          price: it.price,
          image: menuItems.find(m => m.id === it.menuId)?.image || 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600'
        };
      }
    });
  });

  const topFavoriteDishes = Object.values(itemSalesMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 3);

  const maxPopularity = topFavoriteDishes.length > 0 ? topFavoriteDishes[0].quantity : 1;

  const handleStartOnboarding = () => {
    setOnboardStep(1);
    setOnboardCompleted(false);
  };

  const nextStep = () => {
    if (onboardStep === 1) {
      setOnboardStep(2);
    } else if (onboardStep === 2) {
      setOnboardStep(3);
    } else if (onboardStep === 3) {
      setTenantConfig({
        ...tenantConfig,
        shopName: tempShopName,
        industry: tempIndustry,
        pricingTier: tempTier,
        paymentMode: tempPayMode,
        loyaltyEnabled: tempTier !== 'Free',
      });
      setOnboardStep(4);
    } else if (onboardStep === 4) {
      setOnboardCompleted(true);
    }
  };

  const handleToggleStock = (id: string) => {
    setMenuItems(prev => prev.map(item => {
      if (item.id === id) {
        const nextStock = !item.inStock;
        return {
          ...item,
          inStock: nextStock,
          stockCount: nextStock ? 50 : 0
        };
      }
      return item;
    }));
  };

  const resetForm = () => {
    setFormName('');
    setFormPrice(30000);
    setFormCostPrice(12000);
    setFormCategory('Món nước');
    setFormType('Đồ ăn');
    setFormDescription('');
    setFormImage('');
    setFormStockCount(50);
    setFormToppings([]);
    setNewToppingName('');
    setNewToppingPrice(0);
  };

  const handleStartAddForm = () => {
    resetForm();
    setEditingItem(null);
    setShowAddForm(true);
  };

  const handleAddDishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const newDish: MenuItem = {
      id: 'custom_' + Date.now(),
      name: formName.trim(),
      price: Number(formPrice) || 30000,
      costPrice: Number(formCostPrice) || 12000,
      category: formCategory || 'Món nước',
      type: formType || 'Đồ ăn',
      description: formDescription.trim() || 'Món ăn do chủ quán bổ sung thơm ngon nóng hổi.',
      image: formImage || 'https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?auto=format&fit=crop&q=80&w=600',
      inStock: Number(formStockCount) > 0,
      stockCount: Number(formStockCount) || 50,
      toppings: formToppings.length > 0 ? formToppings : undefined,
    };

    setMenuItems(prev => [newDish, ...prev]);
    setShowAddForm(false);
    resetForm();
  };

  const handleStartEdit = (item: MenuItem) => {
    setEditingItem(item);
    setShowAddForm(false);
    setFormName(item.name);
    setFormPrice(item.price);
    setFormCostPrice(item.costPrice || Math.round(item.price * 0.4));
    setFormCategory(item.category);
    setFormType(item.type || 'Đồ ăn');
    setFormDescription(item.description || '');
    setFormImage(item.image);
    setFormStockCount(item.stockCount ?? 50);
    setFormToppings(item.toppings ? [...item.toppings] : []);
    setNewToppingName('');
    setNewToppingPrice(0);
  };

  const handleEditDishSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !formName.trim()) return;

    setMenuItems(prev => prev.map(item => {
      if (item.id === editingItem.id) {
        return {
          ...item,
          name: formName.trim(),
          price: Number(formPrice),
          costPrice: Number(formCostPrice),
          category: formCategory,
          type: formType,
          description: formDescription.trim(),
          image: formImage || item.image,
          stockCount: Number(formStockCount),
          inStock: Number(formStockCount) > 0,
          toppings: formToppings.length > 0 ? formToppings : undefined,
        };
      }
      return item;
    }));

    setEditingItem(null);
    resetForm();
  };

  const handleUpdatePromoSettings = () => {
    setTenantConfig(prev => ({
      ...prev,
      discountCode: promoCode.trim().toUpperCase(),
      discountMinItems: Number(promoMinItems) || 1,
      discountMinAmount: Number(promoMinAmount) || 0,
      discountAmount: Number(promoAmount) || 0,
      discountEnabled: promoEnabled,
      discountTriggerType: promoTriggerType,
      discountConditionType: promoConditionType,
      discountTargetDishId: promoTargetDishId,
    }));
  };

  const handleAiQuestion = (question: string) => {
    setAiChatLogs(prev => [...prev, { sender: 'user', text: question }]);
    setIsTyping(true);

    setTimeout(() => {
      let answer = '';
      const qLower = question.toLowerCase();
      if (qLower.includes('lãi') || qLower.includes('lợi nhuận') || qLower.includes('doanh thu')) {
        answer = `📊 Biên phân tích: Doanh thu thực là ${totalRevenue.toLocaleString()}đ, chi phí đầu vào ${totalCost.toLocaleString()}đ. Lợi nhuận gộp đạt ${netProfit.toLocaleString()}đ.\n🚀 Món ăn tối ưu chi phí hiệu quả nhất: ${topFavoriteDishes[0]?.name || 'Phở'} (Biên lời dồi dào, ổn định).`;
      } else if (qLower.includes('món ăn') || qLower.includes('bán chạy') || qLower.includes('yêu thích')) {
        answer = `🌟 Top 3 món yêu thích trên hệ thống:\n1. ${topFavoriteDishes[0]?.name || 'Phở'} (${topFavoriteDishes[0]?.quantity || 0} lượt đặt)\n2. ${topFavoriteDishes[1]?.name || 'Đồ uống'} (${topFavoriteDishes[1]?.quantity || 0} lượt đặt)\n3. ${topFavoriteDishes[2]?.name || 'Món phụ'} (${topFavoriteDishes[2]?.quantity || 0} lượt đặt).\n💡 Khuyến nghị: Duy trì chuẩn bị nguyên liệu món đứng đầu vào khung giờ cao điểm!`;
      } else if (qLower.includes('giảm giá') || qLower.includes('khuyến mãi') || qLower.includes('ưu đãi')) {
        answer = `🎟️ Chương trình khuyến mãi mã "${tenantConfig.discountCode || 'MUANHIEU15K'}" đang chạy ổn định. Giỏ hàng tối thiểu ${tenantConfig.discountMinItems} món và ${tenantConfig.discountMinAmount?.toLocaleString()}đ để giảm ${tenantConfig.discountAmount?.toLocaleString()}đ giúp tối ưu hóa giá trị đơn hàng khách đặt thêm!`;
      } else if (qLower.includes('vận hành') || qLower.includes('nfc') || qLower.includes('qr')) {
        answer = `⚡ Tính năng dán góc bàn QR & NFC của ScanGo Lite xóa bỏ sai sót nhận đơn, tăng tốc phục vụ bàn lên 80% mà không tăng chi phí nhân lực.`;
      } else {
        answer = `ScanGo AI báo cáo: Hệ thống vận hành trơn tru. Món được đặt nhiều nhất: "${topFavoriteDishes[0]?.name || 'Phở Bò'}". Bạn muốn điều chỉnh danh sách món ăn hay thay đổi mã ưu đãi "${promoCode}"?`;
      }
      setAiChatLogs(prev => [...prev, { sender: 'assistant', text: answer }]);
      setIsTyping(false);
    }, 1000);
  };

  const submitCustomAiChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const q = chatInput;
    setChatInput('');
    handleAiQuestion(q);
  };

  const handleSimulateQrScan = (tableId: string) => {
    setSimulationTableId(tableId);
    setViewMode('customer');
    setSelectedQrTableId(null);
  };

  // STEP 1: ONBOARDING SETUP VIEW
  if (!onboardCompleted) {
    return (
      <div className="flex-grow flex flex-col bg-white p-[34px] font-sans justify-between text-[#2D2B30] h-full" id="owner-onboarding">
        <div>
          <div className="w-[50px] h-[50px] rounded-[21px] bg-[#F5F5F7] border border-[#B5C7D8] flex items-center justify-center mb-[13px]">
            <Building2 className="w-[24px] h-[24px] text-zinc-900" />
          </div>
          <h2 className="text-[24px] font-bold text-[#2D2B30] tracking-tight leading-tight">
            Thiết lập quán
          </h2>
          <p className="text-sm text-[#808080] mt-1 text-pretty font-medium">
            Tối ưu hóa quy trình trong 15s.
          </p>

          <div className="flex gap-1.5 mt-[13px]">
            {[1, 2, 3, 4].map(idx => (
              <div 
                key={idx} 
                className={`h-1 rounded-[21px] flex-1 transition-all duration-350 ${
                  idx <= onboardStep ? 'bg-zinc-900' : 'bg-[#E5E5EA]'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="my-[13px] flex-grow flex flex-col justify-center bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] shadow-sm">
          {onboardStep === 1 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">B1: Thông tin quán</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Tên thương hiệu</h3>
              
              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold ">Tên thương hiệu</label>
                <input 
                  type="text" 
                  value={tempShopName} 
                  required
                  onChange={(e) => setTempShopName(e.target.value)}
                  className="w-full bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-[13px] py-2.5 text-[14px] text-[#2D2B30] focus:outline-2 focus:outline-zinc-900 focus:outline-offset-2 font-semibold shadow-inner"
                  placeholder="E.g. Phở Kinh Kỳ"
                />
              </div>

              <div className="space-y-[4px]">
                <label className="block text-xs text-[#7E7E7E] font-semibold mb-1.5">Mô hình phân loại</label>
                <div className="grid grid-cols-2 gap-[13px]">
                  <button 
                    onClick={() => { setTempIndustry('quan_an'); setTempShopName('Phở Truyền Thuyết Kinh Kỳ'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_an' 
                        ? 'bg-zinc-900 text-white border-zinc-900' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <UtensilsCrossed className="w-5 h-5" />
                    <span className="text-xs font-semibold ">Quán ăn / Phở</span>
                  </button>
                  <button 
                    onClick={() => { setTempIndustry('quan_cafe'); setTempShopName('Cà Phê Rang Muối Cổ Đô'); }}
                    className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-1.5 transition-all shadow-sm ${
                      tempIndustry === 'quan_cafe' 
                        ? 'bg-zinc-900 text-white border-zinc-900' 
                        : 'bg-white border-[#B5C7D8] text-[#2D2B30] hover:bg-[#F5F5F7]'
                    }`}
                  >
                    <Coffee className="w-5 h-5" />
                    <span className="text-xs font-semibold ">Cà phê / Trà sữa</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {onboardStep === 2 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">B2: Gói tính năng</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Chọn gói phù hợp</h3>
              
              <div className="space-y-[4px]">
                <button 
                  onClick={() => setTempTier('Pro')}
                  className={`w-full p-[13px] rounded-[21px] border text-left transition-all flex items-center justify-between shadow-xs ${
                    tempTier === 'Pro' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white text-gray-700 border-[#B5C7D8]'
                  }`}
                >
                  <div className="space-y-0.5 max-w-[80%]">
                    <div className="text-sm font-bold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" /> PRO AI
                    </div>
                    <p className="text-xs text-[#707070]">Tối ưu lợi nhuận, KDS realtime.</p>
                  </div>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-bold">MIỄN PHÍ</span>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 3 && (
            <div className="space-y-[13px]">
              <span className="text-xs text-zinc-900 font-bold ">B3: Thanh toán</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">Quy trình thu ngân</h3>
              
              <div className="grid grid-cols-2 gap-[13px]">
                <button 
                  onClick={() => setTempPayMode('Pay-Later')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-Later' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <Receipt className="w-5 h-5 text-zinc-900" />
                  <div className="text-xs font-bold leading-tight">Trả sau<br/><span className="text-[8px] font-medium">(Ăn xong thanh toán)</span></div>
                </button>
                <button 
                  onClick={() => setTempPayMode('Pay-First')}
                  className={`p-[13px] rounded-[21px] border text-center flex flex-col items-center gap-[4px] transition-all shadow-xs ${
                    tempPayMode === 'Pay-First' ? 'bg-zinc-900/5 text-[#2D2B30] border-zinc-900' : 'bg-white border-[#B5C7D8] text-[#2D2B30]'
                  }`}
                >
                  <CreditCard className="w-5 h-5 text-zinc-900" />
                  <div className="text-xs font-bold leading-tight">Trả trước<br/><span className="text-[8px] font-medium">(Thanh toán tại quầy)</span></div>
                </button>
              </div>
            </div>
          )}

          {onboardStep === 4 && (
            <div className="space-y-[13px] text-[#2D2B30]">
              <div className="w-[40px] h-[40px] rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <h3 className="text-[16px] font-bold text-[#2D2B30] text-center">Hoàn tất!</h3>
              <p className="text-sm text-[#707070] text-center">
                Workspace đã thiết lập xong. Bạn có thể sử dụng QR, KDS và AI ngay lập tức.
              </p>
            </div>
          )}
        </div>

        <button 
          onClick={nextStep}
          className="w-full bg-zinc-900 hover:bg-zinc-900/90 active:translate-y-0.5 text-white py-3.5 rounded-[21px] font-semibold text-[14px] flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer"
        >
          {onboardStep === 4 ? 'Xác nhận Kích Hoạt!' : 'Tiếp Theo'}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // STEP 2: FULL OWNER LIVE DASHBOARD
  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="owner-workspace">
      
      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        
        {/* Branch Info Ribbon */}
        <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8]/60 shadow-xs relative overflow-hidden select-none">
          <div className="flex justify-between items-start">
            <div className="space-y-[2px]">
              <span className="text-[9px] font-bold text-[#808080] block">QUẢN LÝ LIVE PLATFORM</span>
              <h3 className="text-[16px] font-bold text-[#2D2B30]">{tenantConfig.shopName}</h3>
              <p className="text-sm text-[#454547] font-medium">Mô hình: {
                tenantConfig.industry === 'quan_an' ? 'Quán ăn / Phở' : 
                'Cà phê / Trà sữa'
              }</p>
            </div>
            <div className="text-right flex flex-col items-end gap-1 select-none">
              <span className="inline-block text-xs font-bold text-zinc-900 bg-zinc-900/10 border border-zinc-900/20 px-2 py-0.5 rounded-[21px]">
                Gói {tenantConfig.pricingTier.toUpperCase()}
              </span>
              <p className="text-[9px] text-[#808080] font-semibold ">Workspace chủ</p>
            </div>
          </div>

          <div className="flex gap-1.5 mt-2.5">
            <button 
              onClick={handleStartOnboarding}
              className="flex items-center gap-1 text-xs text-[#2D2B30] hover:bg-gray-100 bg-white px-2.5 py-1 rounded-[21px] border border-[#B5C7D8] font-semibold transition-all cursor-pointer focus:outline-2 focus:outline-zinc-900"
            >
              <RefreshCw className="w-3 h-3 text-zinc-900" /> Cài đặt lại mô hình
            </button>
          </div>
        </div>

        {/* Tab Selection Row adhering to minimalist Claude design */}
        <div className="grid grid-cols-5 bg-[#F5F5F7] p-1 rounded-[21px] border border-[#B5C7D8]/50 text-[11px] font-semibold select-none">
          <button 
            onClick={() => { setActiveTab('kpi'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); }}
            className={`py-1.5 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'kpi' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            Báo cáo
          </button>
          <button 
            onClick={() => setActiveTab('menu')}
            className={`py-1.5 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'menu' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            Món ăn
          </button>
          <button 
            onClick={() => { setActiveTab('nfc'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); }}
            className={`py-1.5 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'nfc' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            Bàn QR
          </button>
          <button 
            onClick={() => { setActiveTab('staff'); setShowAddForm(false); setEditingItem(null); }}
            className={`py-1.5 rounded-[21px] transition-all flex justify-center items-center ${
              activeTab === 'staff' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            Nhân viên
          </button>
          <button 
            onClick={() => { setActiveTab('ai'); setShowAddForm(false); setEditingItem(null); setShowAddStaff(false); }}
            className={`py-1.5 rounded-[21px] transition-all flex justify-center items-center relative ${
              activeTab === 'ai' ? 'bg-white text-[#2D2B30] font-bold border border-[#B5C7D8] shadow-sm' : 'text-[#808080] hover:text-[#2D2B30]'
            }`}
          >
            Trợ lý AI
            <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
          </button>
        </div>

        {/* REPORT KPI VIEW */}
        {activeTab === 'kpi' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="grid grid-cols-2 gap-[13px]">
              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <span className="text-xs text-[#808080] block font-bold ">Doanh Thu Thật</span>
                <span className="text-[21px] font-bold text-[#2D2B30] mt-0.5 block ">
                  {totalRevenue.toLocaleString()}đ
                </span>
                <span className="text-xs text-emerald-800 font-semibold block mt-0.5">✓ Real-time POS</span>
              </div>

              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <span className="text-xs text-[#808080] block font-bold ">Biên Lợi Nhuận</span>
                <span className="text-[21px] font-bold text-zinc-900 mt-0.5 block ">
                  {netProfit.toLocaleString()}đ
                </span>
                <span className="text-xs text-[#808080] block mt-0.5 font-sans leading-none">Vốn NVL: {totalCost.toLocaleString()}đ</span>
              </div>
            </div>

            {/* Top seller analysis block */}
            <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs space-y-[13px]">
              <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                <span className="text-sm font-bold text-[#2D2B30] flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-zinc-900" /> Món được đặt chọn phổ biến
                </span>
                <span className="text-xs bg-[#F5F5F7] border border-[#B5C7D8] text-[#454547] px-2 py-0.5 rounded-[21px] font-bold leading-none select-none">Live-chart</span>
              </div>

              <div className="space-y-[13px] pt-1">
                {topFavoriteDishes.map((dish, i) => {
                  const percent = Math.max(15, Math.min(100, Math.round((dish.quantity / maxPopularity) * 100)));
                  return (
                    <div key={dish.id} className="space-y-[4px]">
                      <div className="flex justify-between items-center text-sm ">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${
                            i === 0 ? 'bg-zinc-900' : i === 1 ? 'bg-slate-500' : 'bg-slate-400'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="font-semibold text-[#2D2B30] truncate">{dish.name}</span>
                          <span className="text-xs text-[#808080] flex-shrink-0">({dish.category})</span>
                        </div>
                        <span className="font-semibold text-[#2D2B30] flex-shrink-0 ">{dish.quantity} lượt đặt</span>
                      </div>
                      
                      <div className="w-full bg-[#F5F5F7] rounded-full h-2 overflow-hidden border border-[#B5C7D8]/30">
                        <div 
                          className="h-full rounded-full transition-all duration-500 bg-zinc-900"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Core Loyalty members stats */}
            {tenantConfig.loyaltyEnabled && (
              <div className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] shadow-xs">
                <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                  <span className="text-sm font-bold text-[#2D2B30] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-zinc-900" /> Tích luỹ hội viên ({loyaltyMembers.length} người)
                  </span>
                  <span className="text-xs bg-emerald-50 text-emerald-800 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-semibold select-none">Tăng trưởng chốt đơn</span>
                </div>
                
                <div className="mt-2.5 space-y-1.5 max-h-[120px] overflow-y-auto">
                  {loyaltyMembers.map((member) => (
                    <div key={member.phone} className="flex justify-between text-sm bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8] tracking-tight">
                      <div>
                        <div className="font-semibold text-[#2D2B30]">{member.name || 'Hội Viên Mới'}</div>
                        <div className="text-[#808080] text-xs ">SĐT: {member.phone} • Ghé: {member.visits} lần</div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-zinc-900 ">{member.points} điểm tích</span>
                        <div className="text-[#808080] text-xs font-light">{member.isVerified ? '✓ Đã verify OTP' : 'Tạm'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MENU SETTINGS VIEW */}
        {activeTab === 'menu' && (
          <div className="space-y-[13px] animate-fadeIn">
            
            <div className="flex justify-between items-center select-none">
              <div>
                <span className="text-sm font-bold text-[#2D2B30]">Danh Sách Thực Đơn</span>
                <p className="text-xs text-[#808080] leading-none mt-0.5">Khóa món dán bàn chuẩn xác</p>
              </div>
              
              <button 
                onClick={handleStartAddForm}
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-[13px] py-2 rounded-[21px] flex items-center gap-1 transition-all cursor-pointer font-semibold shadow-xs focus:outline-2 focus:outline-zinc-900"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Món
              </button>
            </div>

            {/* Campaign coupon manager inside menu settings */}
            <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] space-y-3 relative overflow-hidden text-[#2D2B30]">
              <div className="flex items-center gap-1.5 border-b border-[#B5C7D8]/60 pb-2">
                <Gift className="w-4 h-4 text-zinc-900" />
                <span className="text-sm font-bold text-[#2D2B30] ">MÃ KHUYẾN MÃI CHIẾN DỊCH</span>
                <span className="text-xs bg-white border border-[#B5C7D8] text-zinc-900 px-2 py-0.5 rounded-[21px] font-bold ml-auto ">COUPON CODE</span>
              </div>

              <div className="grid grid-cols-2 gap-[13px] text-sm ">
                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Mã Khuyến Mãi</label>
                  <input 
                    type="text" 
                    value={promoCode} 
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none focus:border-zinc-900"
                    placeholder="E.g. GIAM15K"
                  />
                </div>
                
                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Mức Giảm Giá (đ)</label>
                  <input 
                    type="number" 
                    value={promoAmount} 
                    onChange={(e) => setPromoAmount(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none focus:border-zinc-900 "
                  />
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Cách Kích Hoạt</label>
                  <select
                    value={promoTriggerType}
                    onChange={(e) => setPromoTriggerType(e.target.value as 'auto' | 'manual')}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="auto">⚡ Tự động áp dụng khi đủ kiện</option>
                    <option value="manual">🔑 Khách tự nhập mã Coupon</option>
                  </select>
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Tiêu Chí Khách Đạt</label>
                  <select
                    value={promoConditionType}
                    onChange={(e) => setPromoConditionType(e.target.value as 'amount' | 'quantity' | 'both')}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="amount">💰 Theo tổng số tiền tối thiểu</option>
                    <option value="quantity">🛒 Theo số lượng món ăn</option>
                    <option value="both">🚀 Đạt CẢ số lượng & số tiền</option>
                  </select>
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Số nước/món tối thiểu</label>
                  <input 
                    type="number" 
                    disabled={promoConditionType === 'amount'}
                    value={promoMinItems} 
                    onChange={(e) => setPromoMinItems(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none disabled:opacity-40 "
                  />
                </div>

                <div className="space-y-[4px]">
                  <label className="block text-xs text-[#808080] font-bold select-none">Tổng giá tối thiểu (đ)</label>
                  <input 
                    type="number" 
                    disabled={promoConditionType === 'quantity'}
                    value={promoMinAmount} 
                    onChange={(e) => setPromoMinAmount(Number(e.target.value))}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm text-[#2D2B30] font-bold focus:outline-none disabled:opacity-40 "
                  />
                </div>

                <div className="space-y-[4px] col-span-2">
                  <label className="block text-xs text-[#808080] font-bold select-none">Mức ăn áp dụng riêng biệt</label>
                  <select
                    value={promoTargetDishId}
                    onChange={(e) => setPromoTargetDishId(e.target.value)}
                    className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-xs font-semibold text-[#2D2B30] focus:outline-none"
                  >
                    <option value="all">🌐 Áp dụng cho toàn bộ giỏ hàng</option>
                    {menuItems.map(m => (
                      <option key={m.id} value={m.id}>🎯 Chỉ áp dụng riêng món: {m.name} ({m.price.toLocaleString()}đ)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#B5C7D8]/45">
                <label className="flex items-center gap-1.5 text-sm text-[#2D2B30] selection:bg-transparent font-medium cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={promoEnabled}
                    onChange={(e) => setPromoEnabled(e.target.checked)}
                    className="rounded text-zinc-900 focus:ring-zinc-900 w-3.5 h-3.5"
                  />
                  <span>Áp dụng chiến dịch</span>
                </label>

                <button 
                  onClick={handleUpdatePromoSettings}
                  className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm font-semibold px-4 py-1.5 rounded-[21px] cursor-pointer shadow-xs focus:outline-2 focus:outline-zinc-900"
                >
                  Áp dụng thay đổi
                </button>
              </div>

              <p className="text-xs text-[#707070] italic leading-relaxed bg-white p-2.5 rounded-[21px] border border-[#B5C7D8]">
                👉 Chương trình kích hoạt: Mã <strong>{promoCode}</strong> giảm giá <strong>{promoAmount.toLocaleString()}đ</strong> {promoTriggerType === 'auto' ? 'ngay lập tức khi đủ điều kiện.' : 'khi khách nhập đúng mã.'} 
              </p>
            </div>

            {/* Menu item setup Form */}
            {(showAddForm || editingItem) && (
              <form 
                onSubmit={showAddForm ? handleAddDishSubmit : handleEditDishSubmit}
                className="bg-white border border-zinc-900 p-[13px] rounded-[21px] space-y-3 shadow-md text-sm text-[#2D2B30]"
              >
                <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2">
                  <span className="font-bold text-[#2D2B30] ">
                    {showAddForm ? '➕ Thêm món mới vào kho' : '📝 Cập nhật món ăn'}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => { setShowAddForm(false); setEditingItem(null); }}
                    className="text-[#808080] font-bold hover:text-red-500 font-sans"
                  >
                    Hủy [X]
                  </button>
                </div>

                <div className="space-y-[13px]">
                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">Tên sản phẩm *</label>
                    <input 
                      type="text" 
                      required
                      value={formName} 
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      placeholder="E.g. Phở mọc chuẩn vị..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-[13px]">
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">Giá bán khách hàng (đ)</label>
                      <input 
                        type="number" 
                        required
                        value={formPrice} 
                        onChange={(e) => setFormPrice(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      />
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">Giá vốn nguyên liệu * (đ)</label>
                      <input 
                        type="number" 
                        required
                        value={formCostPrice} 
                        onChange={(e) => setFormCostPrice(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 focus:outline-2 focus:outline-zinc-900 font-semibold text-sm "
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-[13px]">
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">Mục hàng</label>
                      <select 
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-1.5 py-1.5 font-semibold text-sm "
                      >
                        <option value="Món nước">Món nước</option>
                        <option value="Khô & Bún">Khô & Bún</option>
                        <option value="Ăn kèm">Ăn kèm</option>
                        <option value="Đồ uống">Đồ uống</option>
                        <option value="Tráng miệng">Tráng miệng</option>
                      </select>
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">Kiểu món</label>
                      <input 
                        type="text"
                        required
                        value={formType}
                        onChange={(e) => setFormType(e.target.value)}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 font-semibold text-sm "
                        placeholder="E.g. Đồ ăn, Đồ uống"
                      />
                    </div>
                    <div className="space-y-[4px]">
                      <label className="block text-xs text-[#808080] font-bold select-none">Tồn ban đầu</label>
                      <input 
                        type="number" 
                        required
                        value={formStockCount} 
                        onChange={(e) => setFormStockCount(Number(e.target.value))}
                        className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-2 py-1.5 font-semibold text-sm "
                      />
                    </div>
                  </div>

                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">Mô tả món</label>
                    <textarea 
                      value={formDescription} 
                      onChange={(e) => setFormDescription(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 h-12"
                      placeholder="Món ăn chuẩn vị Hà Thành..."
                    />
                  </div>

                  <div className="space-y-[4px]">
                    <label className="block text-xs text-[#808080] font-bold select-none">Đường dẫn ảnh sản phẩm (URL)</label>
                    <input 
                      type="text" 
                      value={formImage} 
                      onChange={(e) => setFormImage(e.target.value)}
                      className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-1.5 text-sm "
                      placeholder="Dán link ảnh Unsplash hoặc chọn preset..."
                    />
                    
                    <div className="flex gap-1.5 pt-1 overflow-x-auto whitespace-nowrap scrollbar-none">
                      {PRESET_IMAGES.map(preset => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setFormImage(preset.url)}
                          className={`text-xs font-semibold px-2.5 py-1.5 rounded-[21px] border transition-all ${
                            formImage === preset.url ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-[#F5F5F7] border-[#B5C7D8] text-[#2D2B30]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2 border-t border-[#B5C7D8]/30">
                  <button 
                    type="submit"
                    className="flex-1 bg-zinc-900 hover:bg-zinc-900/95 text-white font-semibold py-2.5 rounded-[21px]"
                  >
                    {showAddForm ? 'XÁC NHẬN THÊM' : 'SỬA THAY ĐỔI'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => { setShowAddForm(false); setEditingItem(null); }}
                    className="bg-transparent text-[#808080] px-4 hover:underline py-2 rounded-[21px] font-semibold"
                  >
                    Bỏ qua
                  </button>
                </div>
              </form>
            )}

            {/* Main Menu Management Listings */}
            <div className="space-y-[4px] max-h-[300px] overflow-y-auto pr-1">
              {menuItems.map(item => (
                <div 
                  key={item.id} 
                  className={`p-3 rounded-2xl flex gap-3 border transition-all shadow-sm ${
                    item.inStock ? 'bg-white border-zinc-200 hover:border-zinc-300' : 'bg-zinc-50 border-zinc-200 opacity-60'
                  }`}
                >
                  <img src={item.image} alt={item.name} className="w-14 h-14 rounded-xl object-cover border border-zinc-200 flex-shrink-0" referrerPolicy="no-referrer" />
                  
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-zinc-900 truncate">{item.name}</h4>
                        <div className="text-sm font-bold text-zinc-900 mt-0.5">{item.price.toLocaleString()}đ</div>
                      </div>
                      
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button 
                          type="button"
                          onClick={() => handleStartEdit(item)}
                          className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          type="button"
                          onClick={() => {
                            setMenuItems(prev => prev.filter(m => m.id !== item.id));
                          }}
                          className="p-1.5 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-zinc-100">
                      <div className="flex items-center gap-2 text-[9px] text-zinc-500 tracking-tight flex-wrap">
                        <span>Gốc: {(item.costPrice || Math.round(item.price*0.4)).toLocaleString()}đ</span>
                        <span>Kho: {item.stockCount}</span>
                      </div>
                      
                      <button 
                        type="button"
                        onClick={() => handleToggleStock(item.id)}
                        className={`px-2 py-0.5 rounded text-[9px] font-bold transition-colors flex-shrink-0 ${
                          item.inStock 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {item.inStock ? 'ĐANG BÁN' : 'TẠM ẨN'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TABLES & QR MANAGER VIEW */}
        {activeTab === 'nfc' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="space-y-[4px]">
              <h4 className="text-sm font-bold text-[#2D2B30]">Quản Lý Bàn Ăn & QR Đặt Món</h4>
              <p className="text-sm text-[#707070] leading-relaxed text-pretty">
                Mỗi bàn ăn tự động phát hành 1 mã QR bảo mật. Hãy chạm giả lập NFC dán bàn hoặc quét QR bên dưới để phân luồng trực tiếp hóa đơn và đặt món cho tệp khách.
              </p>
            </div>

            <form onSubmit={handleAddTableSubmit} className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] flex gap-[13px] items-end shadow-2xs">
              <div className="flex-1 space-y-[4px]">
                <label className="block text-xs text-[#808080] font-bold select-none">Tên bàn ăn mới cần thêm</label>
                <input 
                  type="text"
                  required
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Ví dụ: Bàn VIP 07, Bàn Sân Vườn 02..."
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-[13px] py-1.5 text-sm text-[#2D2B30] font-semibold focus:outline-none focus:border-zinc-900 shadow-sm"
                />
              </div>
              <button 
                type="submit"
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-[13px] py-2.5 rounded-[21px] flex items-center gap-1 shadow-sm h-[38px] transition-all font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm Bàn
              </button>
            </form>

            <div className="bg-white border border-[#B5C7D8] rounded-[21px] p-[13px] space-y-[13px] shadow-xs">
              <div className="text-sm font-bold text-[#2D2B30] border-b border-[#B5C7D8]/30 pb-2 flex items-center justify-between select-none">
                <span>BÀN ĐANG VẬN HÀNH ({tables.length})</span>
                <span className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-250 px-2 py-0.5 rounded-[21px] font-bold">QR SG-LITE CHỐNG GIAN LẬN</span>
              </div>
              
              <div className="grid grid-cols-2 gap-[13px] max-h-[280px] overflow-y-auto pr-1">
                {tables.map((table) => {
                  const tableIdStr = table.id;
                  const isEditingThis = editingTableId === table.id;

                  return (
                    <div 
                      key={table.id} 
                      className="bg-white p-[13px] rounded-[21px] border border-[#B5C7D8] flex flex-col items-center justify-between shadow-2xs hover:border-zinc-900 transition-all text-center space-y-2.5 relative"
                    >
                      <button 
                        type="button"
                        onClick={() => handleDeleteTable(table.id)}
                        className="absolute top-2 right-2 p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-full border border-red-100 transition-colors cursor-pointer"
                        title="Xoá bàn"
                      >
                        <Trash className="w-3 h-3" />
                      </button>

                      {/* QR code logo */}
                      <div className="bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8]/45 flex items-center justify-center">
                        <QrCode className="w-7 h-7 text-[#2D2B30]" />
                      </div>

                      {isEditingThis ? (
                        <div className="space-y-1.5 w-full px-1">
                          <input 
                            type="text" 
                            value={editingTableOriginalName}
                            onChange={(e) => setEditingTableOriginalName(e.target.value)}
                            className="w-full bg-white border border-zinc-900 text-center text-sm font-bold py-1 px-1 rounded-[21px] focus:outline-none"
                            placeholder="Tên bàn"
                          />
                          <div className="flex gap-1 justify-center">
                            <button 
                              type="button"
                              onClick={() => handleSaveTableName(table.id)}
                              className="bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-[21px] flex items-center gap-0.5 cursor-pointer "
                            >
                              <Check className="w-2.5 h-2.5" /> Lưu
                            </button>
                            <button 
                              type="button"
                              onClick={() => setEditingTableId(null)}
                              className="bg-gray-100 text-[#2D2B30] text-[9px] font-bold px-2.5 py-0.5 rounded-[21px] cursor-pointer"
                            >
                              Huỷ
                            </button>
                  </div>

                  <div className="space-y-[4px] border-t border-[#B5C7D8]/30 pt-3">
                    <label className="block text-[10px] uppercase text-[#808080] font-bold select-none">Topping thêm cho món</label>
                    {formToppings.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {formToppings.map((t, i) => (
                          <span key={i} className="inline-flex items-center gap-1 bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-2 py-0.5 text-[10px] font-semibold">
                            {t.name} <span className="font-mono text-[#155BD0]">+{t.price.toLocaleString()}đ</span>
                            <button type="button" onClick={() => setFormToppings(prev => prev.filter((_, j) => j !== i))} className="text-red-500 hover:text-red-700 font-bold ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5">
                      <input type="text" value={newToppingName} onChange={(e) => setNewToppingName(e.target.value)} placeholder="Tên topping" className="flex-1 bg-white border border-[#B5C7D8] rounded-[21px] px-2.5 py-1.5 text-[11px] focus:outline-2 focus:outline-[#155BD0]" />
                      <input type="number" min={0} value={newToppingPrice} onChange={(e) => setNewToppingPrice(Number(e.target.value))} placeholder="Giá" className="w-20 bg-white border border-[#B5C7D8] rounded-[21px] px-2 py-1.5 text-[11px] tabular-nums focus:outline-2 focus:outline-[#155BD0]" />
                      <button type="button" onClick={() => { if (newToppingName.trim() && newToppingPrice >= 0) { setFormToppings(prev => [...prev, { name: newToppingName.trim(), price: newToppingPrice }]); setNewToppingName(''); setNewToppingPrice(0); } }} className="bg-[#155BD0] hover:bg-[#155BD0]/90 text-white text-[10px] font-bold px-3 rounded-[21px] cursor-pointer">+ Thêm</button>
                    </div>
                  </div>
                </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1 justify-center select-none">
                            <span className="text-sm font-bold text-[#2D2B30]">{table.name}</span>
                            <button 
                              type="button"
                              onClick={() => handleStartEditingTable(table.id, table.name)}
                              title="Sửa tên bàn"
                              className="text-zinc-900 hover:text-[#0858DC] p-0.5 bg-gray-50 rounded cursor-pointer"
                            >
                              <Edit2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                          <p className="text-[9px] text-[#808080] leading-none mt-1 select-none ">ID: {table.id}</p>
                        </div>
                      )}

                      <div className="w-full space-y-1 pt-1 border-t border-[#B5C7D8]/30">
                        <button
                          type="button"
                          onClick={() => setSelectedQrTableId(tableIdStr)}
                          className="w-full bg-zinc-900 hover:bg-zinc-900/95 text-white text-[9px] py-1.5 rounded-[21px] font-semibold transition-colors cursor-pointer"
                        >
                          Hiển Thị QR
                        </button>

                        <button 
                          type="button"
                          onClick={() => onTriggerNfcTag(tableIdStr)}
                          className="w-full bg-gray-100 hover:bg-gray-200 text-[#2D2B30] border border-[#B5C7D8] text-[9px] py-1.5 rounded-[21px] font-semibold shadow-2xs cursor-pointer"
                        >
                          Giả lập NFC Tap
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Simulated Live QR Dialog modal */}
            {selectedQrTableId && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                <div className="bg-white p-[34px] rounded-[21px] border border-[#B5C7D8] max-w-xs w-full text-center space-y-[13px] shadow-2xl">
                  
                  <div className="flex justify-between items-center border-b border-[#B5C7D8]/30 pb-2.5 select-none">
                    <span className="text-sm font-bold text-[#2D2B30]">Xác xuất QR gọi món</span>
                    <button 
                      onClick={() => setSelectedQrTableId(null)}
                      className="text-[#808080] font-bold hover:text-red-500 font-sans cursor-pointer"
                    >
                      [X] Đóng
                    </button>
                  </div>

                  {/* QR Image box layout */}
                  <div className="bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] flex flex-col items-center justify-center space-y-2.5">
                    <div className="w-24 h-24 bg-white p-2 rounded-[21px] border border-[#B5C7D8] flex items-center justify-center">
                      <div className="w-20 h-20 bg-zinc-900 flex flex-wrap gap-0.5 justify-center items-center rounded overflow-hidden p-1 opacity-95">
                        {Array.from({ length: 64 }).map((_, i) => (
                          <div 
                            key={i} 
                            className={`w-1.5 h-1.5 rounded-sm ${
                              (i % 3 === 0 || i % 7 === 0 || (i > 10 && i < 18) || i === 0 || i === 7 || i === 56) 
                                ? 'bg-white' 
                                : 'bg-zinc-900'
                            }`} 
                          />
                        ))}
                      </div>
                    </div>

                    <span className="text-[14px] font-bold text-[#2D2B30] tracking-tight">
                      {tables.find(t => t.id === selectedQrTableId)?.name || `Bàn ${selectedQrTableId}`}
                    </span>
                    <p className="text-[9px] text-[#808080] font-semibold select-none leading-none">
                      SCANGO LITE QR SERVICE ACTIVE
                    </p>
                  </div>

                  <p className="text-sm text-[#707070] text-pretty leading-relaxed">
                    Khách tại bàn <strong>"{tables.find(t => t.id === selectedQrTableId)?.name}"</strong> quét mã QR dán bàn để lập tức tự động đặt món không chờ phục vụ đưa giấy.
                  </p>

                  <div className="space-y-[4px]">
                    <button
                      onClick={() => handleSimulateQrScan(selectedQrTableId!)}
                      className="w-full bg-zinc-900 hover:bg-zinc-900/90 text-white py-2.5 rounded-[21px] text-sm font-bold shadow-sm cursor-pointer "
                    >
                      📱 Giả Lập quét QR đặt món
                    </button>

                    <button
                      onClick={() => setSelectedQrTableId(null)}
                      className="w-full text-[#808080] hover:text-[#2D2B30] bg-transparent py-1 text-sm "
                    >
                      Quay lại Dashboard
                    </button>
                  </div>

                </div>
              </div>
            )}
          </div>
        )}

        {/* AI CHATBOT COPILOT VIEW */}
        {activeTab === 'ai' && (
          <div className="flex flex-col h-[290px] bg-white border border-[#B5C7D8] rounded-[21px] overflow-hidden p-[4px] shadow-sm text-[#2D2B30] animate-fadeIn">
            
            <div className="bg-[#F5F5F7] p-2 border-b border-[#B5C7D8]/45 flex items-center justify-between select-none">
              <div className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold text-[#2D2B30] ">Trợ lý AI ScanGo Co-pilot</span>
              </div>
              <span className="text-[9px] bg-slate-200 border border-slate-350 text-slate-800 px-1.5 py-0.5 rounded-[21px] font-semibold ">WORKSPACE</span>
            </div>

            <div className="flex-grow overflow-y-auto p-2 space-y-2 text-sm bg-[#F5F5F7]/30">
              {aiChatLogs.map((log, i) => (
                <div 
                  key={i} 
                  className={`p-2.5 rounded-[21px] max-w-[85%] shadow-2xs ${
                    log.sender === 'user' 
                      ? 'bg-gradient-to-r from-zinc-900/10 to-zinc-900/5 text-[#2D2B30] ml-auto border border-zinc-900/30 font-semibold' 
                      : 'bg-white text-[#454547] mr-auto border border-[#B5C7D8] leading-relaxed animate-fadeIn'
                  }`}
                >
                  {log.text}
                </div>
              ))}
              {isTyping && (
                <div className="bg-transparent text-[#808080] p-2 leading-none text-xs animate-pulse">
                  AI Co-pilot đang phân tích dữ liệu...
                </div>
              )}
            </div>

            {/* Quick Prompts buttons */}
            <div className="p-1 px-[13px] border-t border-[#B5C7D8]/30 flex gap-[4px] overflow-x-auto whitespace-nowrap bg-white select-none text-xs scrollbar-none">
              <button 
                onClick={() => handleAiQuestion('Món ăn nào trong top yêu thích của quán?')}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                🔥 Sản phẩm nào bán chạy nhất?
              </button>
              <button 
                onClick={() => handleAiQuestion('Phân tích lợi nhuận lãi lỗ hôm nay?')}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                📊 Phân tích tiền lãi & chi phí?
              </button>
              <button 
                onClick={() => handleAiQuestion('Giải thích tối ưu mã khuyến mãi giảm giá?')}
                className="bg-[#F5F5F7] text-[#2D2B30] hover:bg-gray-200 px-3 py-1.5 rounded-[21px] border border-[#B5C7D8] font-semibold shadow-2xs flex-shrink-0"
              >
                🎟️ Đánh giá ưu đãi giảm giá?
              </button>
            </div>

            {/* Send chat */}
            <form onSubmit={submitCustomAiChat} className="p-1.5 border-t border-[#B5C7D8]/30 flex gap-[4px] bg-white">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Tra xuất lãi lỗ, đề xuất kinh doanh..."
                className="flex-grow bg-white border border-[#B5C7D8] rounded-[21px] px-[13px] py-1.5 text-sm text-[#2D2B30] font-sans focus:outline-none focus:border-zinc-900 shadow-sm font-medium"
              />
              <button 
                type="submit"
                className="bg-zinc-900 hover:bg-zinc-900/90 text-white text-sm px-4 rounded-[21px] font-bold shadow-sm cursor-pointer"
              >
                Gửi
              </button>
            </form>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="space-y-[13px] animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-[12px] font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-[#155BD0]" />
                Tài khoản nhân viên
              </h3>
              <button
                onClick={() => setShowAddStaff(!showAddStaff)}
                className="bg-[#155BD0] hover:bg-[#155BD0]/90 text-white text-[10px] px-3 py-1.5 rounded-[21px] font-semibold transition-all cursor-pointer"
              >
                + Thêm
              </button>
            </div>

            {showAddStaff && (
              <form onSubmit={handleAddStaff} className="bg-[#F5F5F7] border border-[#B5C7D8] p-4 rounded-[21px] space-y-3">
                <input
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  placeholder="Tên nhân viên"
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-2 text-[12px] text-[#2D2B30] focus:outline-2 focus:outline-[#155BD0]"
                />
                <input
                  value={newStaffPin}
                  onChange={e => setNewStaffPin(e.target.value)}
                  placeholder="Mã PIN (3-6 số)"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  className="w-full bg-white border border-[#B5C7D8] rounded-[21px] px-3 py-2 text-[12px] text-[#2D2B30] focus:outline-2 focus:outline-[#155BD0]"
                />
                <div className="flex gap-3 text-[11px]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isKitchen}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isKitchen: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    Bếp
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isWaiter}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isWaiter: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    Phục vụ
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newStaffRoles.isCashier}
                      onChange={e => setNewStaffRoles(p => ({ ...p, isCashier: e.target.checked }))}
                      className="accent-[#155BD0]"
                    />
                    Thu ngân
                  </label>
                </div>
                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] py-2 rounded-[21px] font-semibold transition-colors cursor-pointer"
                >
                  Lưu nhân viên
                </button>
              </form>
            )}

            <div className="space-y-[4px]">
              {staffAccounts.length === 0 && (
                <p className="text-[#8E8E93] text-xs text-center py-4">Chưa có nhân viên nào. Thêm nhân viên để bắt đầu.</p>
              )}
              {staffAccounts.map(account => (
                <div key={account.id} className="flex items-center justify-between bg-white border border-[#B5C7D8] p-3 rounded-[21px] text-[12px]">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#2D2B30]">{account.name}</p>
                    <div className="flex gap-1">
                      {account.roles.isKitchen && <span className="bg-[#155BD0]/10 text-[#155BD0] text-[9px] px-2 py-0.5 rounded-full font-semibold">Bếp</span>}
                      {account.roles.isWaiter && <span className="bg-emerald-600/10 text-emerald-700 text-[9px] px-2 py-0.5 rounded-full font-semibold">Phục vụ</span>}
                      {account.roles.isCashier && <span className="bg-amber-600/10 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-semibold">Thu ngân</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleStaffActive(account.id)}
                      className={`text-[10px] px-2.5 py-1 rounded-[21px] font-semibold cursor-pointer transition-colors ${
                        account.isActive
                          ? 'bg-emerald-600/10 text-emerald-700'
                          : 'bg-gray-100 text-[#8E8E93]'
                      }`}
                    >
                      {account.isActive ? 'Hoạt động' : 'Tạm ngưng'}
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(account.id)}
                      className="text-red-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

    </div>
  );
}


