import {
  WORKFORCE_CONTRACT_VERSION,
  type Attendance,
  type Shift,
} from '../contracts/workforce.contract.js';
import { STAFF_UID_FIXTURE, TENANT_A_FIXTURE } from './identity.fixture.js';

export const WORKFORCE_NOW_FIXTURE = '2026-09-13T00:00:00.000Z';
export const SHIFT_ID_FIXTURE = 'shift-morning-001';
export const ATTENDANCE_ID_FIXTURE = 'attendance-morning-001';

/** One scheduled Shift; times are UTC and render in tenant time. */
export const shiftFixture: Shift = {
  schemaVersion: WORKFORCE_CONTRACT_VERSION,
  shiftId: SHIFT_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  staffUid: STAFF_UID_FIXTURE,
  date: '20260914',
  startAt: '2026-09-14T01:00:00.000Z',
  endAt: '2026-09-14T09:00:00.000Z',
  role: 'cashier',
  createdAt: WORKFORCE_NOW_FIXTURE,
  updatedAt: WORKFORCE_NOW_FIXTURE,
};

/** Attendance with a clock in and clock out and no correction. */
export const attendanceFixture: Attendance = {
  schemaVersion: WORKFORCE_CONTRACT_VERSION,
  attendanceId: ATTENDANCE_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  staffUid: STAFF_UID_FIXTURE,
  shiftId: SHIFT_ID_FIXTURE,
  clockInAt: '2026-09-14T01:00:00.000Z',
  clockOutAt: '2026-09-14T09:00:00.000Z',
  source: 'staff',
  correctionState: 'none',
  requestedClockInAt: null,
  requestedClockOutAt: null,
  correctionReason: null,
  approverUid: null,
  history: [
    {
      at: '2026-09-14T01:00:00.000Z',
      actorUid: STAFF_UID_FIXTURE,
      action: 'clock_in',
      state: 'none',
      reason: null,
    },
  ],
  createdAt: '2026-09-14T01:00:00.000Z',
  updatedAt: '2026-09-14T09:00:00.000Z',
};

/** Attendance that is waiting for an authorized approver (REQ-HRM-002). */
export const pendingCorrectionAttendanceFixture: Attendance = {
  ...attendanceFixture,
  attendanceId: 'attendance-correction-001',
  correctionState: 'pending',
  requestedClockInAt: '2026-09-14T01:15:00.000Z',
  correctionReason: 'Nhập sai giờ vào ca.',
  history: [
    ...attendanceFixture.history,
    {
      at: '2026-09-14T10:00:00.000Z',
      actorUid: STAFF_UID_FIXTURE,
      action: 'correction_requested',
      state: 'pending',
      reason: 'Nhập sai giờ vào ca.',
    },
  ],
  updatedAt: '2026-09-14T10:00:00.000Z',
};

/** Approved correction with history intact and no payroll figure anywhere. */
export const approvedCorrectionAttendanceFixture: Attendance = {
  ...pendingCorrectionAttendanceFixture,
  correctionState: 'approved',
  clockInAt: '2026-09-14T01:15:00.000Z',
  approverUid: 'uid-owner-001',
  history: [
    ...pendingCorrectionAttendanceFixture.history,
    {
      at: '2026-09-14T11:00:00.000Z',
      actorUid: 'uid-owner-001',
      action: 'correction_approved',
      state: 'approved',
      reason: 'Đã xác nhận với nhân viên.',
    },
  ],
  updatedAt: '2026-09-14T11:00:00.000Z',
};
