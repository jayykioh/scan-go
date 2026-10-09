/**
 * Which of the four list states the Tables screen must paint.
 *
 * The original screen collapsed three very different situations into one
 * "Chưa có bàn nào được thiết lập" panel: still restoring the Auth session,
 * a read that failed, and a shop that genuinely has no tables. An Owner who
 * opened the page from a bookmark saw an empty shop and could create duplicate
 * tables (IMP-01, F-01). Keeping the rule pure makes it testable.
 */
export type TableListView = 'loading' | 'error' | 'empty' | 'list';

export interface TableListViewInput {
  /** Active tenant id from the shared store; `null` while Auth/tenant resolve. */
  tenantId: string | null;
  /** Slice loading flag. */
  loading: boolean;
  /** Number of tables already read. */
  rowCount: number;
  /** Slice or command error message. */
  error: string | null;
}

export function resolveTableListView({
  tenantId,
  loading,
  rowCount,
  error,
}: TableListViewInput): TableListView {
  // Stale data beats a spinner: never hide rows we already have.
  if (rowCount > 0) {
    return 'list';
  }
  if (loading || tenantId === null) {
    return 'loading';
  }
  if (error) {
    return 'error';
  }
  return 'empty';
}
