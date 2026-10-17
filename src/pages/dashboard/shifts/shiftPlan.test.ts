import { describe, expect, it } from 'vitest';
import type { Attendance, Shift } from '@contracts/workforce.contract';
import {
  MISSED_CLOCK_OUT_HOURS,
  addDays,
  attendanceByShiftId,
  combineDayAndTime,
  findOpenAttendance,
  formatDayLabel,
  formatMinutes,
  groupShiftsByDay,
  isoWindowForDays,
  parseDayKey,
  shiftMinutes,
  shiftState,
  startOfWeek,
  toDayKey,
  totalMinutesByStaff,
} from './shiftPlan';

const DAY = '20261017';

function shift(overrides: Partial<Shift> = {}): Shift {
  return {
    schemaVersion: 1,
    shiftId: 'shift-1',
    tenantId: 'tenant-a',
    staffUid: 'uid-a',
    date: DAY,
    startAt: combineDayAndTime(DAY, '08:00'),
    endAt: combineDayAndTime(DAY, '12:00'),
    label: null,
    role: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

function attendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    schemaVersion: 1,
    attendanceId: 'attendance_uid-a_shift-1',
    tenantId: 'tenant-a',
    staffUid: 'uid-a',
    shiftId: 'shift-1',
    clockInAt: combineDayAndTime(DAY, '08:00'),
    clockOutAt: combineDayAndTime(DAY, '09:30'),
    source: 'staff',
    correctionState: 'none',
    requestedClockInAt: null,
    requestedClockOutAt: null,
    correctionReason: null,
    approverUid: null,
    history: [
      {
        at: '2026-10-17T01:00:00.000Z',
        actorUid: 'uid-a',
        action: 'clock_in',
        state: 'none',
        reason: null,
      },
    ],
    createdAt: '2026-10-17T01:00:00.000Z',
    updatedAt: '2026-10-17T02:30:00.000Z',
    ...overrides,
  };
}

describe('day keys', () => {
  it('round-trips a local day and moves by whole days', () => {
    expect(toDayKey(parseDayKey(DAY))).toBe(DAY);
    expect(addDays(DAY, 1)).toBe('20261018');
    expect(addDays('20261101', -1)).toBe('20261031');
  });

  it('starts the week on Monday and labels the day', () => {
    // 2026-10-17 is a Saturday and 2026-10-18 the Sunday that closes that week.
    expect(startOfWeek(DAY)).toBe('20261012');
    expect(startOfWeek('20261018')).toBe('20261012');
    expect(startOfWeek('20261012')).toBe('20261012');
    expect(formatDayLabel('20261012')).toBe('T2 12/10');
  });

  it('combines a day key and a clock time into the stored instant', () => {
    const iso = combineDayAndTime(DAY, '08:30');
    const date = new Date(iso);
    expect(date.getHours()).toBe(8);
    expect(date.getMinutes()).toBe(30);
    expect(toDayKey(date)).toBe(DAY);
  });

  it('pads the attendance window by a day on each side', () => {
    const { from, to } = isoWindowForDays(DAY, addDays(DAY, 6));
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
    expect(days).toBe(9);
  });
});

describe('shift state and minutes', () => {
  const now = Date.parse(combineDayAndTime(DAY, '09:00'));

  it('reads a Shift with no record as planned and zero minutes', () => {
    expect(shiftState(shift(), null, now)).toBe('planned');
    expect(shiftMinutes(shift(), null, now)).toBe(0);
  });

  it('counts an open record from its server clock in', () => {
    const record = attendance({ clockOutAt: null });
    expect(shiftState(shift(), record, now)).toBe('working');
    expect(shiftMinutes(shift(), record, now)).toBe(60);
  });

  it('reads a forgotten clock-out as missing, not as working now', () => {
    const record = attendance({ clockOutAt: null });
    const late =
      Date.parse(shift().endAt) + (MISSED_CLOCK_OUT_HOURS + 1) * 3_600_000;
    expect(shiftState(shift(), record, late)).toBe('missing');
    expect(shiftState(shift(), record, Date.parse(shift().endAt))).toBe(
      'working',
    );
  });

  it('adds up the worked minutes per Staff member', () => {
    const shifts = [
      shift(),
      shift({ shiftId: 'shift-2', startAt: combineDayAndTime(DAY, '13:00'), endAt: combineDayAndTime(DAY, '17:00') }),
      shift({ shiftId: 'shift-3', staffUid: 'uid-b' }),
    ];
    const byShift = attendanceByShiftId([
      attendance(),
      attendance({
        attendanceId: 'attendance_uid-a_shift-2',
        shiftId: 'shift-2',
        clockInAt: combineDayAndTime(DAY, '13:00'),
        clockOutAt: combineDayAndTime(DAY, '17:00'),
      }),
    ]);
    const totals = totalMinutesByStaff(shifts, byShift, now);
    expect(totals.get('uid-a')).toBe(90 + 240);
    expect(totals.get('uid-b')).toBe(0);
  });

  it('finds the one open record and formats minutes', () => {
    const closed = attendance();
    const open = attendance({
      attendanceId: 'attendance_uid-b_shift-9',
      staffUid: 'uid-b',
      shiftId: 'shift-9',
      clockOutAt: null,
    });
    expect(findOpenAttendance([closed, open], 'uid-a')).toBeNull();
    expect(findOpenAttendance([closed, open], 'uid-b')?.attendanceId).toBe(
      'attendance_uid-b_shift-9',
    );
    expect(formatMinutes(0)).toBe('0p');
    expect(formatMinutes(45)).toBe('45p');
    expect(formatMinutes(60)).toBe('1h00');
    expect(formatMinutes(230)).toBe('3h50');
  });
});

describe('groupShiftsByDay', () => {
  it('groups by day key and orders each day by start time', () => {
    const shifts = [
      shift({ shiftId: 'b', startAt: combineDayAndTime(DAY, '13:00'), endAt: combineDayAndTime(DAY, '17:00') }),
      shift({ shiftId: 'a' }),
      shift({ shiftId: 'c', date: addDays(DAY, 1), startAt: combineDayAndTime(addDays(DAY, 1), '08:00') }),
    ];
    const days = groupShiftsByDay(shifts);
    expect(days.map((day) => day.dayKey)).toEqual([DAY, addDays(DAY, 1)]);
    expect(days[0].shifts.map((row) => row.shiftId)).toEqual(['a', 'b']);
    expect(days[1].shifts.map((row) => row.shiftId)).toEqual(['c']);
  });
});
