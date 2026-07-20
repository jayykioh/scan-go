import React, { useState } from 'react';
import { Settings, Save, BadgePercent } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TenantConfig } from '../../types';
import { INDUSTRY_TEMPLATES } from '../../mockData';
import { useToast } from '../../contexts/ToastContext';

const defaultTenant: TenantConfig = {
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
};

export default function SettingsPage() {
  const [tenantConfig, setTenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', defaultTenant);
  const [draft, setDraft] = useState<TenantConfig>(tenantConfig);
  const toast = useToast();

  const updateDraft = <K extends keyof TenantConfig>(key: K, value: TenantConfig[K]) => {
    setDraft(prev => ({ ...prev, [key]: value }));
  };

  const handleIndustryChange = (industry: TenantConfig['industry']) => {
    const template = INDUSTRY_TEMPLATES[industry];
    setDraft(prev => ({
      ...prev,
      industry,
      paymentMode: template?.default_payment_mode || prev.paymentMode,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized: TenantConfig = {
      ...draft,
      shopName: draft.shopName.trim() || 'ScanGo Shop',
      loyaltyRate: Math.max(1, Number(draft.loyaltyRate) || 1),
      loyaltyEnabled: draft.pricingTier !== 'Lite' && draft.loyaltyEnabled,
      discountCode: draft.discountCode?.trim().toUpperCase() || 'SCANGO',
      discountMinItems: Math.max(1, Number(draft.discountMinItems) || 1),
      discountMinAmount: Math.max(0, Number(draft.discountMinAmount) || 0),
      discountAmount: Math.max(0, Number(draft.discountAmount) || 0),
      onboardingStep: 4,
    };
    setTenantConfig(normalized);
    setDraft(normalized);
    toast.success('Đã lưu cấu hình cửa hàng');
  };

  return (
    <div className="p-6 md:p-12 w-full max-w-4xl mx-auto animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
            <Settings className="w-8 h-8" />
            Cấu hình
          </h1>
          <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">Thiết lập thông tin cửa hàng, gói và loyalty</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white border-hard shadow-hard p-6 md:p-10 space-y-8">
        <section className="space-y-5">
          <div>
            <h2 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Thông tin vận hành</h2>
            <p className="text-sm text-zinc-500">Các giá trị này đồng bộ với dashboard và simulator.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3 md:col-span-2">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Tên cửa hàng</label>
              <input type="text" value={draft.shopName} onChange={e => updateDraft('shopName', e.target.value)} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors uppercase tracking-tight" />
            </div>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Loại hình kinh doanh</label>
              <select value={draft.industry} onChange={e => handleIndustryChange(e.target.value as TenantConfig['industry'])} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase">
                <option value="quan_an">Quán ăn / Phở</option>
                <option value="quan_cafe">Quán Café</option>
                <option value="nha_hang">Nhà hàng / Quán nhậu</option>
                <option value="tiem_banh">Tiệm bánh</option>
                <option value="tra_sua">Trà sữa Boba</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Gói sản phẩm</label>
              <select value={draft.pricingTier} onChange={e => updateDraft('pricingTier', e.target.value as TenantConfig['pricingTier'])} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase">
                <option value="Lite">Lite</option>
                <option value="Pro">Pro</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </section>

        <section className="space-y-5 pt-6 border-t border-hard">
          <h2 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Thanh toán</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['Pay-Later', 'Pay-First'] as const).map(mode => (
              <label key={mode} className={`flex items-center gap-3 p-4 border-hard cursor-pointer transition-colors ${draft.paymentMode === mode ? 'bg-orange-50' : 'hover:bg-zinc-50'}`}>
                <input type="radio" name="paymentType" checked={draft.paymentMode === mode} onChange={() => updateDraft('paymentMode', mode)} className="w-4 h-4 accent-orange-600" />
                <span className="font-mono text-xs font-bold uppercase tracking-widest">{mode === 'Pay-Later' ? 'Trả sau (Ăn xong tính)' : 'Trả trước (Thanh toán để nấu)'}</span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-5 pt-6 border-t border-hard">
          <div className="flex items-center gap-2">
            <BadgePercent className="w-5 h-5 text-orange-600" />
            <h2 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Loyalty & ưu đãi</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50 md:col-span-2">
              <input type="checkbox" checked={draft.loyaltyEnabled} disabled={draft.pricingTier === 'Lite'} onChange={e => updateDraft('loyaltyEnabled', e.target.checked)} className="w-4 h-4 accent-orange-600" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest">Bật tích điểm hội viên {draft.pricingTier === 'Lite' ? '(không khả dụng ở Lite)' : ''}</span>
            </label>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Điểm mỗi 10.000đ</label>
              <input type="number" min={1} value={draft.loyaltyRate} onChange={e => updateDraft('loyaltyRate', Number(e.target.value))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600" />
            </div>

            <label className="flex items-center gap-3 p-4 border-hard cursor-pointer hover:bg-zinc-50 self-end">
              <input type="checkbox" checked={draft.discountEnabled !== false} onChange={e => updateDraft('discountEnabled', e.target.checked)} className="w-4 h-4 accent-orange-600" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest">Bật mã ưu đãi</span>
            </label>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Mã ưu đãi</label>
              <input type="text" value={draft.discountCode || ''} onChange={e => updateDraft('discountCode', e.target.value)} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 uppercase" />
            </div>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Cách áp dụng</label>
              <select value={draft.discountTriggerType || 'auto'} onChange={e => updateDraft('discountTriggerType', e.target.value as TenantConfig['discountTriggerType'])} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 uppercase">
                <option value="auto">Tự động</option>
                <option value="manual">Khách nhập mã</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Điều kiện</label>
              <select value={draft.discountConditionType || 'quantity'} onChange={e => updateDraft('discountConditionType', e.target.value as TenantConfig['discountConditionType'])} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 uppercase">
                <option value="quantity">Số món</option>
                <option value="amount">Số tiền</option>
                <option value="both">Cả hai</option>
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:col-span-2">
              <div className="space-y-3">
                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Tối thiểu món</label>
                <input type="number" min={1} value={draft.discountMinItems || 1} onChange={e => updateDraft('discountMinItems', Number(e.target.value))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600" />
              </div>
              <div className="space-y-3">
                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Tối thiểu tiền</label>
                <input type="number" min={0} step={1000} value={draft.discountMinAmount || 0} onChange={e => updateDraft('discountMinAmount', Number(e.target.value))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600" />
              </div>
              <div className="space-y-3">
                <label className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Số tiền giảm</label>
                <input type="number" min={0} step={1000} value={draft.discountAmount || 0} onChange={e => updateDraft('discountAmount', Number(e.target.value))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600" />
              </div>
            </div>
          </div>
        </section>

        <div className="pt-4">
          <button type="submit" className="w-full bg-zinc-950 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-4 border-hard shadow-hard flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer">
            <Save className="w-4 h-4" />
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  );
}
