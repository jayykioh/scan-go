import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users } from 'lucide-react';
import {
  TABLE_FLOOR_COLUMNS,
  TABLE_FLOOR_ROWS,
  type TablePosition,
} from '@contracts/table.contract';
import type { TableServiceState } from '@contracts/tableStatus.contract';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import {
  TABLE_STATE_LABELS,
  TABLE_STATE_SHORT_LABELS,
  moveWithinGrid,
  resolveAreaLabel,
  snapToGrid,
} from './tablePlan';

export const PLAN_MIN_CELL_WIDTH = 62;
// Enough height for two name lines plus the seat and state rows.
const CELL_ASPECT = 0.95;

/** Colour is never the only signal: every tile also prints its state label. */
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

export interface PlanPlacement {
  table: TenantTable;
  position: TablePosition;
  /** False when the table has no saved position and is only placed to be seen. */
  isSaved: boolean;
}

interface TablePlanCanvasProps {
  placements: PlanPlacement[];
  columns: number;
  rows: number;
  states: Map<string, TableServiceState>;
  selectedTableId: string | null;
  onSelect: (table: TenantTable) => void;
  onMove: (table: TenantTable, position: TablePosition) => void;
  savingTableId: string | null;
}

interface DragState {
  tableId: string;
  pointerId: number;
  startX: number;
  startY: number;
  origin: TablePosition;
  moved: boolean;
}

export default function TablePlanCanvas({
  placements,
  columns,
  rows,
  states,
  selectedTableId,
  onSelect,
  onMove,
  savingTableId,
}: TablePlanCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [cellWidth, setCellWidth] = useState(96);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [preview, setPreview] = useState<TablePosition | null>(null);

  const cellHeight = Math.round(cellWidth * CELL_ASPECT);

  // The floor scales to the space it has, so twelve columns fit a laptop
  // without a horizontal scrollbar and the drag maths stays in real pixels.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const available = node.clientWidth - 24;
      setCellWidth(
        Math.max(Math.floor(available / columns), PLAN_MIN_CELL_WIDTH),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [columns]);

  const finishDrag = useCallback(
    (state: DragState) => {
      if (state.moved && preview) {
        const origin = placements.find(
          (placement) => placement.table.tableId === state.tableId,
        );
        const unchanged =
          origin &&
          origin.isSaved &&
          origin.position.x === preview.x &&
          origin.position.y === preview.y;
        if (!unchanged) {
          const table = placements.find(
            (placement) => placement.table.tableId === state.tableId,
          )?.table;
          if (table) {
            onMove(table, preview);
          }
        }
      }
      setDrag(null);
      setPreview(null);
    },
    [onMove, placements, preview],
  );

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    placement: PlanPlacement,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      tableId: placement.table.tableId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: placement.position,
      moved: false,
    });
    setPreview(placement.position);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag || event.pointerId !== drag.pointerId) {
      return;
    }
    const offsetX = event.clientX - drag.startX;
    const offsetY = event.clientY - drag.startY;
    if (Math.abs(offsetX) < 4 && Math.abs(offsetY) < 4) {
      return;
    }
    setDrag({ ...drag, moved: true });
    setPreview(
      snapToGrid(
        drag.origin.x * cellWidth + offsetX,
        drag.origin.y * cellHeight + offsetY,
        cellWidth,
        cellHeight,
      ),
    );
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    placement: PlanPlacement,
  ) => {
    const step: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const delta = step[event.key];
    if (!delta) {
      return;
    }
    event.preventDefault();
    const next = moveWithinGrid(placement.position, delta[0], delta[1]);
    if (
      next.x === placement.position.x &&
      next.y === placement.position.y &&
      placement.isSaved
    ) {
      return;
    }
    onMove(placement.table, next);
  };

  return (
    <div
      ref={wrapperRef}
      className="overflow-x-auto border-hard bg-zinc-100 p-3"
      data-testid="table-plan-canvas"
    >
      <p className="sr-only">
        Sơ đồ bàn dạng lưới {TABLE_FLOOR_COLUMNS} cột {TABLE_FLOOR_ROWS} hàng. Kéo
        bàn để đổi vị trí, hoặc dùng phím mũi tên khi bàn đang được chọn.
      </p>
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
          const state = states.get(placement.table.tableId) ?? 'free';
          const isDragging = drag?.tableId === placement.table.tableId;
          const position =
            isDragging && preview ? preview : placement.position;
          const isSelected = selectedTableId === placement.table.tableId;
          const isSaving = savingTableId === placement.table.tableId;
          const label = [
            placement.table.name,
            placement.table.seats ? `${placement.table.seats} ghế` : null,
            `khu ${resolveAreaLabel(placement.table.area)}`,
            TABLE_STATE_LABELS[state],
            `cột ${position.x + 1} hàng ${position.y + 1}`,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <button
              key={placement.table.tableId}
              type="button"
              onPointerDown={(event) => handlePointerDown(event, placement)}
              onPointerMove={handlePointerMove}
              onPointerUp={() => drag && finishDrag(drag)}
              onPointerCancel={() => drag && finishDrag(drag)}
              onKeyDown={(event) => handleKeyDown(event, placement)}
              onClick={() => {
                if (!drag?.moved) {
                  onSelect(placement.table);
                }
              }}
              aria-label={label}
              aria-pressed={isSelected}
              title={label}
              style={{
                left: position.x * cellWidth + 4,
                top: position.y * cellHeight + 4,
                width: cellWidth - 8,
                height: cellHeight - 8,
                touchAction: 'none',
              }}
              className={[
                'absolute flex flex-col items-start justify-between overflow-hidden border-2 p-1.5 text-left transition-shadow',
                STATE_TILE_CLASS[state],
                isSelected
                  ? 'shadow-[4px_4px_0_0_#18181b]'
                  : 'shadow-[2px_2px_0_0_#d4d4d8]',
                isDragging ? 'z-20 cursor-grabbing opacity-90' : 'cursor-grab',
                isSaving ? 'animate-pulse' : '',
                !placement.isSaved ? 'border-dashed' : '',
              ].join(' ')}
            >
              <span className="line-clamp-2 w-full break-words text-[11px] font-black uppercase leading-[1.15] tracking-tight text-zinc-900">
                {placement.table.name}
              </span>
              <span className="flex w-full items-center gap-1 text-[9px] font-bold text-zinc-500">
                {placement.table.seats ? (
                  <>
                    <Users className="h-3 w-3 shrink-0" />
                    {placement.table.seats}
                  </>
                ) : (
                  <span className="text-zinc-400">chưa đặt ghế</span>
                )}
              </span>
              <span className="flex w-full items-center gap-1 text-[8px] font-black uppercase leading-none tracking-tight text-zinc-700">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT_CLASS[state]}`}
                />
                <span className="truncate">{TABLE_STATE_SHORT_LABELS[state]}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
