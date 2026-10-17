import { useEffect, useState } from 'react';
import type { Attendance, Shift } from '@contracts/workforce.contract';
import {
  subscribeAttendance,
  subscribeShifts,
  type WorkforceScope,
} from '../data/adapters/workforce.adapter';
import { isoWindowForDays } from '../pages/dashboard/shifts/shiftPlan';

export interface WorkforceWindow {
  shifts: Shift[];
  attendance: Attendance[];
  loading: boolean;
  error: string | null;
}

/**
 * Live Shifts and attendance for a tenant-local day range (REQ-HRM-004,
 * REQ-HRM-005). The week window is a parameter, so this is a page-level
 * listener rather than a shared store slice; the scope keeps a Staff member's
 * listener inside what Firestore Rules allow them to read.
 */
export function useWorkforceWindow(options: {
  tenantId: string | null;
  fromDay: string;
  toDay: string;
  staffUid?: string | null;
}): WorkforceWindow {
  const { tenantId, fromDay, toDay, staffUid } = options;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setShifts([]);
      setAttendance([]);
      setError(null);
      setLoading(false);
      return;
    }
    const scope: WorkforceScope = staffUid ? { uid: staffUid } : undefined;
    const { from, to } = isoWindowForDays(fromDay, toDay);
    setLoading(true);
    setError(null);
    const onError = (caught: Error): void => {
      setError(caught.message);
      setLoading(false);
    };
    const unsubscribeShifts = subscribeShifts(
      tenantId,
      scope,
      fromDay,
      toDay,
      (rows) => {
        setShifts(rows);
        setLoading(false);
      },
      onError,
    );
    const unsubscribeAttendance = subscribeAttendance(
      tenantId,
      scope,
      from,
      to,
      setAttendance,
      onError,
    );
    return () => {
      unsubscribeShifts();
      unsubscribeAttendance();
    };
  }, [tenantId, fromDay, toDay, staffUid]);

  return { shifts, attendance, loading, error };
}
