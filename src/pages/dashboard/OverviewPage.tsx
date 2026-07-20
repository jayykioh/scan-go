import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TrendingUp, DollarSign, Users, ShoppingBag, CreditCard, Flame } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { IndustryTemplate } from '../../types';
import { INDUSTRY_TEMPLATES } from '../../mockData';

export default function OverviewPage() {
  const [industry] = usePersistentState('scango:industry:v1', 'quan_an');
  const template = INDUSTRY_TEMPLATES[industry] || INDUSTRY_TEMPLATES['quan_an'];
  const [currentPlan] = usePersistentState('scango:subscription:v1', 'Free');

  // Mock data for the dashboard
  const todayRevenue = 1250000;
  const yesterdayRevenue = 980000;
  const totalOrders = 45;
  const activeCustomers = 12;

  const topItems = [
    { name: 'Phở Bò Tái Lăn Kinh Kỳ', qty: 15, rev: 975000 },
    { name: 'Cà Phê Muối Kinh Kỳ', qty: 12, rev: 420000 },
    { name: 'Bánh Ngọt Croissant', qty: 8, rev: 280000 },
  ];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Tổng quan Kinh doanh</h1>
          <p className="text-zinc-500 font-medium mt-1">Số liệu trực tiếp ngày hôm nay.</p>
        </div>
        <Link 
          to="/simulator" 
          className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 font-bold text-sm uppercase tracking-widest shadow-hard border-hard transition-transform active:translate-y-1 flex items-center gap-2"
        >
          Mở Máy Trạm (Simulator) <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 border-hard shadow-[4px_4px_0_0_#f97316]">
          <div className="flex items-center gap-3 text-orange-600 mb-2">
            <DollarSign className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Doanh thu nay</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter">{todayRevenue.toLocaleString()}đ</div>
          <div className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> +27.5% so với hôm qua
          </div>
        </div>

        <div className="bg-white p-6 border-hard shadow-sm">
          <div className="flex items-center gap-3 text-zinc-500 mb-2">
            <ShoppingBag className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Số đơn</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter">{totalOrders}</div>
        </div>

        <div className="bg-white p-6 border-hard shadow-sm">
          <div className="flex items-center gap-3 text-zinc-500 mb-2">
            <Users className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Khách mua</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter">{activeCustomers}</div>
        </div>

        <div className="bg-white p-6 border-hard shadow-sm bg-zinc-50">
          <div className="flex items-center gap-3 text-zinc-500 mb-2">
            <CreditCard className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Gói dịch vụ</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter text-zinc-900">{currentPlan}</div>
          <Link to="/dashboard/subscription" className="text-xs font-bold text-orange-600 mt-2 inline-block hover:underline">
            Quản lý gói
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Revenue Chart Placeholder */}
        <div className="md:col-span-2 bg-white border-hard shadow-hard flex flex-col">
          <div className="p-5 border-b border-zinc-100 flex justify-between items-center">
            <h3 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Biểu đồ Doanh Thu</h3>
            <span className="text-xs font-bold px-2 py-1 bg-zinc-100 text-zinc-600 border border-zinc-200">7 ngày qua</span>
          </div>
          <div className="flex-1 p-6 flex flex-col items-center justify-center min-h-[300px] relative">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
            
            {/* Mock bars */}
            <div className="w-full h-full flex items-end justify-between gap-2 z-10 px-4">
              {[40, 60, 35, 80, 50, 90, 75].map((height, i) => (
                <div key={i} className="w-full bg-orange-100 border border-orange-200 relative group flex justify-center" style={{ height: `${height}%` }}>
                  <div className="absolute -top-8 opacity-0 group-hover:opacity-100 bg-zinc-900 text-white text-[10px] font-bold px-2 py-1 rounded transition-opacity whitespace-nowrap">
                    {Math.floor(height * 20000)}đ
                  </div>
                  {/* Highlight today */}
                  {i === 6 && <div className="absolute inset-0 bg-orange-500"></div>}
                </div>
              ))}
            </div>
            
            <div className="w-full border-t-2 border-zinc-900 mt-2 flex justify-between px-4 pt-2 text-[10px] font-bold text-zinc-400 uppercase">
              <span>T2</span><span>T3</span><span>T4</span><span>T5</span><span>T6</span><span>T7</span><span className="text-zinc-900">CN</span>
            </div>
          </div>
        </div>

        {/* Top items */}
        <div className="bg-white border-hard shadow-hard flex flex-col">
          <div className="p-5 border-b border-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Món Bán Chạy</h3>
          </div>
          <div className="p-0">
            {topItems.map((item, i) => (
              <div key={i} className="p-4 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors flex justify-between items-center">
                <div>
                  <div className="font-bold text-sm text-zinc-900 truncate max-w-[150px]">{item.name}</div>
                  <div className="text-xs text-zinc-500 font-medium">{item.qty} lượt gọi</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-emerald-600">{item.rev.toLocaleString()}đ</div>
                </div>
              </div>
            ))}
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 mt-auto">
            {currentPlan === 'Free' ? (
              <Link to="/dashboard/subscription" className="w-full block text-center py-2 bg-zinc-200 text-zinc-500 font-bold text-xs uppercase tracking-widest cursor-pointer hover:bg-orange-100 hover:text-orange-700 transition-colors">
                Nâng cấp AI báo cáo
              </Link>
            ) : (
              <button className="w-full py-2 bg-orange-100 text-orange-700 font-bold text-xs uppercase tracking-widest cursor-pointer hover:bg-orange-200 transition-colors">
                Xem AI Báo Cáo
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
