import { z } from 'zod';
import {
  isoUtcTimestampSchema,
  nonNegativeIntSchema,
} from '../validation.js';

/**
 * Workforce contract baseline (REQ-HRM-001 .. REQ-HRM-005).
 *
 * The Owner plans Shifts per Staff member and date, several Staff members per
 * save, and cancels a planned Shift that has no attendance (REQ-HRM-004). The
 * server rejects two overlapping Shifts for one Staff member. A Staff member
 * cannot create, edit, or choose a Shift.
 *
 * Attendance records clock in and clock out against an assigned Shift, stamped
 * with server time, and worked time counts from the moment the Staff member
 * accepts the Shift (REQ-HRM-005). A correction stays `pending` until an
 * authorized user approves it and history remains (REQ-HRM-002). The module
 * never derives or stores payroll, salary, or wage values (REQ-HRM-003).
 */
export const WORKFORCE_CONTRACT_VERSION = 1;

/** Tenant-local day key `yyyymmdd`; times themselves stay UTC. */
export const workDayKeySchema = z.string().regex(/^\d{8}$/);

/** Most Staff members one schedule command may plan at once. */
export const SHIFT_BATCH_MAX_STAFF = 50;

export const shiftSchema = z.strictObject({
  schemaVersion: z.literal(WORKFORCE_CONTRACT_VERSION),
  shiftId: z.string().min(1),
  tenantId: z.string().min(1),
  staffUid: z.string().min(1),
  date: workDayKeySchema,
  startAt: isoUtcTimestampSchema,
  endAt: isoUtcTimestampSchema,
  /** Optional Owner label, e.g. "Ca sáng". Never a role or a pay figure. */
  label: z.string().min(1).max(40).nullable(),
  role: z.string().min(1).max(80).nullable(),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type Shift = z.infer<typeof shiftSchema>;

/**
 * One interval planned for several Staff members in a single save
 * (REQ-HRM-004). A Staff member appears at most once: two Shifts for one Staff
 * in the same batch would violate the per-Staff overlap rule it is checked
 * against.
 */
export const scheduleShiftInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    staffUids: z.array(z.string().min(1)).min(1).max(SHIFT_BATCH_MAX_STAFF),
    date: workDayKeySchema,
    startAt: isoUtcTimestampSchema,
    endAt: isoUtcTimestampSchema,
    label: z.string().trim().min(1).max(40).nullable().optional(),
    role: z.string().trim().min(1).max(80).nullable().optional(),
  })
  .refine((input) => Date.parse(input.endAt) > Date.parse(input.startAt), {
    message: 'Shift end must be after its start.',
  })
  .refine((input) => new Set(input.staffUids).size === input.staffUids.length, {
    message: 'A Staff member may appear only once per schedule command.',
  });
export type ScheduleShiftInput = z.infer<typeof scheduleShiftInputSchema>;

export const shiftCommandResultSchema = z.strictObject({
  schemaVersion: z.literal(WORKFORCE_CONTRACT_VERSION),
  status: z.literal('applied'),
  shifts: z.array(shiftSchema).min(1),
});
export type ShiftCommandResult = z.infer<typeof shiftCommandResultSchema>;

export const cancelShiftInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  shiftId: z.string().min(1),
});
export type CancelShiftInput = z.infer<typeof cancelShiftInputSchema>;

export const cancelShiftResultSchema = z.strictObject({
  schemaVersion: z.literal(WORKFORCE_CONTRACT_VERSION),
  status: z.literal('applied'),
  shiftId: z.string().min(1),
});
export type CancelShiftResult = z.infer<typeof cancelShiftResultSchema>;

/**
 * Half-open interval overlap: `[startAt, endAt)`. Two Shifts for one Staff
 * member overlap when each starts before the other ends (REQ-HRM-001).
 */
export function shiftsOverlap(
  left: Pick<Shift, 'startAt' | 'endAt'>,
  right: Pick<Shift, 'startAt' | 'endAt'>,
): boolean {
  return (
    Date.parse(left.startAt) < Date.parse(right.endAt) &&
    Date.parse(right.startAt) < Date.parse(left.endAt)
  );
}

/** True when a proposed Shift overlaps any existing Shift for the Staff member. */
export function hasOverlappingShift(
  existing: readonly Pick<Shift, 'startAt' | 'endAt'>[],
  proposed: Pick<Shift, 'startAt' | 'endAt'>,
): boolean {
  return existing.some((shift) => shiftsOverlap(shift, proposed));
}

export const attendanceSourceSchema = z.enum(['staff', 'system']);
export type AttendanceSource = z.infer<typeof attendanceSourceSchema>;

export const correctionStateSchema = z.enum(['none', 'pending', 'approved']);
export type CorrectionState = z.infer<typeof correctionStateSchema>;

/** Append-only attendance history entry: state, actor, time, and reason. */
export const attendanceHistoryEntrySchema = z.strictObject({
  at: isoUtcTimestampSchema,
  actorUid: z.string().min(1).nullable(),
  action: z.string().min(1).max(40),
  state: correctionStateSchema,
  reason: z.string().min(1).max(500).nullable(),
});
export type AttendanceHistoryEntry = z.infer<
  typeof attendanceHistoryEntrySchema
>;

/**
 * One clock in/out record. `clockInAt` and `clockOutAt` are server stamps, and
 * `shiftId` binds the record to the Shift that was accepted, so one local day
 * can hold one record per Shift.
 */
export const attendanceSchema = z.strictObject({
  schemaVersion: z.literal(WORKFORCE_CONTRACT_VERSION),
  attendanceId: z.string().min(1),
  tenantId: z.string().min(1),
  staffUid: z.string().min(1),
  shiftId: z.string().min(1).nullable(),
  clockInAt: isoUtcTimestampSchema,
  clockOutAt: isoUtcTimestampSchema.nullable(),
  source: attendanceSourceSchema,
  correctionState: correctionStateSchema,
  requestedClockInAt: isoUtcTimestampSchema.nullable(),
  requestedClockOutAt: isoUtcTimestampSchema.nullable(),
  correctionReason: z.string().min(1).max(500).nullable(),
  approverUid: z.string().min(1).nullable(),
  history: z.array(attendanceHistoryEntrySchema).min(1).max(50),
  createdAt: isoUtcTimestampSchema,
  updatedAt: isoUtcTimestampSchema,
});
export type Attendance = z.infer<typeof attendanceSchema>;

/**
 * Clock in. The server stamps the time: a client-supplied instant in a
 * timekeeping ledger is forgeable, and the sanctioned way to correct a wrong
 * time is a correction request the Owner approves (REQ-HRM-002).
 */
export const clockInInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  staffUid: z.string().min(1),
  /** The assigned Shift being accepted; required by the Staff surface. */
  shiftId: z.string().min(1).nullable().optional(),
});
export type ClockInInput = z.infer<typeof clockInInputSchema>;

export const clockOutInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  attendanceId: z.string().min(1),
});
export type ClockOutInput = z.infer<typeof clockOutInputSchema>;

export const requestCorrectionInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    attendanceId: z.string().min(1),
    requestedClockInAt: isoUtcTimestampSchema.nullable().optional(),
    requestedClockOutAt: isoUtcTimestampSchema.nullable().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .refine(
    (input) =>
      input.requestedClockInAt !== undefined ||
      input.requestedClockOutAt !== undefined,
    { message: 'A correction request needs a requested time.' },
  );
export type RequestCorrectionInput = z.infer<
  typeof requestCorrectionInputSchema
>;

export const approveCorrectionInputSchema = z.strictObject({
  tenantId: z.string().min(1),
  attendanceId: z.string().min(1),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
export type ApproveCorrectionInput = z.infer<
  typeof approveCorrectionInputSchema
>;

export const attendanceResultSchema = z.strictObject({
  schemaVersion: z.literal(WORKFORCE_CONTRACT_VERSION),
  status: z.enum(['applied', 'replayed']),
  attendance: attendanceSchema,
});
export type AttendanceResult = z.infer<typeof attendanceResultSchema>;

export const attendanceSummaryInputSchema = z
  .strictObject({
    tenantId: z.string().min(1),
    staffUid: z.string().min(1),
    fromDay: workDayKeySchema,
    toDay: workDayKeySchema,
  })
  .refine((input) => input.fromDay <= input.toDay, {
    message: 'fromDay must not be after toDay.',
  });
export type AttendanceSummaryInput = z.infer<
  typeof attendanceSummaryInputSchema
>;

/**
 * Attendance summary for review. It deliberately carries only integer minutes
 * and record counts: no salary, wage, or payroll figure exists in the output
 * (REQ-HRM-003).
 */
export const attendanceSummarySchema = z.strictObject({
  tenantId: z.string().min(1),
  staffUid: z.string().min(1),
  fromDay: workDayKeySchema,
  toDay: workDayKeySchema,
  recordCount: nonNegativeIntSchema,
  workedMinutes: nonNegativeIntSchema,
  missingClockOutCount: nonNegativeIntSchema,
});
export type AttendanceSummary = z.infer<typeof attendanceSummarySchema>;

/** Deterministic worked minutes for one completed attendance record. */
export function computeWorkedMinutes(
  attendance: Pick<Attendance, 'clockInAt' | 'clockOutAt'>,
): number {
  if (attendance.clockOutAt === null) {
    return 0;
  }
  const minutes = Math.round(
    (Date.parse(attendance.clockOutAt) - Date.parse(attendance.clockInAt)) /
      60_000,
  );
  return minutes > 0 ? minutes : 0;
}
