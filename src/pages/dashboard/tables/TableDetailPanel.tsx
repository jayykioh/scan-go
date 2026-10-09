import React from 'react';
import {
  Copy,
  ExternalLink,
  MapPin,
  Pencil,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import type { TableServiceState } from '@contracts/tableStatus.contract';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import { TABLE_STATE_LABELS, resolveAreaLabel } from './tablePlan';

const STATE_BADGE_CLASS: Record<TableServiceState, string> = {
  free: 'border-zinc-300 bg-zinc-100 text-zinc-600',
  occupied: 'border-amber-300 bg-amber-100 text-amber-800',
  foodReady: 'border-sky-300 bg-sky-100 text-sky-800',
  awaitingPayment: 'border-red-300 bg-red-100 text-red-800',
};

interface TableDetailPanelProps {
  table: TenantTable | null;
  state: TableServiceState | undefined;
  menuPath: string;
  /** False when the table is only placed visually and the cell is not saved. */
  positionSaved: boolean;
  saving: boolean;
  onEdit: (table: TenantTable) => void;
  onArchive: (table: TenantTable) => void;
  onRegenerate: (table: TenantTable) => void;
  onCopy: (table: TenantTable) => void;
  onSavePosition: (table: TenantTable) => void;
}

/**
 * Actions for the table selected on the plan. Kept beside the canvas so the
 * plan itself stays a map: tiles carry state, this panel carries commands.
 */
export default function TableDetailPanel({
  table,
  state,
  menuPath,
  positionSaved,
  saving,
  onEdit,
  onArchive,
  onRegenerate,
  onCopy,
  onSavePosition,
}: TableDetailPanelProps) {
  if (!table) {
    return (
      <aside className="border-hard bg-white p-5">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
          Chi tiết bàn
        </p>
        <p className="mt-3 text-sm font-medium text-zinc-500">
          Chọn một bàn trên sơ đồ để xem liên kết menu và các thao tác.
        </p>
        <p className="mt-4 text-xs font-medium leading-relaxed text-zinc-400">
          Kéo bàn để đổi vị trí. Khi bàn đang được chọn, dùng phím mũi tên để dịch
          từng ô.
        </p>
      </aside>
    );
  }

  const currentState = state ?? 'free';

  return (
    <aside className="border-hard bg-white">
      <div className="border-b border-zinc-200 p-5">
        <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
          Chi tiết bàn
        </p>
        <h2 className="mt-2 text-xl font-black uppercase tracking-tight text-zinc-900">
          {table.name}
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${STATE_BADGE_CLASS[currentState]}`}
          >
            {TABLE_STATE_LABELS[currentState]}
          </span>
          <span className="flex items-center gap-1 border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            <MapPin className="h-3 w-3" /> {resolveAreaLabel(table.area)}
          </span>
          <span className="flex items-center gap-1 border border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            <Users className="h-3 w-3" />
            {table.seats ? `${table.seats} ghế` : 'chưa đặt ghế'}
          </span>
        </div>
      </div>

      <div className="space-y-3 p-5">
        {!positionSaved && (
          <div className="border border-amber-300 bg-amber-50 p-3">
            <p className="text-xs font-bold text-amber-900">
              Vị trí này chưa được lưu
            </p>
            <button
              type="button"
              onClick={() => onSavePosition(table)}
              disabled={saving}
              className="mt-2 w-full border border-amber-400 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
            >
              {saving ? 'Đang lưu…' : 'Lưu vị trí'}
            </button>
          </div>
        )}

        <div>
          <p className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">
            Link menu của bàn
          </p>
          <code className="mt-2 block break-all border border-zinc-200 bg-zinc-50 p-2 text-[10px] text-zinc-600">
            {menuPath}
          </code>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onCopy(table)}
              className="flex items-center justify-center gap-2 border border-zinc-300 bg-zinc-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-zinc-900 transition-colors hover:bg-zinc-100"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </button>
            <a
              href={menuPath}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Mở
            </a>
          </div>
        </div>

        <div className="space-y-2 border-t border-zinc-200 pt-3">
          <button
            type="button"
            onClick={() => onEdit(table)}
            className="flex w-full items-center justify-center gap-2 border border-zinc-900 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-zinc-900 transition-colors hover:bg-zinc-50"
          >
            <Pencil className="h-3.5 w-3.5" /> Sửa tên, khu vực, số ghế
          </button>
          <button
            type="button"
            onClick={() => onRegenerate(table)}
            className="flex w-full items-center justify-center gap-2 border border-orange-200 bg-orange-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-orange-700 transition-colors hover:bg-orange-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Cấp lại mã QR/NFC
          </button>
          <button
            type="button"
            onClick={() => onArchive(table)}
            className="flex w-full items-center justify-center gap-2 border border-red-200 bg-red-50 px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-700 transition-colors hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" /> Lưu trữ bàn
          </button>
        </div>

        <p className="border-t border-zinc-200 pt-3 text-[10px] font-medium leading-relaxed text-zinc-400">
          Mã bàn: <span className="font-mono">{table.tableId}</span>
          <br />
          QR/NFC: {table.nfcWritten ? 'đã nạp thẻ' : 'chưa nạp thẻ'} · phiên bản
          mã {table.tokenVersion}
        </p>
      </div>
    </aside>
  );
}
