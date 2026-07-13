import React from 'react';
import { Link } from 'react-router-dom';
import { useSimulator } from '../layouts/SimulatorLayout';
import { RefreshCw, Sparkles, Building, Wallet, ChefHat, Smartphone, Settings, ArrowLeft } from 'lucide-react';

export default function SimulatorIndex() {
  const { tenantConfig, setTenantConfig, handleResetSim } = useSimulator();

  return (
    <div className="min-h-dvh bg-noise text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn">
      
      {/* Header */}
      <header className="bg-white border-b border-hard px-4 sm:px-6 py-3 flex justify-between items-center z-10 select-none">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard shadow-hard cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all group">
            <ArrowLeft className="w-5 h-5 text-white group-hover:-translate-x-1 transition-transform" />
          </Link>
          <div>
            <h1 className="text-sm font-bold text-zinc-900 tracking-tight leading-none uppercase font-mono">ScanGo_</h1>
            <p className="text-[10px] text-zinc-500 font-bold mt-0.5 font-mono uppercase tracking-widest">{tenantConfig.shopName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleResetSim}
          aria-label="Khôi phục dữ liệu demo"
          className="px-4 py-2 text-xs font-bold font-mono text-zinc-900 bg-white hover:bg-zinc-100 border-hard shadow-hard flex items-center gap-1.5 transition-all cursor-pointer hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none uppercase tracking-widest"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Reset State</span>
        </button>
      </header>

      {/* Hero + Role Cards */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16 relative">
        <div className="max-w-5xl w-full space-y-12 relative z-10">
          
          {/* Hero text */}
          <div className="text-center space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-950 text-white font-mono text-[10px] font-bold uppercase tracking-widest border-hard shadow-hard">
              <span className="w-1.5 h-1.5 rounded-none bg-orange-600 animate-pulse" />
              Chọn vai trò mô phỏng
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold text-zinc-900 tracking-tighter uppercase leading-[0.9]">
              {tenantConfig.shopName}
            </h2>
          </div>

          {/* Role Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-0 border-hard bg-zinc-950">
            {/* Solo — featured */}
            <Link
              to="/simulator/solo"
              className="lg:order-3 bg-zinc-950 hover:bg-zinc-900 p-6 flex flex-col gap-4 transition-colors cursor-pointer border-b md:border-b-0 md:border-r border-hard min-h-[160px] group"
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 bg-orange-600 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-[9px] bg-white text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">3-IN-1</span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-orange-500 uppercase tracking-wider">Chủ Toàn Năng</p>
                <p className="text-base font-bold text-white mt-0.5 uppercase tracking-tight">Solo Operator</p>
                <p className="font-mono text-[10px] text-zinc-400 mt-2 tracking-widest uppercase">Đặt + Nấu + Thu tiền</p>
              </div>
            </Link>

            {/* Owner */}
            <Link
              to="/simulator/owner"
              className="lg:order-1 bg-white hover:bg-zinc-50 p-6 flex flex-col gap-4 transition-colors cursor-pointer border-b md:border-b-0 md:border-r border-hard group min-h-[160px]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                  <Building className="w-5 h-5 text-white" />
                </div>
                <span className="text-[9px] bg-zinc-100 text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">OWNER</span>
              </div>
              <div>
                <p className="text-base font-bold text-zinc-900 uppercase tracking-tight">Chủ Quán</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-2 tracking-widest uppercase">Báo cáo & Menu</p>
              </div>
            </Link>

            {/* Cashier */}
            <Link
              to="/simulator/cashier"
              className="lg:order-2 bg-white hover:bg-zinc-50 p-6 flex flex-col gap-4 transition-colors cursor-pointer border-b md:border-b-0 md:border-r border-hard group min-h-[160px]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
                <span className="text-[9px] bg-zinc-100 text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">CASHIER</span>
              </div>
              <div>
                <p className="text-base font-bold text-zinc-900 uppercase tracking-tight">Thu Ngân</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-2 tracking-widest uppercase">Thanh toán</p>
              </div>
            </Link>

            {/* Kitchen */}
            <Link
              to="/simulator/kitchen"
              className="lg:order-4 bg-white hover:bg-zinc-50 p-6 flex flex-col gap-4 transition-colors cursor-pointer border-b md:border-b-0 md:border-r border-hard group min-h-[160px]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                  <ChefHat className="w-5 h-5 text-white" />
                </div>
                <span className="text-[9px] bg-zinc-100 text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">KITCHEN</span>
              </div>
              <div>
                <p className="text-base font-bold text-zinc-900 uppercase tracking-tight">KDS Bếp</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-2 tracking-widest uppercase">Nhận đơn</p>
              </div>
            </Link>

            {/* Customer */}
            <Link
              to="/simulator/customer"
              className="lg:order-5 bg-white hover:bg-zinc-50 p-6 flex flex-col gap-4 transition-colors cursor-pointer group min-h-[160px]"
            >
              <div className="flex justify-between items-start w-full">
                <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                  <Smartphone className="w-5 h-5 text-white" />
                </div>
                <span className="text-[9px] bg-zinc-100 text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">CUSTOMER</span>
              </div>
              <div>
                <p className="text-base font-bold text-zinc-900 uppercase tracking-tight">Khách Hàng</p>
                <p className="font-mono text-[10px] text-zinc-500 mt-2 tracking-widest uppercase">Quét QR</p>
              </div>
            </Link>
          </div>

          {/* Config section */}
          <div className="max-w-xl mx-auto bg-white border-hard shadow-hard p-6">
            <div className="flex items-center gap-2 mb-6">
              <Settings className="w-5 h-5 text-zinc-900" />
              <span className="font-mono text-xs font-bold text-zinc-900 uppercase tracking-widest">Cấu hình quán</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="font-mono text-[10px] font-bold uppercase text-zinc-500 tracking-widest block" htmlFor="industry-select">Ngành nghề</label>
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
                    setTenantConfig((prev: any) => ({ 
                      ...prev, 
                      industry, 
                      shopName: shopNames[industry] || 'ScanGo Shop' 
                    }));
                  }}
                  className="w-full bg-zinc-50 border-hard rounded-none px-4 py-3 font-mono text-xs text-zinc-900 font-bold focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase"
                >
                  <option value="quan_an">Quán ăn / Phở</option>
                  <option value="quan_cafe">Quán Café</option>
                  <option value="nha_hang">Nhà hàng / Quán nhậu</option>
                  <option value="tiem_banh">Tiệm bánh</option>
                  <option value="tra_sua">Trà sữa Boba</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="font-mono text-[10px] font-bold uppercase text-zinc-500 tracking-widest block" htmlFor="payment-select">Thanh toán</label>
                <select
                  id="payment-select"
                  value={tenantConfig.paymentMode}
                  onChange={(e) => setTenantConfig((prev: any) => ({ ...prev, paymentMode: e.target.value as any }))}
                  className="w-full bg-zinc-50 border-hard rounded-none px-4 py-3 font-mono text-xs text-zinc-900 font-bold focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase"
                >
                  <option value="Pay-Later">Trả sau (Ăn xong tính)</option>
                  <option value="Pay-First">Trả trước (Thanh toán để nấu)</option>
                </select>
              </div>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}
