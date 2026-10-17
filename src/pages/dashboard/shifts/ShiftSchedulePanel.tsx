import React, { useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { Shift } from '@contracts/workforce.contract';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';
import { useStoreSlice, useStoreTenantId } from '../../../data/tenantStore';
import { useToast } from '../../../contexts/ToastContext';
import { useNow } from '../../../hooks/useNow';
import { useWorkforceWindow } from '../../../hooks/useWorkforceWindow';
import { cancelShift, scheduleShifts } from '../../../data/adapters/workforce.adapter';
import ShiftScheduleDialog, { type ShiftDraft } from './ShiftScheduleDialog';
import {
  addDays,
  attendanceByShiftId,
  combineDayAndTime,
  formatClockTime,
  formatDayLabel,
  formatMinutes,
  formatWeekLabel,
  shiftMinutes,
  shiftState,
  startOfWeek,
  todayDayKey,
  totalMinutesByStaff,
  weekDays,
} from './shiftPlan';

const STATE_LABELS = {
  planned: 'Chưa nhận ca',
  working: 'Đang làm',
  done: 'Đã xong',
  missing: 'Thiếu chấm công',
} as const;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Thao tác ca làm thất bại.';
}

/**
 * The Owner's week of Shifts: who works when, who has accepted the Shift, and
 * the minutes worked so far (REQ-HRM-004, REQ-HRM-005). Minutes only — this
 * never shows or derives a wage (REQ-HRM-003).
 */
export default function ShiftSchedulePanel() {
  const tenantId = useStoreTenantId();
  const toast = useToast();
  const [staff] = useStoreSlice('staffDirectory');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(todayDayKey()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nowMs = useNow();
  const weekEnd = addDays(weekStart, 6);
  const { shifts, attendance, loading, error } = useWorkforceWindow({
    tenantId,
    fromDay: weekStart,
    toDay: weekEnd,
  });

  const byShift = useMemo(() => attendanceByShiftId(attendance), [attendance]);
  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of staff) {
      map.set(member.uid, member.displayName ?? member.uid);
    }
    return map;
  }, [staff]);
  const totals = useMemo(
    () => totalMinutesByStaff(shifts, byShift, nowMs),
    [shifts, byShift, nowMs],
  );
  const activeStaff: StaffDirectoryEntry[] = useMemo(
    () => staff.filter((member) => member.isActive),
    [staff],
  );
  const workingCount = useMemo(
    () => shifts.filter((shift) => shiftState(shift, byShift.get(shift.shiftId) ?? null, nowMs) === 'working').length,
    [shifts, byShift, nowMs],
  );

  const nameOf = (uid: string): string => names.get(uid) ?? uid;

  const handleSave = async (draft: ShiftDraft): Promise<void> => {
    if (!tenantId || saving) return;
    setSaving(true);
    try {
      await scheduleShifts({
        tenantId,
        staffUids: draft.staffUids,
        date: draft.dayKey,
        startAt: combineDayAndTime(draft.dayKey, draft.startTime),
        endAt: combineDayAndTime(draft.dayKey, draft.endTime),
        label: draft.label.length > 0 ? draft.label : null,
      });
      toast.success(`Đã thêm ca cho ${draft.staffUids.length} nhân viên`);
      setDialogOpen(false);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (shift: Shift): Promise<void> => {
    if (!tenantId) return;
    try {
      await cancelShift({ tenantId, shiftId: shift.shiftId });
      toast.success('Đã xoá ca làm');
    } catch (caught) {
      toast.error(errorMessage(caught));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-hard bg-white p-5 shadow-hard md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="h-5 w-5 text-orange-600" />
          <div>
            <p className="text-sm font-bold text-zinc-900">
              {formatWeekLabel(weekStart, weekEnd)}
            </p>
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {shifts.length} ca · đang làm {workingCount}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Tuần trước"
            className="flex h-11 w-11 items-center justify-center border-hard bg-white shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(startOfWeek(todayDayKey()))}
            className="min-h-11 border-hard bg-white px-4 font-mono text-[10px] font-bold uppercase tracking-widest shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            Tuần này
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Tuần sau"
            className="flex h-11 w-11 items-center justify-center border-hard bg-white shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="min-h-11 bg-orange-600 px-5 font-mono text-[10px] font-bold uppercase tracking-widest text-white border-hard shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Thêm ca
          </button>
        </div>
      </div>

      {error && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="border-hard bg-white shadow-hard">
        {loading && shifts.length === 0 ? (
          <p className="p-8 text-center font-mono text-sm uppercase tracking-widest text-zinc-500">
            Đang tải ca làm
          </p>
        ) : shifts.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            Tuần này chưa có ca làm nào. Bấm “Thêm ca” để xếp ca cho nhân viên.
          </p>
        ) : (
          weekDays(weekStart).map((dayKey) => {
            const rows = shifts
              .filter((shift) => shift.date === dayKey)
              .sort((left, right) => left.startAt.localeCompare(right.startAt));
            return (
              <section
                key={dayKey}
                className="border-b border-hard last:border-b-0"
              >
                <header className="flex items-center justify-between bg-zinc-50 px-4 py-2">
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-900">
                    {formatDayLabel(dayKey)}
                  </h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {rows.length} ca
                  </span>
                </header>
                {rows.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-zinc-400">Không có ca</p>
                ) : (
                  <ul>
                    {rows.map((shift) => {
                      const record = byShift.get(shift.shiftId) ?? null;
                      const state = shiftState(shift, record, nowMs);
                      const minutes = shiftMinutes(shift, record, nowMs);
                      const person = nameOf(shift.staffUid);
                      return (
                        <li
                          key={shift.shiftId}
                          className="flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-100 px-4 py-2 last:border-b-0"
                        >
                          <span className="font-mono text-xs font-bold text-zinc-900">
                            {formatClockTime(shift.startAt)}–
                            {formatClockTime(shift.endAt)}
                          </span>
                          {shift.label && (
                            <span className="border border-zinc-300 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                              {shift.label}
                            </span>
                          )}
                          <span className="text-sm font-bold text-zinc-900">
                            {person}
                          </span>
                          <span
                            className={`font-mono text-[10px] font-bold uppercase tracking-widest ${
                              state === 'working'
                                ? 'text-emerald-600'
                                : state === 'missing'
                                  ? 'text-amber-600'
                                  : 'text-zinc-500'
                            }`}
                          >
                            {STATE_LABELS[state]}
                            {state !== 'planned' &&
                              ` · ${formatMinutes(minutes)}`}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleCancel(shift)}
                            aria-label={`Xoá ca ${person} ${formatClockTime(shift.startAt)}`}
                            className="ml-auto flex h-11 w-11 items-center justify-center border-hard bg-white shadow-hard hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none"
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {totals.size > 0 && (
        <div className="border-hard bg-white shadow-hard">
          <header className="border-b border-hard bg-zinc-950 px-4 py-2">
            <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white">
              Giờ công tuần này
            </h3>
          </header>
          <ul>
            {[...totals.entries()]
              .sort(([, left], [, right]) => right - left)
              .map(([staffUid, minutes]) => (
                <li
                  key={staffUid}
                  className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 last:border-b-0"
                >
                  <span className="text-sm font-bold text-zinc-900">
                    {nameOf(staffUid)}
                  </span>
                  <span className="font-mono text-xs font-bold text-zinc-900">
                    {formatMinutes(minutes)}
                  </span>
                </li>
              ))}
          </ul>
          <p className="px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Chỉ tính phút công, không tính lương
          </p>
        </div>
      )}

      {dialogOpen && (
        <ShiftScheduleDialog
          defaultDay={weekStart}
          staff={activeStaff}
          saving={saving}
          onSave={(draft) => void handleSave(draft)}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
