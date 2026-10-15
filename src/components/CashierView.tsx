import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { TenantConfig, TableConfig, Order, LoyaltyMember } from '../types';
import {
  confirmPayment,
  createPayosLink,
  listTableInvoices,
  listUnpaidOrders,
  subscribeOrderPayment,
} from '../data/adapters/payment.adapter';
import { listLoyaltyMembers } from '../data/adapters/loyalty.adapter';
import { cancelUnpaidOrder } from '../data/adapters/ordering.adapter';
import { toViewOrder } from '../data/adapters/view-mappers';
import { useOperationTables } from '../hooks/useOperationTables';
import { resolvePlanLayout } from '../pages/dashboard/tables/tablePlan';
import OperationTableBoard, {
  summarizeOrdersByTable,
  type OperationTableState,
} from './OperationTableBoard';
import { 
  CreditCard, 
  Table, 
  CheckCircle, 
  Smile, 
  Trash2,
  DollarSign,
  AlertTriangle,
  QrCode,
  X,
  ChevronLeft,
  ChevronRight,
  History
} from 'lucide-react';
import type { PayosPaymentLink, PaymentRecord } from '@contracts/payment.contract';
import type { LoyaltyMemberView } from '@contracts/loyalty.contract';

interface CashierProps {
  tenantConfig: TenantConfig;
  tables: TableConfig[];
  loyaltyMembers: LoyaltyMember[];
  /** Tenant scope for the unpaid queue and settlement command. */
  tenantId?: string;
  embedded?: boolean;
  /**
   * Render one table's invoice sheet inline and nothing else (REQ-WAI-002), so
   * a Waiter who is also a Cashier settles from the same UI as the till. The
   * host supplies the dialog chrome; this component supplies the sheet.
   */
  focusTableId?: string;
}

import {
  createSettlementKeyFactory,
  SettlementKeyStore,
} from '../data/adapters/settlement-keys';

/** Settled invoices per dialog page (REQ-CAS-003). */
export const INVOICE_PAGE_SIZE = 5;

const PAYMENT_METHOD_LABEL: Record<PaymentRecord['method'], string> = {
  cash: 'Tiền mặt',
  vietQr: 'VietQR',
  payos: 'PayOS',
};

const PAYMENT_STATUS_LABEL: Record<PaymentRecord['status'], string> = {
  confirmed: 'Đã thu',
  reversed: 'Đã hoàn (reversal)',
  refunded: 'Đã trả lại (refund)',
};

/**
 * The unpaid Orders of one Table, oldest first, so the till settles the bill
 * that has been open longest (REQ-CAS-003).
 */
export function ordersForTable(orders: Order[], tableId: string): Order[] {
  return orders
    .filter((order) => order.tableId === tableId && order.status !== 'paid')
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * One page of settled invoices. The page is clamped, so a reload that returns
 * fewer invoices never leaves the dialog on an empty page.
 */
export function paginateInvoices(
  invoices: Order[],
  page: number,
  size: number = INVOICE_PAGE_SIZE,
): { rows: Order[]; page: number; pageCount: number } {
  const pageCount = Math.max(Math.ceil(invoices.length / size), 1);
  const current = Math.min(Math.max(page, 1), pageCount);
  const start = (current - 1) * size;
  return { rows: invoices.slice(start, start + size), page: current, pageCount };
}

/**
 * The name a bill prints for an existing (returning) customer. The Order
 * snapshot carries only the member id, so the name comes from the Loyalty
 * member list (REQ-CAS-003).
 *
 * shortcut: the member list is bounded to 100 rows, so a member outside it
 * prints no name; add a read-by-id when a shop passes that many members.
 */
export function resolveCustomerName(
  members: LoyaltyMemberView[],
  order: Order,
): string | null {
  const memberId = order.loyaltyMemberId;
  if (!memberId) return null;
  const name = members.find((member) => member.memberId === memberId)?.displayName;
  return name && name.trim().length > 0 ? name : null;
}

interface InvoiceCardProps {
  order: Order;
  tableName: string;
  customerName: string | null;
  pending: boolean;
  /** The PayOS link on screen, when it belongs to this Order. */
  payosLink: PayosPaymentLink | null;
  onSettle: (orderId: string, method: 'cash' | 'vietQr') => void;
  onCancel: (orderId: string) => void;
  onPayos: (orderId: string) => void;
  onClosePayos: () => void;
}

/** One unpaid bill: lines, prices, table, customer, and its actions. */
function InvoiceCard({
  order,
  tableName,
  customerName,
  pending,
  payosLink,
  onSettle,
  onCancel,
  onPayos,
  onClosePayos,
}: InvoiceCardProps) {
  return (
    <div
      data-testid="invoice-card"
      className="rounded-[21px] border border-[#B5C7D8] bg-white overflow-hidden shadow-xs hover:border-zinc-900 transition-colors"
    >
      <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-100 flex justify-between items-center select-none">
        <span className="text-sm font-bold text-zinc-900 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-blue-500" />
          {tableName}
        </span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          order.status === 'ready' ? 'bg-emerald-100 text-emerald-700' :
          order.status === 'cooking' ? 'bg-amber-100 text-amber-700' :
          'bg-zinc-100 text-zinc-500'
        }`}>
          {order.status === 'ready' ? 'Sẵn sàng' : order.status === 'cooking' ? 'Đang nấu' : 'Chờ'}
        </span>
      </div>

      <div className="p-[13px] space-y-[13px] text-[#2D2B30]">
        {/* Item lines */}
        <div className="space-y-1.5 border-b border-[#B5C7D8]/20 pb-2.5">
          {order.items.map(item => (
            <div key={item.id} className="flex justify-between text-sm text-[#454547]">
              <span className="font-sans font-medium text-[#2D2B30]">
                {item.name} <span className="text-[#808080] ml-1 font-semibold text-xs ">x{item.quantity}</span>
              </span>
              <span>{item.price.toLocaleString()}đ</span>
            </div>
          ))}
        </div>

        {order.customerNote && (
          <p className="text-xs text-[#808080] italic">Ghi chú: {order.customerNote}</p>
        )}

        {/* A returning customer keeps their name on the bill (REQ-CAS-003). */}
        {customerName && (
          <div className="bg-[#F5F5F7] p-2 rounded-[21px] border border-[#B5C7D8] flex items-center justify-between text-sm text-[#454547]">
            <div className="flex items-center gap-[4px] min-w-0">
              <Smile className="w-3.5 h-3.5 shrink-0 text-zinc-900" />
              <span className="truncate font-semibold text-[#2D2B30]">
                Khách hàng: {customerName}
              </span>
            </div>
            <span className="shrink-0 text-[#808080] text-xs ">+{Math.floor(order.total / 10000)}đ tích</span>
          </div>
        )}

        {/* Payment row */}
        <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
          <div>
            <span className="text-xs text-zinc-400 block font-bold">Tổng tiền</span>
            <span className="text-xl font-bold text-zinc-900 ">
              {order.total.toLocaleString()}đ
            </span>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button 
              type="button"
              onClick={() => onCancel(order.id)}
              className="p-2 rounded-xl border border-red-100 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              title="Huỷ đơn chưa thanh toán"
              aria-label="Huỷ đơn chưa thanh toán"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            
            <button 
              type="button"
              onClick={() => onSettle(order.id, 'cash')}
              disabled={pending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              Thu tiền
            </button>
            <button 
              type="button"
              onClick={() => onSettle(order.id, 'vietQr')}
              disabled={pending}
              className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" />
              VietQR
            </button>
            <button
              type="button"
              onClick={() => onPayos(order.id)}
              disabled={pending}
              aria-label={`Tạo mã PayOS cho đơn ${order.id}`}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
            >
              <QrCode className="w-4 h-4" />
              PayOS
            </button>
          </div>

          {payosLink && (
            <div className="mt-3 flex w-full flex-col items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
              {payosLink.qrCode ? (
                <div className="rounded-lg bg-white p-2">
                  <QRCodeSVG
                    value={payosLink.qrCode}
                    size={176}
                    aria-label={`Mã QR PayOS cho đơn ${order.id}`}
                  />
                </div>
              ) : (
                <p className="text-xs font-semibold text-blue-900">
                  PayOS chưa trả mã QR. Mở trang thanh toán bên dưới.
                </p>
              )}
              <p className="text-xs font-bold text-blue-900">
                Quét mã để trả {payosLink.amountVnd.toLocaleString()}đ
              </p>
              <p className="font-mono text-[10px] text-blue-700">
                Mã PayOS {payosLink.orderCode} · Đang chờ PayOS xác nhận
              </p>
              {payosLink.checkoutUrl && (
                <a
                  href={payosLink.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-800 underline underline-offset-4"
                >
                  Mở trang thanh toán PayOS
                </a>
              )}
              <button
                type="button"
                onClick={onClosePayos}
                className="text-[10px] font-bold uppercase tracking-widest text-blue-700"
              >
                Đóng mã
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CashierView({
  tenantConfig,
  tables,
  loyaltyMembers,
  tenantId,
  embedded = false,
  focusTableId,
}: CashierProps) {
  const [cashierActiveShift, setCashierActiveShift] = useState(false);
  const [cashierPin, setCashierPin] = useState('');
  const [cashierPinError, setCashierPinError] = useState('');
  const [settlementError, setSettlementError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // False until the first unpaid read settles, so the till never calls a table
  // empty while the queue is still arriving.
  const [queueLoaded, setQueueLoaded] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  // The selected table's invoice dialog: its settled history, the payment
  // record on screen, and the reload counter a settlement bumps (REQ-CAS-003).
  const [tableInvoices, setTableInvoices] = useState<Order[]>([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [invoicePage, setInvoicePage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [invoiceReload, setInvoiceReload] = useState(0);
  const [members, setMembers] = useState<LoyaltyMemberView[]>([]);
  const [openPaymentId, setOpenPaymentId] = useState<string | null>(null);
  const [openPayment, setOpenPayment] = useState<PaymentRecord | null>(null);
  // The PayOS link currently on screen, and the Order it belongs to.
  const [payosLink, setPayosLink] = useState<PayosPaymentLink | null>(null);
  const [payosOrderId, setPayosOrderId] = useState<string | null>(null);
  // One idempotency key per Order, reused on retry until a confirmed result.
  const settlementKeys = useRef(new SettlementKeyStore(createSettlementKeyFactory()));
  // One idempotency key per Order for cancellation retries.
  const cancelKeys = useRef(new Map<string, string>());

  const refreshUnpaid = useCallback(async () => {
    if (!tenantId) return;
    try {
      const unpaid = await listUnpaidOrders(tenantId);
      setOrders(unpaid.map(toViewOrder));
      setSettlementError(null);
    } catch (error) {
      setSettlementError(
        error instanceof Error ? error.message : 'Không tải được danh sách nợ.',
      );
    } finally {
      setQueueLoaded(true);
    }
  }, [tenantId]);

  useEffect(() => {
    void refreshUnpaid();
  }, [refreshUnpaid]);

  /**
   * While a PayOS QR is on screen, watch that Order's Payment. The webhook
   * settles the Order server-side, so the appearance of the record is what
   * closes the panel and drops the Order from the unpaid queue (REQ-PAY-004).
   */
  useEffect(() => {
    if (!tenantId || !payosOrderId) return;
    return subscribeOrderPayment(
      tenantId,
      payosOrderId,
      (payment) => {
        if (!payment) return;
        setPayosLink(null);
        setPayosOrderId(null);
        void refreshUnpaid();
      },
      () => undefined,
    );
  }, [tenantId, payosOrderId, refreshUnpaid]);

  // Confirm a settlement and refresh the queue from the committed result.
  const handleSettleOrder = async (orderId: string, method: 'cash' | 'vietQr') => {
    const activeOrderObj = orders.find(o => o.id === orderId);
    if (!activeOrderObj || !tenantId) return;

    setSettlementError(null);
    setPendingOrderId(orderId);

    const idempotencyKey = settlementKeys.current.keyFor(orderId);

    try {
      await confirmPayment({
        tenantId,
        orderId,
        method,
        amountVnd: activeOrderObj.total,
        idempotencyKey,
      });
      // A confirmed result is final; drop the key and the settled Order.
      settlementKeys.current.clear(orderId);
      setOrders(prev => prev.filter(o => o.id !== orderId));
      if (payosOrderId === orderId) {
        setPayosLink(null);
        setPayosOrderId(null);
      }
      // The settled bill is now part of the table's history (REQ-CAS-003).
      setInvoiceReload((count) => count + 1);
    } catch (error) {
      setSettlementError(
        error instanceof Error ? error.message : 'Không thể xác nhận thanh toán.',
      );
    } finally {
      setPendingOrderId(null);
    }
  };

  /**
   * Ask the server for the PayOS link of one Order and show its QR. The amount
   * and the `orderCode` come from the server, so the cashier only presents it
   * (REQ-PAY-003). A second ask returns the stored pending link, which is how
   * the till reopens a payment code.
   */
  const handleCreatePayosLink = async (orderId: string) => {
    if (!tenantId) return;
    setSettlementError(null);
    setPendingOrderId(orderId);
    try {
      const link = await createPayosLink(
        tenantId,
        orderId,
        window.location.origin,
      );
      setPayosLink(link);
      setPayosOrderId(orderId);
    } catch (error) {
      setSettlementError(
        error instanceof Error ? error.message : 'Không tạo được mã PayOS.',
      );
    } finally {
      setPendingOrderId(null);
    }
  };

  // Cancel one unpaid Order with a mandatory reason. The server restores the
  // recorded Inventory deductions exactly once (REQ-CAS-002, REQ-INV-002).
  const handleCancelOrder = async () => {
    if (!cancelTargetId || !tenantId) return;
    const reason = cancelReason.trim();
    if (reason.length === 0) {
      setCancelError('Vui lòng nhập lý do huỷ đơn.');
      return;
    }
    setCancelError(null);
    const key =
      cancelKeys.current.get(cancelTargetId) ??
      `idem-cancel-${cancelTargetId}-${crypto.randomUUID()}`;
    cancelKeys.current.set(cancelTargetId, key);
    try {
      await cancelUnpaidOrder({
        tenantId,
        orderId: cancelTargetId,
        reason,
        idempotencyKey: key,
      });
      cancelKeys.current.delete(cancelTargetId);
      setOrders(prev => prev.filter(o => o.id !== cancelTargetId));
      setCancelTargetId(null);
      setCancelReason('');
    } catch (error) {
      setCancelError(
        error instanceof Error ? error.message : 'Không thể huỷ đơn hàng.',
      );
    }
  };

  const handleCashierLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (cashierPin.length >= 4) {
      setCashierActiveShift(true);
      setCashierPinError('');
    } else {
      setCashierPinError('Vui lòng nhập mã PIN đủ 4 số!');
    }
  };

  // Observe the immutable Payment record for one Order while it is open.
  const unpaidOrderIds = orders.map((order) => order.id).join('|');
  useEffect(() => {
    if (!tenantId || unpaidOrderIds.length === 0) return;
    const unsubscribers = unpaidOrderIds.split('|').map((orderId) =>
      subscribeOrderPayment(
        tenantId,
        orderId,
        (payment) => {
          if (payment) {
            setOrders(prev => prev.filter(o => o.id !== orderId));
          }
        },
        (error) => setSettlementError(error.message),
      ),
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [tenantId, unpaidOrderIds]);

  // The till picks the table to collect from on the same floor plan the other
  // operating pages use (REQ-TBL-002, REQ-CAS-001), and the pick opens that
  // table's invoice dialog (REQ-CAS-003). This runs before the PIN early
  // return below, so it must not depend on `activeUnpaidOrders`.
  const [selectedTableId, setSelectedTableId] = useState<string | null>(
    focusTableId ?? null,
  );
  const { tables: operationTables } = useOperationTables(tables);
  const layout = useMemo(
    () => resolvePlanLayout(operationTables),
    [operationTables],
  );
  const boardStates = useMemo(() => {
    const states = new Map<string, OperationTableState>();
    for (const [tableId, summary] of summarizeOrdersByTable(orders)) {
      states.set(tableId, {
        state: 'awaitingPayment',
        count: summary.count,
      });
    }
    return states;
  }, [orders]);

  // The dialog's history: the settled invoices of the selected table, read
  // from the server because `orders` is not client-readable (REQ-CAS-003).
  useEffect(() => {
    setInvoicePage(1);
    setShowHistory(false);
    setOpenPaymentId(null);
    if (!tenantId || !selectedTableId) {
      setTableInvoices([]);
      setInvoiceError(null);
      return;
    }
    let cancelled = false;
    setInvoiceLoading(true);
    setInvoiceError(null);
    void (async () => {
      try {
        const [invoices, loyalty] = await Promise.all([
          listTableInvoices(tenantId, selectedTableId),
          // A missing member list only costs the printed name, never the bill.
          listLoyaltyMembers().catch(() => [] as LoyaltyMemberView[]),
        ]);
        if (cancelled) return;
        setTableInvoices(invoices.map(toViewOrder));
        setMembers(loyalty);
      } catch (error) {
        if (cancelled) return;
        setInvoiceError(
          error instanceof Error ? error.message : 'Không tải được hoá đơn cũ.',
        );
      } finally {
        if (!cancelled) setInvoiceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, selectedTableId, invoiceReload]);

  // One listener for the settled invoice whose payment record is open.
  useEffect(() => {
    if (!tenantId || !openPaymentId) {
      setOpenPayment(null);
      return;
    }
    return subscribeOrderPayment(
      tenantId,
      openPaymentId,
      (payment) => setOpenPayment(payment),
      () => setOpenPayment(null),
    );
  }, [tenantId, openPaymentId]);

  // Login Screen
  if (!embedded && !cashierActiveShift) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-grow flex flex-col bg-white p-8 font-sans justify-between text-[#2D2B30] h-full" 
        id="cashier-login"
      >
        <div className="space-y-4 mt-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F5F5F7] border border-[#E5E5EA] flex items-center justify-center mx-auto shadow-sm">
            <CreditCard className="w-5 h-5 text-zinc-900" />
          </div>
          <h3 className="text-2xl font-bold text-[#2D2B30] text-center tracking-tight">Thu Ngân</h3>
          <p className="text-xs text-[#8E8E93] text-center max-w-[240px] mx-auto leading-relaxed">
            Vui lòng nhập mã PIN.
          </p>
        </div>

        <form onSubmit={handleCashierLogin} className="space-y-3 text-center my-6">
          <input 
            type="password" 
            value={cashierPin}
            onChange={(e) => {
              setCashierPin(e.target.value.replace(/\D/g, ''));
              setCashierPinError('');
            }}
            placeholder="••••"
            maxLength={4}
            className="w-32 bg-[#F2F2F7] border border-[#E5E5EA] rounded-2xl text-center tracking-[0.4em] text-xl py-3 text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 shadow-sm font-bold"
          />
          {cashierPinError ? (
            <p className="text-xs text-red-650 font-medium">{cashierPinError}</p>
          ) : (
            <p className="text-xs text-[#8E8E93] font-medium">Nhập số bất kỳ để trải nghiệm thử</p>
          )}
        </form>

        <motion.button 
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleCashierLogin}
          className="w-full bg-zinc-950 hover:bg-zinc-900 text-white py-3.5 rounded-2xl font-semibold text-xs shadow-sm transition-all cursor-pointer"
        >
          Đăng nhập
        </motion.button>
      </motion.div>
    );
  }

  // Active unsettled orders logic
  const activeUnpaidOrders = orders.filter(o => o.status !== 'paid');
  const dialogTable = selectedTableId
    ? operationTables.find((table) => table.tableId === selectedTableId) ?? null
    : null;
  const dialogOrders = selectedTableId
    ? ordersForTable(activeUnpaidOrders, selectedTableId)
    : [];
  const history = paginateInvoices(tableInvoices, invoicePage);
  // A free table opens straight onto its invoice history; a busy one shows the
  // open bill first and offers the history below (REQ-CAS-003).
  const historyVisible = showHistory || dialogOrders.length === 0;

  const renderInvoiceCard = (order: Order) => (
    <InvoiceCard
      key={order.id}
      order={order}
      tableName={
        order.tableName ??
        tables.find(t => t.id === order.tableId)?.name ??
        `Bàn ${order.tableId}`
      }
      customerName={resolveCustomerName(members, order)}
      pending={pendingOrderId === order.id}
      payosLink={payosOrderId === order.id ? payosLink : null}
      onSettle={(orderId, method) => void handleSettleOrder(orderId, method)}
      onCancel={(orderId) => {
        setCancelError(null);
        setCancelReason('');
        setCancelTargetId(orderId);
      }}
      onPayos={(orderId) => void handleCreatePayosLink(orderId)}
      onClosePayos={() => {
        setPayosLink(null);
        setPayosOrderId(null);
      }}
    />
  );

  // One table's bills, shared by the till's dialog and the Waiter's inline
  // sheet (REQ-CAS-003, REQ-WAI-002).
  const invoiceDialogBody = (
    <div className="flex-grow space-y-[13px] overflow-y-auto p-[13px]">
      {invoiceLoading && (
        <p className="text-xs font-semibold text-[#808080]">
          Đang tải hoá đơn...
        </p>
      )}
      {invoiceError && (
        <p role="alert" className="text-xs font-semibold text-red-600">
          {invoiceError}
        </p>
      )}

      <div className="space-y-[13px]" data-testid="invoice-dialog-current">
        {!queueLoaded ? (
          <p className="rounded-[21px] border border-dashed border-[#B5C7D8] bg-[#F5F5F7] px-4 py-5 text-center text-xs font-semibold text-[#808080]">
            Đang tải hoá đơn...
          </p>
        ) : dialogOrders.length === 0 ? (
          <div className="rounded-[21px] border border-dashed border-[#B5C7D8] bg-[#F5F5F7] px-4 py-5 text-center">
            <p className="text-sm font-bold text-zinc-900">
              Bàn này không còn nợ
            </p>
            <p className="mt-1 text-xs text-[#808080]">
              {tableInvoices.length > 0
                ? 'Xem lại hoá đơn cũ của bàn bên dưới.'
                : 'Bàn này chưa có hoá đơn nào.'}
            </p>
          </div>
        ) : (
          dialogOrders.map(renderInvoiceCard)
        )}
      </div>

      <div className="rounded-[21px] border border-[#B5C7D8] bg-white">
        {dialogOrders.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((current) => !current)}
            data-testid="invoice-history-toggle"
            aria-expanded={historyVisible}
            className="flex w-full items-center gap-2 px-[13px] py-3 text-left text-xs font-bold text-zinc-900 cursor-pointer"
          >
            <History className="w-4 h-4 text-zinc-500" />
            Xem hoá đơn khác ({tableInvoices.length})
          </button>
        )}

        {historyVisible && (
          <div
            data-testid="invoice-history"
            className="border-t border-[#B5C7D8]/40 px-[13px] py-1"
          >
            {tableInvoices.length === 0 ? (
              <p className="py-3 text-xs text-[#808080]">
                Bàn này chưa có hoá đơn nào.
              </p>
            ) : (
              history.rows.map((invoice) => (
                <div
                  key={invoice.id}
                  className="border-b border-[#B5C7D8]/30 last:border-b-0"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenPaymentId((current) =>
                        current === invoice.id ? null : invoice.id,
                      )
                    }
                    data-testid="invoice-history-row"
                    aria-expanded={openPaymentId === invoice.id}
                    className="flex w-full items-center justify-between gap-2 py-2.5 text-left cursor-pointer"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-zinc-900">
                        {invoice.tableName ?? dialogTable?.name} · #
                        {invoice.id.slice(-6).toUpperCase()}
                      </span>
                      <span className="block truncate text-[11px] text-[#808080]">
                        {invoice.timestamp.toLocaleString('vi-VN')} ·{' '}
                        {invoice.items
                          .map((item) => `${item.quantity}x ${item.name}`)
                          .join(', ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-emerald-600">
                      {invoice.total.toLocaleString()}đ
                    </span>
                  </button>

                  {openPaymentId === invoice.id && (
                    <div
                      data-testid="invoice-payment"
                      className="mb-2 rounded-xl border border-[#B5C7D8] bg-[#F5F5F7] p-2.5 text-[11px] text-[#454547]"
                    >
                      {openPayment ? (
                        <div className="space-y-0.5">
                          <p className="font-bold text-[#2D2B30]">
                            Mã thanh toán: {PAYMENT_METHOD_LABEL[openPayment.method]} ·{' '}
                            {openPayment.amountVnd.toLocaleString()}đ
                          </p>
                          <p>
                            {openPayment.status === 'confirmed'
                              ? 'Đã thu'
                              : PAYMENT_STATUS_LABEL[openPayment.status]}{' '}
                            lúc{' '}
                            {new Date(openPayment.confirmedAt).toLocaleString('vi-VN')}
                          </p>
                          <p className="font-mono break-all">
                            {openPayment.paymentId}
                          </p>
                        </div>
                      ) : (
                        <p>Chưa đọc được bản ghi thanh toán.</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {history.pageCount > 1 && (
              <div className="flex items-center justify-between gap-2 py-2">
                <button
                  type="button"
                  onClick={() => setInvoicePage(history.page - 1)}
                  disabled={history.page <= 1}
                  data-testid="invoice-page-prev"
                  className="flex h-11 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Trước
                </button>
                <span className="text-[11px] font-bold text-[#808080]">
                  Trang {history.page}/{history.pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setInvoicePage(history.page + 1)}
                  disabled={history.page >= history.pageCount}
                  data-testid="invoice-page-next"
                  className="flex h-11 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-700 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                >
                  Tiếp
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  // One cancel sheet, shared by the till page and the focused Waiter sheet.
  const cancelDialog =
    cancelTargetId &&
    createPortal(
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-zinc-950/40 p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Huỷ đơn hàng"
          data-testid="cashier-cancel-dialog"
          className="w-full max-w-md space-y-2 rounded-[21px] border border-red-200 bg-red-50 p-[13px]"
        >
          <p className="text-sm font-bold text-red-700">Lý do huỷ đơn</p>
          <textarea
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={500}
            rows={2}
            className="w-full rounded-xl border border-red-200 bg-white p-2 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Ví dụ: khách đổi ý"
          />
          {cancelError && (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {cancelError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCancelOrder()}
              className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
            >
              Xác nhận huỷ
            </button>
            <button
              type="button"
              onClick={() => setCancelTargetId(null)}
              className="bg-white border border-zinc-200 text-zinc-700 font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  // REQ-WAI-002: a Waiter who is also a Cashier settles from this exact sheet,
  // inline in the table dialog the Waiter already has open.
  if (focusTableId) {
    return (
      <div
        data-testid="cashier-focus"
        className="flex-grow flex flex-col overflow-hidden bg-white font-sans text-[#2D2B30]"
      >
        {/* The till prints this beside its bill list; the focused sheet needs
            its own copy or a failed settle would look like nothing happened. */}
        {settlementError && (
          <p
            role="alert"
            className="border-b border-red-100 bg-red-50 px-[13px] py-2 text-xs font-semibold text-red-600"
          >
            {settlementError}
          </p>
        )}
        {dialogTable ? (
          invoiceDialogBody
        ) : (
          <p className="p-[13px] text-xs font-semibold text-[#808080]">
            Đang tải bàn...
          </p>
        )}
        {cancelDialog}
      </div>
    );
  }

  return (
    <div className="flex-grow flex flex-col bg-white font-sans text-[#2D2B30] h-full" id="cashier-main">
      <div className="bg-[#F5F5F7] px-[13px] py-[13px] border-b border-[#B5C7D8]/60 flex justify-between items-center select-none">
        <div className="flex items-center gap-[4px]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span className="text-sm font-bold text-[#2D2B30] ">Thu Ngân</span>
        </div>
        <span className="text-sm bg-zinc-900 text-white font-semibold rounded-[21px] px-2.5 py-0.5 ">
          {activeUnpaidOrders.length} Đơn Nợ
        </span>
      </div>

      <div className="flex-grow overflow-y-auto p-[13px] space-y-[13px] bg-white">
        <OperationTableBoard
          placements={layout.placements}
          columns={layout.columns}
          rows={layout.rows}
          states={boardStates}
          selectedTableId={selectedTableId}
          onSelect={(table) =>
            setSelectedTableId((current) =>
              current === table.tableId ? null : table.tableId,
            )
          }
        />

        <div className="text-xs font-bold text-[#808080] select-none flex justify-between">
          <span>Hóa đơn</span>
          <span className="text-xs text-zinc-900 lowercase">sync</span>
        </div>

        {activeUnpaidOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center select-none">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="text-sm font-bold text-zinc-900">Tất cả đã thanh toán!</p>
            <p className="text-xs text-zinc-400 mt-1">Không có bàn nào nợ tiền</p>
          </div>
        ) : (
          <div className="space-y-[13px]">
            {activeUnpaidOrders.map(renderInvoiceCard)}
          </div>
        )}

        {settlementError && (
          <p role="alert" className="text-xs font-semibold text-red-600">
            {settlementError}
          </p>
        )}

        {cancelDialog}

        {/* Loyalty details list for cashier verification (P2 mock; no M1 contract) */}
        <div className="bg-white border border-[#B5C7D8] p-[13px] rounded-[21px] shadow-sm text-[#2D2B30] space-y-[13px]" data-testid="loyalty-demo">
          <div className="text-sm font-bold text-[#2D2B30] flex items-center gap-[4px] select-none">
            <CheckCircle className="w-4 h-4 text-zinc-900" />
            Hội viên trung thành hệ thống
            <span className="ml-auto text-[9px] font-bold text-[#808080] uppercase">Demo</span>
          </div>
          
          <div className="space-y-[4px]">
            {loyaltyMembers.map(member => (
              <div key={member.phone} className="flex justify-between items-center bg-[#F5F5F7] p-[13px] rounded-[21px] border border-[#B5C7D8] text-sm hover:bg-[#E5E5EA] transition-colors">
                <div className="space-y-[2px]">
                  <p className="font-semibold text-[#2D2B30]">{member.name}</p>
                  <p className="text-xs text-[#808080] ">SĐT: {member.phone}</p>
                </div>
                <div className="text-right space-y-[2px]">
                  <span className="text-xs bg-zinc-900/10 text-zinc-900 px-2 py-0.5 rounded-[21px] font-bold ">
                    {member.points} pt
                  </span>
                  <p className="text-[9px] text-[#808080] ">Ghé thăm: {member.visits} lần</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/*
        One table's bills, opened from the floor plan (REQ-CAS-003). Rendered at
        the document body: the operating frame clips its content, and the sheet
        must cover the whole viewport on a phone.
      */}
      {dialogTable &&
        createPortal(
          <div className="fixed inset-0 z-[9999] flex items-stretch justify-center bg-zinc-950/40 sm:items-center sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`Hoá đơn ${dialogTable.name}`}
              data-testid="cashier-invoice-dialog"
              className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-[21px] sm:border sm:border-[#B5C7D8]"
            >
              <div className="flex items-start justify-between gap-3 border-b border-[#B5C7D8]/60 bg-[#F5F5F7] px-[13px] py-[13px] select-none">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[#2D2B30]">
                    {dialogTable.name}
                  </p>
                  <p className="text-[11px] font-semibold text-[#808080]">
                    {!queueLoaded
                      ? 'Đang tải...'
                      : dialogOrders.length > 0
                        ? 'Đang có khách'
                        : 'Bàn trống'}
                    {dialogTable.area ? ` · khu ${dialogTable.area}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTableId(null)}
                  aria-label="Đóng hoá đơn"
                  data-testid="invoice-dialog-close"
                  autoFocus
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {invoiceDialogBody}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

