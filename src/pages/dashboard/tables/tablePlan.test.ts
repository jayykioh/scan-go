import { describe, expect, it } from 'vitest';
import { TABLE_FLOOR_COLUMNS, TABLE_FLOOR_ROWS } from '@contracts/table.contract';
import {
  MIN_CANVAS_COLUMNS,
  MIN_CANVAS_ROWS,
  clampToGrid,
  groupTablesByArea,
  isInsideGrid,
  moveWithinGrid,
  nextFreePosition,
  TABLE_STATE_LABELS,
  TABLE_STATE_SHORT_LABELS,
  resolveAreaLabel,
  resolveCanvasExtent,
  resolvePlanLayout,
  snapToGrid,
  summarizeTableStates,
} from './tablePlan';

describe('resolveCanvasExtent', () => {
  it('shows the minimum extent for an empty floor', () => {
    expect(resolveCanvasExtent([])).toEqual({
      columns: MIN_CANVAS_COLUMNS,
      rows: MIN_CANVAS_ROWS,
    });
  });

  it('grows to fit the farthest table', () => {
    expect(resolveCanvasExtent([{ x: 9, y: 7 }])).toEqual({
      columns: 11,
      rows: 9,
    });
  });

  it('never exceeds the stored grid', () => {
    expect(
      resolveCanvasExtent([{ x: TABLE_FLOOR_COLUMNS - 1, y: TABLE_FLOOR_ROWS - 1 }]),
    ).toEqual({ columns: TABLE_FLOOR_COLUMNS, rows: TABLE_FLOOR_ROWS });
  });
});

describe('nextFreePosition', () => {
  it('starts at the top-left corner', () => {
    expect(nextFreePosition([])).toEqual({ x: 0, y: 0 });
  });

  it('skips cells that are taken', () => {
    expect(
      nextFreePosition([
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toEqual({ x: 2, y: 0 });
  });

  it('returns null when the floor is full', () => {
    const full = [];
    for (let y = 0; y < TABLE_FLOOR_ROWS; y += 1) {
      for (let x = 0; x < TABLE_FLOOR_COLUMNS; x += 1) {
        full.push({ x, y });
      }
    }
    expect(nextFreePosition(full)).toBeNull();
  });
});

describe('grid bounds', () => {
  it('rejects a cell outside the grid', () => {
    expect(isInsideGrid({ x: 0, y: 0 })).toBe(true);
    expect(isInsideGrid({ x: -1, y: 0 })).toBe(false);
    expect(isInsideGrid({ x: TABLE_FLOOR_COLUMNS, y: 0 })).toBe(false);
    expect(isInsideGrid({ x: 0, y: TABLE_FLOOR_ROWS })).toBe(false);
    expect(isInsideGrid({ x: 1.5, y: 0 })).toBe(false);
  });

  it('clamps a drag that runs off the floor', () => {
    expect(clampToGrid({ x: -5, y: 99 })).toEqual({ x: 0, y: TABLE_FLOOR_ROWS - 1 });
  });

  it('moves one cell per arrow press and stops at the edge', () => {
    expect(moveWithinGrid({ x: 2, y: 2 }, 1, 0)).toEqual({ x: 3, y: 2 });
    expect(moveWithinGrid({ x: 0, y: 0 }, -1, -1)).toEqual({ x: 0, y: 0 });
    expect(moveWithinGrid({ x: TABLE_FLOOR_COLUMNS - 1, y: 0 }, 1, 0)).toEqual({
      x: TABLE_FLOOR_COLUMNS - 1,
      y: 0,
    });
  });

  it('snaps a pixel offset to the nearest cell', () => {
    expect(snapToGrid(0, 0, 96, 84)).toEqual({ x: 0, y: 0 });
    expect(snapToGrid(100, 100, 96, 84)).toEqual({ x: 1, y: 1 });
    expect(snapToGrid(-40, -40, 96, 84)).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveAreaLabel', () => {
  it('falls back to the main area for a missing or blank name', () => {
    expect(resolveAreaLabel(null)).toBe('Khu chính');
    expect(resolveAreaLabel('   ')).toBe('Khu chính');
    expect(resolveAreaLabel('Sân vườn')).toBe('Sân vườn');
  });
});

describe('state labels', () => {
  it('gives every state both a full and a short label', () => {
    const states = ['free', 'occupied', 'foodReady', 'awaitingPayment'] as const;
    for (const state of states) {
      expect(TABLE_STATE_LABELS[state].length).toBeGreaterThan(0);
      expect(TABLE_STATE_SHORT_LABELS[state].length).toBeGreaterThan(0);
      expect(TABLE_STATE_SHORT_LABELS[state].length).toBeLessThanOrEqual(8);
    }
    expect(TABLE_STATE_LABELS.awaitingPayment).toBe('Chờ thanh toán');
  });
});

describe('groupTablesByArea', () => {
  it('groups by area and sorts by name inside each group', () => {
    const groups = groupTablesByArea([
      { name: 'Bàn 3', area: 'Sân vườn' },
      { name: 'Bàn 1', area: null },
      { name: 'Bàn 2', area: 'Sân vườn' },
    ]);
    expect(groups.map((group) => group.area)).toEqual(['Khu chính', 'Sân vườn']);
    expect(groups[1].tables.map((table) => table.name)).toEqual(['Bàn 2', 'Bàn 3']);
  });
});

describe('resolvePlanLayout', () => {
  const table = (
    tableId: string,
    name: string,
    position: { x: number; y: number } | null,
  ) => ({ tableId, name, position });

  it('keeps saved positions and fills the rest into free cells', () => {
    const layout = resolvePlanLayout([
      table('t1', 'Bàn 1', { x: 0, y: 0 }),
      table('t2', 'Bàn 2', null),
    ]);
    expect(layout.placements.map((p) => [p.table.tableId, p.position, p.isSaved])).toEqual([
      ['t1', { x: 0, y: 0 }, true],
      ['t2', { x: 1, y: 0 }, false],
    ]);
    expect(layout.unsavedCount).toBe(1);
  });

  it('never draws two tables in the same cell', () => {
    const layout = resolvePlanLayout([
      table('t1', 'Bàn 1', { x: 0, y: 0 }),
      table('t2', 'Bàn 2', { x: 0, y: 0 }),
      table('t3', 'Bàn 3', null),
    ]);
    const keys = layout.placements.map((p) => `${p.position.x}:${p.position.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('treats an out-of-grid stored position as unplaced', () => {
    const layout = resolvePlanLayout([table('t1', 'Bàn 1', { x: 99, y: 0 })]);
    expect(layout.placements[0].isSaved).toBe(false);
    expect(layout.placements[0].position).toEqual({ x: 0, y: 0 });
  });

  it('reports tables that do not fit on a full floor', () => {
    const full = [];
    for (let y = 0; y < TABLE_FLOOR_ROWS; y += 1) {
      for (let x = 0; x < TABLE_FLOOR_COLUMNS; x += 1) {
        full.push(table(`t-${x}-${y}`, `Bàn ${x}-${y}`, { x, y }));
      }
    }
    const layout = resolvePlanLayout([...full, table('extra', 'Bàn thêm', null)]);
    expect(layout.overflowCount).toBe(1);
    expect(layout.unsavedCount).toBe(0);
    expect(layout.columns).toBe(TABLE_FLOOR_COLUMNS);
    expect(layout.rows).toBe(TABLE_FLOOR_ROWS);
  });
});

describe('summarizeTableStates', () => {  it('counts every state and treats an unreported table as free', () => {
    expect(
      summarizeTableStates(4, ['occupied', 'awaitingPayment', undefined]),
    ).toEqual({
      total: 4,
      free: 2,
      occupied: 1,
      foodReady: 0,
      awaitingPayment: 1,
    });
  });

  it('reports an empty floor', () => {
    expect(summarizeTableStates(0, [])).toEqual({
      total: 0,
      free: 0,
      occupied: 0,
      foodReady: 0,
      awaitingPayment: 0,
    });
  });
});
