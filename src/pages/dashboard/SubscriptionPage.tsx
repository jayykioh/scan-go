import React, { useState } from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useToast } from '../../contexts/ToastContext';
import { Check, Zap, Star, Shield, ArrowRight } from 'lucide-react';

type PlanTier = 'Free' | 'Lite' | 'Pro';

export default function SubscriptionPage() {
  const [currentPlan, setCurrentPlan] = usePersistentState<PlanTier>('scango:subscription:v1', 'Free');
  const toast = useToast();

  const handleUpgrade = (tier: PlanTier) => {
    if (tier === currentPlan) return;
    setCurrentPlan(tier);
    toast.success(`Đã nâng cấp lên gói ${tier}!`);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Gói Cước & Thanh Toán</h1>
        <p className="text-zinc-500 font-medium mt-1">Quản lý gói Subscription của bạn. Hiện tại đang sử dụng gói: <span className="font-bold text-orange-600">{currentPlan}</span></p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Free Plan */}
        <div className={`bg-white border-hard shadow-hard flex flex-col transition-all ${currentPlan === 'Free' ? 'ring-4 ring-zinc-900 ring-offset-2' : 'hover:-translate-y-1'}`}>
          <div className="p-6 border-b border-zinc-100 bg-zinc-50">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-zinc-900">Free</h3>
            <p className="text-zinc-500 text-sm mt-1">Dành cho quán siêu nhỏ</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter">0đ</span>
              <span className="text-zinc-500 font-bold text-sm">/tháng</span>
            </div>
          </div>
          <div className="p-6 flex-1 bg-white">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium">Tối đa 3 bàn / 15 đơn/ngày</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium">QR menu cơ bản</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-medium">Theo dõi trạng thái món real-time</span>
              </li>
              <li className="flex items-start gap-3 opacity-40">
                <Shield className="w-5 h-5 text-zinc-400 shrink-0" />
                <span className="text-sm font-medium line-through">Chống phá đơn NFC</span>
              </li>
              <li className="flex items-start gap-3 opacity-40">
                <Zap className="w-5 h-5 text-zinc-400 shrink-0" />
                <span className="text-sm font-medium line-through">AI phân tích lời/lỗ</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-zinc-100">
            <button 
              onClick={() => handleUpgrade('Free')}
              disabled={currentPlan === 'Free'}
              className={`w-full py-3 font-bold uppercase tracking-widest text-sm transition-colors border-hard ${currentPlan === 'Free' ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-50 text-zinc-900 shadow-sm'}`}
            >
              {currentPlan === 'Free' ? 'Đang sử dụng' : 'Chọn gói Free'}
            </button>
          </div>
        </div>

        {/* Lite Plan */}
        <div className={`bg-white border-hard shadow-hard flex flex-col relative transition-all ${currentPlan === 'Lite' ? 'ring-4 ring-orange-500 ring-offset-2' : 'hover:-translate-y-1'}`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white font-bold text-[10px] uppercase tracking-widest px-3 py-1 shadow-sm">
            Khuyên Dùng
          </div>
          <div className="p-6 border-b border-orange-100 bg-orange-50/50">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-orange-700">Lite</h3>
            <p className="text-orange-600/70 text-sm mt-1">Đầy đủ vận hành tiêu chuẩn</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter text-orange-700">99k</span>
              <span className="text-orange-600/70 font-bold text-sm">/tháng</span>
            </div>
          </div>
          <div className="p-6 flex-1 bg-white">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-bold">Không giới hạn bàn & đơn</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-medium">Chạm NFC Order & thanh toán</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-medium">Phân quyền 3 role (Owner, Thu ngân, Bếp)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-medium">Màn hình Kitchen Display (KDS)</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-bold text-orange-700">AI Rule-based (tính lời/lỗ, auto 86)</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-orange-100 bg-orange-50/30">
            <button 
              onClick={() => handleUpgrade('Lite')}
              disabled={currentPlan === 'Lite'}
              className={`w-full py-3 font-bold uppercase tracking-widest text-sm transition-transform shadow-hard border-hard flex items-center justify-center gap-2 ${currentPlan === 'Lite' ? 'bg-orange-200 text-orange-700 cursor-not-allowed opacity-50' : 'bg-orange-500 hover:bg-orange-600 text-white active:translate-y-1'}`}
            >
              {currentPlan === 'Lite' ? 'Đang sử dụng' : 'Nâng cấp Lite'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Pro Plan */}
        <div className={`bg-zinc-900 border-hard shadow-[8px_8px_0_0_#000] flex flex-col text-white transition-all ${currentPlan === 'Pro' ? 'ring-4 ring-zinc-500 ring-offset-2 ring-offset-zinc-900' : 'hover:-translate-y-1'}`}>
          <div className="p-6 border-b border-zinc-800 bg-zinc-950">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-white flex items-center gap-2">Pro <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" /></h3>
            <p className="text-zinc-400 text-sm mt-1">Trợ lý AI & Quản trị nâng cao</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter">199k</span>
              <span className="text-zinc-500 font-bold text-sm">/tháng</span>
            </div>
          </div>
          <div className="p-6 flex-1 bg-zinc-900">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-yellow-400 shrink-0" />
                <span className="text-sm font-medium">Mọi tính năng của gói Lite</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
                <span className="text-sm font-bold text-yellow-400">AI Chat LLM hỏi-đáp doanh thu</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium">Split Bill (chia tiền)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium">Đổi template ngành linh hoạt</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium">Loyalty: Gợi ý ưu đãi tự động</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-zinc-800">
            <button 
              onClick={() => handleUpgrade('Pro')}
              disabled={currentPlan === 'Pro'}
              className={`w-full py-3 font-bold uppercase tracking-widest text-sm transition-transform shadow-hard border-hard ${currentPlan === 'Pro' ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-100 text-zinc-900 active:translate-y-1'}`}
            >
              {currentPlan === 'Pro' ? 'Đang sử dụng' : 'Nâng cấp Pro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
