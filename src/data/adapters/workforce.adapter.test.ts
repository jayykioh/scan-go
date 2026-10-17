import { describe, expect, it } from 'vitest';
import {
  WORKFORCE_READ_LIMIT,
  mapStoredAttendance,
  mapStoredShift,
} from './workforce.adapter';

describe('mapStoredShift', () => {
  it('maps a stored Shift and defaults the optional label', () => {
    const shift = mapStoredShift('tenant-a', 'shift-1', {
      schemaVersion: 1,
      tenantId: 'tenant-a',
      staffUid: 'uid-a',
      date: '20261017',
      startAt: '2026-10-17T01:00:00.000Z',
      endAt: '2026-10-17T05:00:00.000Z',
      role: 'waiter',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(shift.shiftId).toBe('shift-1');
    expect(shift.label).toBeNull();
    expect(mapStoredShift('tenant-a', 'shift-1', { ...shift, label: 'Ca sáng' }).label).toBe(
      'Ca sáng',
    );
  });

  it('refuses a stored Shift without its required times', () => {
    expect(() =>
      mapStoredShift('tenant-a', 'shift-1', {
        tenantId: 'tenant-a',
        staffUid: 'uid-a',
        date: '20261017',
      }),
    ).toThrow();
  });
});

describe('mapStoredAttendance', () => {
  it('maps a stored record and keeps an open clock out as null', () => {
    const record = mapStoredAttendance('tenant-a', 'attendance_uid-a_shift-1', {
      tenantId: 'tenant-a',
      staffUid: 'uid-a',
      shiftId: 'shift-1',
      clockInAt: '2026-10-17T01:00:00.000Z',
      clockOutAt: null,
      source: 'staff',
      correctionState: 'none',
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
      updatedAt: '2026-10-17T01:00:00.000Z',
    });
    expect(record.clockOutAt).toBeNull();
    expect(record.attendanceId).toBe('attendance_uid-a_shift-1');
    expect(WORKFORCE_READ_LIMIT).toBeGreaterThan(0);
  });
});
