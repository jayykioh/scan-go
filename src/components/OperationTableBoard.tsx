import { useEffect, useState } from 'react';
import type { TableServiceState } from '@contracts/tableStatus.contract';
import {
  TABLE_STATE_LABELS,
  TABLE_STATE_SHORT_LABELS,
  resolveAreaLabel,
  type PlanPlacement,
} from '../pages/dashboard/tables/tablePlan';
import type { OperationTable } from '../hooks/useOperationTables';
import type { Order } from '../types';

/**
 * Operating floor plan (REQ-TBL-002, REQ-TBL-003).
 *
 * The same cells the Owner arranged, drawn read-only and larger than the
 * administration canvas so a Kitchen, till, or Waiter screen can tap a table
 * without aiming. The grid scrolls and snaps horizontally, so a phone swipes
 * right-to-left through the tables instead of shrinking them.
 */
export const OPERATION_CELL_MIN_WIDTH = 96;

/** Name, area, and state need about as much height as width at this size. */
const CELL_ASPECT = 1;

/** Colour is never the only signal: every tile also prints its state. */
const STATE_TILE_CLASS: Record<TableServiceState, string> = {
  free: 'border-zinc-300 bg-white',
  occupied: 'border-amber-400 bg-amber-50',
  foodReady: 'border-sky-400 bg-sky-50',
  awaitingPayment: 'border-red-400 bg-red-50',
};

const STATE_DOT_CLASS: Record<TableServiceState, string> = {
  free: 'bg-zinc-300',
  occupied: 'bg-amber-500',
  foodReady: 'bg-sky-500',
  awaitingPayment: 'bg-red-500',
};

/** Wait urgency, which repaints a busy tile without changing its state text. */
export type OperationTone = 'calm' | 'warn' | 'late';

const TONE_TILE_CLASS: Record<OperationTone, string> = {
  calm: 'border-amber-400 bg-amber-50',
  warn: 'border-amber-500 bg-amber-100',
  late: 'border-red-500 bg-red-50',
};

/** What one table looks like for the page that is drawing it. */
export interface OperationTableState {
  state: TableServiceState;
  /** Open orders on this table; the tile always prints this number. */
  count: number;
  /** Replaces the state text, e.g. the longest wait in the Kitchen. */
  detail?: string;
  /** Repaints a busy tile by wait urgency. */
  tone?: OperationTone;
  /**
   * Draws the "!" ping that tells a Waiter this table has dishes to carry
   * (REQ-WAI-002). The tile's accessible name also says it, so the ping is
   * never the only signal.
   */
  ping?: boolean;
}

export interface TableOrderSummary {
  count: number;
  oldestAt: Date | null;
}

/** Orders per table, oldest order first for the wait tone. */
export function summarizeOrdersByTable(
  orders: Order[],
): Map<string, TableOrderSummary> {
  const summary = new Map<string, TableOrderSummary>();
  for (const order of orders) {
    const existing = summary.get(order.tableId);
    if (!existing) {
      summary.set(order.tableId, { count: 1, oldestAt: order.timestamp });
      continue;
    }
    existing.count += 1;
    if (
      existing.oldestAt === null ||
      order.timestamp.getTime() < existing.oldestAt.getTime()
    ) {
      existing.oldestAt = order.timestamp;
    }
  }
  return summary;
}

interface OperationTableBoardProps {
  placements: PlanPlacement<OperationTable>[];
  columns: number;
  rows: number;
  states: Map<string, OperationTableState>;
  selectedTableId: string | null;
  onSelect: (table: OperationTable) => void;
}

export default function OperationTableBoard({
  placements,
  columns,
  rows,
  states,
  selectedTableId,
  onSelect,
}: OperationTableBoardProps) {
  // A callback ref, so the effect re-runs when the plan arrives and the real
  // wrapper replaces the empty-state paragraph.
  const [wrapper, setWrapper] = useState<HTMLDivElement | null>(null);
  const [cellWidth, setCellWidth] = useState(OPERATION_CELL_MIN_WIDTH);

  const cellHeight = Math.round(cellWidth * CELL_ASPECT);

  // Scale the floor to the space it has, but never below a comfortable tap
  // target: past that the wrapper scrolls instead of shrinking the tiles.
  useEffect(() => {
    if (!wrapper) {
      return;
    }
    const measure = () => {
      // A hidden node reports 0. Keep the last good size instead of clamping
      // the floor to the minimum for the rest of the session.
      const width = wrapper.clientWidth;
      if (width <= 0) {
        return;
      }
      setCellWidth(
        Math.max(
          Math.floor((width - 24) / Math.max(columns, 1)),
          OPERATION_CELL_MIN_WIDTH,
        ),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [wrapper, columns]);

  if (placements.length === 0) {
    return (
      <p
        data-testid="operation-table-board"
        className="rounded-[21px] border border-dashed border-[#B5C7D8] bg-[#F5F5F7] px-4 py-6 text-center text-xs font-semibold text-[#5B5B60]"
      >
        Chưa có bàn nào. Thêm bàn ở mục Sơ đồ Bàn để vận hành theo bàn.
      </p>
    );
  }

  return (
    <div data-testid="operation-table-board" className="space-y-[4px]">
      <div className="flex items-center justify-between text-xs font-bold text-[#808080] select-none">
        <span>Sơ đồ bàn</span>
        <span className="lowercase">bấm bàn để xem đơn</span>
      </div>

      <div
        ref={setWrapper}
        data-testid="operation-table-scroll"
        className="max-h-[46vh] snap-x snap-mandatory overflow-auto border border-[#B5C7D8] bg-[#F5F5F7] p-3 lg:max-h-[420px]"
      >
        <div
          className="relative"
          style={{
            width: columns * cellWidth,
            height: rows * cellHeight,
            backgroundImage:
              'linear-gradient(to right, #e4e4e7 1px, transparent 1px), linear-gradient(to bottom, #e4e4e7 1px, transparent 1px)',
            backgroundSize: `${cellWidth}px ${cellHeight}px`,
          }}
        >
          {placements.map((placement) => {
            const table = placement.table;
            const entry = states.get(table.tableId);
            const state = entry?.state ?? 'free';
            const count = entry?.count ?? 0;
            const isSelected = selectedTableId === table.tableId;
            const area = resolveAreaLabel(table.area);
            const ping = entry?.ping === true;
            const label = [
              table.name,
              `khu ${area}`,
              table.seats ? `${table.seats} ghế` : null,
              `${count} đơn đang đợi`,
              TABLE_STATE_LABELS[state],
              ping ? 'cần phục vụ' : null,
            ]
              .filter(Boolean)
              .join(', ');

            return (
              <button
                key={table.tableId}
                type="button"
                onClick={() => onSelect(table)}
                aria-label={label}
                aria-pressed={isSelected}
                title={label}
                style={{
                  left: placement.position.x * cellWidth + 4,
                  top: placement.position.y * cellHeight + 4,
                  width: cellWidth - 8,
                  height: cellHeight - 8,
                }}
                className={[
                  'absolute flex snap-start flex-col items-start justify-between border-2 p-2 text-left transition-shadow',
                  state === 'free'
                    ? STATE_TILE_CLASS.free
                    : entry?.tone
                      ? TONE_TILE_CLASS[entry.tone]
                      : STATE_TILE_CLASS[state],
                  isSelected
                    ? 'shadow-[4px_4px_0_0_#18181b]'
                    : 'shadow-[2px_2px_0_0_#d4d4d8]',
                  'cursor-pointer',
                ].join(' ')}
              >
                {/* The ping sits on the tile's corner, over the neighbour's gap,
                    so a Waiter reads the room without opening a table. */}
                {ping && (
                  <span
                    data-testid="operation-table-ping"
                    aria-hidden="true"
                    className="absolute -right-2 -top-2 z-20 flex h-6 w-6 animate-pulse items-center justify-center rounded-full border-2 border-white bg-red-600 text-sm font-black leading-none text-white shadow-[2px_2px_0_0_#18181b]"
                  >
                    !
                  </span>
                )}

                <span className="flex w-full items-start justify-between gap-1">
                  <span className="line-clamp-2 break-words text-[13px] font-black uppercase leading-[1.1] tracking-tight text-zinc-900">
                    {table.name}
                  </span>
                  {/* The count is always printed, so an empty table reads as 0. */}
                  <span
                    data-testid="operation-table-count"
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      count > 0
                        ? 'bg-zinc-950 text-white'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {count}
                  </span>
                </span>

                <span className="w-full truncate text-[10px] font-bold text-zinc-500">
                  {/* A phone cell is too narrow for the seat count too. */}
                  {table.seats && cellWidth >= 120
                    ? `${area} · ${table.seats} ghế`
                    : area}
                </span>

                <span className="flex w-full items-center gap-1 text-[10px] font-black uppercase leading-none tracking-tight text-zinc-700">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT_CLASS[state]}`}
                  />
                  <span className="truncate">
                    {entry?.detail ?? TABLE_STATE_SHORT_LABELS[state]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
