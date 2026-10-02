import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import type { ZodType } from 'zod';
import {
  WORKFORCE_CONTRACT_VERSION,
  approveCorrectionInputSchema,
  attendanceSchema,
  attendanceSummarySchema,
  clockInInputSchema,
  clockOutInputSchema,
  computeWorkedMinutes,
  requestCorrectionInputSchema,
  scheduleShiftInputSchema,
  shiftSchema,
  type ApproveCorrectionInput,
  type Attendance,
  type AttendanceSummary,
  type ClockInInput,
  type ClockOutInput,
  type RequestCorrectionInput,
  type ScheduleShiftInput,
  type Shift,
} from '../../../../shared/contracts/workforce.contract.js';

export const WORKFORCE_INVALID_MESSAGE = 'Dữ liệu ca làm việc không hợp lệ.';
export const WORKFORCE_MEMBER_DENIED_MESSAGE = 'Bạn không thuộc cửa hàng này.';
export const WORKFORCE_OWNER_DENIED_MESSAGE =
  'Chỉ chủ cửa hàng thực hiện được thao tác này.';
export const WORKFORCE_SELF_DENIED_MESSAGE =
  'Nhân viên chỉ xem và sửa được bản ghi của mình.';
export const WORKFORCE_SHIFT_OVERLAP_MESSAGE = 'Ca làm việc bị trùng giờ.';
export const WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE =
  'Không tìm thấy bản ghi chấm công.';
export const WORKFORCE_ALREADY_CLOCKED_OUT_MESSAGE =
  'Ca đã được chấm công ra.';
export const WORKFORCE_NO_PENDING_CORRECTION_MESSAGE =
  'Không có yêu cầu sửa giờ nào đang chờ.';

export function nowIso(): string {
  return new Date().toISOString();
}

export function requireUid(uid: string | undefined): string {
  if (!uid) {
    throw new HttpsError(
      'unauthenticated',
      'Cần đăng nhập để thực hiện thao tác này.',
    );
  }
  return uid;
}

function parseOrInvalid<T>(schema: ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data ?? {});
  if (!parsed.success) {
    throw new HttpsError('invalid-argument', WORKFORCE_INVALID_MESSAGE);
  }
  return parsed.data;
}

export function parseScheduleShiftInput(data: unknown): ScheduleShiftInput {
  return parseOrInvalid<ScheduleShiftInput>(scheduleShiftInputSchema, data);
}

export function parseClockInInput(data: unknown): ClockInInput {
  return parseOrInvalid<ClockInInput>(clockInInputSchema, data);
}

export function parseClockOutInput(data: unknown): ClockOutInput {
  return parseOrInvalid<ClockOutInput>(clockOutInputSchema, data);
}

export function parseRequestCorrectionInput(
  data: unknown,
): RequestCorrectionInput {
  return parseOrInvalid<RequestCorrectionInput>(
    requestCorrectionInputSchema,
    data,
  );
}

export function parseApproveCorrectionInput(
  data: unknown,
): ApproveCorrectionInput {
  return parseOrInvalid<ApproveCorrectionInput>(
    approveCorrectionInputSchema,
    data,
  );
}

export function assertActiveMember(memberData: DocumentData | undefined): void {
  if (!memberData || memberData.isActive === false) {
    throw new HttpsError('permission-denied', WORKFORCE_MEMBER_DENIED_MESSAGE);
  }
}

export function assertActiveOwnerMember(
  memberData: DocumentData | undefined,
): void {
  assertActiveMember(memberData);
  if (memberData?.membershipType !== 'owner') {
    throw new HttpsError('permission-denied', WORKFORCE_OWNER_DENIED_MESSAGE);
  }
}

export function shiftCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/shifts`;
}

export function attendanceCollectionPath(tenantId: string): string {
  return `tenants/${tenantId}/attendance`;
}

/** Deterministic clock-in id: one attendance record per Staff and UTC day. */
export function attendanceIdFor(staffUid: string, clockInAt: string): string {
  const dayKey = clockInAt.slice(0, 10).replace(/-/g, '');
  return `attendance_${staffUid}_${dayKey}`;
}

export function buildNewShift(
  input: ScheduleShiftInput,
  shiftId: string,
  now: string,
): Shift {
  return shiftSchema.parse({
    schemaVersion: WORKFORCE_CONTRACT_VERSION,
    shiftId,
    tenantId: input.tenantId,
    staffUid: input.staffUid,
    date: input.date,
    startAt: input.startAt,
    endAt: input.endAt,
    role: input.role ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export function toShift(shiftId: string, data: DocumentData): Shift {
  return shiftSchema.parse({
    schemaVersion: data.schemaVersion ?? WORKFORCE_CONTRACT_VERSION,
    shiftId,
    tenantId: data.tenantId,
    staffUid: data.staffUid,
    date: data.date,
    startAt: data.startAt,
    endAt: data.endAt,
    role: data.role ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

export function buildNewAttendance(
  input: ClockInInput,
  attendanceId: string,
  now: string,
): Attendance {
  return attendanceSchema.parse({
    schemaVersion: WORKFORCE_CONTRACT_VERSION,
    attendanceId,
    tenantId: input.tenantId,
    staffUid: input.staffUid,
    shiftId: input.shiftId ?? null,
    clockInAt: input.clockInAt,
    clockOutAt: null,
    source: 'staff',
    correctionState: 'none',
    requestedClockInAt: null,
    requestedClockOutAt: null,
    correctionReason: null,
    approverUid: null,
    history: [
      {
        at: now,
        actorUid: input.staffUid,
        action: 'clock_in',
        state: 'none',
        reason: null,
      },
    ],
    createdAt: now,
    updatedAt: now,
  });
}

export function toAttendance(
  attendanceId: string,
  data: DocumentData,
): Attendance {
  return attendanceSchema.parse({
    schemaVersion: data.schemaVersion ?? WORKFORCE_CONTRACT_VERSION,
    attendanceId,
    tenantId: data.tenantId,
    staffUid: data.staffUid,
    shiftId: data.shiftId ?? null,
    clockInAt: data.clockInAt,
    clockOutAt: data.clockOutAt ?? null,
    source: data.source ?? 'staff',
    correctionState: data.correctionState ?? 'none',
    requestedClockInAt: data.requestedClockInAt ?? null,
    requestedClockOutAt: data.requestedClockOutAt ?? null,
    correctionReason: data.correctionReason ?? null,
    approverUid: data.approverUid ?? null,
    history: data.history ?? [],
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  });
}

export function applyClockOut(
  current: Attendance,
  clockOutAt: string,
  now: string,
): Attendance {
  if (current.clockOutAt !== null) {
    throw new HttpsError(
      'failed-precondition',
      WORKFORCE_ALREADY_CLOCKED_OUT_MESSAGE,
    );
  }
  return attendanceSchema.parse({
    ...current,
    clockOutAt,
    history: [
      ...current.history,
      {
        at: now,
        actorUid: current.staffUid,
        action: 'clock_out',
        state: current.correctionState,
        reason: null,
      },
    ],
    updatedAt: now,
  });
}

/** A correction stays `pending` until an authorized user approves it. */
export function applyCorrectionRequest(
  current: Attendance,
  input: RequestCorrectionInput,
  actorUid: string,
  now: string,
): Attendance {
  const requestedClockInAt =
    input.requestedClockInAt === undefined
      ? current.requestedClockInAt
      : input.requestedClockInAt;
  const requestedClockOutAt =
    input.requestedClockOutAt === undefined
      ? current.requestedClockOutAt
      : input.requestedClockOutAt;
  return attendanceSchema.parse({
    ...current,
    correctionState: 'pending',
    requestedClockInAt,
    requestedClockOutAt,
    correctionReason: input.reason,
    approverUid: null,
    history: [
      ...current.history,
      {
        at: now,
        actorUid,
        action: 'correction_requested',
        state: 'pending',
        reason: input.reason,
      },
    ],
    updatedAt: now,
  });
}

/** Apply an approved correction and keep the full history (REQ-HRM-002). */
export function applyCorrectionApproval(
  current: Attendance,
  approverUid: string,
  reason: string | null,
  now: string,
): Attendance {
  if (current.correctionState !== 'pending') {
    throw new HttpsError(
      'failed-precondition',
      WORKFORCE_NO_PENDING_CORRECTION_MESSAGE,
    );
  }
  return attendanceSchema.parse({
    ...current,
    clockInAt: current.requestedClockInAt ?? current.clockInAt,
    clockOutAt: current.requestedClockOutAt ?? current.clockOutAt,
    correctionState: 'approved',
    approverUid,
    history: [
      ...current.history,
      {
        at: now,
        actorUid: approverUid,
        action: 'correction_approved',
        state: 'approved',
        reason,
      },
    ],
    updatedAt: now,
  });
}

/**
 * Attendance summary for review. It returns only integer minutes and counts:
 * no salary, wage, or payroll figure is produced (REQ-HRM-003).
 */
export function buildAttendanceSummary(
  tenantId: string,
  staffUid: string,
  fromDay: string,
  toDay: string,
  records: readonly Attendance[],
): AttendanceSummary {
  const workedMinutes = records.reduce(
    (sum, record) => sum + computeWorkedMinutes(record),
    0,
  );
  return attendanceSummarySchema.parse({
    tenantId,
    staffUid,
    fromDay,
    toDay,
    recordCount: records.length,
    workedMinutes,
    missingClockOutCount: records.filter(
      (record) => record.clockOutAt === null,
    ).length,
  });
}
