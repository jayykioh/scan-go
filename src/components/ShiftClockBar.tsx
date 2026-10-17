import React, { useMemo, useState } from 'react';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { useNow } from '../hooks/useNow';
import { useWorkforceWindow } from '../hooks/useWorkforceWindow';
import {
  clockInToShift,
  clockOutOfShift,
} from '../data/adapters/workforce.adapter';
import {
  addDays,
  attendanceByShiftId,
  findOpenAttendance,
  formatClockTime,
  formatDayLabel,
  formatMinutes,
  shiftMinutes,
  todayDayKey,
} from '../pages/dashboard/shifts/shiftPlan';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Chấm công thất bại.';
}

/**
 * The Staff member's Shift strip: the Shift the Owner assigned, and the one
 * action that starts counting time — "Nhận ca" (REQ-HRM-005). There is no
 * clock-in without an assigned Shift, so a Staff member cannot choose their
 * own hours or invent a Shift.
 */
export default function ShiftClockBar({
  tenantId,
  staffUid,
}: {
  tenantId: string;
  staffUid: string;
}) {
  const toast = useToast();
  const nowMs = useNow();
  const [busy, setBusy] = useState(false);
  const today = todayDayKey(nowMs);
  const { shifts, attendance, error } = useWorkforceWindow({
    tenantId,
    // A week either side so an open record from a forgotten clock-out stays
    // reachable, and tomorrow's Shift is visible.
    fromDay: addDays(today, -7),
    toDay: addDays(today, 7),
    staffUid,
  });

  const byShift = useMemo(() => attendanceByShiftId(attendance), [attendance]);
  const open = useMemo(
    () => findOpenAttendance(attendance, staffUid),
    [attendance, staffUid],
  );
  const openShift = useMemo(
    () => shifts.find((shift) => shift.shiftId === open?.shiftId) ?? null,
    [shifts, open],
  );
  const todayShifts = useMemo(
    () =>
      shifts
        .filter((shift) => shift.date === today)
        .sort((left, right) => left.startAt.localeCompare(right.startAt)),
    [shifts, today],
  );
  const nextShift = useMemo(
    () =>
      shifts
        .filter((shift) => shift.date > today)
        .sort((left, right) => left.startAt.localeCompare(right.startAt))[0] ??
      null,
    [shifts, today],
  );

  const run = async (action: () => Promise<unknown>, done: string): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      toast.success(done);
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-[#B5C7D8]/30 bg-[#F5F5F7] px-4 py-2">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[#8E8E93]">
        <Clock className="h-3 w-3" />
        Ca làm
      </div>

      {error && (
        <p role="alert" className="mt-1 text-xs text-red-500">
          {error}
        </p>
      )}

      {open ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#2D2B30]">
            Đang làm từ {formatClockTime(open.clockInAt)}
            {openShift?.label ? ` · ${openShift.label}` : ''} ·{' '}
            {formatMinutes(
              openShift ? shiftMinutes(openShift, open, nowMs) : 0,
            )}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(
                () =>
                  clockOutOfShift({
                    tenantId,
                    attendanceId: open.attendanceId,
                  }),
                'Đã tan ca',
              )
            }
            className="min-h-11 rounded-[21px] bg-[#155BD0] px-4 text-xs font-semibold text-white disabled:opacity-60"
          >
            <LogOut className="mr-1 inline-block h-3 w-3" />
            Tan ca
          </button>
        </div>
      ) : todayShifts.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {todayShifts.map((shift) => (
            <li key={shift.shiftId} className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-[#2D2B30]">
                {formatClockTime(shift.startAt)}–{formatClockTime(shift.endAt)}
              </span>
              {shift.label && (
                <span className="text-xs text-[#8E8E93]">{shift.label}</span>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    () =>
                      clockInToShift({
                        tenantId,
                        staffUid,
                        shiftId: shift.shiftId,
                      }),
                    'Đã nhận ca, bắt đầu tính giờ',
                  )
                }
                className="min-h-11 rounded-[21px] bg-[#155BD0] px-4 text-xs font-semibold text-white disabled:opacity-60"
              >
                <LogIn className="mr-1 inline-block h-3 w-3" />
                Nhận ca
              </button>
              {byShift.has(shift.shiftId) && (
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#8E8E93]">
                  Xong{' '}
                  {formatMinutes(
                    shiftMinutes(
                      shift,
                      byShift.get(shift.shiftId) ?? null,
                      nowMs,
                    ),
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-[#8E8E93]">
          Hôm nay bạn không có ca làm.
          {nextShift &&
            ` Ca kế tiếp: ${formatDayLabel(nextShift.date)} ${formatClockTime(nextShift.startAt)}–${formatClockTime(nextShift.endAt)}.`}
        </p>
      )}
    </div>
  );
}
