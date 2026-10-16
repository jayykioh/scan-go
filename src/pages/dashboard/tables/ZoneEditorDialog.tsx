import React, { useEffect, useState } from 'react';
import { Plus, Trash2, XCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_TABLE_AREA,
  TABLE_AREA_MAX_LENGTH,
  TABLE_MAX_SEATS,
} from '@contracts/table.contract';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import {
  parseSeatCount,
  resolveAreaLabel,
} from './tablePlan';
import type { ZoneDraftTable } from './zoneEditor';

/**
 * Create or edit one area: name it, tick the tables that belong to it, author
 * new tables ("bàn ảo") that only exist in this dialog, and pick the Waiters who
 * serve it. Nothing is written until Lưu, so a mistyped plan costs no commands
 * (REQ-TBL-004, REQ-TBL-009).
 */
export interface ZoneEditorDialogProps {
  /** The area being edited; null when the zone is new. */
  editingArea: string | null;
  /** Tables the dialog may tick: the tenant's active floor. */
  tables: TenantTable[];
  /** Waiter candidates: active directory members holding the waiter role. */
  waiters: StaffDirectoryEntry[];
  /** Waiters currently assigned to the edited area. */
  assignedWaiterUids: string[];
  /** Every area label in use, so a duplicate name can warn about merging. */
  areaLabels: string[];
  saving: boolean;
  onSave: (input: {
    originalLabel: string | null;
    label: string;
    selectedTableIds: string[];
    draftTables: ZoneDraftTable[];
    waiterUids: string[];
  }) => void;
  onDelete: (label: string) => void;
  onClose: () => void;
}

export default function ZoneEditorDialog({
  editingArea,
  tables,
  waiters,
  assignedWaiterUids,
  areaLabels,
  saving,
  onSave,
  onDelete,
  onClose,
}: ZoneEditorDialogProps) {
  // The default area opens with its own label: it is a real area to assign
  // Waiters to, and saving it stores "no name" again (REQ-TBL-004).
  const [label, setLabel] = useState(editingArea ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    editingArea === null
      ? []
      : tables
          .filter((table) => resolveAreaLabel(table.area) === editingArea)
          .map((table) => table.tableId),
  );
  const [waiterUids, setWaiterUids] = useState<string[]>(assignedWaiterUids);
  const [drafts, setDrafts] = useState<ZoneDraftTable[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, saving]);

  const toggle = (
    list: string[],
    setList: (next: string[]) => void,
    value: string,
  ) => {
    setList(
      list.includes(value)
        ? list.filter((entry) => entry !== value)
        : [...list, value],
    );
  };

  const labelTaken =
    label.trim().length > 0 &&
    label.trim() !== editingArea &&
    areaLabels.includes(label.trim());
  const namedDrafts = drafts.filter((draft) => draft.name.trim().length > 0);
  const seatProblem = drafts.some(
    (draft) =>
      draft.seats.trim().length > 0 && parseSeatCount(draft.seats) === null,
  );
  const canSave =
    !saving &&
    label.trim().length > 0 &&
    !seatProblem &&
    (selectedIds.length > 0 || namedDrafts.length > 0);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-zinc-950/40 p-4 pt-10 backdrop-blur-sm">
      <div
        data-testid="zone-editor"
        className="w-full max-w-2xl animate-fadeIn border-hard bg-white shadow-hard"
      >
        <div className="flex items-center justify-between border-b border-hard bg-zinc-50 p-6">
          <div>
            <h3 className="text-lg font-bold uppercase tracking-tight">
              {editingArea === null ? 'Thêm khu vực' : 'Sửa khu vực'}
            </h3>
            <p className="mt-1 text-xs font-medium text-zinc-500">
              Chọn bàn cho khu, thêm bàn mới nếu cần, rồi chọn nhân viên phục
              vụ. Mọi thứ chỉ được ghi khi bấm Lưu.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex h-11 w-11 items-center justify-center text-zinc-400 transition-colors hover:text-zinc-900 disabled:opacity-40"
            aria-label="Đóng hộp thoại"
          >
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        <form
          className="space-y-6 p-6"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) {
              return;
            }
            onSave({
              originalLabel: editingArea,
              label: label.trim(),
              selectedTableIds: selectedIds,
              draftTables: namedDrafts,
              waiterUids,
            });
          }}
        >
          <div>
            <label
              htmlFor="zone-name"
              className="mb-2 block text-xs font-bold uppercase tracking-widest text-zinc-500"
            >
              Tên khu vực
            </label>
            <input
              id="zone-name"
              type="text"
              required
              autoFocus
              maxLength={TABLE_AREA_MAX_LENGTH}
              placeholder={`Vd: Sân vườn, Tầng 2… (để trống là ${DEFAULT_TABLE_AREA})`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="w-full border-hard px-4 py-3 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {labelTaken && (
              <p className="mt-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                Đã có khu vực tên này. Lưu sẽ gộp các bàn đã chọn vào khu đó.
              </p>
            )}
            {label.trim() === DEFAULT_TABLE_AREA && (
              <p className="mt-2 text-[11px] text-zinc-500">
                “{DEFAULT_TABLE_AREA}” là khu mặc định: bàn không có tên khu đều
                nằm ở đây.
              </p>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Bàn trong khu ({selectedIds.length} bàn có sẵn
              {namedDrafts.length > 0
                ? ` + ${namedDrafts.length} bàn mới`
                : ''}
              )
            </legend>
            {tables.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Chưa có bàn nào. Thêm bàn mới ở dưới.
              </p>
            ) : (
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto border-hard bg-zinc-50 p-3 sm:grid-cols-2">
                {tables.map((table) => (
                  <label
                    key={table.tableId}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(table.tableId)}
                      onChange={() =>
                        toggle(selectedIds, setSelectedIds, table.tableId)
                      }
                      className="h-4 w-4 accent-orange-600"
                    />
                    <span className="truncate">
                      {table.name}
                      <span className="text-zinc-400">
                        {' · '}
                        {resolveAreaLabel(table.area)}
                        {table.seats ? ` · ${table.seats} ghế` : ''}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Thêm bàn mới vào khu
            </legend>
            <div className="space-y-2 border-hard bg-zinc-50 p-3">
              {drafts.map((draft, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={draft.name}
                    aria-label={`Tên bàn mới ${index + 1}`}
                    placeholder="Vd: Bàn 07"
                    onChange={(event) =>
                      setDrafts(
                        drafts.map((entry, position) =>
                          position === index
                            ? { ...entry, name: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="min-w-0 flex-1 border-hard px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <input
                    type="number"
                    min={1}
                    max={TABLE_MAX_SEATS}
                    value={draft.seats}
                    aria-label={`Số ghế bàn mới ${index + 1}`}
                    placeholder="Ghế"
                    onChange={(event) =>
                      setDrafts(
                        drafts.map((entry, position) =>
                          position === index
                            ? { ...entry, seats: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className="w-20 border-hard px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts(drafts.filter((_, position) => position !== index))
                    }
                    className="flex h-9 w-9 items-center justify-center text-zinc-400 transition-colors hover:text-red-500"
                    aria-label={`Xoá bàn mới ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDrafts([...drafts, { name: '', seats: '' }])}
                className="flex items-center gap-2 border border-zinc-900 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-100"
              >
                <Plus className="h-4 w-4" /> Thêm bàn
              </button>
              <p className="text-[11px] text-zinc-500">
                Bàn mới chỉ được tạo khi bấm Lưu; mỗi bàn nhận một ô trống trên
                sơ đồ.
              </p>
              {seatProblem && (
                <p className="text-[11px] font-bold text-red-600">
                  Số ghế phải là số nguyên từ 1 đến {TABLE_MAX_SEATS}.
                </p>
              )}
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Nhân viên phục vụ khu ({waiterUids.length})
            </legend>
            {waiters.length === 0 ? (
              <p className="text-xs text-zinc-500">
                Chưa có nhân viên phục vụ đang hoạt động. Thêm ở mục Nhân viên
                trước.
              </p>
            ) : (
              <div className="grid max-h-40 grid-cols-1 gap-2 overflow-y-auto border-hard bg-zinc-50 p-3 sm:grid-cols-2">
                {waiters.map((waiter) => (
                  <label
                    key={waiter.uid}
                    className="flex cursor-pointer items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={waiterUids.includes(waiter.uid)}
                      onChange={() =>
                        toggle(waiterUids, setWaiterUids, waiter.uid)
                      }
                      className="h-4 w-4 accent-orange-600"
                    />
                    <span className="truncate">
                      {waiter.displayName ?? waiter.email ?? waiter.uid}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-[11px] text-zinc-500">
              Nhân viên được gán chỉ xem được bàn và món của khu này. Chưa gán
              khu nào thì vẫn xem toàn quán.
            </p>
          </fieldset>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-zinc-200 pt-4">
            {editingArea !== null && editingArea !== DEFAULT_TABLE_AREA && (
              <button
                type="button"
                disabled={saving}
                onClick={() => onDelete(editingArea)}
                className="mr-auto flex items-center gap-2 border border-red-300 bg-white px-4 py-3 text-xs font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-50 disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" /> Xoá khu vực
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="border-hard px-5 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40"
            >
              Huỷ
            </button>
            <button
              type="submit"
              disabled={!canSave}
              className="border-hard bg-zinc-900 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-hard transition-transform hover:bg-zinc-800 active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? 'Đang lưu…' : 'Lưu khu vực'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
