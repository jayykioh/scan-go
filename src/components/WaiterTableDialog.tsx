import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCircle, ClipboardList, CreditCard, X } from 'lucide-react';
import type { OperationTable } from '../hooks/useOperationTables';
import type { Order, TableConfig, TenantConfig } from '../types';
import CashierView from './CashierView';
import StaffOrderEntry from './StaffOrderEntry';

interface WaiterTableDialogProps {
  table: OperationTable;
  tenantId: string;
  tenantConfig: TenantConfig;
  /** The Tenant's tables, so the focused till sheet names the bill's table. */
  tables: TableConfig[];
  /** Whether this Waiter also carries the Cashier role (REQ-WAI-002). */
  canCollect: boolean;
  /** The `ready` dishes of this table, so the Waiter serves them here. */
  readyOrders: Order[];
  onServe: (orderId: string) => void;
  onClose: () => void;
}

type WaiterTab = 'serve' | 'order' | 'collect';

/**
 * One table's workspace for a Waiter (REQ-WAI-002): the dishes to carry, the
 * order to add at that table, and — when the Waiter is also a Cashier — the
 * till's own invoice sheet. The dish list and the tables come from the shared
 * tenant store, so opening the dialog reads nothing new.
 */
export default function WaiterTableDialog({
  table,
  tenantId,
  tenantConfig,
  tables,
  canCollect,
  readyOrders,
  onServe,
  onClose,
}: WaiterTableDialogProps) {
  // A pinged table opens on what to carry; otherwise on taking the order.
  const [tab, setTab] = useState<WaiterTab>(
    readyOrders.length > 0 ? 'serve' : 'order',
  );

  const tabs: { key: WaiterTab; label: string; icon: ReactNode }[] = [
    { key: 'serve', label: `Phục vụ (${readyOrders.length})`, icon: <Bell className="w-4 h-4" /> },
    { key: 'order', label: 'Thêm món', icon: <ClipboardList className="w-4 h-4" /> },
    ...(canCollect
      ? [{ key: 'collect' as const, label: 'Thu tiền', icon: <CreditCard className="w-4 h-4" /> }]
      : []),
  ];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-stretch justify-center bg-zinc-950/40 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bàn ${table.name}`}
        data-testid="waiter-table-dialog"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl sm:h-auto sm:max-h-[85vh] sm:max-w-2xl sm:rounded-[21px] sm:border sm:border-[#B5C7D8]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#B5C7D8]/60 bg-[#F5F5F7] px-[13px] py-[13px] select-none">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#2D2B30]">{table.name}</p>
            <p className="text-[11px] font-semibold text-[#808080]">
              {readyOrders.length > 0
                ? `${readyOrders.length} món cần phục vụ`
                : 'Không có món chờ phục vụ'}
              {table.area ? ` · khu ${table.area}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bàn"
            data-testid="waiter-table-close"
            autoFocus
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-[#B5C7D8]/40 bg-white" role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={tab === entry.key}
              onClick={() => setTab(entry.key)}
              className={`flex flex-1 items-center justify-center gap-1.5 py-3 text-[11px] font-bold transition-colors cursor-pointer ${
                tab === entry.key
                  ? 'border-b-2 border-[#155BD0] text-[#155BD0]'
                  : 'text-[#8E8E93]'
              }`}
            >
              {entry.icon}
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {tab === 'serve' && (
            <div className="flex-grow space-y-3 overflow-y-auto p-[13px]">
              {readyOrders.length === 0 && (
                <p className="py-8 text-center text-xs text-[#8E8E93]">
                  Bàn này chưa có món cần phục vụ.
                </p>
              )}
              {readyOrders.map((order) => (
                <div
                  key={order.id}
                  data-testid="waiter-serve-card"
                  className="rounded-[21px] border border-emerald-200 bg-[#F5F5F7] p-4 shadow-sm"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-bold">
                      {order.orderType === 'takeaway' ? 'Mang về' : table.name}
                    </span>
                    <span className="text-[10px] text-[#8E8E93]">
                      #{order.id.slice(-6)}
                    </span>
                  </div>
                  <div className="mb-3 space-y-1 text-[11px] text-[#707070]">
                    {order.items.map((item) => (
                      <div key={item.menuId} className="flex justify-between">
                        <span>
                          {item.quantity}x {item.name}
                        </span>
                        <span className="tabular-nums">
                          {item.price.toLocaleString()}đ
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onServe(order.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-[21px] bg-emerald-600 py-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 cursor-pointer"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Đã phục vụ
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'order' && (
            <div className="flex-grow overflow-y-auto">
              <StaffOrderEntry
                tenantId={tenantId}
                tenantConfig={tenantConfig}
                tables={tables}
                lockedTableId={table.tableId}
                searchable
              />
            </div>
          )}

          {tab === 'collect' && canCollect && (
            <CashierView
              key={table.tableId}
              tenantConfig={tenantConfig}
              tables={tables}
              loyaltyMembers={[]}
              tenantId={tenantId}
              embedded
              focusTableId={table.tableId}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
