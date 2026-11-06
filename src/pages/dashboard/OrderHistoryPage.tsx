import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ReceiptText,
} from 'lucide-react';
import type {
  OrderHistoryPage,
  OrderHistoryRow,
  OrderHistoryStatusFilter,
  OrderStatus,
} from '@contracts/order.contract';
import { listOrderHistory } from '../../data/adapters/ordering.adapter';
import { formatVnd } from '../../data/adapters/reporting.adapter';
import { useStoreTenantId } from '../../data/tenantStore';
import {
  addDaysToDayKey,
  dateInputFromDayKey,
  dayKeyFromDateInput,
  formatDayKeyLabel,
  localDayKey,
  validateDayRange,
} from '../../utils/dayRange';

const STATUS_FILTERS: Array<{
  value: OrderHistoryStatusFilter;
  label: string;
}> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'unpaid', label: 'Chưa thanh toán' },
  { value: 'paid', label: 'Đã thanh toán' },
  { value: 'cancelled', label: 'Đã huỷ' },
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Chờ xử lý',
  cooking: 'Đang nấu',
  ready: 'Sẵn sàng',
  served: 'Đã phục vụ',
  paid: 'Đã thanh toán',
  cancelled: 'Đã huỷ',
};

const STATUS_TONES: Record<OrderStatus, string> = {
  pending: 'border-amber-300 bg-amber-50 text-amber-700',
  cooking: 'border-orange-300 bg-orange-50 text-orange-700',
  ready: 'border-emerald-300 bg-emerald-50 text-emerald-700',
  served: 'border-sky-300 bg-sky-50 text-sky-700',
  paid: 'border-zinc-300 bg-zinc-100 text-zinc-700',
  cancelled: 'border-red-300 bg-red-50 text-red-700',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  vietQr: 'VietQR',
  payos: 'PayOS',
};

const ACTOR_LABELS: Record<string, string> = {
  customer: 'Khách',
  staff: 'Nhân viên',
  system: 'Hệ thống',
};

function formatMoment(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
  });
}

function paymentLabel(row: OrderHistoryRow): string {
  if (!row.paidAt) return 'Chưa thu';
  const method = row.paymentMethod
    ? PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod
    : null;
  if (row.order.paymentMode === 'payFirst') {
    return method ? `Đã trả trước · ${method}` : 'Đã trả trước';
  }
  return method ? `Đã thu · ${method}` : 'Đã thu';
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${STATUS_TONES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function PaymentBadge({ row }: { row: OrderHistoryRow }) {
  const paid = row.paidAt !== null;
  return (
    <span
      className={`inline-flex items-center border px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
        paid
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-orange-300 bg-orange-50 text-orange-700'
      }`}
    >
      {paymentLabel(row)}
    </span>
  );
}

export default function OrderHistoryPage() {
  const tenantId = useStoreTenantId();
  const [fromDay, setFromDay] = useState(() =>
    addDaysToDayKey(localDayKey(), -6),
  );
  const [toDay, setToDay] = useState(() => localDayKey());
  const [status, setStatus] = useState<OrderHistoryStatusFilter>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OrderHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const rangeProblem = useMemo(
    () => validateDayRange(fromDay, toDay),
    [fromDay, toDay],
  );

  useEffect(() => {
    if (!tenantId || rangeProblem) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listOrderHistory({ tenantId, fromDay, toDay, status, page })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setData(null);
          setError(
            caught instanceof Error
              ? caught.message
              : 'Không tải được lịch sử đơn.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, fromDay, toDay, status, page, rangeProblem]);

  const handleFromChange = (value: string) => {
    const next = dayKeyFromDateInput(value);
    if (!next) return;
    setFromDay(next);
    setPage(1);
  };

  const handleToChange = (value: string) => {
    const next = dayKeyFromDateInput(value);
    if (!next) return;
    setToDay(next);
    setPage(1);
  };

  const rows = data?.rows ?? [];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">
            Lịch sử đơn
          </h1>
          <p className="text-zinc-500 font-medium mt-1">
            Xem lại từng đơn hàng, thanh toán và trạng thái phục vụ.
            <span className="ml-2 border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {loading ? 'Đang tải' : error ? 'Lỗi' : data ? 'Số liệu thật' : 'Trống'}
            </span>
          </p>
        </div>
      </div>

      <div className="border-hard bg-white p-4 md:p-5 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Từ ngày
              <input
                type="date"
                value={dateInputFromDayKey(fromDay)}
                max={dateInputFromDayKey(toDay)}
                onChange={(event) => handleFromChange(event.target.value)}
                className="border-hard bg-zinc-50 px-3 py-2 font-sans text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600"
              />
            </label>
            <label className="flex flex-col gap-1 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Đến ngày
              <input
                type="date"
                value={dateInputFromDayKey(toDay)}
                min={dateInputFromDayKey(fromDay)}
                onChange={(event) => handleToChange(event.target.value)}
                className="border-hard bg-zinc-50 px-3 py-2 font-sans text-sm font-bold text-zinc-900 focus:outline-none focus:border-orange-600"
              />
            </label>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 lg:ml-auto"
            role="group"
            aria-label="Lọc trạng thái đơn"
          >
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={status === option.value}
                onClick={() => {
                  setStatus(option.value);
                  setPage(1);
                  setExpandedOrderId(null);
                }}
                className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  status === option.value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-white text-zinc-500 hover:border-zinc-900 hover:text-zinc-900'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {rangeProblem && (
          <p role="alert" className="mt-4 text-xs font-bold text-red-600">
            {rangeProblem}
          </p>
        )}
      </div>

      {!tenantId && (
        <div className="border border-zinc-200 bg-white px-4 py-6 text-sm font-bold text-zinc-500">
          Chưa chọn cửa hàng. Hãy chọn cửa hàng để xem lịch sử đơn.
        </div>
      )}

      {tenantId && error && (
        <div
          role="alert"
          className="mb-6 flex items-center gap-2 border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-700"
        >
          <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      {tenantId && !error && data && rows.length === 0 && (
        <div className="border border-zinc-200 bg-white px-4 py-6 text-sm font-bold text-zinc-500">
          Không có đơn nào trong khoảng ngày này.
        </div>
      )}

      {tenantId && !error && data && rows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              {formatDayKeyLabel(fromDay)} – {formatDayKeyLabel(toDay)}
            </p>
            {loading && (
              <span
                role="status"
                aria-live="polite"
                className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400"
              >
                Đang tải
              </span>
            )}
          </div>

          <ul className="space-y-3">
            {rows.map((row) => {
              const orderId = row.order.orderId;
              const expanded = expandedOrderId === orderId;
              return (
                <li key={orderId} className="border-hard bg-white">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`order-detail-${orderId}`}
                    onClick={() =>
                      setExpandedOrderId(expanded ? null : orderId)
                    }
                    className="w-full text-left p-4 flex flex-wrap items-center gap-x-4 gap-y-2 hover:bg-zinc-50 transition-colors"
                  >
                    <span className="font-mono text-xs font-bold text-zinc-500">
                      {formatMoment(row.order.createdAt)} · #
                      {orderId.slice(-6).toUpperCase()}
                    </span>
                    <span className="font-bold text-sm text-zinc-900">
                      {row.order.tableNameSnapshot}
                    </span>
                    <span className="text-xs font-medium text-zinc-500">
                      {row.order.items.length} món
                    </span>
                    <span className="text-sm font-black text-zinc-900">
                      {formatVnd(row.order.totalVnd)}
                    </span>
                    <span className="flex flex-wrap items-center gap-2 ml-auto">
                      <OrderStatusBadge status={row.order.status} />
                      <PaymentBadge row={row} />
                      <ChevronDown
                        className={`w-4 h-4 text-zinc-400 transition-transform ${
                          expanded ? 'rotate-180' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </span>
                  </button>

                  {expanded && (
                    <div
                      id={`order-detail-${orderId}`}
                      className="border-t border-zinc-100 p-4 grid gap-6 md:grid-cols-2"
                    >
                      <div>
                        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                          Món đã gọi
                        </h3>
                        <ul className="space-y-1">
                          {row.order.items.map((line) => (
                            <li
                              key={line.lineId}
                              className="flex items-baseline justify-between gap-3 text-sm"
                            >
                              <span className="font-medium text-zinc-700">
                                {line.quantity}× {line.name}
                                {line.modifiers.length > 0 && (
                                  <span className="text-zinc-400">
                                    {' '}
                                    ({line.modifiers.map((m) => m.name).join(', ')})
                                  </span>
                                )}
                              </span>
                              <span className="font-bold text-zinc-900">
                                {formatVnd(line.lineTotalVnd)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {row.order.customerNote && (
                          <p className="mt-3 text-xs text-zinc-500">
                            Ghi chú: {row.order.customerNote}
                          </p>
                        )}
                        <dl className="mt-3 space-y-1 text-xs">
                          {row.order.discountVnd > 0 && (
                            <div className="flex justify-between">
                              <dt className="text-zinc-500">Giảm giá</dt>
                              <dd className="font-bold text-red-600">
                                -{formatVnd(row.order.discountVnd)}
                              </dd>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <dt className="text-zinc-500">Tổng cộng</dt>
                            <dd className="font-black text-zinc-900">
                              {formatVnd(row.order.totalVnd)}
                            </dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-zinc-500">Thanh toán</dt>
                            <dd className="font-bold text-zinc-900">
                              {row.paidAt
                                ? `${paymentLabel(row)} · ${formatMoment(row.paidAt)}`
                                : `${paymentLabel(row)} · ${row.order.paymentMode === 'payFirst' ? 'Trả trước' : 'Trả sau'}`}
                            </dd>
                          </div>
                          {row.cancellationReason && (
                            <div className="flex justify-between gap-4">
                              <dt className="text-zinc-500">Lý do huỷ</dt>
                              <dd className="font-bold text-red-600 text-right">
                                {row.cancellationReason}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>

                      <div>
                        <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-2">
                          Lịch sử trạng thái
                        </h3>
                        {row.statusEvents.length === 0 ? (
                          <p className="text-xs text-zinc-400">
                            Chưa có lịch sử trạng thái.
                          </p>
                        ) : (
                          <ol className="space-y-2">
                            {row.statusEvents.map((event) => (
                              <li
                                key={event.eventId}
                                className="flex items-start gap-2 text-xs"
                              >
                                <span
                                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900"
                                  aria-hidden="true"
                                />
                                <span>
                                  <span className="font-bold text-zinc-900">
                                    {STATUS_LABELS[event.newStatus]}
                                  </span>
                                  <span className="text-zinc-400">
                                    {' '}
                                    · {formatMoment(event.createdAt)} ·{' '}
                                    {ACTOR_LABELS[event.actorType] ??
                                      event.actorType}
                                  </span>
                                  {event.reason && (
                                    <span className="block text-zinc-500">
                                      {event.reason}
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 border border-zinc-300 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              Trước
            </button>
            <span className="font-mono text-xs font-bold text-zinc-500">
              Trang {data?.page ?? page}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={!data?.hasMore || loading}
              className="flex items-center gap-1 border border-zinc-300 bg-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-700 disabled:cursor-not-allowed disabled:text-zinc-300"
            >
              Tiếp
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {tenantId && !error && !data && !loading && !rangeProblem && (
        <div className="flex items-center gap-2 border border-zinc-200 bg-white px-4 py-6 text-sm font-bold text-zinc-500">
          <ReceiptText className="w-4 h-4" aria-hidden="true" />
          Chưa có dữ liệu lịch sử đơn.
        </div>
      )}
    </div>
  );
}
