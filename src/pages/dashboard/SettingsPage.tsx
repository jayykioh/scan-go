import React, { useCallback, useEffect, useState } from 'react';
import {
  Settings,
  Save,
  BadgePercent,
  RefreshCw,
  AlertTriangle,
  CloudOff,
} from 'lucide-react';
import type {
  ConfigSource,
  TenantConfigOverrideInput,
  TenantVisibleResolvedConfig,
} from '@contracts/config.contract';
import { usePersistentState } from '../../hooks/usePersistentState';
import { TenantConfig } from '../../types';
import { INDUSTRY_TEMPLATES } from '../../mockData';
import { useToast } from '../../contexts/ToastContext';
import { isFirebaseConfigured } from '../../data/adapters/auth.adapter';
import {
  getResolvedConfig,
  updateTenantConfig,
} from '../../data/adapters/config.adapter';
import type { I18nLocale } from '@contracts/i18n.contract';
import {
  fetchRemoteLocale,
  resolveInterfaceLocale,
  saveRemoteLocale,
  translate,
  writeCachedLocale,
} from '../../data/adapters/i18n.adapter';

interface SourceMeta {
  short: string;
  title: string;
  description: string;
  chipClass: string;
  dotClass: string;
}

interface ConfigRow {
  key: string;
  label: string;
  hint?: string;
  value: string;
}

interface ConfigGroup {
  id: string;
  title: string;
  caption: string;
  rows: ConfigRow[];
}

const sourceMeta: Record<ConfigSource, SourceMeta> = {
  default: {
    short: 'Mặc định',
    title: 'ScanGo đặt sẵn',
    description: 'Chưa ai thay đổi giá trị này.',
    chipClass: 'bg-zinc-100 text-zinc-600 border-zinc-300',
    dotClass: 'bg-zinc-400',
  },
  admin: {
    short: 'ADMIN',
    title: 'ADMIN đặt',
    description: 'ScanGo (ADMIN) đã đổi cho toàn hệ thống.',
    chipClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
  tenant: {
    short: 'Cửa hàng',
    title: 'Cửa hàng đổi',
    description: 'Chính cửa hàng của bạn đã thay đổi giá trị này.',
    chipClass: 'bg-orange-50 text-orange-700 border-orange-300',
    dotClass: 'bg-orange-500',
  },
};

const sourceOrder: ConfigSource[] = ['default', 'admin', 'tenant'];

function readSource(
  sources: Record<string, ConfigSource>,
  key: string,
): ConfigSource {
  const found = sources[key];
  return found === 'admin' || found === 'tenant' || found === 'default'
    ? found
    : 'default';
}

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
  const [resolved, setResolved] = useState<TenantVisibleResolvedConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [draftLocale, setDraftLocale] = useState<'vi' | 'en'>('vi');
  const [interfaceLocale, setInterfaceLocale] = useState<I18nLocale>(() =>
    resolveInterfaceLocale(),
  );
  const [draftTimezone, setDraftTimezone] = useState('Asia/Ho_Chi_Minh');
  const [draftPinPolicy, setDraftPinPolicy] = useState({
    length: 6,
    maxFailedAttempts: 5,
    lockMinutes: 15,
    sessionHours: 8,
  });
  const [draftAi, setDraftAi] = useState({
    revenueDropPercent: 20,
    lowMarginPercent: 20,
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
        setDraftAi({
          revenueDropPercent: result.values.ai.revenueDropPercent,
          lowMarginPercent: result.values.ai.lowMarginPercent,
        });
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

  // Apply the persisted server locale on open so a saved user choice wins over
  // an empty browser cache (REQ-I18N-001).
  useEffect(() => {
    let cancelled = false;
    void fetchRemoteLocale()
      .then(result => {
        if (!cancelled && result) {
          setInterfaceLocale(result.locale);
          writeCachedLocale(result.locale);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveResolvedConfig = async () => {
    if (!resolved) return;

    const allowed = resolved.allowedTenantOverrideKeys;
    const overrides: TenantConfigOverrideInput = {};

    if (allowed.includes('locale')) {
      overrides.locale = draftLocale;
    }

    if (allowed.includes('timezone')) {
      const timezone = draftTimezone.trim();
      if (timezone) {
        overrides.timezone = timezone;
      }
    }

    if (allowed.includes('pinPolicy')) {
      overrides.pinPolicy = {
        length: Number(draftPinPolicy.length),
        maxFailedAttempts: Number(draftPinPolicy.maxFailedAttempts),
        lockMinutes: Number(draftPinPolicy.lockMinutes),
        sessionHours: Number(draftPinPolicy.sessionHours),
      };
    }

    if (allowed.includes('ai')) {
      overrides.ai = {
        revenueDropPercent: Number(draftAi.revenueDropPercent),
        lowMarginPercent: Number(draftAi.lowMarginPercent),
      };
    }

    if (Object.keys(overrides).length === 0) {
      const message = 'Cửa hàng chưa được phép thay đổi cấu hình nào.';
      setConfigError(message);
      toast.error(message);
      return;
    }

    setConfigSaving(true);
    setConfigError(null);
    try {
      await updateTenantConfig(overrides);
      // Re-read the tenant-visible projection so sources stay correct and
      // ADMIN-only values never enter this state.
      await loadResolvedConfig();
      toast.success('Đã lưu cấu hình cửa hàng');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Không lưu được cấu hình.';
      setConfigError(message);
      toast.error(message);
    } finally {
      setConfigSaving(false);
    }
  };

  // Interface language is a user preference, separate from the tenant
  // `locale` override. It is cached locally and persisted on the server for an
  // authenticated user (REQ-I18N-001).
  const handleInterfaceLocaleChange = async (next: I18nLocale) => {
    setInterfaceLocale(next);
    try {
      await saveRemoteLocale(next);
      toast.success(translate(next, 'settings.language.saved'));
    } catch {
      toast.error(translate(next, 'settings.language.failed'));
    }
  };

  const configGroups: ConfigGroup[] = resolved
    ? [
        {
          id: 'shop',
          title: 'Cài đặt cửa hàng',
          caption: 'Dùng cho cửa hàng đang mở.',
          rows: [
            {
              key: 'locale',
              label: 'Ngôn ngữ hiển thị',
              hint: 'Ngôn ngữ giao diện mặc định của cửa hàng',
              value: resolved.values.locale === 'vi' ? 'Tiếng Việt' : 'English',
            },
            {
              key: 'timezone',
              label: 'Múi giờ',
              hint: 'Dùng để tính ngày, giờ và báo cáo',
              value: resolved.values.timezone,
            },
          ],
        },
        {
          id: 'pin',
          title: 'Chính sách PIN nhân viên',
          caption: 'Quy tắc đăng nhập của nhân viên.',
          rows: [
            {
              key: 'pinPolicy.length',
              label: 'Độ dài PIN',
              hint: 'Số chữ số nhân viên phải nhập',
              value: `${resolved.values.pinPolicy.length} chữ số`,
            },
            {
              key: 'pinPolicy.maxFailedAttempts',
              label: 'Số lần nhập sai tối đa',
              hint: 'Sau số lần này tài khoản bị khóa',
              value: `${resolved.values.pinPolicy.maxFailedAttempts} lần`,
            },
            {
              key: 'pinPolicy.lockMinutes',
              label: 'Thời gian khóa tài khoản',
              hint: 'Khóa tạm thời sau khi nhập sai quá nhiều',
              value: `${resolved.values.pinPolicy.lockMinutes} phút`,
            },
            {
              key: 'pinPolicy.sessionHours',
              label: 'Thời gian mỗi phiên làm việc',
              hint: 'Hết thời gian này nhân viên phải đăng nhập lại',
              value: `${resolved.values.pinPolicy.sessionHours} giờ`,
            },
          ],
        },
      ]
    : [];

  const allowedOverrideKeys = resolved?.allowedTenantOverrideKeys ?? [];
  const canOverrideLocale = allowedOverrideKeys.includes('locale');
  const canOverrideTimezone = allowedOverrideKeys.includes('timezone');
  const canOverridePinPolicy = allowedOverrideKeys.includes('pinPolicy');
  const canOverrideAi = allowedOverrideKeys.includes('ai');
  const canSaveTenantConfig =
    canOverrideLocale ||
    canOverrideTimezone ||
    canOverridePinPolicy ||
    canOverrideAi;

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

      <section
        className="bg-white border-hard shadow-hard p-6 md:p-8 mb-8"
        aria-labelledby="interface-language-title"
        data-testid="interface-language"
      >
        <h2 id="interface-language-title" className="font-bold text-lg uppercase tracking-tight text-zinc-900">
          {translate(interfaceLocale, 'settings.language.title')}
        </h2>
        <p className="text-sm text-zinc-500 mt-1">
          {translate(interfaceLocale, 'settings.language.description')}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['vi', 'en'] as const).map(locale => (
            <button
              key={locale}
              type="button"
              aria-pressed={interfaceLocale === locale}
              onClick={() => void handleInterfaceLocaleChange(locale)}
              className={`border-hard px-4 py-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer ${
                interfaceLocale === locale
                  ? 'bg-zinc-950 text-white'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {translate(
                interfaceLocale,
                locale === 'vi' ? 'settings.language.vi' : 'settings.language.en',
              )}
            </button>
          ))}
        </div>
      </section>

      <form onSubmit={handleSave} className="bg-white border-hard shadow-hard p-6 md:p-10 space-y-8">
        <section className="space-y-5" data-testid="resolved-config" aria-labelledby="resolved-config-title">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
            <div>
              <h2 id="resolved-config-title" className="font-bold text-lg uppercase tracking-tight text-zinc-900">Cấu hình đang áp dụng</h2>
              <p className="text-sm text-zinc-500">Giá trị thật đang chạy cho cửa hàng. Mỗi dòng ghi rõ ai đặt giá trị đó.</p>
            </div>
            {resolved && (
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                Phiên bản cấu hình v{resolved.schemaVersion}
              </span>
            )}
          </div>

          {!configured && (
            <div className="flex items-start gap-3 border-hard bg-zinc-50 px-4 py-3">
              <CloudOff className="w-4 h-4 mt-0.5 shrink-0 text-zinc-400" aria-hidden="true" />
              <p className="text-sm text-zinc-600 leading-relaxed">
                Chưa kết nối máy chủ. Khi cửa hàng kết nối Firebase, cấu hình thật và nguồn của từng giá trị sẽ hiển thị tại đây.
              </p>
            </div>
          )}

          {configured && configLoading && !resolved && (
            <div className="border-hard bg-white" role="status" aria-live="polite" aria-label="Đang tải cấu hình">
              <span className="sr-only">Đang tải cấu hình…</span>
              <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                <div className="h-3 w-40 bg-zinc-200 animate-pulse-soft" />
              </div>
              <div className="divide-y divide-zinc-200">
                {[0, 1, 2, 3].map(row => (
                  <div key={row} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="h-3 w-32 bg-zinc-200 animate-pulse-soft" />
                    <div className="h-3 w-20 bg-zinc-200 animate-pulse-soft" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {configError && (
            <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-hard border-red-300 bg-red-50 px-4 py-3">
              <p className="flex items-start gap-2 text-sm text-red-700 leading-relaxed">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{configError}</span>
              </p>
              <button
                type="button"
                onClick={() => void loadResolvedConfig()}
                disabled={configLoading}
                className="shrink-0 inline-flex items-center justify-center gap-2 border-hard bg-white px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-100 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${configLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Thử lại
              </button>
            </div>
          )}

          {resolved && (
            <>
              <div className="border-hard bg-white">
                <p className="px-4 pt-3 text-xs text-zinc-500 leading-relaxed">
                  Thứ tự ưu tiên khi trùng giá trị:{' '}
                  <span className="font-bold text-zinc-700">Mặc định → ADMIN → Cửa hàng</span>.
                  Giá trị bên phải mạnh hơn và được dùng.
                </p>
                <ul className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-px border-t border-zinc-200 bg-zinc-200" aria-label="Ý nghĩa nguồn cấu hình">
                  {sourceOrder.map((source, index) => {
                    const meta = sourceMeta[source];
                    return (
                      <li key={source} className="bg-white px-4 py-3">
                        <span className="flex items-center gap-2">
                          <span className={`w-2 h-2 ${meta.dotClass}`} aria-hidden="true" />
                          <span className="font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-800">{meta.short}</span>
                          {index === sourceOrder.length - 1 && (
                            <span className="font-mono text-[9px] uppercase tracking-widest text-orange-700 border border-orange-300 bg-orange-50 px-1.5 py-0.5">Cao nhất</span>
                          )}
                        </span>
                        <span className="mt-1 block text-[11px] leading-snug text-zinc-500">{meta.description}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {configGroups.map(group => (
                <div key={group.id} className="border-hard bg-white">
                  <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3">
                    <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-700">{group.title}</h3>
                    <p className="mt-0.5 text-xs text-zinc-500">{group.caption}</p>
                  </div>
                  <dl className="divide-y divide-zinc-200">
                    {group.rows.map(row => {
                      const source = readSource(resolved.sources, row.key);
                      const meta = sourceMeta[source];
                      return (
                        <div key={row.key} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <dt className="min-w-0">
                            <span className="block font-mono text-xs text-zinc-700">{row.label}</span>
                            {row.hint ? (
                              <span className="mt-0.5 block text-[11px] text-zinc-400">{row.hint}</span>
                            ) : null}
                          </dt>
                          <dd className="flex shrink-0 flex-wrap items-center gap-3">
                            <span className="font-mono text-sm font-bold text-zinc-900">{row.value}</span>
                            <span
                              className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${meta.chipClass}`}
                              title={meta.description}
                              aria-label={`Nguồn: ${meta.title}. ${meta.description}`}
                            >
                              <span className={`h-1.5 w-1.5 ${meta.dotClass}`} aria-hidden="true" />
                              {meta.short}
                            </span>
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              ))}

              <p className="border-hard bg-zinc-50 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
                Một số giá trị cấp hệ thống (ví dụ: lưu trữ, sao lưu, giới hạn tốc độ) do ADMIN quản lý và không hiển thị tại đây.
              </p>

              <div className="space-y-1">
                <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-zinc-700">Chỉnh cấu hình cửa hàng</h3>
                <p className="text-xs text-zinc-500">Cửa hàng chỉ được thay đổi các giá trị được phép. Lưu sẽ gửi lên máy chủ.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-3">
                  <label htmlFor="resolvedLocale" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                    Ngôn ngữ {canOverrideLocale ? '(được phép ghi đè)' : '(chỉ ADMIN chỉnh)'}
                  </label>
                  <select id="resolvedLocale" value={draftLocale} disabled={configSaving || !canOverrideLocale} onChange={e => setDraftLocale(e.target.value as 'vi' | 'en')} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer transition-colors uppercase disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="vi">Tiếng Việt</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div className="space-y-3">
                  <label htmlFor="resolvedTimezone" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                    Múi giờ {canOverrideTimezone ? '(được phép ghi đè)' : '(chỉ ADMIN chỉnh)'}
                  </label>
                  <input id="resolvedTimezone" type="text" value={draftTimezone} disabled={configSaving || !canOverrideTimezone} onChange={e => setDraftTimezone(e.target.value)} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Chính sách PIN {canOverridePinPolicy ? '(được phép ghi đè)' : '(chỉ ADMIN chỉnh)'}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  {([
                    ['length', 'Độ dài PIN'],
                    ['maxFailedAttempts', 'Sai tối đa'],
                    ['lockMinutes', 'Khóa (phút)'],
                    ['sessionHours', 'Phiên (giờ)'],
                  ] as const).map(([field, label]) => (
                    <div key={field} className="space-y-3">
                      <label htmlFor={`pin-${field}`} className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">{label}</label>
                      <input id={`pin-${field}`} type="number" min={1} value={draftPinPolicy[field]} disabled={configSaving || !canOverridePinPolicy} onChange={e => setDraftPinPolicy(prev => ({ ...prev, [field]: Number(e.target.value) }))} className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  Ngưỡng cảnh báo AI {canOverrideAi ? '(được phép ghi đè)' : '(chỉ ADMIN chỉnh)'}
                </p>
                <p className="text-xs text-zinc-500">
                  Trợ lý AI cảnh báo chủ quán khi doanh thu một ngày giảm quá ngưỡng, hoặc khi một món có biên lợi nhuận dưới ngưỡng.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <label htmlFor="ai-revenueDrop" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                      Doanh thu giảm (%)
                    </label>
                    <input
                      id="ai-revenueDrop"
                      type="number"
                      min={1}
                      max={100}
                      value={draftAi.revenueDropPercent}
                      disabled={configSaving || !canOverrideAi}
                      onChange={e => setDraftAi(prev => ({ ...prev, revenueDropPercent: Number(e.target.value) }))}
                      className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                  <div className="space-y-3">
                    <label htmlFor="ai-lowMargin" className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 block">
                      Biên lợi nhuận tối thiểu (%)
                    </label>
                    <input
                      id="ai-lowMargin"
                      type="number"
                      min={1}
                      max={100}
                      value={draftAi.lowMarginPercent}
                      disabled={configSaving || !canOverrideAi}
                      onChange={e => setDraftAi(prev => ({ ...prev, lowMarginPercent: Number(e.target.value) }))}
                      className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>
              </div>

              <button type="button" onClick={handleSaveResolvedConfig} disabled={configSaving || !canSaveTenantConfig} className="w-full bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-6 py-4 border-hard shadow-hard flex items-center justify-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-[transform,box-shadow] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                <Save className="w-4 h-4" aria-hidden="true" />
                {configSaving ? 'Đang lưu…' : 'Lưu cấu hình cửa hàng'}
              </button>

              {!canSaveTenantConfig && (
                <p className="border-hard bg-zinc-50 px-4 py-3 text-[11px] leading-relaxed text-zinc-500">
                  Cửa hàng chưa được phép thay đổi cấu hình nào. Liên hệ ADMIN để điều chỉnh.
                </p>
              )}
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
