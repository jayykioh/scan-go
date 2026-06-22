import React, { useState, useEffect } from 'react';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig } from './types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS, INDUSTRY_TEMPLATES } from './mockData';
import PhoneSimulator from './components/PhoneSimulator';
import OwnerView from './components/OwnerView';
import CashierView from './components/CashierView';
import KitchenView from './components/KitchenView';
import CustomerView from './components/CustomerView';
import SoloOperatorView from './components/SoloOperatorView';
import { 
  Sparkles, 
  Nfc, 
  RefreshCw, 
  Play, 
  HelpCircle, 
  Plus, 
  Building, 
  ChefHat, 
  Smartphone, 
  Wallet,
  Settings,
  Flame,
  UserCheck,
  Check
} from 'lucide-react';

export default function App() {
  // Global shared state
  const [tenantConfig, setTenantConfig] = useState<TenantConfig>({
    shopName: 'Bún Phở Kinh Kỳ',
    industry: 'quan_an',
    pricingTier: 'Pro', // Default to Pro for the richest demo features
    paymentMode: 'Pay-Later',
    loyaltyEnabled: true,
    loyaltyRate: 1, // 1000đ = 1pt
    onboardingStep: 4, 
    discountCode: 'MUANHIEU15K',
    discountMinItems: 3,
    discountMinAmount: 150000,
    discountAmount: 15000,
    discountEnabled: true,
    discountTriggerType: 'auto',
    discountConditionType: 'quantity',
    discountTargetDishId: 'all',
  });

  // Active tables configured by owner
  const [tables, setTables] = useState<TableConfig[]>([
    { id: '1', name: 'Bàn 01' },
    { id: '2', name: 'Bàn 02' },
    { id: '3', name: 'Bàn 03' },
    { id: '4', name: 'Bàn 04' },
    { id: '5', name: 'Bàn 05' },
    { id: '6', name: 'Bàn 06' },
  ]);

  // Track if each actor has done onboarding/signin
  const [ownerOnboarded, setOwnerOnboarded] = useState(true);
  const [soloOnboarded, setSoloOnboarded] = useState(false);
  const [cashierOnboarded, setCashierOnboarded] = useState(true);
  const [kitchenOnboarded, setKitchenOnboarded] = useState(true);

  // Active Menu items matching the selected industry engine template
  const [menuItems, setMenuItems] = useState<MenuItem[]>(MOCK_MENU_ITEMS.quan_an);

  // Active orders synced across all actors
  const [orders, setOrders] = useState<Order[]>([
    {
      id: 'ord_1',
      tableId: '1',
      items: [
        { id: 'qa1_x1', menuId: 'qa1', name: 'Phở Bò Tái Lăn Kinh Kỳ', price: 65000, quantity: 1, selectedModifiers: ['Thêm quẩy'] }
      ],
      total: 65000,
      status: 'cooking',
      timestamp: new Date(Date.now() - 300000), // 5 mins ago
      customerPhone: '0987654321',
      paymentMode: 'Pay-Later',
    },
    {
      id: 'ord_2',
      tableId: '3',
      items: [
        { id: 'qa3_x1', menuId: 'qa3', name: 'Bún Chả Tre Thạch Thất', price: 50000, quantity: 2, selectedModifiers: [] },
        { id: 'qa6_x1', menuId: 'qa6', name: 'Trà Sâm Dứa Hương Lài', price: 5000, quantity: 1 }
      ],
      total: 105000,
      status: 'pending',
      timestamp: new Date(Date.now() - 60000), // 1 min ago
      paymentMode: 'Pay-Later',
    }
  ]);

  // Active loyalty list
  const [loyaltyMembers, setLoyaltyMembers] = useState<LoyaltyMember[]>(MOCK_LOYALTY_MEMBERS);

  // Customer dynamic simulator helper values
  const [simulationTableId, setSimulationTableId] = useState<string>('2');
  const [nfcTriggeredAlert, setNfcTriggeredAlert] = useState<string | null>(null);
  
  // Layout views toggle
  const [viewMode, setViewMode] = useState<'login' | 'owner' | 'cashier' | 'kitchen' | 'customer' | 'grid' | 'solo'>('login');

  // Load new menu template on industry change
  useEffect(() => {
    const selectedList = MOCK_MENU_ITEMS[tenantConfig.industry] || MOCK_MENU_ITEMS.quan_an;
    setMenuItems(selectedList);

    // Update payment method based on standard template behavior
    const templateConfig = INDUSTRY_TEMPLATES[tenantConfig.industry];
    if (templateConfig) {
      setTenantConfig(prev => ({
        ...prev,
        paymentMode: templateConfig.default_payment_mode,
      }));
    }
  }, [tenantConfig.industry]);

  // Handle Owner simulated NFC sticker allocation
  const handleOwnerNfcAllocation = (tableId: string) => {
    setNfcTriggeredAlert(tableId);
    setTimeout(() => {
      setNfcTriggeredAlert(null);
    }, 3000);
  };

  // Helper: auto-simulate a mock client order to show real-time synchronization
  const triggerAutoOrderSimulation = () => {
    const randTable = ['1', '2', '3'][Math.floor(Math.random() * 3)];
    
    // Pick 1-2 random menu items
    const selectedMenuPreset = MOCK_MENU_ITEMS[tenantConfig.industry] || MOCK_MENU_ITEMS.quan_an;
    const item1 = selectedMenuPreset[0];
    const item2 = selectedMenuPreset[1];

    const randomOrder: Order = {
      id: `ord_sim_${Date.now()}`,
      tableId: randTable,
      items: [
        { id: `${item1.id}_s1`, menuId: item1.id, name: item1.name, price: item1.price, quantity: 1, selectedModifiers: [] },
        { id: `${item2.id}_s2`, menuId: item2.id, name: item2.name, price: item2.price, quantity: 1, selectedModifiers: [] }
      ],
      total: item1.price + item2.price,
      status: 'pending',
      timestamp: new Date(),
      customerPhone: '0901234567',
      paymentMode: tenantConfig.paymentMode,
    };

    setOrders(prev => [...prev, randomOrder]);
  };

  // Settle all cash orders to clear workflow
  const handleClearAllOrders = () => {
    setOrders([]);
  };

  const handleResetSim = () => {
    setTenantConfig({
      shopName: 'Bún Phở Kinh Kỳ',
      industry: 'quan_an',
      pricingTier: 'Pro',
      paymentMode: 'Pay-Later',
      loyaltyEnabled: true,
      loyaltyRate: 1,
      onboardingStep: 4,
      discountCode: 'MUANHIEU15K',
      discountMinItems: 3,
      discountMinAmount: 150000,
      discountAmount: 15000,
      discountEnabled: true,
    });
    setMenuItems(MOCK_MENU_ITEMS.quan_an);
    setOrders([
      {
        id: 'ord_1',
        tableId: '1',
        items: [{ id: 'qa1_x1', menuId: 'qa1', name: 'Phở Bò Tái Lăn Kinh Kỳ', price: 65000, quantity: 1, selectedModifiers: ['Thêm quẩy'] }],
        total: 65000,
        status: 'cooking',
        timestamp: new Date(),
        customerPhone: '0987654321',
        paymentMode: 'Pay-Later',
      }
    ]);
    setLoyaltyMembers(MOCK_LOYALTY_MEMBERS);
    setOwnerOnboarded(true);
    setSoloOnboarded(false);
    setCashierOnboarded(true);
    setKitchenOnboarded(true);
  };

  if (viewMode === 'login') {
    return (
      <div className="min-h-screen bg-zinc-50/50 text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn">
        
        {/* Upper Main Banner Workspace (simplified for login portal) */}
        <header className="bg-white border-b border-zinc-200 px-6 py-4 flex justify-between items-center z-10 select-none shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 flex items-center justify-center font-extrabold text-white text-xl tracking-tighter shadow-sm select-none">
              S⚡G
            </div>
            <div>
              <p className="text-[9.5px] text-zinc-500 font-mono tracking-widest leading-none font-extrabold uppercase">CỔNG ĐĂNG NHẬP QUẢN TRỊ & MUA SẮM</p>
              <h1 className="text-sm font-semibold text-zinc-900 tracking-tight mt-0.5">
                ScanGo Lite Space Portal
              </h1>
            </div>
          </div>
          <button 
            type="button"
            onClick={handleResetSim}
            className="px-3 py-1.5 text-[10.5px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded-lg flex items-center gap-1.5 transition-all shadow-sm uppercase cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Khôi phục ban đầu
          </button>
        </header>

        {/* Central Card Grid for Actor Login */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 select-none">
          <div className="max-w-4xl w-full text-center space-y-6 animate-fadeIn">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-zinc-100 border border-zinc-200 rounded-full text-[9px] font-bold text-zinc-800 uppercase tracking-widest leading-none">
              🚀 CHỌN VAI TRÒ ĐỂ BẮT ĐẦU ĐĂNG NHẬP
            </div>
            
            <div className="space-y-2">
              <h1 className="text-3xl md:text-4xl font-extrabold text-zinc-900 tracking-tight leading-tight">
                {tenantConfig.shopName}
              </h1>
              <p className="text-xs md:text-sm text-zinc-650 max-w-xl mx-auto leading-relaxed">
                Chào mừng bạn đến với hệ thống ScanGo Lite. Trải nghiệm hệ thống đặt món hoàn chỉnh dán góc bàn, vận hành không cần bất kỳ linh kiện hay thiết bị POS đắt đỏ nào!
              </p>
            </div>

            {/* Actor Selection Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 max-w-6xl mx-auto mt-8">
              {/* Card Owner */}
              <button
                type="button"
                onClick={() => setViewMode('owner')}
                className="bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl p-5 text-left flex flex-col justify-between hover:shadow-md transition-all h-[180px] cursor-pointer group"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-650 border border-zinc-200 group-hover:scale-105 transition-transform">
                     <Building className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-1.5 py-0.5 rounded font-bold font-mono uppercase tracking-wider">Chủ quán</span>
                </div>
                <div className="mt-2 text-left">
                  <h4 className="text-[12.5px] font-bold text-zinc-900 uppercase tracking-tight group-hover:text-zinc-900 transition-colors">1. CHỦ CỬA HÀNG (Owner)</h4>
                  <p className="text-[10.5px] text-zinc-500 line-clamp-3 mt-1 leading-normal font-medium">Báo cáo doanh thu realtime, sửa menu món ăn, thiết lập khuyến mãi tự động và lập QR Code dán bàn.</p>
                </div>
              </button>

              {/* Card Cashier */}
              <button
                type="button"
                onClick={() => setViewMode('cashier')}
                className="bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl p-5 text-left flex flex-col justify-between hover:shadow-md transition-all h-[180px] cursor-pointer group"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-650 border border-zinc-200 group-hover:scale-105 transition-transform">
                     <Wallet className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-1.5 py-0.5 rounded font-bold font-mono uppercase tracking-wider">Thu ngân</span>
                </div>
                <div className="mt-2 text-left">
                  <h4 className="text-[12.5px] font-bold text-zinc-900 uppercase tracking-tight group-hover:text-zinc-900 transition-colors">2. THU NGÂN QUẦY (Cashier)</h4>
                  <p className="text-[10.5px] text-zinc-500 line-clamp-3 mt-1 leading-normal font-medium">Duyệt thanh toán tiền mặt/chuyển khoản ngân hàng, hỗ trợ tách lẻ tài chính (Split Bill) thông minh.</p>
                </div>
              </button>

              {/* Card Kitchen */}
              <button
                type="button"
                onClick={() => setViewMode('kitchen')}
                className="bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl p-5 text-left flex flex-col justify-between hover:shadow-md transition-all h-[180px] cursor-pointer group"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-650 border border-zinc-200 group-hover:scale-105 transition-transform">
                     <ChefHat className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-1.5 py-0.5 rounded font-bold font-mono uppercase tracking-wider">Nhà bếp</span>
                </div>
                <div className="mt-2 text-left">
                  <h4 className="text-[12.5px] font-bold text-zinc-900 uppercase tracking-tight group-hover:text-zinc-900 transition-colors">3. TRẠM KDS BẾP (Kitchen)</h4>
                  <p className="text-[10.5px] text-zinc-500 line-clamp-3 mt-1 leading-normal font-medium">Hiển thị màn hình bếp trực quan, điều phối đơn nấu nướng theo thứ tự thời gian gọi chuẩn xác.</p>
                </div>
              </button>

              {/* Card Solo Owner 3-in-1 */}
              <button
                type="button"
                onClick={() => setViewMode('solo')}
                className="bg-white border-2 border-orange-200 hover:border-orange-500 rounded-2xl p-5 text-left flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 transition-all h-[180px] cursor-pointer group bg-gradient-to-br from-orange-50/10 via-white to-white"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 border border-orange-200 group-hover:scale-105 transition-transform animate-pulse">
                     <Sparkles className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] bg-orange-100 text-orange-800 border border-orange-200 px-1.5 py-0.5 rounded font-extrabold font-mono uppercase tracking-wider">3-Trong-1</span>
                </div>
                <div className="mt-2 text-left">
                  <h4 className="text-[12.5px] font-bold text-orange-850 uppercase tracking-tight group-hover:text-orange-950 transition-colors">⚡ CHỦ TOÀN NĂNG (Solo)</h4>
                  <p className="text-[10.5px] text-zinc-500 line-clamp-3 mt-1 leading-normal font-medium">Hợp nhất [Chủ + Thu Ngân + Đầu Bếp] rảnh tay. Chấp nhận đơn, nấu, thu tiền 1 chạm, quản lý kho tức khắc!</p>
                </div>
              </button>

              {/* Card Customer */}
              <button
                type="button"
                onClick={() => setViewMode('customer')}
                className="bg-white border border-zinc-200 hover:border-zinc-900 rounded-2xl p-5 text-left flex flex-col justify-between hover:shadow-md transition-all h-[180px] cursor-pointer group"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-zinc-50 flex items-center justify-center text-zinc-650 border border-zinc-200 group-hover:scale-105 transition-transform">
                     <Smartphone className="w-5 h-5" />
                  </div>
                  <span className="text-[8px] bg-zinc-100 text-zinc-800 border border-zinc-200 px-1.5 py-0.5 rounded font-bold font-mono uppercase tracking-wider">Khách hàng</span>
                </div>
                <div className="mt-2 text-left">
                  <h4 className="text-[12.5px] font-bold text-zinc-900 uppercase tracking-tight group-hover:text-zinc-900 transition-colors">4. KHÁCH GỌI MÓN (Customer)</h4>
                  <p className="text-[10.5px] text-zinc-500 line-clamp-3 mt-1 leading-normal font-medium">Đặt món quét mã tại bàn, cập nhật trạng thái đơn nấu realtime, đăng ký Loyalty không cần mật khẩu.</p>
                </div>
              </button>
            </div>

            {/* Quick config in Login page */}
            <div className="max-w-2xl mx-auto bg-zinc-50 border border-zinc-200 p-5 rounded-2xl tracking-normal space-y-3.5 mt-8 shadow-sm">
              <div className="flex items-center gap-2 text-zinc-900 justify-center">
                <Settings className="w-4 h-4 text-zinc-500 animate-spin-slow" />
                <span className="text-[10.5px] font-bold uppercase tracking-wider">Cấu hình mô hình quán kinh doanh</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left text-xs">
                <div className="space-y-1">
                  <label className="text-[9.5px] font-bold uppercase text-zinc-650 block tracking-wide">Ngành nghề (Tự động thích nghi menu):</label>
                  <select
                    value={tenantConfig.industry}
                    onChange={(e) => {
                      const industry = e.target.value as any;
                      const shopNames: Record<string, string> = {
                        quan_an: 'Bún Phở Kinh Kỳ',
                        quan_cafe: 'The Wood Coffee',
                        nha_hang: 'Nhà Hàng Lá Đỏ',
                        tiem_banh: 'Sweet Crumbs',
                        tra_sua: 'Milky Boba Land'
                      };
                      setTenantConfig(prev => ({ 
                        ...prev, 
                        industry, 
                        shopName: shopNames[industry] || 'ScanGo Shop' 
                      }));
                    }}
                    className="w-full bg-white border border-zinc-250 rounded-xl px-3 py-2 text-sm text-zinc-900 font-semibold focus:outline-none focus:border-zinc-900 cursor-pointer h-10 shadow-sm"
                  >
                    <option value="quan_an">🍜 Quán ăn / Phở / Noodle Shop</option>
                    <option value="quan_cafe">☕ Quán Café / Nước giải khát</option>
                    <option value="nha_hang">🍻 Nhà hàng / Quán nhậu / Lẩu gầm cầu</option>
                    <option value="tiem_banh">🥐 Tiệm bánh ngọt Pháp / Cakes</option>
                    <option value="tra_sua">🧋 Quán Trà sữa Boba / Pudding</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9.5px] font-bold uppercase text-zinc-650 block tracking-wide">Hành vi thanh toán mặc định:</label>
                  <select
                    value={tenantConfig.paymentMode}
                    onChange={(e) => setTenantConfig(prev => ({ ...prev, paymentMode: e.target.value as any }))}
                    className="w-full bg-white border border-zinc-250 rounded-xl px-3 py-2 text-sm text-zinc-900 font-semibold focus:outline-none focus:border-zinc-900 cursor-pointer h-10 shadow-sm"
                  >
                    <option value="Pay-Later">💵 Trả sau (Ăn xong rồi thu ngân tính tiền)</option>
                    <option value="Pay-First">💳 Trả trước (Thanh toán để gửi lệnh bếp nấu)</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Small branding label */}
        <footer className="py-4 text-center border-t border-zinc-200/50 bg-zinc-50 text-[9px] font-mono text-zinc-500 uppercase select-none">
          ScanGo Lite Workspace Portal • Real-time Data Synced across all connected systems
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/30 text-zinc-800 flex flex-col font-sans antialiased">
      
      {/* Upper Main Banner Workspace */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10 select-none shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center font-extrabold text-white text-xl tracking-tighter shadow-sm select-none">
              S⚡G
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 font-mono tracking-widest leading-none font-bold uppercase">MÀN HÌNH CHUYÊN BIỆT ĐANG HOẠT ĐỘNG</p>
              <h1 className="text-sm font-bold text-zinc-900 tracking-tight flex items-center gap-1.5 mt-1">
                {tenantConfig.shopName} <span className="text-[10px] bg-zinc-100 text-zinc-800 font-bold px-2 py-0.5 rounded border border-zinc-200 uppercase">{viewMode === 'owner' ? 'Chủ quán' : viewMode === 'cashier' ? 'Thu ngân' : viewMode === 'kitchen' ? 'KDS Nhà bếp' : viewMode === 'solo' ? 'Chủ Toàn Năng' : 'Khách hàng'}</span>
              </h1>
            </div>
          </div>
        </div>

        {/* Workspace controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-zinc-150/80 border border-zinc-200 rounded-xl p-0.5 flex text-xs font-semibold shadow-inner">
            <button 
              onClick={() => setViewMode('login')}
              className="px-3 py-1.5 rounded-lg text-zinc-800 hover:bg-zinc-200 font-bold flex items-center gap-1 text-xs item-center shrink-0"
              title="Quay lại Cổng Chọn Vai Trò"
            >
              🚪 Đăng xuất
            </button>
            <button 
              onClick={() => setViewMode('solo')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'solo' ? 'bg-orange-600 text-white shadow-sm font-bold animate-pulse' : 'text-zinc-700 hover:bg-zinc-200/50 hover:text-orange-600 font-bold'
              }`}
            >
              👑 Chủ Toàn Năng
            </button>
            <button 
              onClick={() => setViewMode('owner')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'owner' ? 'bg-zinc-900 text-white shadow-sm font-bold' : 'text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              Chủ quán
            </button>
            <button 
              onClick={() => setViewMode('cashier')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'cashier' ? 'bg-zinc-900 text-white shadow-sm font-bold' : 'text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              Thu ngân
            </button>
            <button 
              onClick={() => setViewMode('kitchen')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'kitchen' ? 'bg-zinc-900 text-white shadow-sm font-bold' : 'text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              KDS Bếp
            </button>
            <button 
              onClick={() => setViewMode('customer')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'customer' ? 'bg-zinc-900 text-white shadow-sm font-bold' : 'text-zinc-700 hover:bg-zinc-200/50'
              }`}
            >
              Khách hàng
            </button>
          </div>
        </div>
      </header>

      {/* Main Sandbox Workspace Layout */}
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
        
        {/* Playful Simulation Sandbox Helper panel */}
        <section className="lg:col-span-1 bg-white border border-zinc-200 rounded-2xl p-4 space-y-4 h-fit select-none shadow-sm">
          <div className="flex items-center gap-2 text-zinc-900 border-b border-zinc-100 pb-3">
            <Sparkles className="w-4 h-4 text-zinc-600 fill-zinc-100" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">Giả Lập Hệ Thống</h2>
          </div>

          {/* Quick preset changer config templates */}
          <div className="space-y-2">
            <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">Chọn Kiểu Quán</span>
            <div className="grid grid-cols-1 gap-1.5">
              <button 
                onClick={() => setTenantConfig(prev => ({ ...prev, industry: 'quan_an', shopName: 'Phở Kinh Kỳ' }))}
                className={`py-2 px-3 rounded-xl border text-[11px] font-medium transition-all cursor-pointer flex items-center justify-between ${
                  tenantConfig.industry === 'quan_an'
                    ? 'border-zinc-900 bg-zinc-950 text-white shadow-sm'
                    : 'border-zinc-250 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span>🍜 Phở Kinh Kỳ</span>
                {tenantConfig.industry === 'quan_an' && <span className="text-[9px] bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono">Đang chạy</span>}
              </button>
              <button 
                onClick={() => setTenantConfig(prev => ({ ...prev, industry: 'quan_cafe', shopName: 'Cà Phê Cổ Đô' }))}
                className={`py-2 px-3 rounded-xl border text-[11px] font-medium transition-all cursor-pointer flex items-center justify-between ${
                  tenantConfig.industry === 'quan_cafe'
                    ? 'border-zinc-900 bg-zinc-950 text-white shadow-sm'
                    : 'border-zinc-250 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span>☕ Cà Phê Cổ Đô</span>
                {tenantConfig.industry === 'quan_cafe' && <span className="text-[9px] bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono">Đang chạy</span>}
              </button>
              <button 
                onClick={() => setTenantConfig(prev => ({ ...prev, industry: 'nha_hang', shopName: 'Nhà Hàng Lá Đỏ' }))}
                className={`py-2 px-3 rounded-xl border text-[11px] font-medium transition-all cursor-pointer flex items-center justify-between ${
                  tenantConfig.industry === 'nha_hang'
                    ? 'border-zinc-900 bg-zinc-950 text-white shadow-sm'
                    : 'border-zinc-250 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <span>🍻 Nhà Hàng Lá Đỏ</span>
                {tenantConfig.industry === 'nha_hang' && <span className="text-[9px] bg-zinc-800 text-zinc-200 px-1.5 py-0.5 rounded font-mono">Đang chạy</span>}
              </button>
            </div>
          </div>

          {/* Connected Flow Guide Step Status */}
          <div className="bg-zinc-50 rounded-xl p-3 space-y-1 text-[11px] text-zinc-600 leading-normal border border-zinc-100">
            <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">Quản lý đồng bộ</span>
            {orders.length === 0 ? (
              <p>Chưa có đơn hàng nào phát sinh. Hãy thử chạm bàn giả lập góc dưới để thử nghiệm.</p>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-zinc-900">
                  Có {orders.length} hóa đơn đang đồng bộ.
                </p>
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {orders.map((o) => (
                    <span key={o.id} className="text-[9px] font-semibold bg-zinc-200/60 px-1.5 py-0.5 rounded text-zinc-850">
                      Bàn {o.tableId} ({o.status === 'pending' ? 'Chờ' : o.status === 'cooking' ? 'Nấu' : o.status === 'ready' ? 'Bưng' : 'Paid'})
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Action pushes */}
          <div className="space-y-2 border-t border-zinc-100 pt-3 text-[10px]">
            <span className="text-[9px] uppercase tracking-wider text-zinc-400 font-bold block">Tạo đơn giả lập nhanh</span>
            
            <button 
              onClick={triggerAutoOrderSimulation}
              className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-2 rounded-xl font-medium flex items-center justify-center gap-1.5 shadow-sm transition-all text-xs cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" /> Khách bàn mới chọn món (QR)
            </button>
            
            <button 
              onClick={handleClearAllOrders}
              className="w-full bg-zinc-100 hover:bg-zinc-200 text-zinc-800 py-2 rounded-xl font-medium block text-center border border-zinc-250 cursor-pointer text-xs active:scale-98"
            >
              Dọn sạch bàn trống (Clear)
            </button>
          </div>
        </section>

        {/* Synced Phone Simulator Display (Focused view) */}
        <section className="lg:col-span-3 grid grid-cols-1 max-w-md mx-auto w-full">
          
          {/* ACTOR SOLO: ALL IN ONE */}
          {viewMode === 'solo' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold px-1 select-none">
                <Sparkles className="w-4 h-4 text-orange-500 animate-pulse" />
                <span className="text-orange-600 font-extrabold uppercase">⚡ CHỦ TOÀN NĂNG (3-in-1 Solo Mode)</span>
              </div>
              <PhoneSimulator 
                actorName="Solo" 
                actorColor="#ea580c" 
                onboardStatus={soloOnboarded ? 'All-In-One' : 'Setup Onboarding'}
              >
                <SoloOperatorView 
                  tenantConfig={tenantConfig}
                  setTenantConfig={setTenantConfig}
                  tables={tables}
                  orders={orders}
                  setOrders={setOrders}
                  menuItems={menuItems}
                  setMenuItems={setMenuItems}
                  loyaltyMembers={loyaltyMembers}
                  setLoyaltyMembers={setLoyaltyMembers}
                  onboardCompleted={soloOnboarded}
                  setOnboardCompleted={setSoloOnboarded}
                />
              </PhoneSimulator>
            </div>
          )}

          {/* ACTOR 1: OWNER */}
          {viewMode === 'owner' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold px-1 select-none">
                <Building className="w-4 h-4 text-orange-500" />
                <span>1. CHỦ QUÁN (OWNER)</span>
              </div>
              <PhoneSimulator 
                actorName="Owner" 
                actorColor="#f97316" 
                onboardStatus={ownerOnboarded ? 'Dashboard Active' : 'Setup Onboarding'}
              >
                <OwnerView 
                  tenantConfig={tenantConfig}
                  setTenantConfig={setTenantConfig}
                  menuItems={menuItems}
                  setMenuItems={setMenuItems}
                  orders={orders}
                  loyaltyMembers={loyaltyMembers}
                  onTriggerNfcTag={handleOwnerNfcAllocation}
                  onboardCompleted={ownerOnboarded}
                  setOnboardCompleted={setOwnerOnboarded}
                  setViewMode={setViewMode}
                  setSimulationTableId={setSimulationTableId}
                  tables={tables}
                  setTables={setTables}
                />
              </PhoneSimulator>
            </div>
          )}

          {/* ACTOR 2: CASHIER */}
          {viewMode === 'cashier' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold px-1 select-none">
                <Wallet className="w-4 h-4 text-blue-400" />
                <span>2. THU NGÂN (CASHIER)</span>
              </div>
              <PhoneSimulator 
                actorName="Cashier" 
                actorColor="#3b82f6" 
                onboardStatus={cashierOnboarded ? 'Live Active' : 'Enter PIN'}
              >
                <CashierView 
                  tenantConfig={tenantConfig}
                  tables={tables}
                  orders={orders}
                  setOrders={setOrders}
                  loyaltyMembers={loyaltyMembers}
                  setLoyaltyMembers={setLoyaltyMembers}
                />
              </PhoneSimulator>
            </div>
          )}

          {/* ACTOR 3: KITCHEN STAFF (KDS) */}
          {viewMode === 'kitchen' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold px-1 select-none">
                <ChefHat className="w-4 h-4 text-amber-500" />
                <span>3. NHÀ BẾP (KITCHEN display)</span>
              </div>
              <PhoneSimulator 
                actorName="Kitchen" 
                actorColor="#f59e0b" 
                onboardStatus={kitchenOnboarded ? 'Active Queue' : 'Kitchen SignIn'}
              >
                <KitchenView 
                  tenantConfig={tenantConfig}
                  orders={orders}
                  setOrders={setOrders}
                  menuItems={menuItems}
                  setMenuItems={setMenuItems}
                  onboardCompleted={kitchenOnboarded}
                  setOnboardCompleted={setKitchenOnboarded}
                  tables={tables}
                />
              </PhoneSimulator>
            </div>
          )}

          {/* ACTOR 4: CUSTOMER APP */}
          {viewMode === 'customer' && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs font-semibold px-1 select-none">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>4. KHÁCH HÀNG (CUSTOMER)</span>
              </div>
              <PhoneSimulator 
                actorName="Customer" 
                actorColor="#10b981" 
                onboardStatus="Contactless Client"
                nfcActive={nfcTriggeredAlert !== null}
              >
                <div className="flex-1 flex flex-col relative bg-zinc-50">
                  {nfcTriggeredAlert && (
                    <div className="absolute top-0 inset-x-0 bg-emerald-600 text-white p-2 text-center text-[10px] font-bold font-mono tracking-wider z-50 animate-bounce">
                      ⚡ ĐÃ CHẠM GHI NFC CHO BÀN {nfcTriggeredAlert.padStart(2, '0')} THÀNH CÔNG!
                    </div>
                  )}
                  <CustomerView 
                    tenantConfig={tenantConfig}
                    menuItems={menuItems}
                    orders={orders}
                    setOrders={setOrders}
                    loyaltyMembers={loyaltyMembers}
                    setLoyaltyMembers={setLoyaltyMembers}
                    simulationTableId={simulationTableId}
                    setSimulationTableId={setSimulationTableId}
                    tables={tables}
                  />
                </div>
              </PhoneSimulator>
            </div>
          )}

        </section>

      </main>

      {/* High impact predictive explanation layer for architectural beauty */}
      <footer className="mt-12 text-center text-[10px] text-zinc-400 font-mono py-6 border-t border-zinc-200/50 select-none">
        ScanGo Lite • Giao diện chuẩn mực iOS & Vận hành tối giản
      </footer>

    </div>
  );
}
