import { describe, expect, it } from 'vitest';
import {
  applyClockOut,
  applyCorrectionApproval,
  applyCorrectionRequest,
  attendanceIdForShift,
  buildAttendanceSummary,
  buildNewAttendance,
  buildNewShift,
  toShift,
} from './service.js';
import {
  computeWorkedMinutes,
  hasOverlappingShift,
  shiftsOverlap,
} from '../../../../shared/contracts/workforce.contract.js';
import { pendingCorrectionAttendanceFixture } from '../../../../shared/fixtures/workforce.fixture.js';

const NOW = '2026-09-14T01:00:00.000Z';

describe('workforce shift overlap (REQ-HRM-001)', () => {
  it('detects a partial overlap and a full containment', () => {
    const base = { startAt: '2026-09-14T01:00:00.000Z', endAt: '2026-09-14T05:00:00.000Z' };
    expect(
      shiftsOverlap(base, {
        startAt: '2026-09-14T04:00:00.000Z',
        endAt: '2026-09-14T08:00:00.000Z',
      }),
    ).toBe(true);
    expect(
      shiftsOverlap(base, {
        startAt: '2026-09-14T02:00:00.000Z',
        endAt: '2026-09-14T03:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('treats touching shifts and separate shifts as non-overlapping', () => {
    const base = { startAt: '2026-09-14T01:00:00.000Z', endAt: '2026-09-14T05:00:00.000Z' };
    expect(
      shiftsOverlap(base, {
        startAt: '2026-09-14T05:00:00.000Z',
        endAt: '2026-09-14T09:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      hasOverlappingShift([base], {
        startAt: '2026-09-14T06:00:00.000Z',
        endAt: '2026-09-14T09:00:00.000Z',
      }),
    ).toBe(false);
  });
});

describe('workforce attendance correction (REQ-HRM-002)', () => {
  it('keeps a correction pending and preserves history on approval', () => {
    const pending = pendingCorrectionAttendanceFixture;
    expect(pending.correctionState).toBe('pending');
    const approved = applyCorrectionApproval(
      pending,
      'uid-owner-001',
      'Đã xác nhận.',
      '2026-09-14T11:00:00.000Z',
    );
    expect(approved.correctionState).toBe('approved');
    expect(approved.history.slice(0, pending.history.length)).toEqual(
      pending.history,
    );
    expect(approved.history).toHaveLength(pending.history.length + 1);
    expect(approved.clockInAt).toBe(pending.requestedClockInAt);
  });

  it('refuses to approve when no correction is pending', () => {
    expect(() =>
      applyCorrectionApproval(
        { ...pendingCorrectionAttendanceFixture, correctionState: 'none' },
        'uid-owner-001',
        null,
        '2026-09-14T11:00:00.000Z',
      ),
    ).toThrow();
  });
});

describe('workforce shift planning (REQ-HRM-004)', () => {
  const input = {
    tenantId: 'tenant-a',
    staffUids: ['uid-a', 'uid-b'],
    date: '20260914',
    startAt: '2026-09-14T01:00:00.000Z',
    endAt: '2026-09-14T05:00:00.000Z',
    label: 'Ca sáng',
  };

  it('builds one labelled Shift per Staff member from one command', () => {
    const first = buildNewShift(input, 'uid-a', 'shift-1', NOW);
    const second = buildNewShift(input, 'uid-b', 'shift-2', NOW);
    expect(first.label).toBe('Ca sáng');
    expect(first.staffUid).toBe('uid-a');
    expect(second.staffUid).toBe('uid-b');
    expect(first.startAt).toBe(second.startAt);
  });

  it('reads a stored Shift without a label and defaults it to null', () => {
    const stored = toShift('shift-1', {
      ...buildNewShift(input, 'uid-a', 'shift-1', NOW),
      label: undefined,
    });
    expect(stored.label).toBeNull();
  });

  it('keys attendance by Shift and records the acting clock-out', () => {
    expect(attendanceIdForShift('uid-a', 'shift-1')).toBe(
      'attendance_uid-a_shift-1',
    );
    const attendance = buildNewAttendance(
      { tenantId: 'tenant-a', staffUid: 'uid-a', shiftId: 'shift-1' },
      'attendance_uid-a_shift-1',
      NOW,
    );
    const closed = applyClockOut(
      attendance,
      '2026-09-14T05:00:00.000Z',
      'uid-owner',
      '2026-09-14T05:00:00.000Z',
    );
    expect(closed.history.at(-1)?.actorUid).toBe('uid-owner');
    expect(() =>
      applyClockOut(closed, '2026-09-14T06:00:00.000Z', 'uid-a', NOW),
    ).toThrow();
  });
});

describe('workforce attendance summary (REQ-HRM-003)', () => {
  it('computes worked minutes without any payroll figure', () => {
    const attendance = buildNewAttendance(
      {
        tenantId: 'tenant-a',
        staffUid: 'uid-staff',
        shiftId: null,
      },
      'attendance-1',
      NOW,
    );
    expect(attendance.clockInAt).toBe(NOW);
    const summary = buildAttendanceSummary(
      'tenant-a',
      'uid-staff',
      '20260914',
      '20260914',
      [{ ...attendance, clockOutAt: '2026-09-14T09:00:00.000Z' }],
    );
    expect(summary.workedMinutes).toBe(480);
    expect(computeWorkedMinutes({ ...attendance, clockOutAt: null })).toBe(0);
    expect(Object.keys(summary).some((key) => /salary|wage|payroll|vnd/i.test(key))).toBe(
      false,
    );
  });

  it('records a requested correction as pending', () => {
    const attendance = buildNewAttendance(
      {
        tenantId: 'tenant-a',
        staffUid: 'uid-staff',
        shiftId: null,
      },
      'attendance-1',
      NOW,
    );
    const pending = applyCorrectionRequest(
      attendance,
      {
        tenantId: 'tenant-a',
        attendanceId: 'attendance-1',
        requestedClockInAt: '2026-09-14T01:15:00.000Z',
        requestedClockOutAt: undefined,
        reason: 'Sai giờ vào.',
      },
      'uid-staff',
      '2026-09-14T10:00:00.000Z',
    );
    expect(pending.correctionState).toBe('pending');
    expect(pending.requestedClockInAt).toBe('2026-09-14T01:15:00.000Z');
    expect(pending.history.at(-1)).toMatchObject({
      action: 'correction_requested',
      state: 'pending',
      reason: 'Sai giờ vào.',
    });
  });
});
