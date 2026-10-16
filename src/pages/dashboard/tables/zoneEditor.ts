import {
  DEFAULT_TABLE_AREA,
  type TablePosition,
} from '@contracts/table.contract';
import type { TenantTable } from '../../../data/adapters/table.adapter';
import { allocateFreePositions, parseSeatCount, resolveAreaLabel } from './tablePlan';

/**
 * The whole configuration one zone save sends (REQ-TBL-009).
 *
 * The server has no batch command, so the screen plans every command here and
 * runs them in order: create the authored tables, move tables in and out of the
 * area, release a renamed area's old assignment, then assign the Waiters last —
 * that last command re-projects the area's coverage onto every table of the
 * zone, so the projections cannot disagree with the plan.
 *
 * shortcut: the commands are not atomic, upgrade to one batch callable when a
 * zone regularly exceeds ~50 tables.
 */

export interface ZoneDraftTable {
  name: string;
  seats: string;
}

export interface ZoneSavePlanInput {
  /** The area being edited; null when the zone is new. */
  originalLabel: string | null;
  label: string;
  tables: TenantTable[];
  selectedTableIds: readonly string[];
  draftTables: readonly ZoneDraftTable[];
  occupiedPositions: readonly TablePosition[];
  waiterUids: readonly string[];
  currentWaiterUids: readonly string[];
}

export interface ZoneSavePlan {
  label: string;
  /** Tables authored in the dialog, created with their own free cell. */
  creates: { name: string; seats: number | null; position: TablePosition }[];
  /** Area changes for tables that already exist. */
  relabels: { table: TenantTable; area: string | null }[];
  /** An area document to drop because the zone was renamed. */
  releasedLabel: string | null;
  /** The one Waiter command; null when nothing about coverage changed. */
  assign: { label: string; waiterUids: string[] } | null;
  /** Authored tables the floor grid could not hold. */
  overflow: number;
}

function sameUidSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((uid, index) => uid === sortedRight[index]);
}

/** A stored label: the default area is stored as "no name", never as text. */
export function storedAreaLabel(label: string): string | null {
  return label === DEFAULT_TABLE_AREA ? null : label;
}

export function buildZoneSavePlan(input: ZoneSavePlanInput): ZoneSavePlan {
  const label = input.label.trim();
  const selected = new Set(input.selectedTableIds);
  const positions = allocateFreePositions(
    input.draftTables.length,
    [...input.occupiedPositions],
  );

  const creates = input.draftTables
    .map((draft, index) => ({
      name: draft.name.trim(),
      seats: parseSeatCount(draft.seats),
      position: positions[index],
    }))
    .filter(
      (create): create is ZoneSavePlan['creates'][number] =>
        create.name.length > 0 && create.position !== undefined,
    );

  const relabels: ZoneSavePlan['relabels'] = [];
  for (const table of input.tables) {
    const current = resolveAreaLabel(table.area);
    if (selected.has(table.tableId)) {
      if (current !== label) {
        relabels.push({ table, area: storedAreaLabel(label) });
      }
      continue;
    }
    // A table that was in the zone and is no longer ticked leaves it. Only the
    // zone being edited is touched, never another area's tables.
    if (input.originalLabel !== null && current === input.originalLabel) {
      relabels.push({ table, area: null });
    }
  }

  const labelChanged =
    input.originalLabel !== null && input.originalLabel !== label;
  const waitersChanged = !sameUidSet(input.waiterUids, input.currentWaiterUids);
  const assignNeeded =
    labelChanged ||
    waitersChanged ||
    (input.originalLabel === null && input.waiterUids.length > 0);

  return {
    label,
    creates,
    relabels,
    releasedLabel: labelChanged ? input.originalLabel : null,
    assign: assignNeeded
      ? { label, waiterUids: [...input.waiterUids] }
      : null,
    overflow: input.draftTables.length - creates.length,
  };
}
