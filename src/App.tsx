import React, { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig } from './types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS, INDUSTRY_TEMPLATES } from './mockData';
import PhoneSimulator from './components/PhoneSimulator';
import { usePersistentState } from './hooks/usePersistentState';
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

const OwnerView = lazy(() => import('./components/OwnerView'));
const CashierView = lazy(() => import('./components/CashierView'));
const KitchenView = lazy(() => import('./components/KitchenView'));
const CustomerView = lazy(() => import('./components/CustomerView'));
const SoloOperatorView = lazy(() => import('./components/SoloOperatorView'));

function RoleLoading() {
  return (
    <div className="mx-auto flex aspect-[9/18.5] w-full max-w-[370px] items-center justify-center rounded-[48px] border-8 border-zinc-900 bg-white shadow-xl" role="status">
      <div className="text-center">
        <span className="mx-auto block size-7 animate-spin rounded-full border-2 border-zinc-200 border-t-blue-600" aria-hidden="true" />
        <p className="mt-3 text-xs font-semibold text-zinc-600">Đang mở màn hình…</p>
      </div>
    </div>
  );
}

export default function App() {
  // Global shared state
  const [tenantConfig, setTenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', {
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
  const [tables, setTables] = usePersistentState<TableConfig[]>('scango:tables:v1', [
    { id: '1', name: 'Bàn 01' },
    { id: '2', name: 'Bàn 02' },
    { id: '3', name: 'Bàn 03' },
    { id: '4', name: 'Bàn 04' },
    { id: '5', name: 'Bàn 05' },
    { id: '6', name: 'Bàn 06' },
  ]);

  // Track if each actor has done onboarding/signin
  const [ownerOnboarded, setOwnerOnboarded] = usePersistentState('scango:owner-onboarded:v1', true);
  const [soloOnboarded, setSoloOnboarded] = usePersistentState('scango:solo-onboarded:v1', false);
  const [cashierOnboarded, setCashierOnboarded] = usePersistentState('scango:cashier-onboarded:v1', true);
  const [kitchenOnboarded, setKitchenOnboarded] = usePersistentState('scango:kitchen-onboarded:v1', true);

  // Active Menu items matching the selected industry engine template
  const [menuItems, setMenuItems] = usePersistentState<MenuItem[]>('scango:menu:v1', MOCK_MENU_ITEMS.quan_an);

  // Active orders synced across all actors
  const [orders, setOrders] = usePersistentState<Order[]>('scango:orders:v1', [
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
  ], {
    deserialize: (value) => (JSON.parse(value) as Order[]).map((order) => ({
      ...order,
      timestamp: new Date(String(order.timestamp)),
    })),
  });

  // Active loyalty list
  const [loyaltyMembers, setLoyaltyMembers] = usePersistentState<LoyaltyMember[]>('scango:loyalty:v1', MOCK_LOYALTY_MEMBERS);

  // Customer dynamic simulator helper values
  const [simulationTableId, setSimulationTableId] = useState<string>('2');
  const [nfcTriggeredAlert, setNfcTriggeredAlert] = useState<string | null>(null);
  
  // Layout views toggle
  const [viewMode, setViewMode] = useState<'login' | 'owner' | 'cashier' | 'kitchen' | 'customer' | 'grid' | 'solo'>('login');

  const previousIndustry = useRef(tenantConfig.industry);

  // Load a new menu template only when the operator changes industry.
  useEffect(() => {
    if (previousIndustry.current === tenantConfig.industry) return;
    previousIndustry.current = tenantConfig.industry;

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
      discountTriggerType: 'auto',
      discountConditionType: 'quantity',
      discountTargetDishId: 'all',
    });
    setTables([
      { id: '1', name: 'Bàn 01' },
      { id: '2', name: 'Bàn 02' },
      { id: '3', name: 'Bàn 03' },
      { id: '4', name: 'Bàn 04' },
      { id: '5', name: 'Bàn 05' },
      { id: '6', name: 'Bàn 06' },
    ]);
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
    setSimulationTableId('2');
    setNfcTriggeredAlert(null);
  };

  if (viewMode === 'login') {
    return (
      <div className="min-h-dvh bg-white text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn">
        
        {/* Header */}
        <header className="bg-white border-b border-zinc-100 px-4 sm:px-6 py-3 flex justify-between items-center z-10 select-none">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center shadow-sm">
              <Nfc className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-zinc-900 tracking-tight leading-none">ScanGo</h1>
              <p className="text-[10px] text-zinc-400 font-medium mt-0.5">{tenantConfig.shopName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetSim}
            aria-label="Khôi phục dữ liệu demo"
            className="min-h-9 px-3 py-1.5 text-xs font-semibold text-zinc-600 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset Demo</span>
          </button>
        </header>

        {/* Hero + Role Cards */}
        <main id="main-content" className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16">
          <div className="max-w-5xl w-full space-y-8">
            
            {/* Hero text */}
            <div className="text-center space-y-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange-50 border border-orange-100 rounded-full text-[10px] font-bold text-orange-700 uppercase tracking-widest">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                MVP Demo — Chọn vai trò
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight">
                {tenantConfig.shopName}
              </h2>
              <p className="text-sm text-zinc-500 max-w-md mx-auto">
                Hệ thống đặt món QR — không cần thiết bị POS
              </p>
            </div>

            {/* Role Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Solo — featured */}
              <button
                type="button"
                onClick={() => setViewMode('solo')}
                className="lg:order-3 bg-zinc-950 hover:bg-zinc-900 rounded-2xl p-5 text-left flex flex-col gap-3 transition-all cursor-pointer shadow-md border border-zinc-800 min-h-[160px]"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[9px] bg-white/20 text-white px-2 py-0.5 rounded-full font-bold tracking-wider">3-IN-1</span>
                </div>
                <div>
                  <p className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Chủ Toàn Năng</p>
                  <p className="text-base font-bold text-white mt-0.5">Solo Operator</p>
                  <p className="text-[11px] text-white/60 mt-1">Đặt + Nấu + Thu tiền</p>
                </div>
              </button>

              {/* Owner */}
              <button
                type="button"
                onClick={() => setViewMode('owner')}
                className="lg:order-1 bg-white border border-zinc-200 hover:border-orange-300 hover:shadow-md rounded-2xl p-5 text-left flex flex-col gap-3 transition-all cursor-pointer group min-h-[160px]"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center">
                    <Building className="w-5 h-5 text-orange-600" />
                  </div>
                  <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold tracking-wider">OWNER</span>
                </div>
                <div>
                  <p className="text-base font-bold text-zinc-900">Chủ Quán</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Báo cáo, menu, QR bàn</p>
                </div>
              </button>

              {/* Cashier */}
              <button
                type="button"
                onClick={() => setViewMode('cashier')}
                className="lg:order-2 bg-white border border-zinc-200 hover:border-blue-300 hover:shadow-md rounded-2xl p-5 text-left flex flex-col gap-3 transition-all cursor-pointer group min-h-[160px]"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold tracking-wider">CASHIER</span>
                </div>
                <div>
                  <p className="text-base font-bold text-zinc-900">Thu Ngân</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Thanh toán, tích điểm</p>
                </div>
              </button>

              {/* Kitchen */}
              <button
                type="button"
                onClick={() => setViewMode('kitchen')}
                className="lg:order-4 bg-white border border-zinc-200 hover:border-amber-300 hover:shadow-md rounded-2xl p-5 text-left flex flex-col gap-3 transition-all cursor-pointer group min-h-[160px]"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                    <ChefHat className="w-5 h-5 text-amber-600" />
                  </div>
                  <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold tracking-wider">KITCHEN</span>
                </div>
                <div>
                  <p className="text-base font-bold text-zinc-900">KDS Bếp</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Nhận đơn, cập nhật trạng thái</p>
                </div>
              </button>

              {/* Customer */}
              <button
                type="button"
                onClick={() => setViewMode('customer')}
                className="lg:order-5 bg-white border border-zinc-200 hover:border-emerald-300 hover:shadow-md rounded-2xl p-5 text-left flex flex-col gap-3 transition-all cursor-pointer group min-h-[160px]"
              >
                <div className="flex justify-between items-start w-full">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-emerald-600" />
                  </div>
                  <span className="text-[9px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold tracking-wider">CUSTOMER</span>
                </div>
                <div>
                  <p className="text-base font-bold text-zinc-900">Khách Hàng</p>
                  <p className="text-[11px] text-zinc-400 mt-1">Quét QR, gọi món, theo dõi</p>
                </div>
              </button>
            </div>

            {/* Config section */}
            <div className="max-w-xl mx-auto bg-zinc-50 border border-zinc-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="w-4 h-4 text-zinc-400" />
                <span className="text-xs font-bold text-zinc-700 uppercase tracking-wider">Cấu hình quán</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wide block" htmlFor="industry-select">Ngành nghề</label>
                  <select
                    id="industry-select"
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
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 h-10 text-sm text-zinc-900 font-medium focus:outline-none focus:border-zinc-900 cursor-pointer"
                  >
                    <option value="quan_an">Quán ăn / Phở</option>
                    <option value="quan_cafe">Quán Café</option>
                    <option value="nha_hang">Nhà hàng / Quán nhậu</option>
                    <option value="tiem_banh">Tiệm bánh</option>
                    <option value="tra_sua">Trà sữa Boba</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-zinc-500 tracking-wide block" htmlFor="payment-select">Thanh toán</label>
                  <select
                    id="payment-select"
                    value={tenantConfig.paymentMode}
                    onChange={(e) => setTenantConfig(prev => ({ ...prev, paymentMode: e.target.value as any }))}
                    className="w-full bg-white border border-zinc-200 rounded-lg px-3 h-10 text-sm text-zinc-900 font-medium focus:outline-none focus:border-zinc-900 cursor-pointer"
                  >
                    <option value="Pay-Later">Trả sau (ăn xong tính)</option>
                    <option value="Pay-First">Trả trước (thanh toán để nấu)</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        </main>

        <footer className="py-3 text-center border-t border-zinc-100 text-[10px] font-mono text-zinc-400 select-none">
          ScanGo MVP • localStorage demo
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-50/30 text-zinc-800 flex flex-col font-sans antialiased">
      
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
        <div className="w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          <nav aria-label="Chuyển vai trò" className="bg-zinc-100 border border-zinc-200 rounded-xl p-1 flex w-max min-w-full md:min-w-0 gap-0.5">
            <button 
              onClick={() => setViewMode('login')}
              className="px-3 py-1.5 rounded-lg text-zinc-500 hover:bg-white hover:text-zinc-900 font-medium flex items-center gap-1.5 text-xs shrink-0 transition-colors cursor-pointer min-h-[36px]"
              title="Quay lại"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
              Thoát
            </button>
            <button 
              onClick={() => setViewMode('solo')}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer min-h-[36px] ${
                viewMode === 'solo' ? 'bg-zinc-950 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'
              }`}
            >
              Solo
            </button>
            <button 
              onClick={() => setViewMode('owner')}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer min-h-[36px] ${
                viewMode === 'owner' ? 'bg-orange-500 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'
              }`}
            >
              Owner
            </button>
            <button 
              onClick={() => setViewMode('cashier')}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer min-h-[36px] ${
                viewMode === 'cashier' ? 'bg-blue-500 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'
              }`}
            >
              Cashier
            </button>
            <button 
              onClick={() => setViewMode('kitchen')}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer min-h-[36px] ${
                viewMode === 'kitchen' ? 'bg-amber-500 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'
              }`}
            >
              Kitchen
            </button>
            <button 
              onClick={() => setViewMode('customer')}
              className={`px-3 py-1.5 rounded-lg transition-colors text-xs font-semibold cursor-pointer min-h-[36px] ${
                viewMode === 'customer' ? 'bg-emerald-500 text-white shadow-sm' : 'text-zinc-600 hover:bg-white'
              }`}
            >
              Customer
            </button>
          </nav>
        </div>
      </header>

      {/* Main Sandbox Workspace Layout */}
      <main className="flex-1 p-4 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
        
        {/* Simulation Control Panel */}
        <section className="lg:col-span-1 bg-white border border-zinc-200 rounded-2xl p-4 space-y-4 h-fit select-none">
          <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
            <Flame className="w-4 h-4 text-orange-500" />
            <h2 className="text-xs font-bold text-zinc-900">Giả Lập</h2>
          </div>

          {/* Industry preset */}
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block">Kiểu quán</span>
            <div className="grid grid-cols-1 gap-1">
              {[
                { id: 'quan_an', label: 'Quán Phở', name: 'Phở Kinh Kỳ' },
                { id: 'quan_cafe', label: 'Quán Café', name: 'Cà Phê Cổ Đô' },
                { id: 'nha_hang', label: 'Nhà Hàng', name: 'Nhà Hàng Lá Đỏ' },
              ].map(({ id, label, name }) => (
                <button
                  key={id}
                  onClick={() => setTenantConfig(prev => ({ ...prev, industry: id as any, shopName: name }))}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer flex items-center justify-between ${
                    tenantConfig.industry === id
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  <span>{label}</span>
                  {tenantConfig.industry === id && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Order status */}
          <div className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-2">Đơn đang xử lý</span>
            {orders.length === 0 ? (
              <p className="text-xs text-zinc-400">Chưa có đơn nào</p>
            ) : (
              <div className="flex gap-1 flex-wrap">
                {orders.map((o) => (
                  <span key={o.id} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    o.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                    o.status === 'cooking' ? 'bg-orange-100 text-orange-700' :
                    o.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-zinc-100 text-zinc-500'
                  }`}>
                    B{o.tableId}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="space-y-2 pt-1">
            <button 
              onClick={triggerAutoOrderSimulation}
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-white py-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Tạo đơn mới
            </button>
            <button 
              onClick={handleClearAllOrders}
              className="w-full bg-zinc-50 hover:bg-zinc-100 text-zinc-600 py-2.5 rounded-xl font-medium text-xs border border-zinc-200 cursor-pointer transition-colors"
            >
              Xóa tất cả đơn
            </button>
          </div>
        </section>

        {/* Synced Phone Simulator Display (Focused view) */}
        <section className="lg:col-span-3 grid grid-cols-1 max-w-md mx-auto w-full">
          <Suspense fallback={<RoleLoading />}>
          
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
          </Suspense>
        </section>

      </main>

      {/* High impact predictive explanation layer for architectural beauty */}
      <footer className="mt-12 text-center text-[10px] text-zinc-400 font-mono py-6 border-t border-zinc-200/50 select-none">
        ScanGo Lite • Giao diện chuẩn mực iOS & Vận hành tối giản
      </footer>

    </div>
  );
}
