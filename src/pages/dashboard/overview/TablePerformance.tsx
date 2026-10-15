import React, { useState } from 'react';
import type { I18nMessageKey } from '@contracts/i18n.contract';
import type { PopularTable } from '@contracts/reporting.contract';
import {
  resolveInterfaceLocale,
  translate,
} from '../../../data/adapters/i18n.adapter';
import { formatVnd } from '../../../data/adapters/reporting.adapter';

/**
 * The read layer sorts by revenue and caps the list at this size without
 * signalling truncation (`src/data/firestoreRead.ts`), so a full list may hide
 * further tables. The panel states the limit rather than implying completeness.
 */
export const TABLE_PERFORMANCE_READ_LIMIT = 50;

export interface TablePerformanceRow {
  tableId: string;
  tableName: string;
  paidOrderCount: number;
  revenueVnd: number;
  grossProfitVnd: number;
}

/**
 * Table stats for the selected period (REQ-RPT-001). Names come from the stats
 * snapshot, so a renamed or archived table still reads as it did in the period.
 */
export function buildTablePerformanceRows(
  tables: readonly PopularTable[],
): { rows: TablePerformanceRow[]; mayBeTruncated: boolean } {
  const rows = tables
    .map((table) => ({
      tableId: table.tableId,
      tableName: table.tableName,
      paidOrderCount: table.paidOrderCount,
      revenueVnd: table.revenueVnd,
      grossProfitVnd: table.grossProfitVnd,
    }))
    .sort((a, b) => b.revenueVnd - a.revenueVnd);

  return {
    rows,
    mayBeTruncated: tables.length >= TABLE_PERFORMANCE_READ_LIMIT,
  };
}

/** Per-table revenue and gross profit for the selected reporting period. */
export default function TablePerformance({
  tables,
}: {
  tables: readonly PopularTable[];
}) {
  const [locale] = useState(() => resolveInterfaceLocale());
  const t = (key: I18nMessageKey) => translate(locale, key);
  const { rows, mayBeTruncated } = buildTablePerformanceRows(tables);

  return (
    <section
      className="bg-white border-hard shadow-hard"
      aria-labelledby="table-performance-title"
    >
      <div className="p-5 border-b border-zinc-100 flex flex-wrap justify-between items-center gap-2">
        <h3
          id="table-performance-title"
          className="font-bold text-lg uppercase tracking-tight text-zinc-900"
        >
          {t('owner.overview.tablePerformance')}
        </h3>
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
          {t('owner.overview.tablePerformanceOrder')}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-xs font-bold text-zinc-400 uppercase tracking-widest">
          {t('owner.overview.tablePerformanceEmpty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {t('owner.overview.tablePerformance')}
            </caption>
            <thead>
              <tr className="border-b border-zinc-100 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                <th scope="col" className="p-3 text-left">
                  {t('owner.overview.tableName')}
                </th>
                <th scope="col" className="p-3 text-right">
                  {t('owner.overview.tablePaidOrders')}
                </th>
                <th scope="col" className="p-3 text-right">
                  {t('owner.overview.tableRevenue')}
                </th>
                <th scope="col" className="p-3 text-right">
                  {t('owner.overview.tableGrossProfit')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.tableId}
                  className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors"
                >
                  <td className="p-3 font-bold text-zinc-900">{row.tableName}</td>
                  <td className="p-3 text-right font-medium text-zinc-500">
                    {row.paidOrderCount}
                  </td>
                  <td className="p-3 text-right font-bold text-zinc-900">
                    {formatVnd(row.revenueVnd)}
                  </td>
                  <td
                    className={`p-3 text-right font-bold ${
                      row.grossProfitVnd < 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {formatVnd(row.grossProfitVnd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mayBeTruncated && (
        <p className="p-4 bg-zinc-50 border-t border-zinc-100 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          {t('owner.overview.tablePerformanceTruncated')}
        </p>
      )}
    </section>
  );
}
