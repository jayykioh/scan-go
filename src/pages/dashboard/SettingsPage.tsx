import React, { useCallback, useEffect, useState } from 'react';
import { Settings, Save, BadgePercent } from 'lucide-react';
import type { ConfigSource, ResolvedConfig } from '@contracts/config.contract';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TenantConfig } from '../../types';
import { INDUSTRY_TEMPLATES } from '../../mockData';
import { useToast } from '../../contexts/ToastContext';
import { isFirebaseConfigured } from '../../data/adapters/auth.adapter';
import {
  getResolvedConfig,
  updateTenantConfig,
} from '../../data/adapters/config.adapter';

const sourceLabel: Record<ConfigSource, string> = {
  default: 'Mặc định',
  admin: 'ADMIN',
  tenant: 'Cửa hàng',
};

const sourceClass: Record<ConfigSource, string> = {
  default: 'bg-zinc-100 text-zinc-600 border-zinc-300',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  tenant: 'bg-orange-50 text-orange-700 border-orange-200',
};

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

  const [configured] = useState(() => isFirebaseConfigured());
  const [resolved, setResolved] = useState<ResolvedConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [draftLocale, setDraftLocale] = useState<'vi' | 'en'>('vi');
  const [draftTimezone, setDraftTimezone] = useState('Asia/Ho_Chi_Minh');
  const [draftPinPolicy, setDraftPinPolicy] = useState({
    length: 6,
    maxFailedAttempts: 5,
    lockMinutes: 15,
    sessionHours: 8,
  });

  const loadResolvedConfig = useCallback(async () => {
    if (!configured) {
      setResolved(null);
      return;
    }
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await getResolvedConfig();
      setResolved(result);
      if (result) {
        setDraftLocale(result.values.locale);
        setDraftTimezone(result.values.timezone);
        setDraftPinPolicy({ ...result.values.pinPolicy });
      }
    } catch (error) {
      setConfigError(
        error instanceof Error ? error.message : 'Không đọc được cấu hình.',
      );
    } finally {
      setConfigLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    void loadResolvedConfig();
  }, [loadResolvedConfig]);

  const handleSaveResolvedConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    try {
      const timezone = draftTimezone.trim();
      const result = await updateTenantConfig({
        locale: draftLocale,
        ...(timezone ? { timezone } : {}),
        pinPolicy: {
          length: Number(draftPinPolicy.length),
          maxFailedAttempts: Number(draftPinPolicy.maxFailedAttempts),
          lockMinutes: Number(draftPinPolicy.lockMinutes),
          sessionHours: Number(draftPinPolicy.sessionHours),
        },
      });
      setResolved(result.resolvedConfig);
      setDraftLocale(result.resolvedConfig.values.locale);
      setDraftTimezone(result.resolvedConfig.values.timezone);
      setDraftPinPolicy({ ...result.resolvedConfig.values.pinPolicy });
      toast.success('Đã lưu cấu hình đã resolve');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không lưu được cấu hình.';
      setConfigError(message);
      toast.error(message);
    } finally {
      setConfigSaving(false);
    }
  };

  const configRows = resolved
    ? [
        { key: 'locale', label: 'Ngôn ngữ', value: resolved.values.locale },
        { key: 'timezone', label: 'Múi giờ', value: resolved.values.timezone },
        {
          key: 'pinPolicy.length',
          label: 'Độ dài PIN',
          value: String(resolved.values.pinPolicy.length),
        },
        {
          key: 'pinPolicy.maxFailedAttempts',
          label: 'Sai PIN tối đa',
          value: String(resolved.values.pinPolicy.maxFailedAttempts),
        },
        {
          key: 'pinPolicy.lockMinutes',
          label: 'Khóa PIN (phút)',
          value: String(resolved.values.pinPolicy.lockMinutes),
        },
        {
          key: 'pinPolicy.sessionHours',
          label: 'Session Staff (giờ)',
          value: String(resolved.values.pinPolicy.sessionHours),
        },
      ]
    : [];

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
        <section className="space-y-5" data-testid="resolved-config">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Cấu hình đã resolve</h2>
              <p className="text-sm text-zinc-500">Đọc trực tiếp từ Firestore. Nguồn của mỗi giá trị được hiển thị.</p>
            </div>
            {resolved && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Contract v{resolved.schemaVersion}
              </span>
            )}
          </div>

          {!configured && (
            <p className="font-mono text-[11px] text-zinc-500 uppercase">Firebase chưa được cấu hình.</p>
          )}

          {configured && configLoading && (
            <p className="font-mono text-[11px] text-zinc-500 uppercase">Đang tải cấu hình...</p>
          )}

          {configError && (
            <p className="font-mono text-[11px] text-red-600 uppercase leading-relaxed">{configError}</p>
          )}

          {resolved && (
            <>
              <ul className="border-hard divide-y divide-zinc-200">
                {configRows.map(row => {
                  const source = resolved.sources[row.key] ?? 'default';
                  return (
                    <li key={row.key} className="flex items-center justify-between gap-3 px-4 py-3">
                      <span className="font-mono text-xs text-zinc-700">{row.label}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-mono text-xs font-bold text-zinc-900 uppercase">{row.value}</span>
                        <span className={`font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border ${sourceClass[source]}`}>
                          {sourceLabel[source]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label htmlFor="resolvedLocale" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Ngôn ngữ (được phép ghi đè)</label>
                  <select id="resolvedLocale" value={draftLocale} disabled={configSaving} onChange={e => setDraftLocale(e.target.value as 'vi' | 'en')} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase disabled:opacity-50">
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label htmlFor="resolvedTimezone" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">Múi giờ (được phép ghi đè)</label>
                  <input id="resolvedTimezone" type="text" value={draftTimezone} disabled={configSaving} onChange={e => setDraftTimezone(e.target.value)} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50" />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {([
                  ['length', 'Độ dài PIN'],
                  ['maxFailedAttempts', 'Sai tối đa'],
                  ['lockMinutes', 'Khóa (phút)'],
                  ['sessionHours', 'Session (giờ)'],
                ] as const).map(([field, label]) => (
                  <div key={field} className="space-y-3">
                    <label htmlFor={`pin-${field}`} className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">{label}</label>
                    <input id={`pin-${field}`} type="number" min={1} value={draftPinPolicy[field]} disabled={configSaving} onChange={e => setDraftPinPolicy(prev => ({ ...prev, [field]: Number(e.target.value) }))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50" />
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleSaveResolvedConfig} disabled={configSaving} className="w-full bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-4 border-hard shadow-hard flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" />
                {configSaving ? 'Đang lưu...' : 'Lưu cấu hình đã resolve'}
              </button>
            </>
          )}
        </section>

        <section className="space-y-5 pt-6 border-t">
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

        <section className="space-y-5 pt-6 border-t ">
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
