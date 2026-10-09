import {
  DEFAULT_TABLE_AREA,
  TABLE_FLOOR_COLUMNS,
  TABLE_FLOOR_ROWS,
  type TablePosition,
} from '@contracts/table.contract';
import type { TableServiceState } from '@contracts/tableStatus.contract';

/**
 * Pure floor-plan geometry and grouping (REQ-TBL-002, REQ-TBL-003).
 *
 * Positions are grid cells, never pixels: the same saved arrangement has to
 * mean the same thing on a laptop and on the tablet at the counter. The canvas
 * shows at least the minimum extent and grows to fit the tables actually
 * placed, so a five-table shop does not get an empty hall.
 */

export const MIN_CANVAS_COLUMNS = 8;
export const MIN_CANVAS_ROWS = 6;

export interface CanvasExtent {
  columns: number;
  rows: number;
}

export function resolveCanvasExtent(positions: TablePosition[]): CanvasExtent {
  let columns = MIN_CANVAS_COLUMNS;
  let rows = MIN_CANVAS_ROWS;
  for (const position of positions) {
    columns = Math.max(columns, position.x + 2);
    rows = Math.max(rows, position.y + 2);
  }
  return {
    columns: Math.min(columns, TABLE_FLOOR_COLUMNS),
    rows: Math.min(rows, TABLE_FLOOR_ROWS),
  };
}

function cellKey(position: TablePosition): string {
  return `${position.x}:${position.y}`;
}

/** The first free cell, scanning row by row: where a newly added table lands. */
export function nextFreePosition(
  occupied: TablePosition[],
): TablePosition | null {
  const taken = new Set(occupied.map(cellKey));
  for (let y = 0; y < TABLE_FLOOR_ROWS; y += 1) {
    for (let x = 0; x < TABLE_FLOOR_COLUMNS; x += 1) {
      if (!taken.has(`${x}:${y}`)) {
        return { x, y };
      }
    }
  }
  return null;
}

export function isInsideGrid(position: TablePosition): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.x < TABLE_FLOOR_COLUMNS &&
    position.y >= 0 &&
    position.y < TABLE_FLOOR_ROWS
  );
}

/** Clamp any coordinate pair into the grid; a drag can never leave the floor. */
export function clampToGrid(position: TablePosition): TablePosition {
  return {
    x: Math.min(Math.max(Math.round(position.x), 0), TABLE_FLOOR_COLUMNS - 1),
    y: Math.min(Math.max(Math.round(position.y), 0), TABLE_FLOOR_ROWS - 1),
  };
}

/** Keyboard move: one cell per arrow press, clamped at the edges. */
export function moveWithinGrid(
  position: TablePosition,
  dx: number,
  dy: number,
): TablePosition {
  return clampToGrid({ x: position.x + dx, y: position.y + dy });
}

/** Snap a pixel offset inside the canvas to the nearest cell. */
export function snapToGrid(
  offsetX: number,
  offsetY: number,
  cellWidth: number,
  cellHeight: number,
): TablePosition {
  return clampToGrid({
    x: Math.round(offsetX / Math.max(cellWidth, 1)),
    y: Math.round(offsetY / Math.max(cellHeight, 1)),
  });
}

/** Area label shown to the Owner; tables without one belong to the main area. */
export function resolveAreaLabel(area: string | null): string {
  const trimmed = (area ?? '').trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_TABLE_AREA;
}

export interface AreaGroup<T> {
  area: string;
  tables: T[];
}

/**
 * Group tables for the list view. Areas keep the order they first appear in
 * after sorting by name, so the list is stable between renders.
 */
export function groupTablesByArea<
  T extends { name: string; area: string | null },
>(tables: T[]): AreaGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const table of [...tables].sort((left, right) =>
    left.name.localeCompare(right.name, 'vi'),
  )) {
    const area = resolveAreaLabel(table.area);
    const bucket = groups.get(area) ?? [];
    bucket.push(table);
    groups.set(area, bucket);
  }
  return [...groups.entries()].map(([area, grouped]) => ({
    area,
    tables: grouped,
  }));
}

export interface TableStateSummary {
  total: number;
  free: number;
  occupied: number;
  foodReady: number;
  awaitingPayment: number;
}

/** Counts for the summary strip. A table with no reported status is free. */
export function summarizeTableStates(
  total: number,
  states: Iterable<TableServiceState | undefined>,
): TableStateSummary {
  const summary: TableStateSummary = {
    total,
    free: 0,
    occupied: 0,
    foodReady: 0,
    awaitingPayment: 0,
  };
  let counted = 0;
  for (const state of states) {
    counted += 1;
    summary[state ?? 'free'] += 1;
  }
  // Tables the server did not report on are free by definition.
  summary.free += Math.max(total - counted, 0);
  return summary;
}

export const TABLE_STATE_LABELS: Record<TableServiceState, string> = {
  free: 'Trống',
  occupied: 'Có khách',
  foodReady: 'Món sẵn sàng',
  awaitingPayment: 'Chờ thanh toán',
};

/**
 * Short forms for a floor-plan tile, where a cell is around 90px wide. The full
 * label stays in the summary strip, the detail panel, and every accessible
 * name, so nothing is only ever communicated by the abbreviation.
 */
export const TABLE_STATE_SHORT_LABELS: Record<TableServiceState, string> = {
  free: 'Trống',
  occupied: 'Có khách',
  foodReady: 'Sẵn sàng',
  awaitingPayment: 'Chờ thu',
};

export interface PlanPlacement<T> {
  table: T;
  position: TablePosition;
  /** False when the table has no saved position and is only placed to be seen. */
  isSaved: boolean;
}

export interface PlanLayout<T> {
  placements: PlanPlacement<T>[];
  columns: number;
  rows: number;
  /** Tables that have no saved position yet, so the Owner can persist them. */
  unsavedCount: number;
  /** Tables that could not be shown because the floor grid is full. */
  overflowCount: number;
}

/**
 * Decide where every table is drawn. Tables the Owner already placed keep their
 * cell; the rest are shown in the first free cells so a shop that just added
 * tables still sees them, and the screen can offer to save that arrangement
 * instead of writing to Firestore behind the Owner's back (REQ-TBL-002).
 */
export function resolvePlanLayout<
  T extends { tableId: string; name: string; position: TablePosition | null },
>(tables: T[]): PlanLayout<T> {
  const ordered = [...tables].sort((left, right) =>
    left.name.localeCompare(right.name, 'vi'),
  );
  const placements: PlanPlacement<T>[] = [];
  const occupied: TablePosition[] = [];
  const taken = new Set<string>();
  const pending: T[] = [];

  for (const table of ordered) {
    // Two tables can share a stored cell (a bad save, or two devices editing at
    // once). Only the first keeps it; the other is re-placed and reported as
    // unsaved so the screen offers to persist the arrangement.
    if (
      table.position &&
      isInsideGrid(table.position) &&
      !taken.has(cellKey(table.position))
    ) {
      placements.push({ table, position: table.position, isSaved: true });
      occupied.push(table.position);
      taken.add(cellKey(table.position));
    } else {
      pending.push(table);
    }
  }

  let overflowCount = 0;
  for (const table of pending) {
    const position = nextFreePosition(occupied);
    if (!position) {
      overflowCount += 1;
      continue;
    }
    placements.push({ table, position, isSaved: false });
    occupied.push(position);
    taken.add(cellKey(position));
  }

  const extent = resolveCanvasExtent(occupied);
  return {
    placements,
    columns: extent.columns,
    rows: extent.rows,
    unsavedCount: pending.length - overflowCount,
    overflowCount,
  };
}

