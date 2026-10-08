import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Boxes,
  ClipboardList,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  Ingredient,
  InventoryChangeEntry,
  UnitInput,
} from '@contracts/inventory.contract';
import {
  adjustStock,
  archiveIngredient,
  createIngredient,
  getInventoryChangeReport,
  subscribeIngredients,
  updateIngredient,
} from '../data/adapters/inventory.adapter';
import { useToast } from '../contexts/ToastContext';

interface InventoryPanelProps {
  /** When true the panel hides its own title (embedded in a tabbed view). */
  embedded?: boolean;
}

interface IngredientForm {
  mode: 'create' | 'edit';
  ingredientId: string | null;
  name: string;
  purchaseUnit: UnitInput;
  countUnitLabel: string;
  purchasePriceVnd: string;
  lowStockThreshold: string;
  initialQuantity: string;
  isActive: boolean;
}

const UNIT_OPTIONS: Array<{ value: UnitInput; label: string }> = [
  { value: 'g', label: 'g (gam)' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l (lít)' },
  { value: 'unit', label: 'đếm (trái, hộp...)' },
];

const BASE_UNIT_LABEL: Record<Ingredient['baseUnit'], string> = {
  g: 'g',
  ml: 'ml',
  unit: 'đơn vị',
};

/** Count ingredients show their free-text unit name, for example "trái". */
function displayUnit(ingredient: Ingredient): string {
  if (ingredient.baseUnit === 'unit') {
    return ingredient.countUnitLabel ?? 'đơn vị';
  }
  return BASE_UNIT_LABEL[ingredient.baseUnit];
}

/** The chosen purchase unit, with the count name when the unit is count. */
function purchaseUnitLabel(ingredient: Ingredient): string {
  if (ingredient.baseUnit === 'unit') {
    return ingredient.countUnitLabel ?? 'đơn vị';
  }
  const value = ingredient.purchaseUnit ?? ingredient.baseUnit;
  return UNIT_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

const EMPTY_FORM: IngredientForm = {
  mode: 'create',
  ingredientId: null,
  name: '',
  purchaseUnit: 'kg',
  countUnitLabel: '',
  purchasePriceVnd: '',
  lowStockThreshold: '0',
  initialQuantity: '',
  isActive: true,
};

const ACTION_LABEL: Record<string, string> = {
  IngredientChanged: 'Nguyên liệu',
  RecipeChanged: 'Công thức',
  StockAdjusted: 'Điều chỉnh kho',
  StockCountRecorded: 'Kiểm kê',
};

const COMMAND_LABEL: Record<string, string> = {
  create: 'Thêm',
  update: 'Sửa',
  archive: 'Lưu trữ',
  adjustStock: 'Điều chỉnh',
};

function formatVnd(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeChange(entry: InventoryChangeEntry): string {
  const verb = entry.command ? COMMAND_LABEL[entry.command] ?? entry.command : 'Đổi';
  const subject = ACTION_LABEL[entry.action] ?? entry.action;
  return `${verb} ${subject.toLowerCase()}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Thao tác kho thất bại.';
}

/** Base unit of a purchase unit, matched against an ingredient base unit. */
function isUnitCompatible(unit: UnitInput, baseUnit: Ingredient['baseUnit']): boolean {
  if (unit === 'kg' || unit === 'g') return baseUnit === 'g';
  if (unit === 'l' || unit === 'ml') return baseUnit === 'ml';
  return baseUnit === 'unit';
}

export default function InventoryPanel({ embedded = false }: InventoryPanelProps) {
  const toast = useToast();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [report, setReport] = useState<InventoryChangeEntry[]>([]);
  const [showReport, setShowReport] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<IngredientForm | null>(null);
  const [archiving, setArchiving] = useState<Ingredient | null>(null);
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null);
  const [adjustDelta, setAdjustDelta] = useState('');
  const [adjustReason, setAdjustReason] = useState<
    'waste' | 'manual_adjustment'
  >('waste');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustLotPrice, setAdjustLotPrice] = useState('');
  const [adjustLotUnit, setAdjustLotUnit] = useState<UnitInput>('g');

  useEffect(() => {
    const unsubscribe = subscribeIngredients(
      (list) => setIngredients(list),
      (error) => setListError(error.message),
    );
    return () => unsubscribe();
  }, []);

  const activeIngredients = useMemo(
    () => ingredients.filter((item) => item.archivedAt === null),
    [ingredients],
  );

  const loadReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const result = await getInventoryChangeReport(50);
      setReport(result.entries);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoadingReport(false);
    }
  }, [toast]);

  useEffect(() => {
    if (showReport) void loadReport();
  }, [showReport, loadReport]);

  const openCreate = () => {
    setForm({ ...EMPTY_FORM });
  };

  const openEdit = (ingredient: Ingredient) => {
    setForm({
      mode: 'edit',
      ingredientId: ingredient.ingredientId,
      name: ingredient.name,
      purchaseUnit: ingredient.purchaseUnit ?? ingredient.baseUnit,
      countUnitLabel: ingredient.countUnitLabel ?? '',
      purchasePriceVnd: String(ingredient.purchasePriceVnd ?? ''),
      lowStockThreshold: String(ingredient.lowStockThreshold),
      initialQuantity: '',
      isActive: ingredient.isActive,
    });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || saving) return;
    const name = form.name.trim();
    const price = Number(form.purchasePriceVnd);
    if (!name) {
      toast.error('Vui lòng nhập tên nguyên liệu');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error('Giá nhập không hợp lệ');
      return;
    }
    const threshold = Number(form.lowStockThreshold || '0');
    if (!Number.isInteger(threshold) || threshold < 0) {
      toast.error('Ngưỡng cảnh báo không hợp lệ');
      return;
    }
    const countUnitLabel = form.countUnitLabel.trim();
    if (form.purchaseUnit === 'unit' && !countUnitLabel) {
      toast.error('Nhập tên đơn vị đếm, ví dụ: trái, hộp');
      return;
    }

    setSaving(true);
    try {
      if (form.mode === 'create') {
        const initial = Number(form.initialQuantity || '0');
        if (!Number.isFinite(initial) || initial < 0) {
          toast.error('Số lượng tồn ban đầu không hợp lệ');
          return;
        }
        await createIngredient({
          name,
          purchaseUnit: form.purchaseUnit,
          countUnitLabel:
            form.purchaseUnit === 'unit' ? countUnitLabel : null,
          purchasePriceVnd: price,
          lowStockThreshold: threshold,
          isActive: form.isActive,
          stockInput:
            initial > 0
              ? { unit: form.purchaseUnit, quantity: initial }
              : null,
        });
        toast.success('Đã thêm nguyên liệu');
      } else if (form.ingredientId) {
        await updateIngredient(form.ingredientId, {
          name,
          purchaseUnit: form.purchaseUnit,
          countUnitLabel:
            form.purchaseUnit === 'unit' ? countUnitLabel : null,
          purchasePriceVnd: price,
          lowStockThreshold: threshold,
          isActive: form.isActive,
        });
        toast.success('Đã cập nhật nguyên liệu');
      }
      setForm(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiving) return;
    setSaving(true);
    try {
      await archiveIngredient(
        archiving.ingredientId,
        'Lưu trữ từ màn hình kho',
      );
      toast.success(`Đã lưu trữ ${archiving.name}`);
      setArchiving(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjust = async () => {
    if (!adjusting) return;
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error('Số lượng điều chỉnh phải là số nguyên khác 0');
      return;
    }
    const isDeduction = delta < 0;
    const reason = isDeduction ? adjustReason : 'stock_in';
    const note = isDeduction ? adjustNote.trim() : null;
    if (isDeduction && !note) {
      toast.error('Cần ghi lý do khi giảm kho (hết hạn, hỏng, hoặc lý do khác)');
      return;
    }

    // A purchase lot needs its own price so the server can record it and move
    // the Cost to the weighted average (REQ-INV-010, ADR 0014).
    let lot: { purchaseUnit: UnitInput; purchasePriceVnd: number } | undefined;
    if (!isDeduction) {
      const lotPrice = Number(adjustLotPrice);
      if (!Number.isFinite(lotPrice) || lotPrice < 0 || adjustLotPrice.trim() === '') {
        toast.error('Vui lòng nhập giá mua của đợt hàng này');
        return;
      }
      if (!isUnitCompatible(adjustLotUnit, adjusting.baseUnit)) {
        toast.error('Đơn vị giá không khớp với đơn vị gốc của nguyên liệu');
        return;
      }
      lot = { purchaseUnit: adjustLotUnit, purchasePriceVnd: lotPrice };
    }

    setSaving(true);
    try {
      await adjustStock(
        adjusting.ingredientId,
        delta,
        reason,
        `inv-adjust-${adjusting.ingredientId}-${Date.now()}`,
        note,
        lot,
      );
      toast.success(
        isDeduction ? 'Đã điều chỉnh tồn kho' : 'Đã nhập hàng vào kho',
      );
      setAdjusting(null);
      setAdjustDelta('');
      setAdjustNote('');
      setAdjustReason('waste');
      setAdjustLotPrice('');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={embedded ? 'p-4 space-y-4' : 'p-6 md:p-12 w-full max-w-6xl mx-auto animate-fadeIn space-y-6'}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {!embedded && (
          <div>
            <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-tighter flex items-center gap-3">
              <Boxes className="w-8 h-8" />
              Kho nguyên liệu
            </h1>
            <p className="font-mono text-xs text-zinc-500 uppercase tracking-widest mt-2">
              Quản lý và theo dõi mọi thay đổi
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowReport((value) => !value)}
            className={`font-mono font-bold text-xs uppercase tracking-widest px-4 py-2.5 border-hard flex items-center gap-2 transition-colors cursor-pointer ${
              showReport ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <History className="w-4 h-4" />
            Báo cáo thay đổi
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-4 py-2.5 border-hard shadow-hard flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Thêm nguyên liệu
          </button>
        </div>
      </div>

      {listError && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      <AnimatePresence>
        {showReport && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-white border-hard shadow-hard">
              <div className="flex items-center justify-between p-4 border-b border-hard">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-orange-600" />
                  <span className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-900">
                    Báo cáo thay đổi kho ({report.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void loadReport()}
                  className="p-2 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                  title="Tải lại báo cáo"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100">
                {report.length === 0 ? (
                  <p className="p-6 text-center text-sm text-zinc-500">
                    Chưa có thay đổi nào được ghi nhận.
                  </p>
                ) : (
                  report.map((entry) => (
                    <div key={entry.eventId} className="flex items-start justify-between gap-3 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900">
                          {describeChange(entry)}
                          {entry.targetName ? `: ${entry.targetName}` : ''}
                        </p>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">
                          {entry.actorType}
                          {entry.role ? ` · ${entry.role}` : ''} · {formatTime(entry.createdAt)}
                          {entry.quantityDelta !== null
                            ? ` · ${entry.quantityDelta > 0 ? '+' : ''}${entry.quantityDelta}`
                            : ''}
                        </p>
                        {entry.reason && (
                          <p className="text-xs text-zinc-500 mt-1">Lý do: {entry.reason}</p>
                        )}
                        {entry.note && (
                          <p className="text-xs text-zinc-500 mt-1">Ghi chú: {entry.note}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="bg-white border-hard shadow-hard overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[820px]">
          <thead>
            <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-widest">
              <th className="p-4 font-bold border-b border-hard">Nguyên liệu</th>
              <th className="p-4 font-bold border-b border-hard">Đơn vị</th>
              <th className="p-4 font-bold border-b border-hard">Giá nhập</th>
              <th className="p-4 font-bold border-b border-hard">Tồn kho</th>
              <th className="p-4 font-bold border-b border-hard">Trạng thái</th>
              <th className="p-4 font-bold border-b border-hard text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {activeIngredients.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">
                  Chưa có nguyên liệu. Bấm "Thêm nguyên liệu".
                </td>
              </tr>
            ) : (
              activeIngredients.map((ingredient) => {
                const low = ingredient.stockQuantity <= ingredient.lowStockThreshold;
                return (
                  <tr key={ingredient.ingredientId} className="hover:bg-zinc-50 transition-colors">
                    <td className="p-4 border-b border-hard">
                      <p className="font-bold text-zinc-900">{ingredient.name}</p>
                      <p className="font-mono text-[10px] text-zinc-400 mt-1">
                        #{ingredient.ingredientId.slice(-8)}
                      </p>
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard">
                      {purchaseUnitLabel(ingredient)}
                    </td>
                    <td className="p-4 font-mono text-xs text-zinc-600 border-b border-hard">
                      {ingredient.purchasePriceVnd !== null ? (
                        <>
                          <div>
                            {formatVnd(ingredient.purchasePriceVnd)}/
                            {purchaseUnitLabel(ingredient)}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-1">
                            Vốn {formatVnd(ingredient.unitCostVnd)}/
                            {displayUnit(ingredient)}
                          </div>
                        </>
                      ) : (
                        `${formatVnd(ingredient.unitCostVnd)}/${displayUnit(ingredient)}`
                      )}
                    </td>
                    <td className="p-4 border-b border-hard">
                      <span className={`font-mono text-xs font-bold ${low ? 'text-red-600' : 'text-zinc-900'}`}>
                        {ingredient.stockQuantity.toLocaleString('vi-VN')} {displayUnit(ingredient)}
                      </span>
                      <p className="font-mono text-[10px] text-zinc-400 mt-1">
                        Ngưỡng {ingredient.lowStockThreshold}
                      </p>
                    </td>
                    <td className="p-4 border-b border-hard">
                      <span
                        className={`font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-hard ${
                          ingredient.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {ingredient.isActive ? 'Đang dùng' : 'Tạm ngưng'}
                      </span>
                    </td>
                    <td className="p-4 border-b border-hard text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjusting(ingredient);
                            setAdjustDelta('');
                            setAdjustLotPrice('');
                            setAdjustLotUnit(
                              ingredient.purchaseUnit ?? ingredient.baseUnit,
                            );
                          }}
                          className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-1 border-hard hover:bg-zinc-100 cursor-pointer"
                        >
                          Tồn
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(ingredient)}
                          className="p-2 border-hard text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 cursor-pointer"
                          title="Sửa"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setArchiving(ingredient)}
                          className="p-2 border-hard text-zinc-500 hover:text-white hover:bg-red-500 cursor-pointer"
                          title="Lưu trữ"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal title={form.mode === 'create' ? 'Thêm nguyên liệu' : 'Sửa nguyên liệu'} onClose={() => setForm(null)}>
          <form onSubmit={handleSave} className="p-6 space-y-4">
            <Field label="Tên nguyên liệu">
              <input
                type="text"
                autoFocus
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-zinc-50 border-hard px-4 py-3 font-bold text-zinc-900 focus:outline-none focus:border-orange-600"
                placeholder="Ví dụ: Thịt bò"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Đơn vị nhập">
                <select
                  value={form.purchaseUnit}
                  onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value as UnitInput })}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-xs font-bold text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer"
                >
                  {UNIT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Giá nhập (VND)">
                <input
                  type="number"
                  min={0}
                  required
                  value={form.purchasePriceVnd}
                  onChange={(e) => setForm({ ...form, purchasePriceVnd: e.target.value })}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                  placeholder="0"
                />
              </Field>
            </div>
            {form.purchaseUnit === 'unit' && (
              <Field label="Tên đơn vị đếm">
                <input
                  type="text"
                  required
                  value={form.countUnitLabel}
                  onChange={(e) => setForm({ ...form, countUnitLabel: e.target.value })}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                  placeholder="Ví dụ: trái, hộp, phần"
                />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ngưỡng cảnh báo">
                <input
                  type="number"
                  min={0}
                  value={form.lowStockThreshold}
                  onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
                  className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                  placeholder="0"
                />
              </Field>
              {form.mode === 'create' && (
                <Field label="Tồn ban đầu">
                  <input
                    type="number"
                    min={0}
                    value={form.initialQuantity}
                    onChange={(e) => setForm({ ...form, initialQuantity: e.target.value })}
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                    placeholder="0"
                  />
                </Field>
              )}
            </div>
            <label className="flex items-center gap-2 cursor-pointer font-bold text-xs uppercase tracking-widest">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="accent-orange-600"
              />
              Đang sử dụng
            </label>
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-zinc-950 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-800 cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Lưu
              </button>
            </div>
          </form>
        </Modal>
      )}

      {archiving && (
        <Modal title="Lưu trữ nguyên liệu" onClose={() => setArchiving(null)}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-zinc-600">
              Lưu trữ <span className="font-bold text-zinc-900">{archiving.name}</span>? Nguyên liệu vẫn được giữ trong lịch sử.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setArchiving(null)}
                className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleArchive()}
                disabled={saving}
                className="flex-1 bg-red-600 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-red-700 cursor-pointer disabled:opacity-50"
              >
                Lưu trữ
              </button>
            </div>
          </div>
        </Modal>
      )}

      {adjusting && (
        <Modal title="Điều chỉnh tồn kho" onClose={() => setAdjusting(null)}>
          <div className="p-6 space-y-4">
            <p className="text-sm text-zinc-600">
              {adjusting.name}: đang có{' '}
              <span className="font-bold text-zinc-900">
                {adjusting.stockQuantity} {displayUnit(adjusting)}
              </span>
            </p>
            <Field label={`Số lượng thay đổi (${displayUnit(adjusting)})`}>
              <input
                type="number"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                placeholder="Ví dụ: 5000 hoặc -200"
              />
            </Field>
            {Number(adjustDelta) < 0 && (
              <>
                <Field label="Lý do giảm">
                  <select
                    value={adjustReason}
                    onChange={(e) =>
                      setAdjustReason(
                        e.target.value as 'waste' | 'manual_adjustment',
                      )
                    }
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer"
                  >
                    <option value="waste">Hao hụt / hết hạn</option>
                    <option value="manual_adjustment">Điều chỉnh khác</option>
                  </select>
                </Field>
                <Field label="Ghi chú (bắt buộc)">
                  <input
                    type="text"
                    value={adjustNote}
                    onChange={(e) => setAdjustNote(e.target.value)}
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                    placeholder="Ví dụ: hết hạn ngày 01/10"
                  />
                </Field>
              </>
            )}
            {Number(adjustDelta) > 0 && (
              <>
                <Field label="Đơn vị giá mua">
                  <select
                    value={adjustLotUnit}
                    onChange={(e) => setAdjustLotUnit(e.target.value as UnitInput)}
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600 cursor-pointer"
                  >
                    {UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Giá mua đợt này (VND)">
                  <input
                    type="number"
                    value={adjustLotPrice}
                    onChange={(e) => setAdjustLotPrice(e.target.value)}
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                    placeholder="Ví dụ: 120000 mỗi kg"
                  />
                </Field>
                <p className="text-xs text-zinc-500">
                  Giá vốn sẽ đổi thành bình quân gia quyền giữa hàng đang có và
                  đợt này. Nếu giá cao hơn giá trước trên 10%, hệ thống sẽ cảnh
                  báo.
                </p>
              </>
            )}
            <p className="text-xs text-zinc-500">
              Dương là nhập thêm. Âm là giảm; khi giảm phải ghi rõ lý do. Mọi thay đổi đều được ghi báo cáo.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAdjusting(null)}
                className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void handleAdjust()}
                disabled={saving}
                className="flex-1 bg-zinc-950 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-800 cursor-pointer disabled:opacity-50"
              >
                Lưu
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block font-mono text-xs font-bold uppercase tracking-widest text-zinc-500">
        {label}
      </label>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white border-hard shadow-[8px_8px_0_0_#09090b] w-full max-w-md">
        <div className="flex justify-between items-center p-4 border-b border-hard bg-zinc-950 text-white">
          <h2 className="font-mono font-bold text-sm uppercase tracking-widest">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
