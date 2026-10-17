import {
  computeWorkedMinutes,
  type Attendance,
  type Shift,
} from '@contracts/workforce.contract';

/**
 * Shift-plan arithmetic for the Owner's schedule view and the Staff clock bar
 * (REQ-HRM-004, REQ-HRM-005). Day keys are the tenant-local `yyyymmdd` keys the
 * Shift document stores; every minute figure is derived from server stamps.
 */

/** A Shift can be left open this long past its end before it reads as missed. */
export const MISSED_CLOCK_OUT_HOURS = 12;

export function toDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function todayDayKey(nowMs: number = Date.now()): string {
  return toDayKey(new Date(nowMs));
}

export function parseDayKey(dayKey: string): Date {
  const year = Number(dayKey.slice(0, 4));
  const month = Number(dayKey.slice(4, 6));
  const day = Number(dayKey.slice(6, 8));
  return new Date(year, month - 1, day);
}

export function formatDayKey(date: Date): string {
  return toDayKey(date);
}

export function addDays(dayKey: string, amount: number): string {
  const date = parseDayKey(dayKey);
  date.setDate(date.getDate() + amount);
  return formatDayKey(date);
}

/** Monday of the week the day belongs to, because a shop week starts Monday. */
export function startOfWeek(dayKey: string): string {
  const date = parseDayKey(dayKey);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  return addDays(dayKey, -(weekday - 1));
}

export function weekDays(fromDay: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(fromDay, index));
}

const WEEKDAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

export function formatDayLabel(dayKey: string): string {
  const date = parseDayKey(dayKey);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${WEEKDAY_LABELS[date.getDay()]} ${day}/${month}`;
}

export function formatWeekLabel(fromDay: string, toDay: string): string {
  const from = parseDayKey(fromDay);
  const to = parseDayKey(toDay);
  const short = (date: Date): string =>
    `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${short(from)} – ${short(to)}`;
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatMinutes(minutes: number): string {
  const safe = minutes > 0 ? Math.round(minutes) : 0;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return hours > 0 ? `${hours}h${String(rest).padStart(2, '0')}` : `${rest}p`;
}

/**
 * UTC bounds for a local day range, padded by a day on each side. The padding
 * plus in-memory joining by `shiftId` keeps a clock in near a local midnight
 * inside the window without any timezone arithmetic in the query.
 */
export function isoWindowForDays(
  fromDay: string,
  toDay: string,
  padDays = 1,
): { from: string; to: string } {
  const from = parseDayKey(addDays(fromDay, -padDays));
  const to = parseDayKey(addDays(toDay, padDays + 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Local `HH:MM` on a day key as the UTC instant the Shift stores. */
export function combineDayAndTime(dayKey: string, time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = parseDayKey(dayKey);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}

export type ShiftState = 'planned' | 'working' | 'done' | 'missing';

export function attendanceByShiftId(
  records: readonly Attendance[],
): Map<string, Attendance> {
  const byShift = new Map<string, Attendance>();
  for (const record of records) {
    if (record.shiftId) {
      byShift.set(record.shiftId, record);
    }
  }
  return byShift;
}

export function findOpenAttendance(
  records: readonly Attendance[],
  staffUid: string,
): Attendance | null {
  return (
    records.find(
      (record) => record.staffUid === staffUid && record.clockOutAt === null,
    ) ?? null
  );
}

/**
 * `missing` is an open record whose Shift ended long ago: the Staff member
 * forgot to clock out, which is not the same as working right now.
 */
export function shiftState(
  shift: Shift,
  attendance: Attendance | null,
  nowMs: number,
): ShiftState {
  if (!attendance) return 'planned';
  if (attendance.clockOutAt !== null) return 'done';
  return nowMs > Date.parse(shift.endAt) + MISSED_CLOCK_OUT_HOURS * 3_600_000
    ? 'missing'
    : 'working';
}

/** Minutes so far: an open record counts from its server clock in. */
export function shiftMinutes(
  shift: Shift,
  attendance: Attendance | null,
  nowMs: number,
): number {
  if (!attendance) return 0;
  if (attendance.clockOutAt !== null) {
    return computeWorkedMinutes(attendance);
  }
  const minutes = Math.round((nowMs - Date.parse(attendance.clockInAt)) / 60_000);
  return minutes > 0 ? minutes : 0;
}

export interface ShiftDay {
  dayKey: string;
  shifts: Shift[];
}

export function groupShiftsByDay(shifts: readonly Shift[]): ShiftDay[] {
  const byDay = new Map<string, Shift[]>();
  for (const shift of shifts) {
    const rows = byDay.get(shift.date) ?? [];
    rows.push(shift);
    byDay.set(shift.date, rows);
  }
  return [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, rows]) => ({
      dayKey,
      shifts: [...rows].sort((left, right) =>
        left.startAt.localeCompare(right.startAt),
      ),
    }));
}

/** Worked minutes per Staff member over the loaded Shifts, for the week total. */
export function totalMinutesByStaff(
  shifts: readonly Shift[],
  byShift: Map<string, Attendance>,
  nowMs: number,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const shift of shifts) {
    const minutes = shiftMinutes(shift, byShift.get(shift.shiftId) ?? null, nowMs);
    totals.set(shift.staffUid, (totals.get(shift.staffUid) ?? 0) + minutes);
  }
  return totals;
}
