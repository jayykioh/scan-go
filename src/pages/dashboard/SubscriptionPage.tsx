import React from 'react';
import { CreditCard } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TenantConfig } from '../../types';

export default function SubscriptionPage() {
  const [tenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', {} as TenantConfig);
  const currentTier = tenantConfig.pricingTier || 'Free';

  return (
    <div className="p-6 md:p-12 w-full max-w-5xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <CreditCard className="w-8 h-8" />
            Gói Dịch Vụ
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">
            Quản lý gói đăng ký và thanh toán
          </p>
        </div>
      </div>

      <div className="bg-white border-hard shadow-hard p-6 md:p-10 space-y-8">
        <div>
          <h2 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Gói Dịch Vụ ScanGo</h2>
          <p className="text-sm text-zinc-500">
            Nâng cấp để mở khoá tính năng CRM, Khách hàng thân thiết và tích hợp POS chuyên sâu.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 overflow-hidden">
          <div className="bg-white p-6 md:p-8 border-hard flex flex-col items-center text-center shadow-sm relative">
            <h5 className="font-bold text-zinc-900 mb-1 text-lg">Lite (Miễn phí)</h5>
            <div className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider mb-2 border border-orange-200">Dùng thử 7 ngày</div>
            <p className="text-3xl font-bold text-zinc-900 mb-6">0đ<span className="text-sm text-zinc-500 font-normal">/tháng</span></p>
            <ul className="text-sm text-zinc-600 space-y-3 mb-8 flex-1 text-left w-full font-medium">
              <li>✓ Menu điện tử QR</li>
              <li>✓ Tính tiền nhanh</li>
              <li>✓ Quản lý kho cơ bản</li>
            </ul>
            <button className={`w-full py-3 font-bold text-sm uppercase tracking-widest transition-colors ${currentTier === 'Free' || currentTier === 'Lite' ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed' : 'bg-zinc-900 text-white hover:bg-zinc-800'}`}>
              {currentTier === 'Free' || currentTier === 'Lite' ? 'Đang sử dụng' : 'Hạ cấp'}
            </button>
          </div>

          <div className="bg-orange-600 p-6 md:p-8 border-hard flex flex-col items-center text-center shadow-lg relative overflow-hidden">
            <div className="absolute top-4 right-[-32px] bg-zinc-900 text-white text-[10px] font-bold py-1 px-10 rotate-45 uppercase tracking-widest">HOT</div>
            <h5 className="font-bold text-white mb-1 text-lg">Pro</h5>
            <p className="text-3xl font-bold text-white mb-6">199k<span className="text-sm text-orange-200 font-normal">/tháng</span></p>
            <ul className="text-sm text-orange-100 space-y-3 mb-8 flex-1 text-left w-full font-medium">
              <li>✓ Mọi tính năng Lite</li>
              <li>✓ Tích điểm Loyalty</li>
              <li>✓ Gửi SMS Khuyến mãi</li>
              <li>✓ Xuất báo cáo Excel</li>
            </ul>
            <button className={`w-full py-3 font-bold text-sm uppercase tracking-widest transition-colors ${currentTier === 'Pro' ? 'bg-orange-800 text-white cursor-not-allowed border border-orange-700' : 'bg-white text-orange-600 hover:bg-zinc-100 border-hard'}`} onClick={() => currentTier !== 'Pro' && alert('Chức năng thanh toán đang được phát triển!')}>
              {currentTier === 'Pro' ? 'Đang sử dụng' : 'Nâng cấp ngay'}
            </button>
          </div>

          <div className="bg-zinc-900 p-6 md:p-8 border-hard flex flex-col items-center text-center shadow-sm relative">
            <h5 className="font-bold text-white mb-1 text-lg">Enterprise</h5>
            <p className="text-3xl font-bold text-white mb-2">Liên hệ</p>
            <p className="text-[10px] text-orange-400 font-bold mb-4 uppercase tracking-widest">(Đã bao gồm thẻ chạm NFC)</p>
            <ul className="text-sm text-zinc-400 space-y-3 mb-8 flex-1 text-left w-full font-medium">
              <li>✓ Chuỗi cửa hàng</li>
              <li>✓ API tích hợp ERP</li>
              <li>✓ Tuỳ biến giao diện</li>
              <li>✓ Hỗ trợ chuyên biệt</li>
            </ul>
            <button className="w-full py-3 bg-zinc-800 text-white border-hard hover:bg-zinc-700 font-bold text-sm uppercase tracking-widest transition-colors cursor-pointer" onClick={() => alert('Liên hệ hotline: 1900 xxxx')}>
              Nhận tư vấn
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
