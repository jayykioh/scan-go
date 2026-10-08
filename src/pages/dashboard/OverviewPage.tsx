import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, TrendingUp, DollarSign, Users, ShoppingBag, CreditCard, Flame } from 'lucide-react';
import type { ReportingPeriod, ReportingSummaryResult } from '@contracts/reporting.contract';
import type { SubscriptionState } from '@contracts/subscription.contract';
import { formatVnd, getReportingSummary } from '../../data/adapters/reporting.adapter';
import { getSubscription } from '../../data/adapters/subscription.adapter';
import { formatPlanLabel } from '../../data/adapters/subscription-view';
import { useActiveTenantId } from '../../hooks/useActiveTenantId';

interface TopItem {
  name: string;
  qty: number;
  rev: number;
}

interface PeriodOption {
  value: ReportingPeriod;
  label: string;
  rangeLabel: string;
}

const PERIOD_OPTIONS: PeriodOption[] = [
  { value: 'day', label: 'Hôm nay', rangeLabel: 'Hôm nay' },
  { value: 'week', label: 'Tuần', rangeLabel: 'Tuần này' },
  { value: 'month', label: 'Tháng', rangeLabel: 'Tháng này' },
];

/** Short tenant-local day label from a `yyyymmdd` key. */
function formatDayLabel(dayKey: string): string {
  const day = Number(dayKey.slice(6, 8));
  const month = Number(dayKey.slice(4, 6));
  return `${day}/${month}`;
}

export default function OverviewPage() {
  const tenantId = useActiveTenantId();
  const [period, setPeriod] = useState<ReportingPeriod>('day');
  const [summary, setSummary] = useState<ReportingSummaryResult | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setSummary(null);
      setReportError(null);
      return;
    }
    let cancelled = false;
    setReportError(null);
    void getReportingSummary({ tenantId, period })
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSummary(null);
          setReportError(
            error instanceof Error ? error.message : 'Không tải được báo cáo.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, period]);

  useEffect(() => {
    if (!tenantId) {
      setSubscription(null);
      setPlanError(null);
      return;
    }
    let cancelled = false;
    setPlanError(null);
    void getSubscription()
      .then((state) => {
        if (!cancelled) setSubscription(state);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSubscription(null);
          setPlanError(
            error instanceof Error ? error.message : 'Không tải được gói dịch vụ.',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const currentPlan = subscription ? formatPlanLabel(subscription.plan) : '—';
  const hasLiveData = summary !== null;
  const periodLabel =
    PERIOD_OPTIONS.find((option) => option.value === period)?.rangeLabel ??
    'Hôm nay';
  const periodRevenue = summary?.totals.revenueVnd ?? 0;
  const grossProfitVnd = summary?.totals.grossProfitVnd ?? null;
  const totalOrders = summary?.totals.createdOrderCount ?? 0;
  const paidOrders = summary?.totals.paidOrderCount ?? 0;
  const topItems: TopItem[] = (summary?.popularItems ?? []).map((item) => ({
    name: item.itemName,
    qty: item.paidQuantity,
    rev: item.revenueVnd,
  }));
  const dailyBreakdown = summary?.dailyBreakdown ?? [];
  const maxDayRevenue = dailyBreakdown.reduce(
    (max, day) => Math.max(max, day.totals.revenueVnd),
    0,
  );
  // The chart shows a bar per stored day; the placeholder stays until the
  // server reports a paid revenue inside the selected period.
  const hasServerRevenue = hasLiveData && periodRevenue > 0;

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">Tổng quan Kinh doanh</h1>
          <p className="text-zinc-500 font-medium mt-1">
            Số liệu trực tiếp {periodLabel.toLowerCase()}.
            <span className="ml-2 border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {reportError ? 'Lỗi tải báo cáo' : hasLiveData ? 'Số liệu thật' : 'Trống'}
            </span>
          </p>
        </div>
        <Link
          to="/simulator"
          className="bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 font-bold text-sm uppercase tracking-widest shadow-hard border-hard transition-transform active:translate-y-1 flex items-center gap-2"
        >
          Mở Máy Trạm (Simulator) <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 mb-6" role="group" aria-label="Chọn kỳ báo cáo">
        {PERIOD_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest border transition-colors ${
              period === option.value
                ? 'bg-zinc-900 text-white border-zinc-900'
                : 'bg-white text-zinc-500 border-zinc-300 hover:border-zinc-900 hover:text-zinc-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 border-hard shadow-[4px_4px_0_0_#f97316]">
          <div className="flex items-center gap-3 text-orange-600 mb-2">
            <DollarSign className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Doanh thu {periodLabel}</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter">{formatVnd(periodRevenue)}</div>
          {grossProfitVnd === null ? (
            <div className="text-xs font-bold text-zinc-400 mt-2">
              Chưa có số liệu {periodLabel.toLowerCase()}
            </div>
          ) : (
            <div className="text-xs font-bold text-emerald-600 mt-2 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Lợi nhuận gộp: {formatVnd(grossProfitVnd)}
            </div>
          )}
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
            <h3 className="font-bold text-xs uppercase tracking-widest">Đơn đã thu</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter">{paidOrders}</div>
        </div>

        <div className="bg-white p-6 border-hard shadow-sm bg-zinc-50">
          <div className="flex items-center gap-3 text-zinc-500 mb-2">
            <CreditCard className="w-5 h-5" />
            <h3 className="font-bold text-xs uppercase tracking-widest">Gói dịch vụ</h3>
          </div>
          <div className="text-3xl font-black tracking-tighter text-zinc-900">{currentPlan}</div>
          {planError ? (
            <p className="text-xs font-bold text-red-600 mt-2">{planError}</p>
          ) : (
            <Link to="/dashboard/subscription" className="text-xs font-bold text-orange-600 mt-2 inline-block hover:underline">
              Quản lý gói
            </Link>
          )}
        </div>
      </div>

      {reportError && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-700"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {reportError}
        </div>
      )}
      {planError && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-700"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {planError}
        </div>
      )}
      {!reportError && summary && totalOrders === 0 && (
        <div className="mb-6 border border-zinc-200 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Chưa có số liệu báo cáo cho {periodLabel.toLowerCase()}.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Revenue Chart from the Reporting adapter */}
        <div className="md:col-span-2 bg-white border-hard shadow-hard flex flex-col">
          <div className="p-5 border-b border-zinc-100 flex justify-between items-center">
            <h3 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Biểu đồ Doanh Thu</h3>
            <span className="text-xs font-bold px-2 py-1 bg-zinc-100 text-zinc-600 border border-zinc-200">{periodLabel}</span>
          </div>
          <div className="flex-1 p-6 flex flex-col justify-end min-h-[300px] relative">
            <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            {hasServerRevenue ? (
              <div className="w-full h-full flex items-end justify-around gap-2 z-10 px-2">
                {dailyBreakdown.map((day) => {
                  const heightPct =
                    maxDayRevenue > 0
                      ? Math.max(4, Math.round((day.totals.revenueVnd / maxDayRevenue) * 100))
                      : 4;
                  return (
                    <div key={day.dayKey} className="flex-1 max-w-[56px] flex flex-col items-center h-full justify-end">
                      <div
                        className="w-full bg-orange-500 border border-orange-600 relative group"
                        style={{ height: `${heightPct}%` }}
                      >
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 bg-zinc-900 text-white text-[10px] font-bold px-2 py-1 rounded transition-opacity whitespace-nowrap z-20">
                          {formatDayLabel(day.dayKey)} · {formatVnd(day.totals.revenueVnd)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="z-10 text-center self-center">
                <DollarSign className="w-8 h-8 text-zinc-300 mx-auto" aria-hidden="true" />
                <p className="mt-3 text-xs font-bold uppercase tracking-widest text-zinc-400">
                  Chưa có doanh thu đã thu {periodLabel.toLowerCase()}.
                </p>
              </div>
            )}

            {hasServerRevenue && (
              <div className="w-full border-t-2 border-zinc-900 mt-2 flex justify-around px-2 pt-2 text-[10px] font-bold text-zinc-400 uppercase">
                {dailyBreakdown.map((day) => (
                  <span key={day.dayKey} className="flex-1 max-w-[56px] text-center truncate">
                    {formatDayLabel(day.dayKey)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top items */}
        <div className="bg-white border-hard shadow-hard flex flex-col">
          <div className="p-5 border-b border-zinc-100 flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-lg uppercase tracking-tight text-zinc-900">Món Bán Chạy</h3>
          </div>
          <div className="p-0">
            {topItems.length === 0 && (
              <div className="p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">
                Chưa có đơn đã thu.
              </div>
            )}
            {topItems.map((item, i) => (
              <div key={i} className="p-4 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors flex justify-between items-center">
                <div>
                  <div className="font-bold text-sm text-zinc-900 truncate max-w-[150px]">{item.name}</div>
                  <div className="text-xs text-zinc-500 font-medium">{item.qty} lượt gọi</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-sm text-emerald-600">{formatVnd(item.rev)}</div>
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
