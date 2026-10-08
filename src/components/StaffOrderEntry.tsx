import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, X, ShoppingBag, Check, AlertCircle } from 'lucide-react';
import type { CatalogMenuItem } from '@contracts/catalog.contract';
import type {
  OrderCartLineInput,
  OrderPaymentMode,
} from '@contracts/order.contract';
import { subscribeOwnerMenu } from '../data/adapters/catalog.adapter';
import {
  createOrderIdempotencyKey,
  createStaffOrder,
} from '../data/adapters/ordering.adapter';
import type { TableConfig, TenantConfig } from '../types';

interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  selectedOptionIds: string[];
  modifierLabel: string;
}

interface StaffOrderEntryProps {
  tenantId: string;
  tenantConfig: TenantConfig;
  tables: TableConfig[];
}

function selectionKey(menuItemId: string, optionIds: string[]): string {
  return `${menuItemId}::${[...optionIds].sort().join(',')}`;
}

function modifierLabelFor(
  item: CatalogMenuItem,
  optionIds: string[],
): string {
  const names: string[] = [];
  for (const group of item.modifierGroups) {
    for (const option of group.options) {
      if (optionIds.includes(option.optionId)) {
        names.push(option.name);
      }
    }
  }
  return names.join(', ');
}

function unitPriceFor(item: CatalogMenuItem, optionIds: string[]): number {
  let price = item.priceVnd;
  for (const group of item.modifierGroups) {
    for (const option of group.options) {
      if (optionIds.includes(option.optionId)) {
        price += option.priceDeltaVnd;
      }
    }
  }
  return price;
}

export default function StaffOrderEntry({
  tenantId,
  tenantConfig,
  tables,
}: StaffOrderEntryProps) {
  const [menuItems, setMenuItems] = useState<CatalogMenuItem[]>([]);
  const [orderType, setOrderType] = useState<'dineIn' | 'takeaway'>('dineIn');
  const [tableId, setTableId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [picker, setPicker] = useState<CatalogMenuItem | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    const unsubscribe = subscribeOwnerMenu(
      (items) => setMenuItems(items),
      (err) => setError(err.message),
    );
    return () => unsubscribe();
  }, [tenantId]);

  const availableItems = useMemo(
    () => menuItems.filter((item) => item.isAvailable && item.archivedAt === null),
    [menuItems],
  );

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart],
  );

  const openPicker = (item: CatalogMenuItem) => {
    if (item.modifierGroups.length === 0) {
      addLine(item, []);
      return;
    }
    setPicker(item);
    setPicked([]);
    setError(null);
  };

  const toggleOption = (item: CatalogMenuItem, groupId: string, optionId: string) => {
    const group = item.modifierGroups.find((entry) => entry.groupId === groupId);
    if (!group) return;
    setPicked((prev) => {
      if (group.selectionType === 'single') {
        const withoutGroup = prev.filter(
          (id) => !group.options.some((option) => option.optionId === id),
        );
        return [...withoutGroup, optionId];
      }
      if (prev.includes(optionId)) {
        return prev.filter((id) => id !== optionId);
      }
      const inGroup = prev.filter((id) =>
        group.options.some((option) => option.optionId === id),
      );
      if (group.maxSelections !== null && inGroup.length >= group.maxSelections) {
        return prev;
      }
      return [...prev, optionId];
    });
  };

  const confirmPicker = () => {
    if (!picker) return;
    for (const group of picker.modifierGroups) {
      const count = group.options.filter((option) =>
        picked.includes(option.optionId),
      ).length;
      const min = group.isRequired ? Math.max(1, group.minSelections) : group.minSelections;
      if (count < min) {
        setError(`Chọn mục bắt buộc: ${group.name}`);
        return;
      }
      if (group.maxSelections !== null && count > group.maxSelections) {
        setError(`Chọn tối đa ${group.maxSelections} mục: ${group.name}`);
        return;
      }
    }
    addLine(picker, picked);
    setPicker(null);
    setPicked([]);
    setError(null);
  };

  const addLine = (item: CatalogMenuItem, optionIds: string[]) => {
    const key = selectionKey(item.menuItemId, optionIds);
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...prev,
        {
          key,
          menuItemId: item.menuItemId,
          name: item.name,
          unitPrice: unitPriceFor(item, optionIds),
          quantity: 1,
          selectedOptionIds: optionIds,
          modifierLabel: modifierLabelFor(item, optionIds),
        },
      ];
    });
    setMessage(null);
  };

  const changeQuantity = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) =>
          line.key === key ? { ...line, quantity: line.quantity + delta } : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((line) => line.key !== key));
  };

  const submit = async () => {
    if (cart.length === 0 || submitting) return;
    if (orderType === 'dineIn' && !tableId) {
      setError('Chọn bàn trước khi gửi đơn.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const lines: OrderCartLineInput[] = cart.map((line) => ({
        menuItemId: line.menuItemId,
        quantity: line.quantity,
        selectedOptionIds: line.selectedOptionIds,
      }));
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = createOrderIdempotencyKey();
      }
      const paymentMode: OrderPaymentMode =
        tenantConfig.paymentMode === 'Pay-First' ? 'payFirst' : 'payLater';
      const result = await createStaffOrder({
        tenantId,
        orderType,
        tableId: orderType === 'dineIn' ? tableId : null,
        paymentMode,
        idempotencyKey: idempotencyKeyRef.current,
        lines,
      });
      idempotencyKeyRef.current = null;
      setCart([]);
      setMessage(`Đã gửi đơn #${result.order.orderId.slice(-6).toUpperCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không gửi được đơn.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold flex items-center gap-2">
          <ShoppingBag className="w-4 h-4 text-[#155BD0]" />
          Lên món tại quầy
        </h3>
      </div>

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-red-600 text-[11px]">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </p>
      )}
      {message && (
        <p role="status" className="flex items-center gap-1.5 text-emerald-700 text-[11px]">
          <Check className="w-3.5 h-3.5" /> {message}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOrderType('dineIn')}
          className={`flex-1 py-2 rounded-[21px] text-[11px] font-bold transition-colors cursor-pointer ${
            orderType === 'dineIn'
              ? 'bg-[#155BD0] text-white'
              : 'bg-[#F5F5F7] text-[#707070]'
          }`}
        >
          Tại bàn
        </button>
        <button
          type="button"
          onClick={() => setOrderType('takeaway')}
          className={`flex-1 py-2 rounded-[21px] text-[11px] font-bold transition-colors cursor-pointer ${
            orderType === 'takeaway'
              ? 'bg-[#155BD0] text-white'
              : 'bg-[#F5F5F7] text-[#707070]'
          }`}
        >
          Mang về
        </button>
      </div>

      {orderType === 'dineIn' && (
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="w-full bg-[#F5F5F7] border border-[#B5C7D8] rounded-[21px] px-3 py-2 text-[11px] font-semibold focus:outline-none focus:border-[#155BD0]"
        >
          <option value="">Chọn bàn</option>
          {tables.map((table) => (
            <option key={table.id} value={table.id}>
              {table.name}
            </option>
          ))}
        </select>
      )}

      <div className="grid grid-cols-2 gap-2">
        {availableItems.map((item) => (
          <button
            key={item.menuItemId}
            type="button"
            onClick={() => openPicker(item)}
            className="text-left bg-white border border-[#B5C7D8] rounded-[16px] p-2.5 hover:border-[#155BD0] transition-colors cursor-pointer"
          >
            <p className="text-[11px] font-bold text-[#2D2B30] line-clamp-2">{item.name}</p>
            <p className="text-[10px] text-[#155BD0] font-bold mt-1">
              {item.priceVnd.toLocaleString('vi-VN')}đ
            </p>
          </button>
        ))}
        {availableItems.length === 0 && (
          <p className="col-span-2 text-[11px] text-[#8E8E93] text-center py-6">
            Chưa có món khả dụng.
          </p>
        )}
      </div>

      {cart.length > 0 && (
        <div className="border-t border-[#B5C7D8]/30 pt-3 space-y-2">
          {cart.map((line) => (
            <div key={line.key} className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-[#2D2B30] truncate">
                  {line.name}
                </p>
                {line.modifierLabel && (
                  <p className="text-[9px] text-[#8E8E93] truncate">
                    {line.modifierLabel}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => changeQuantity(line.key, -1)}
                  className="w-6 h-6 rounded-full bg-[#F5F5F7] flex items-center justify-center cursor-pointer"
                >
                  <Minus className="w-3 h-3" />
                </button>
                <span className="text-[11px] font-bold w-5 text-center">{line.quantity}</span>
                <button
                  type="button"
                  onClick={() => changeQuantity(line.key, 1)}
                  className="w-6 h-6 rounded-full bg-[#F5F5F7] flex items-center justify-center cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => removeLine(line.key)}
                  className="w-6 h-6 rounded-full bg-red-50 text-red-500 flex items-center justify-center cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2 border-t border-[#B5C7D8]/30">
            <span className="text-[11px] font-bold text-[#2D2B30]">Tổng tạm tính</span>
            <span className="text-[13px] font-bold text-[#155BD0]">
              {total.toLocaleString('vi-VN')}đ
            </span>
          </div>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="w-full bg-[#155BD0] hover:bg-[#155BD0]/90 text-white font-semibold text-sm py-3 rounded-[21px] transition-colors cursor-pointer disabled:opacity-60"
          >
            {submitting ? 'Đang gửi...' : 'Gửi đơn vào bếp'}
          </button>
        </div>
      )}

      {picker && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-0">
          <div className="bg-white w-full max-w-[420px] rounded-t-[24px] p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-bold text-[#2D2B30]">{picker.name}</h4>
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="p-1 text-[#8E8E93] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {picker.modifierGroups.map((group) => (
                <div key={group.groupId} className="space-y-1.5">
                  <p className="text-[11px] font-bold text-[#2D2B30]">
                    {group.name}
                    {group.isRequired && <span className="text-red-500"> *</span>}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const active = picked.includes(option.optionId);
                      return (
                        <button
                          key={option.optionId}
                          type="button"
                          onClick={() =>
                            toggleOption(picker, group.groupId, option.optionId)
                          }
                          className={`px-2.5 py-1.5 rounded-[16px] text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                            active
                              ? 'bg-[#155BD0] text-white border-[#155BD0]'
                              : 'bg-white text-[#2D2B30] border-[#B5C7D8]'
                          }`}
                        >
                          {option.name}
                          {option.priceDeltaVnd > 0 &&
                            ` +${option.priceDeltaVnd.toLocaleString('vi-VN')}`}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={confirmPicker}
              className="w-full mt-4 bg-[#155BD0] text-white font-semibold text-sm py-3 rounded-[21px] cursor-pointer"
            >
              Thêm vào đơn
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
