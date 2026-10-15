import { useMemo } from 'react';
import type { TablePosition } from '@contracts/table.contract';
import type { TenantTable } from '../data/adapters/table.adapter';
import { useStoreSlice, useStoreTenantId } from '../data/tenantStore';
import type { TableConfig } from '../types';

/** One table as an operating page needs it: identity plus where it sits. */
export interface OperationTable {
  tableId: string;
  name: string;
  area: string | null;
  seats: number | null;
  position: TablePosition | null;
}

/**
 * Normalise the two table sources an operating page can have (REQ-TBL-002):
 * the Tenant's configured floor plan when one is resolved, and the demo list
 * otherwise. Rows without a saved position are laid out by `resolvePlanLayout`.
 */
export function toOperationTables(
  storeRows: TenantTable[],
  fallback: TableConfig[],
): OperationTable[] {
  if (storeRows.length > 0) {
    return storeRows.map((row) => ({
      tableId: row.tableId,
      name: row.name,
      area: row.area,
      seats: row.seats,
      position: row.position,
    }));
  }
  return fallback.map((table) => ({
    tableId: table.id,
    name: table.name,
    area: null,
    seats: null,
    position: null,
  }));
}

/**
 * Tables for an operating page. A resolved Tenant owns the plan even while it
 * still has no tables, so the demo list only stands in when there is no Tenant
 * at all — otherwise a real shop would see tables that do not exist.
 */
export function useOperationTables(fallback: TableConfig[]): {
  tables: OperationTable[];
  loading: boolean;
} {
  const [rows, meta] = useStoreSlice('tables');
  const tenantId = useStoreTenantId();

  const tables = useMemo(
    () => (tenantId ? toOperationTables(rows, []) : toOperationTables([], fallback)),
    [tenantId, rows, fallback],
  );

  return {
    tables,
    loading: tenantId !== null && meta.loading && rows.length === 0,
  };
}
