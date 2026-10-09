import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  ExternalLink,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  SmartphoneNfc,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { DEFAULT_TABLE_AREA, TABLE_MAX_SEATS } from '@contracts/table.contract';
import type { TablePosition } from '@contracts/table.contract';
import GuideModal from '../../components/GuideModal';
import { useToast } from '../../contexts/ToastContext';
import {
  archiveTenantTable,
  configureTenantTable,
  createTenantTable,
  regenerateTableToken,
  renameTenantTable,
  type TenantTable,
} from '../../data/adapters/table.adapter';
import {
  refreshSlice,
  useStoreSlice,
  useStoreTenantId,
} from '../../data/tenantStore';
import { useActiveTenantId } from '../../hooks/useActiveTenantId';
import { resolveTableListView } from './tableListView';
import TableDetailPanel from './tables/TableDetailPanel';
import TablePlanCanvas from './tables/TablePlanCanvas';
import { useTableServiceStatus } from './tables/useTableServiceStatus';
import {
  TABLE_STATE_LABELS,
  groupTablesByArea,
  nextFreePosition,
  resolveAreaLabel,
  resolvePlanLayout,
  summarizeTableStates,
} from './tables/tablePlan';

type ViewMode = 'plan' | 'list';

interface TableDraft {
  id: string;
  name: string;
  area: string;
  seats: string;
  /** Position kept from the current table, so an edit never moves the tile. */
  position: TablePosition | null;
  qrPayload?: string;
}

const emptyDraft = (position: TablePosition | null): TableDraft => ({
  id: '',
  name: '',
  area: '',
  seats: '',
  position,
});

function draftFromTable(table: TenantTable): TableDraft {
  return {
    id: table.tableId,
    name: table.name,
    area: table.area ?? '',
    seats: table.seats ? String(table.seats) : '',
    position: table.position,
    qrPayload: table.qrPayload ?? undefined,
  };
}

function parseSeats(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= TABLE_MAX_SEATS
    ? parsed
    : null;
}

export default function TablesPage() {
  // The tenant store owns this listener: it waits for the restored Auth session
  // and the resolved active Tenant before it subscribes, so opening the page
  // directly by URL no longer shows an empty shop (IMP-01, F-01).
  const [rows, { loading, error: loadError }] = useStoreSlice('tables');
  const tenantId = useStoreTenantId();
  const activeTenantId = useActiveTenantId();
  const toast = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('plan');
  const [query, setQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savingTableId, setSavingTableId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<TableDraft | null>(null);
  const [deletingTable, setDeletingTable] = useState<TenantTable | null>(null);
  // Optimistic cells: a drag must not snap back while the server round-trips.
  const [pendingPositions, setPendingPositions] = useState<
    Map<string, TablePosition>
  >(() => new Map());

  const status = useTableServiceStatus(tenantId);

  // Drop an optimistic cell as soon as the stored row agrees with it.
  useEffect(() => {
    if (pendingPositions.size === 0) {
      return;
    }
    let changed = false;
    const next = new Map(pendingPositions);
    for (const table of rows) {
      const pending = next.get(table.tableId);
      if (
        pending &&
        table.position &&
        table.position.x === pending.x &&
        table.position.y === pending.y
      ) {
        next.delete(table.tableId);
        changed = true;
      }
    }
    if (changed) {
      setPendingPositions(next);
    }
  }, [rows, pendingPositions]);

  const tables = useMemo(
    () =>
      rows.map((table) => {
        const pending = pendingPositions.get(table.tableId);
        return pending ? { ...table, position: pending } : table;
      }),
    [rows, pendingPositions],
  );

  const layout = useMemo(() => resolvePlanLayout(tables), [tables]);
  const areas = useMemo(() => {
    const unique = new Set(rows.map((table) => resolveAreaLabel(table.area)));
    return [...unique].sort((left, right) => left.localeCompare(right, 'vi'));
  }, [rows]);

  const visibleTables = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tables.filter((table) => {
      if (areaFilter !== 'all' && resolveAreaLabel(table.area) !== areaFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        table.name.toLowerCase().includes(needle) ||
        resolveAreaLabel(table.area).toLowerCase().includes(needle)
      );
    });
  }, [tables, query, areaFilter]);

  const visibleIds = useMemo(
    () => new Set(visibleTables.map((table) => table.tableId)),
    [visibleTables],
  );
  const visiblePlacements = layout.placements.filter((placement) =>
    visibleIds.has(placement.table.tableId),
  );
  const summary = summarizeTableStates(
    rows.length,
    rows.map((table) => status.states.get(table.tableId)),
  );
  const selectedTable =
    tables.find((table) => table.tableId === selectedTableId) ?? null;
  const selectedPlacement = layout.placements.find(
    (placement) => placement.table.tableId === selectedTableId,
  );

  const view = resolveTableListView({
    tenantId,
    loading,
    rowCount: rows.length,
    error: loadError ?? actionError,
  });
  const showSkeleton = view === 'loading';
  const showError = view === 'error';
  const showEmpty = view === 'empty';
  const hasRows = view === 'list';

  const menuPath = (token: string | null) =>
    `/menu/${encodeURIComponent(token ?? '')}`;
  const menuUrl = (token: string | null) =>
    `${window.location.origin}${menuPath(token)}`;

  const requireTenant = (): string => {
    if (!activeTenantId) {
      throw new Error('Chưa chọn cửa hàng.');
    }
    return activeTenantId;
  };

  const reportError = (error: unknown, fallback: string) => {
    setActionError(error instanceof Error ? error.message : fallback);
  };

  const handleOpenAdd = () => {
    const free = nextFreePosition(layout.placements.map((p) => p.position));
    setDraft(emptyDraft(free));
    setIsModalOpen(true);
  };

  const handleOpenEdit = (table: TenantTable) => {
    setDraft(draftFromTable(table));
    setIsModalOpen(true);
  };

  const handleSaveTable = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft?.name.trim()) {
      return;
    }
    const isNew = !rows.some((table) => table.tableId === draft.id);
    const seats = parseSeats(draft.seats);
    const area = draft.area.trim();
    void (async () => {
      try {
        if (isNew) {
          await createTenantTable(requireTenant(), draft.name.trim(), {
            area: area || null,
            seats,
            position: draft.position,
          });
          toast.success(`Đã thêm ${draft.name.trim()}`);
        } else {
          await renameTenantTable(requireTenant(), draft.id, draft.name.trim());
          await configureTenantTable(requireTenant(), draft.id, {
            area: area || null,
            seats,
            position: draft.position,
          });
          toast.success(`Đã cập nhật ${draft.name.trim()}`);
        }
        setDraft(null);
        setIsModalOpen(false);
      } catch (error) {
        reportError(error, 'Không lưu được bàn.');
      }
    })();
  };

  const handleDeleteTable = () => {
    if (!deletingTable) {
      return;
    }
    if (rows.length <= 1) {
      toast.error('Cần giữ lại ít nhất một bàn để simulator hoạt động');
      setDeletingTable(null);
      return;
    }
    void (async () => {
      try {
        await archiveTenantTable(requireTenant(), deletingTable.tableId, null);
        toast.success(`Đã lưu trữ ${deletingTable.name}`);
        setSelectedTableId((current) =>
          current === deletingTable.tableId ? null : current,
        );
        setDeletingTable(null);
      } catch (error) {
        reportError(error, 'Không lưu trữ được bàn.');
      }
    })();
  };

  const handleRegenerateSecret = (table: TenantTable) => {
    void (async () => {
      try {
        await regenerateTableToken(requireTenant(), table.tableId);
        toast.success(`Đã cấp lại QR/NFC cho ${table.name}`);
      } catch (error) {
        reportError(error, 'Không cấp lại được mã.');
      }
    })();
  };

  const handleCopyLink = async (table: TenantTable) => {
    const url = menuUrl(table.activeToken);
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Đã copy link menu ${table.name}`);
    } catch {
      toast.info(url);
    }
  };

  /** Persist one table's cell; the plan shows it immediately, then confirms. */
  const savePosition = (table: TenantTable, position: TablePosition) => {
    setPendingPositions((current) =>
      new Map(current).set(table.tableId, position),
    );
    setSavingTableId(table.tableId);
    setActionError(null);
    void (async () => {
      try {
        await configureTenantTable(requireTenant(), table.tableId, {
          area: table.area,
          seats: table.seats,
          position,
        });
      } catch (error) {
        setPendingPositions((current) => {
          const next = new Map(current);
          next.delete(table.tableId);
          return next;
        });
        reportError(error, 'Không lưu được vị trí bàn.');
      } finally {
        setSavingTableId(null);
      }
    })();
  };

  /** Write every cell the plan is only showing, so the arrangement is real. */
  const handleArrangeAll = () => {
    const unsaved = layout.placements.filter((placement) => !placement.isSaved);
    if (unsaved.length === 0) {
      return;
    }
    void (async () => {
      try {
        for (const placement of unsaved) {
          await configureTenantTable(
            requireTenant(),
            placement.table.tableId,
            {
              area: placement.table.area,
              seats: placement.table.seats,
              position: placement.position,
            },
          );
        }
        toast.success(`Đã lưu vị trí cho ${unsaved.length} bàn`);
      } catch (error) {
        reportError(error, 'Không lưu được sơ đồ.');
      }
    })();
  };

  const stateBadge = (state: keyof typeof TABLE_STATE_LABELS | undefined) =>
    TABLE_STATE_LABELS[state ?? 'free'];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-fadeIn">
      <GuideModal
        storageKey="scango:guide:tables:v2"
        title="Sắp sơ đồ bàn và theo dõi trạng thái"
        steps={[
          {
            title: 'Kéo bàn vào đúng chỗ',
            body: 'Kéo một bàn trên lưới để đổi vị trí; vị trí được lưu lại. Bàn đang chọn có thể dịch bằng phím mũi tên.',
          },
          {
            title: 'Đặt khu vực và số ghế',
            body: 'Mở "Sửa bàn" để ghi khu vực (Tầng 1, Sân vườn…) và số ghế. Dùng ô tìm kiếm và nút lọc khu vực để thu gọn sơ đồ.',
          },
          {
            title: 'Đọc trạng thái từ đơn thật',
            body: 'Mỗi bàn hiện Trống, Có khách, Món sẵn sàng hoặc Chờ thanh toán, lấy trực tiếp từ đơn hàng đang mở.',
          },
        ]}
      />

      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter text-zinc-900 uppercase">
            Sơ đồ bàn
          </h1>
          <p className="mt-1 font-medium text-zinc-500">
            Sắp bàn theo khu vực, xem trạng thái phục vụ, và quản lý link QR/NFC.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Chế độ xem"
            className="flex border-hard bg-white"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'plan'}
              onClick={() => setViewMode('plan')}
              className={`flex items-center gap-2 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors ${
                viewMode === 'plan'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <LayoutGrid className="h-4 w-4" /> Sơ đồ
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-2 border-l border-zinc-200 px-4 py-3 text-[11px] font-black uppercase tracking-widest transition-colors ${
                viewMode === 'list'
                  ? 'bg-zinc-900 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              <List className="h-4 w-4" /> Danh sách
            </button>
          </div>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="flex items-center gap-2 border-hard bg-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-hard transition-transform hover:bg-orange-700 active:translate-y-1"
          >
            <Plus className="h-5 w-5" /> Thêm Bàn
          </button>
        </div>
      </div>

      {actionError && (
        <p
          role="alert"
          className="mb-6 border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700"
        >
          {actionError}
        </p>
      )}

      {hasRows && (
        <div className="mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: 'Tổng số bàn', value: summary.total, tone: 'text-zinc-900' },
              { label: 'Trống', value: summary.free, tone: 'text-zinc-600' },
              {
                label: TABLE_STATE_LABELS.occupied,
                value: summary.occupied,
                tone: 'text-amber-700',
              },
              {
                label: TABLE_STATE_LABELS.foodReady,
                value: summary.foodReady,
                tone: 'text-sky-700',
              },
              {
                label: TABLE_STATE_LABELS.awaitingPayment,
                value: summary.awaitingPayment,
                tone: 'text-red-700',
              },
            ].map((item) => (
              <div key={item.label} className="border-hard bg-white p-4">
                <p className="font-mono text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">
                  {item.label}
                </p>
                <p className={`mt-1 text-2xl font-black ${item.tone}`}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-hard bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={areaFilter === 'all'}
                onClick={() => setAreaFilter('all')}
                className={`min-h-11 border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                  areaFilter === 'all'
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                Tất cả khu vực
              </button>
              {areas.map((area) => (
                <button
                  key={area}
                  type="button"
                  aria-pressed={areaFilter === area}
                  onClick={() => setAreaFilter(area)}
                  className={`flex min-h-11 items-center gap-1 border px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
                    areaFilter === area
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-100'
                  }`}
                >
                  <MapPin className="h-3 w-3" /> {area}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {layout.unsavedCount > 0 && (
                <button
                  type="button"
                  onClick={handleArrangeAll}
                  className="flex min-h-11 items-center gap-2 border border-amber-400 bg-amber-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-900 transition-colors hover:bg-amber-100"
                >
                  <Wand2 className="h-3.5 w-3.5" /> Lưu vị trí{' '}
                  {layout.unsavedCount} bàn
                </button>
              )}
              <label className="flex min-h-11 items-center gap-2 border border-zinc-300 bg-white px-3 py-2">
                <Search className="h-3.5 w-3.5 text-zinc-400" />
                <span className="sr-only">Tìm bàn theo tên hoặc khu vực</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm bàn…"
                  className="w-40 text-xs font-medium text-zinc-800 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={status.refresh}
                className="flex min-h-11 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-zinc-600 transition-colors hover:bg-zinc-100"
                title="Cập nhật trạng thái bàn"
              >
                <RotateCw className="h-3.5 w-3.5" /> Trạng thái
              </button>
            </div>
          </div>

          {status.error && (
            <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
              Không đọc được trạng thái bàn: {status.error}
            </p>
          )}
          {layout.overflowCount > 0 && (
            <p className="border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
              {layout.overflowCount} bàn chưa xếp được vì lưới đã đầy. Hãy lưu
              trữ bớt bàn hoặc gom lại gần nhau.
            </p>
          )}
        </div>
      )}

      <div
        aria-busy={showSkeleton}
        className={
          viewMode === 'list'
            ? 'grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            : 'block'
        }
      >
        {showSkeleton && (
          <div
            role="status"
            className="col-span-full grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            <span className="sr-only">Đang tải sơ đồ bàn…</span>
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex flex-col border-hard bg-white">
                <div className="h-[74px] animate-pulse border-b border-zinc-100 bg-zinc-100" />
                <div className="flex-1 space-y-3 bg-zinc-50 p-5">
                  <div className="h-3 w-24 animate-pulse bg-zinc-200" />
                  <div className="h-3 w-32 animate-pulse bg-zinc-200" />
                  <div className="h-9 w-full animate-pulse bg-zinc-200" />
                </div>
                <div className="h-[186px] border-t border-zinc-200 bg-white" />
              </div>
            ))}
          </div>
        )}

        {showError && (
          <div
            role="alert"
            className="col-span-full flex flex-col items-center justify-center gap-4 border-2 border-dashed border-red-200 bg-red-50 px-6 py-16 text-center"
          >
            <AlertTriangle className="h-10 w-10 text-red-500" />
            <div>
              <p className="font-bold text-red-800">Không tải được sơ đồ bàn</p>
              <p className="mt-1 text-sm font-medium text-red-700">
                {loadError ?? actionError}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshSlice('tables')}
              className="flex items-center gap-2 border border-red-300 bg-white px-5 py-3 text-xs font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-100"
            >
              <RotateCw className="h-4 w-4" /> Thử lại
            </button>
          </div>
        )}

        {showEmpty && (
          <div className="col-span-full flex flex-col items-center justify-center gap-4 border-2 border-dashed border-zinc-200 bg-zinc-50 px-6 py-20 text-center text-zinc-500">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200">
              <Plus className="h-8 w-8 text-zinc-400" />
            </div>
            <div>
              <p className="font-bold text-zinc-700">
                Chưa có bàn nào được thiết lập
              </p>
              <p className="mt-1 text-sm font-medium">
                Thêm bàn đầu tiên để có link menu và mã QR cho khách.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenAdd}
              className="flex items-center gap-2 border-hard bg-orange-600 px-6 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-hard transition-transform hover:bg-orange-700 active:translate-y-1"
            >
              <Plus className="h-5 w-5" /> Thêm bàn
            </button>
          </div>
        )}

        {hasRows && visibleTables.length === 0 && (
          <p className="col-span-full border-2 border-dashed border-zinc-200 bg-zinc-50 px-6 py-10 text-center text-sm font-medium text-zinc-500">
            Không có bàn nào khớp với bộ lọc hiện tại.
          </p>
        )}

        {hasRows && visibleTables.length > 0 && viewMode === 'plan' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <TablePlanCanvas
              placements={visiblePlacements}
              columns={layout.columns}
              rows={layout.rows}
              states={status.states}
              selectedTableId={selectedTableId}
              onSelect={(table) => setSelectedTableId(table.tableId)}
              onMove={savePosition}
              savingTableId={savingTableId}
            />
            <TableDetailPanel
              table={selectedTable}
              state={
                selectedTable
                  ? status.states.get(selectedTable.tableId)
                  : undefined
              }
              menuPath={menuPath(selectedTable?.activeToken ?? null)}
              positionSaved={selectedPlacement?.isSaved ?? true}
              saving={savingTableId === selectedTable?.tableId}
              onEdit={handleOpenEdit}
              onArchive={setDeletingTable}
              onRegenerate={handleRegenerateSecret}
              onCopy={handleCopyLink}
              onSavePosition={(table) => {
                const placement = layout.placements.find(
                  (item) => item.table.tableId === table.tableId,
                );
                if (placement) {
                  savePosition(table, placement.position);
                }
              }}
            />
          </div>
        )}

        {hasRows &&
          visibleTables.length > 0 &&
          viewMode === 'list' &&
          groupTablesByArea(visibleTables).map((group) => (
            <React.Fragment key={group.area}>
              <h2 className="col-span-full mt-2 flex items-center gap-2 font-mono text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
                <MapPin className="h-3.5 w-3.5" /> {group.area}
                <span className="text-zinc-400">({group.tables.length})</span>
              </h2>
              {group.tables.map((table) => {
                const state = status.states.get(table.tableId);
                return (
                  <div
                    key={table.tableId}
                    className="group flex flex-col border-hard bg-white shadow-[4px_4px_0_0_#e4e4e7] transition-transform hover:-translate-y-1"
                  >
                    <div className="flex items-start justify-between border-b border-zinc-100 p-5">
                      <div className="min-w-0">
                        <h3 className="truncate text-xl font-bold text-zinc-900">
                          {table.name}
                        </h3>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                          <span>{resolveAreaLabel(table.area)}</span>
                          <span>
                            {table.seats ? `${table.seats} ghế` : 'chưa đặt ghế'}
                          </span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDeletingTable(table)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center text-zinc-300 transition-colors hover:text-red-500"
                        title="Lưu trữ bàn"
                        aria-label={`Lưu trữ ${table.name}`}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex flex-1 flex-col gap-3 bg-zinc-50 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="border border-zinc-300 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-zinc-700">
                          {stateBadge(state)}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle className="h-4 w-4" />
                          {table.nfcWritten === false
                            ? 'NFC chưa nạp'
                            : 'NFC đã cấp phát'}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-bold text-zinc-500">
                          <SmartphoneNfc className="h-4 w-4" /> Tap-to-Order
                        </span>
                      </div>
                      <code className="block break-all border border-zinc-200 bg-white p-2 text-[10px] text-zinc-500">
                        {menuUrl(table.activeToken)}
                      </code>
                    </div>

                    <div className="grid grid-cols-1 gap-2 border-t border-zinc-200 p-4">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(table)}
                        className="flex w-full items-center justify-center gap-2 border border-zinc-900 bg-white py-2.5 text-xs font-bold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-50"
                      >
                        Sửa bàn
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateSecret(table)}
                        className="flex w-full items-center justify-center gap-2 border border-orange-200 bg-orange-50 py-2.5 text-xs font-bold uppercase tracking-widest text-orange-700 transition-colors hover:bg-orange-100"
                      >
                        <RefreshCw className="h-4 w-4" /> Cấp lại mã
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyLink(table)}
                          className="flex w-full items-center justify-center gap-2 border border-zinc-200 bg-zinc-50 py-2.5 text-xs font-bold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-100"
                        >
                          <Copy className="h-4 w-4" /> Copy
                        </button>
                        <a
                          href={menuPath(table.activeToken)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex w-full items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 py-2.5 text-xs font-bold uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100"
                        >
                          <ExternalLink className="h-4 w-4" /> Mở
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
      </div>

      {isModalOpen &&
        draft &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/40 p-4 pt-16 backdrop-blur-sm">
            <div className="w-full max-w-md animate-fadeIn border-hard bg-white shadow-hard">
              <div className="flex items-center justify-between border-b border-hard bg-zinc-50 p-6">
                <h3 className="text-lg font-bold uppercase tracking-tight">
                  {rows.some((table) => table.tableId === draft.id)
                    ? 'Sửa bàn'
                    : 'Thêm bàn mới'}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setDraft(null);
                  }}
                  className="flex h-11 w-11 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900"
                  aria-label="Đóng hộp thoại"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSaveTable} className="space-y-5 p-6">
                <div>
                  <label
                    htmlFor="table-name"
                    className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500"
                  >
                    Tên bàn
                  </label>
                  <input
                    id="table-name"
                    type="text"
                    required
                    autoFocus
                    placeholder="Vd: Bàn 01, VIP 2..."
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                    className="w-full border-hard px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="table-area"
                    className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500"
                  >
                    Khu vực
                  </label>
                  <input
                    id="table-area"
                    type="text"
                    list="table-area-options"
                    placeholder={DEFAULT_TABLE_AREA}
                    value={draft.area}
                    onChange={(event) =>
                      setDraft({ ...draft, area: event.target.value })
                    }
                    className="w-full border-hard px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <datalist id="table-area-options">
                    {areas.map((area) => (
                      <option key={area} value={area} />
                    ))}
                  </datalist>
                  <p className="mt-2 text-[11px] text-zinc-500">
                    Để trống nghĩa là {DEFAULT_TABLE_AREA}.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="table-seats"
                    className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500"
                  >
                    Số ghế
                  </label>
                  <input
                    id="table-seats"
                    type="number"
                    min={1}
                    max={TABLE_MAX_SEATS}
                    placeholder="4"
                    value={draft.seats}
                    onChange={(event) =>
                      setDraft({ ...draft, seats: event.target.value })
                    }
                    className="w-full border-hard px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  {draft.seats.trim().length > 0 && parseSeats(draft.seats) === null && (
                    <p className="mt-2 text-[11px] font-bold text-red-600">
                      Số ghế phải là số nguyên từ 1 đến {TABLE_MAX_SEATS}.
                    </p>
                  )}
                </div>

                {draft.id && (
                  <div>
                    <label
                      htmlFor="table-qr"
                      className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500"
                    >
                      QR payload
                    </label>
                    <input
                      id="table-qr"
                      type="text"
                      value={draft.qrPayload ?? ''}
                      readOnly
                      className="w-full border-hard bg-zinc-50 px-4 py-3 font-mono text-xs focus:outline-none"
                    />
                    <p className="mt-2 text-[11px] text-zinc-500">
                      Mã QR do máy chủ cấp; cấp lại mã để đổi liên kết.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full border-hard bg-zinc-900 py-3 text-sm font-bold uppercase tracking-widest text-white shadow-hard transition-transform hover:bg-zinc-800 active:translate-y-1"
                >
                  Lưu
                </button>
              </form>
            </div>
          </div>,
          document.body,
        )}

      {deletingTable &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm animate-fadeIn space-y-5 border-hard bg-white p-6 text-center shadow-[8px_8px_0_0_#ef4444]">
              <XCircle className="mx-auto h-12 w-12 text-red-600" />
              <div>
                <h3 className="text-xl font-bold uppercase tracking-tight text-zinc-900">
                  Lưu trữ bàn?
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  Bàn{' '}
                  <span className="font-bold text-zinc-900">
                    {deletingTable.name}
                  </span>{' '}
                  sẽ rời khỏi sơ đồ và link QR/NFC của bàn ngừng hoạt động.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeletingTable(null)}
                  className="flex-1 border-hard px-4 py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTable}
                  className="flex-1 border-hard bg-red-600 px-4 py-3 text-xs font-bold uppercase tracking-widest text-white"
                >
                  Lưu trữ
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
