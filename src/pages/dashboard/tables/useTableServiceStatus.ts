import { useCallback, useEffect, useRef, useState } from 'react';
import type { TableServiceState } from '@contracts/tableStatus.contract';
import { listTableServiceStatus } from '../../../data/adapters/table.adapter';

/** How often the floor plan re-reads table state while it is on screen. */
export const TABLE_STATUS_POLL_MS = 10_000;

export interface TableServiceStatusState {
  states: Map<string, TableServiceState>;
  error: string | null;
  /** True until the first answer arrives, so the plan can avoid a false "trống". */
  loading: boolean;
  refresh: () => void;
}

/**
 * Poll the floor-plan service state (REQ-TBL-003).
 *
 * The state is derived from live Orders on the server, so it is always
 * consistent with the Kitchen board and the till; the cost is that the screen
 * has to ask again. Polling pauses while the tab is hidden and resumes with an
 * immediate refresh when it comes back, so a counter tablet left open all day
 * is current the moment someone looks at it.
 */
export function useTableServiceStatus(
  tenantId: string | null,
  intervalMs: number = TABLE_STATUS_POLL_MS,
): TableServiceStatusState {
  const [states, setStates] = useState<Map<string, TableServiceState>>(
    () => new Map(),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!tenantId || inFlight.current) {
      return;
    }
    inFlight.current = true;
    try {
      const tables = await listTableServiceStatus(tenantId);
      if (!mounted.current) {
        return;
      }
      setStates(new Map(tables.map((table) => [table.tableId, table.state])));
      setError(null);
    } catch (cause) {
      if (mounted.current) {
        setError(
          cause instanceof Error ? cause.message : 'Không đọc được trạng thái bàn.',
        );
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) {
        setLoading(false);
      }
    }
  }, [tenantId]);

  useEffect(() => {
    mounted.current = true;
    setStates(new Map());
    setLoading(true);
    if (!tenantId) {
      setLoading(false);
      return () => {
        mounted.current = false;
      };
    }

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted.current = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [tenantId, intervalMs, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { states, error, loading, refresh };
}
