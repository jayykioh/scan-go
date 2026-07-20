import React from 'react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useToast } from '../../contexts/ToastContext';
import { Check, Zap, Star, Shield, ArrowRight, CreditCard } from 'lucide-react';
import { TenantConfig } from '../../types';

export default function SubscriptionPage() {
  // Sync with tenant config so that Settings and Subscription use the same source of truth
  const [tenantConfig, setTenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', {} as TenantConfig);
  const currentPlan = tenantConfig.pricingTier || 'Lite';
  const toast = useToast();

  const handleUpgrade = (tier: 'Lite' | 'Pro' | 'Enterprise') => {
    if (tier === currentPlan) return;
    if (tier === 'Enterprise') {
      alert('Vui lòng liên hệ 1900 xxxx để nhận tư vấn gói Enterprise.');
      return;
    }
    setTenantConfig(prev => ({ ...prev, pricingTier: tier }));
    toast.success(`Đã thay đổi sang gói ${tier}!`);
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase flex items-center gap-3">
            <CreditCard className="w-8 h-8" />
            Gói Cước & Thanh Toán
          </h1>
          <p className="font-mono text-zinc-500 font-medium text-xs uppercase tracking-widest mt-2">
            Quản lý gói đăng ký của bạn. Đang dùng: <span className="font-bold text-orange-600">{currentPlan}</span>
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Lite Plan */}
        <div className={`bg-white border-hard shadow-hard flex flex-col transition-all ${currentPlan === 'Lite' ? 'ring-4 ring-zinc-900 ring-offset-2' : 'hover:-translate-y-1'}`}>
          <div className="p-6 border-b border-zinc-100 bg-zinc-50">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-zinc-900">Lite</h3>
            <p className="text-zinc-500 text-sm mt-1">Dành cho quán siêu nhỏ</p>
            <div className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider mt-2 border border-orange-200 inline-block">Dùng thử 7 ngày</div>
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
                <span className="text-sm font-medium line-through">Chạm NFC Order & thanh toán</span>
              </li>
              <li className="flex items-start gap-3 opacity-40">
                <Zap className="w-5 h-5 text-zinc-400 shrink-0" />
                <span className="text-sm font-medium line-through">AI phân tích lời/lỗ</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-zinc-100">
            <button
              onClick={() => handleUpgrade('Lite')}
              disabled={currentPlan === 'Lite'}
              className={`w-full py-3 font-bold uppercase tracking-widest text-sm transition-colors border-hard ${currentPlan === 'Lite' ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed' : 'bg-white hover:bg-zinc-50 text-zinc-900 shadow-sm'}`}
            >
              {currentPlan === 'Lite' ? 'Đang sử dụng' : 'Hạ cấp Lite'}
            </button>
          </div>
        </div>

        {/* Pro Plan */}
        <div className={`bg-white border-hard shadow-hard flex flex-col relative transition-all ${currentPlan === 'Pro' ? 'ring-4 ring-orange-500 ring-offset-2' : 'hover:-translate-y-1'}`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white font-bold text-[10px] uppercase tracking-widest px-3 py-1 shadow-sm">
            Khuyên Dùng
          </div>
          <div className="p-6 border-b border-orange-100 bg-orange-50/50">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-orange-700">Pro</h3>
            <p className="text-orange-600/70 text-sm mt-1">Đầy đủ vận hành tiêu chuẩn</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter text-orange-700">199k</span>
              <span className="text-orange-600/70 font-bold text-sm">/tháng</span>
            </div>
          </div>
          <div className="p-6 flex-1 bg-white">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-bold">Mọi tính năng của gói Lite</span>
              </li>
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
                <span className="text-sm font-medium">Màn hình Kitchen Display (KDS)</span>
              </li>
              <li className="flex items-start gap-3">
                <Zap className="w-5 h-5 text-orange-500 shrink-0" />
                <span className="text-sm font-bold text-orange-700">AI Rule-based & LLM hỏi-đáp</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-orange-100 bg-orange-50/30">
            <button
              onClick={() => handleUpgrade('Pro')}
              disabled={currentPlan === 'Pro'}
              className={`w-full py-3 font-bold uppercase tracking-widest text-sm transition-transform shadow-hard border-hard flex items-center justify-center gap-2 ${currentPlan === 'Pro' ? 'bg-orange-200 text-orange-700 cursor-not-allowed opacity-50' : 'bg-orange-500 hover:bg-orange-600 text-white active:translate-y-1'}`}
            >
              {currentPlan === 'Pro' ? 'Đang sử dụng' : 'Nâng cấp Pro'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className={`bg-zinc-900 border-hard shadow-[8px_8px_0_0_#000] flex flex-col text-white transition-all ${currentPlan === 'Enterprise' ? 'ring-4 ring-zinc-500 ring-offset-2 ring-offset-zinc-900' : 'hover:-translate-y-1'}`}>
          <div className="p-6 border-b border-zinc-800 bg-zinc-950">
            <h3 className="text-2xl font-bold uppercase tracking-tight text-white flex items-center gap-2">Enterprise <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" /></h3>
            <p className="text-zinc-400 text-sm mt-1">Trợ lý AI & Quản trị nâng cao</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter">Liên hệ</span>
            </div>
            <p className="text-[10px] text-orange-400 font-bold mt-2 uppercase tracking-widest">(Đã bao gồm thiết bị thẻ chạm NFC)</p>
          </div>
          <div className="p-6 flex-1 bg-zinc-900">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-yellow-400 shrink-0" />
                <span className="text-sm font-medium">Mọi tính năng của gói Pro</span>
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
              <li className="flex items-start gap-3">
                <Check className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-sm font-medium">API tích hợp ERP & Chuỗi</span>
              </li>
            </ul>
          </div>
          <div className="p-6 border-t border-zinc-800">
            <button
              onClick={() => handleUpgrade('Enterprise')}
              className="w-full py-3 font-bold uppercase tracking-widest text-sm transition-transform shadow-hard border-hard bg-white hover:bg-zinc-100 text-zinc-900 active:translate-y-1"
            >
              Nhận tư vấn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
