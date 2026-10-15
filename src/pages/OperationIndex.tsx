import React from 'react';
import { Link } from 'react-router-dom';
import { useOperation } from '../layouts/OperationLayout';
import { Wallet, ChefHat, Smartphone, ArrowLeft, Users } from 'lucide-react';

const PAGES = [
  {
    to: '/operation/cashier',
    label: 'Thu Ngân',
    hint: 'Sơ đồ bàn & thu tiền',
    tag: 'CASHIER',
    icon: Wallet,
    tone: 'text-blue-600',
  },
  {
    to: '/operation/kitchen',
    label: 'KDS Bếp',
    hint: 'Nhận đơn theo bàn',
    tag: 'KITCHEN',
    icon: ChefHat,
    tone: 'text-amber-600',
  },
  {
    to: '/operation/staff',
    label: 'Nhân Viên',
    hint: 'Lên món theo khu',
    tag: 'STAFF',
    icon: Users,
    tone: 'text-[#155BD0]',
  },
  {
    to: '/operation/customer',
    label: 'Khách Hàng',
    hint: 'Quét QR gọi món',
    tag: 'CUSTOMER',
    icon: Smartphone,
    tone: 'text-emerald-600',
  },
];

export default function OperationIndex() {
  const { tenantConfig } = useOperation();

  return (
    <div className="min-h-dvh bg-noise text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn">
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
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Vận hành</span>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-16 relative">
        <div className="max-w-5xl w-full space-y-12 relative z-10">
          <div className="text-center space-y-4">
            <span className="inline-flex items-center gap-2 px-3 py-1 bg-zinc-950 text-white font-mono text-[10px] font-bold uppercase tracking-widest border-hard shadow-hard">
              <span className="w-1.5 h-1.5 rounded-none bg-orange-600 animate-pulse" />
              Chọn trang vận hành
            </span>
            <h2 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold text-zinc-900 tracking-tighter uppercase leading-[0.9]">
              {tenantConfig.shopName}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border-hard bg-zinc-950">
            {PAGES.map((page) => {
              const Icon = page.icon;
              return (
                <Link
                  key={page.to}
                  to={page.to}
                  className="bg-white hover:bg-zinc-50 p-6 flex flex-col gap-4 transition-colors cursor-pointer border-b sm:border-b-0 sm:border-r border-hard min-h-[160px] group last:border-r-0"
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="w-10 h-10 bg-zinc-950 flex items-center justify-center border-hard group-hover:-translate-y-1 transition-transform">
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-[9px] bg-zinc-100 text-zinc-900 px-2 py-0.5 font-bold tracking-wider uppercase border-hard">{page.tag}</span>
                  </div>
                  <div>
                    <p className="text-base font-bold text-zinc-900 uppercase tracking-tight">{page.label}</p>
                    <p className={`font-mono text-[10px] mt-2 tracking-widest uppercase ${page.tone}`}>{page.hint}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
