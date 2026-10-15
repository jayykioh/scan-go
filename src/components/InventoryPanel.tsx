import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  updateIngredient,
} from '../data/adapters/inventory.adapter';
import { useToast } from '../contexts/ToastContext';
import { useStoreSlice } from '../data/tenantStore';

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
  StockAdjusted: 'Tồn kho',
  StockCountRecorded: 'Kiểm kê',
};

/** Reason codes are stored as codes; the report reads them in Vietnamese. */
const REASON_LABEL: Record<string, string> = {
  waste: 'Hao hụt / hết hạn',
  manual_adjustment: 'Điều chỉnh khác',
  stock_in: 'Nhập hàng',
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

/** Filter chip of the report view. */
function chipClass(active: boolean): string {
  return `font-mono font-bold text-[10px] uppercase tracking-widest px-3 py-1.5 border-hard cursor-pointer ${
    active ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100'
  }`;
}

/** Ingredients per page; the list is paged instead of rendering everything. */
export const INGREDIENT_PAGE_SIZE = 10;

export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** One page of a list; the requested page is clamped to the last real page. */
export function pageSlice<T>(items: T[], page: number, size: number): T[] {
  const safe = Math.min(Math.max(page, 0), pageCount(items.length, size) - 1);
  return items.slice(safe * size, safe * size + size);
}

/** Waste is a stock deduction the kitchen recorded with the waste reason. */
export function isWasteEntry(entry: InventoryChangeEntry): boolean {
  return entry.action === 'StockAdjusted' && entry.reason === 'waste';
}

/**
 * Quantities typed for a bulk waste. An empty row is skipped; a row that is not
 * a whole number above zero is counted as invalid instead of silently dropped.
 */
export function parseBulkWasteQuantities(
  ingredientIds: string[],
  quantities: Record<string, string>,
): { rows: Array<{ ingredientId: string; delta: number }>; invalid: number } {
  const rows: Array<{ ingredientId: string; delta: number }> = [];
  let invalid = 0;
  for (const ingredientId of ingredientIds) {
    const raw = (quantities[ingredientId] ?? '').trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
      invalid += 1;
      continue;
    }
    rows.push({ ingredientId, delta: -value });
  }
  return { rows, invalid };
}

/** Base unit of a purchase unit, matched against an ingredient base unit. */
function isUnitCompatible(unit: UnitInput, baseUnit: Ingredient['baseUnit']): boolean {
  if (unit === 'kg' || unit === 'g') return baseUnit === 'g';
  if (unit === 'l' || unit === 'ml') return baseUnit === 'ml';
  return baseUnit === 'unit';
}

export default function InventoryPanel({ embedded = false }: InventoryPanelProps) {
  const toast = useToast();
  const [ingredients, inventoryState] = useStoreSlice('ingredients');
  const listError = inventoryState.error;
  const [report, setReport] = useState<InventoryChangeEntry[]>([]);
  const [view, setView] = useState<'list' | 'report'>('list');
  const [wasteOnly, setWasteOnly] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkWasteOpen, setBulkWasteOpen] = useState(false);
  const [bulkQuantities, setBulkQuantities] = useState<Record<string, string>>({});
  const [bulkReason, setBulkReason] = useState<'waste' | 'manual_adjustment'>(
    'waste',
  );
  const [bulkNote, setBulkNote] = useState('');
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

  const activeIngredients = useMemo(
    () => ingredients.filter((item) => item.archivedAt === null),
    [ingredients],
  );

  // The kitchen tablet never renders the whole catalogue at once.
  const [page, setPage] = useState(0);
  const pages = pageCount(activeIngredients.length, INGREDIENT_PAGE_SIZE);
  const safePage = Math.min(page, pages - 1);
  const pageItems = pageSlice(activeIngredients, safePage, INGREDIENT_PAGE_SIZE);

  // Selection drives the bulk waste entry, so it only ever holds live rows.
  const selectedIngredients = useMemo(
    () =>
      activeIngredients.filter((item) => selectedIds.includes(item.ingredientId)),
    [activeIngredients, selectedIds],
  );
  const wasteReport = useMemo(() => report.filter(isWasteEntry), [report]);
  const visibleReport = wasteOnly ? wasteReport : report;
  const allPageSelected =
    pageItems.length > 0 &&
    pageItems.every((item) => selectedIds.includes(item.ingredientId));

  const toggleSelected = (ingredientId: string) =>
    setSelectedIds((previous) =>
      previous.includes(ingredientId)
        ? previous.filter((id) => id !== ingredientId)
        : [...previous, ingredientId],
    );

  const togglePageSelected = () =>
    setSelectedIds((previous) =>
      allPageSelected
        ? previous.filter(
            (id) => !pageItems.some((item) => item.ingredientId === id),
          )
        : [
            ...new Set([
              ...previous,
              ...pageItems.map((item) => item.ingredientId),
            ]),
          ],
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
    if (view === 'report') void loadReport();
  }, [view, loadReport]);

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

  /** One note and one reason cover every ingredient picked for waste. */
  const handleBulkWaste = async () => {
    const { rows, invalid } = parseBulkWasteQuantities(
      selectedIngredients.map((item) => item.ingredientId),
      bulkQuantities,
    );
    if (invalid > 0) {
      toast.error('Số lượng hao hụt phải là số nguyên lớn hơn 0');
      return;
    }
    if (rows.length === 0) {
      toast.error('Nhập số lượng hao hụt cho ít nhất một nguyên liệu');
      return;
    }
    const note = bulkNote.trim();
    if (!note) {
      toast.error('Cần ghi lý do khi giảm kho (hết hạn, hỏng, hoặc lý do khác)');
      return;
    }

    setSaving(true);
    try {
      const stamp = Date.now();
      for (const row of rows) {
        await adjustStock(
          row.ingredientId,
          row.delta,
          bulkReason,
          `inv-waste-${row.ingredientId}-${stamp}`,
          note,
        );
      }
      toast.success(`Đã ghi hao hụt ${rows.length} nguyên liệu`);
      setBulkWasteOpen(false);
      setBulkQuantities({});
      setBulkNote('');
      setSelectedIds([]);
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
          {view === 'list' && (
            <button
              type="button"
              onClick={openCreate}
              className="bg-orange-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-4 py-2.5 border-hard shadow-hard flex items-center gap-2 hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Thêm nguyên liệu
            </button>
          )}
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Kho nguyên liệu"
        data-testid="inventory-tabs"
        className="flex gap-2 border-hard bg-white p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'list'}
          data-testid="inventory-tab-list"
          onClick={() => setView('list')}
          className={`flex-1 font-mono font-bold text-[11px] uppercase tracking-normal whitespace-nowrap px-2 py-2.5 border-hard flex items-center justify-center gap-2 cursor-pointer sm:text-xs sm:tracking-widest sm:px-4 ${
            view === 'list' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <Boxes className="w-4 h-4" />
          Nguyên liệu
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'report'}
          data-testid="inventory-tab-report"
          onClick={() => setView('report')}
          className={`flex-1 font-mono font-bold text-[11px] uppercase tracking-normal whitespace-nowrap px-2 py-2.5 border-hard flex items-center justify-center gap-2 cursor-pointer sm:text-xs sm:tracking-widest sm:px-4 ${
            view === 'report' ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          <History className="w-4 h-4" />
          Báo cáo kho
        </button>
      </div>

      {listError && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {listError}
        </div>
      )}

      {view === 'report' && (
        <section className="bg-white border-hard shadow-hard">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-hard">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-600" />
              <span className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-900">
                Báo cáo thay đổi kho ({visibleReport.length})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-testid="report-filter-all"
                onClick={() => setWasteOnly(false)}
                className={chipClass(!wasteOnly)}
              >
                Tất cả ({report.length})
              </button>
              <button
                type="button"
                data-testid="report-filter-waste"
                onClick={() => setWasteOnly(true)}
                className={chipClass(wasteOnly)}
              >
                Hao hụt ({wasteReport.length})
              </button>
              <button
                type="button"
                onClick={() => void loadReport()}
                className="p-2 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                title="Tải lại báo cáo"
              >
                <RefreshCw className={`w-4 h-4 ${loadingReport ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-zinc-100">
            {visibleReport.length === 0 ? (
              <p className="p-6 text-center text-sm text-zinc-500">
                Chưa có thay đổi nào được ghi nhận.
              </p>
            ) : (
              visibleReport.map((entry) => (
                <div
                  key={entry.eventId}
                  data-testid="report-row"
                  className="flex items-start justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-900 flex flex-wrap items-center gap-2">
                      {describeChange(entry)}
                      {entry.targetName ? `: ${entry.targetName}` : ''}
                      {isWasteEntry(entry) && (
                        <span
                          data-testid="report-waste-badge"
                          className="font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border-hard bg-red-100 text-red-700"
                        >
                          Hao hụt
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mt-0.5">
                      {entry.actorType}
                      {entry.role ? ` · ${entry.role}` : ''} · {formatTime(entry.createdAt)}
                      {entry.quantityDelta !== null
                        ? ` · ${entry.quantityDelta > 0 ? '+' : ''}${entry.quantityDelta}`
                        : ''}
                    </p>
                    {entry.reason && (
                      <p className="text-xs text-zinc-500 mt-1">
                        Lý do: {REASON_LABEL[entry.reason] ?? entry.reason}
                      </p>
                    )}
                    {entry.note && (
                      <p className="text-xs text-zinc-500 mt-1">Ghi chú: {entry.note}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {view === 'list' && (
        <>
      {selectedIngredients.length > 0 && (
        <div
          data-testid="bulk-waste-bar"
          className="flex flex-wrap items-center justify-between gap-3 border-hard bg-amber-50 px-4 py-3"
        >
          <p className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-900">
            Đã chọn {selectedIngredients.length} nguyên liệu
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="bulk-waste-open"
              onClick={() => {
                setBulkQuantities({});
                setBulkNote('');
                setBulkReason('waste');
                setBulkWasteOpen(true);
              }}
              className="bg-red-600 text-white font-mono font-bold text-xs uppercase tracking-widest px-4 py-2.5 border-hard hover:bg-red-700 cursor-pointer"
            >
              Ghi hao hụt
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="bg-white text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest px-4 py-2.5 border-hard hover:bg-zinc-100 cursor-pointer"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      <div
        data-testid="ingredient-table-scroll"
        className="bg-white border-hard shadow-hard overflow-x-auto"
      >
        <table className="w-full text-left border-collapse lg:min-w-[880px]">
          <thead>
            <tr className="bg-zinc-950 text-white font-mono text-[10px] uppercase tracking-widest">
              <th className="p-2 font-bold border-b border-hard lg:p-4">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={togglePageSelected}
                  aria-label="Chọn tất cả nguyên liệu trên trang"
                  className="accent-orange-600 cursor-pointer"
                />
              </th>
              <th className="p-2 font-bold border-b border-hard lg:p-4">Nguyên liệu</th>
              <th className="hidden p-2 font-bold border-b border-hard lg:table-cell lg:p-4">Đơn vị</th>
              <th className="hidden p-2 font-bold border-b border-hard lg:table-cell lg:p-4">Giá nhập</th>
              <th className="p-2 font-bold border-b border-hard lg:p-4">Tồn kho</th>
              <th className="hidden p-2 font-bold border-b border-hard lg:table-cell lg:p-4">Trạng thái</th>
              <th className="p-2 font-bold border-b border-hard text-right lg:p-4">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {activeIngredients.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-zinc-500 font-mono text-sm uppercase tracking-widest">
                  Chưa có nguyên liệu. Bấm "Thêm nguyên liệu".
                </td>
              </tr>
            ) : (
              pageItems.map((ingredient) => {
                const low = ingredient.stockQuantity <= ingredient.lowStockThreshold;
                return (
                  <tr
                    key={ingredient.ingredientId}
                    data-testid="ingredient-row"
                    className="hover:bg-zinc-50 transition-colors"
                  >
                    <td className="p-2 border-b border-hard lg:p-4">
                      <input
                        type="checkbox"
                        data-testid="ingredient-select"
                        checked={selectedIds.includes(ingredient.ingredientId)}
                        onChange={() => toggleSelected(ingredient.ingredientId)}
                        aria-label={`Chọn ${ingredient.name}`}
                        className="accent-orange-600 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 border-b border-hard lg:p-4">
                      <p className="font-bold text-zinc-900">{ingredient.name}</p>
                      <p className="font-mono text-[10px] text-zinc-400 mt-1">
                        #{ingredient.ingredientId.slice(-8)}
                      </p>
                      <span
                        className={`mt-1 inline-block font-mono text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 border-hard lg:hidden ${
                          ingredient.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-zinc-200 text-zinc-600'
                        }`}
                      >
                        {ingredient.isActive ? 'Đang dùng' : 'Tạm ngưng'}
                      </span>
                    </td>
                    <td className="hidden p-2 font-mono text-xs text-zinc-600 border-b border-hard lg:table-cell lg:p-4">
                      {purchaseUnitLabel(ingredient)}
                    </td>
                    <td className="hidden p-2 font-mono text-xs text-zinc-600 border-b border-hard lg:table-cell lg:p-4">
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
                    <td className="p-2 border-b border-hard lg:p-4">
                      <span className={`font-mono text-xs font-bold ${low ? 'text-red-600' : 'text-zinc-900'}`}>
                        {ingredient.stockQuantity.toLocaleString('vi-VN')} {displayUnit(ingredient)}
                      </span>
                      <p className="font-mono text-[10px] text-zinc-400 mt-1">
                        Ngưỡng {ingredient.lowStockThreshold}
                      </p>
                    </td>
                    <td className="hidden p-2 border-b border-hard lg:table-cell lg:p-4">
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
                    <td className="p-2 border-b border-hard text-right lg:p-4">
                      <div className="flex items-center justify-end gap-1 lg:gap-2">
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

      {activeIngredients.length > INGREDIENT_PAGE_SIZE && (
        <div
          data-testid="ingredient-pager"
          className="flex flex-wrap items-center justify-between gap-3 border-hard bg-white px-4 py-3"
        >
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            Trang {safePage + 1}/{pages} ·{' '}
            {safePage * INGREDIENT_PAGE_SIZE + 1}–
            {Math.min(
              (safePage + 1) * INGREDIENT_PAGE_SIZE,
              activeIngredients.length,
            )}{' '}
            trong {activeIngredients.length} nguyên liệu
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage(safePage - 1)}
              disabled={safePage === 0}
              className="border-hard bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              ‹ Trước
            </button>
            <button
              type="button"
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= pages - 1}
              className="border-hard bg-white px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-900 hover:bg-zinc-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Sau ›
            </button>
          </div>
        </div>
      )}
        </>
      )}

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

      {bulkWasteOpen && (
        <Modal title="Ghi hao hụt nhiều nguyên liệu" onClose={() => setBulkWasteOpen(false)}>
          <div data-testid="bulk-waste-modal" className="p-6 space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto">
              {selectedIngredients.map((ingredient) => (
                <div key={ingredient.ingredientId} className="space-y-1">
                  <label className="block text-sm font-bold text-zinc-900">
                    {ingredient.name}
                    <span className="ml-2 font-mono text-[10px] font-normal uppercase tracking-widest text-zinc-500">
                      còn {ingredient.stockQuantity.toLocaleString('vi-VN')}{' '}
                      {displayUnit(ingredient)}
                    </span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    data-testid="bulk-waste-qty"
                    value={bulkQuantities[ingredient.ingredientId] ?? ''}
                    onChange={(e) =>
                      setBulkQuantities((previous) => ({
                        ...previous,
                        [ingredient.ingredientId]: e.target.value,
                      }))
                    }
                    className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                    placeholder={`Số lượng hao hụt (${displayUnit(ingredient)})`}
                  />
                </div>
              ))}
            </div>
            <Field label="Lý do giảm">
              <select
                data-testid="bulk-waste-reason"
                value={bulkReason}
                onChange={(e) =>
                  setBulkReason(e.target.value as 'waste' | 'manual_adjustment')
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
                data-testid="bulk-waste-note"
                value={bulkNote}
                onChange={(e) => setBulkNote(e.target.value)}
                className="w-full bg-zinc-50 border-hard px-4 py-3 font-mono text-sm text-zinc-900 focus:outline-none focus:border-orange-600"
                placeholder="Ví dụ: hết hạn ngày 01/10"
              />
            </Field>
            <p className="text-xs text-zinc-500">
              Nguyên liệu để trống sẽ không bị trừ. Mỗi nguyên liệu được ghi một
              dòng vào báo cáo kho.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBulkWasteOpen(false)}
                className="flex-1 bg-white border-hard text-zinc-900 font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-zinc-100 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                data-testid="bulk-waste-submit"
                onClick={() => void handleBulkWaste()}
                disabled={saving}
                className="flex-1 bg-red-600 border-hard text-white font-mono font-bold text-xs uppercase tracking-widest py-3 hover:bg-red-700 cursor-pointer disabled:opacity-50"
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
