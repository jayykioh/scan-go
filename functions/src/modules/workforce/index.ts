import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  WORKFORCE_CONTRACT_VERSION,
  attendanceResultSchema,
  attendanceSummaryInputSchema,
  attendanceSummarySchema,
  hasOverlappingShift,
  shiftCommandResultSchema,
  type Attendance,
  type AttendanceSummaryInput,
  type Shift,
} from '../../../../shared/contracts/workforce.contract.js';
import { getDb } from '../../shared/firestore.js';
import { assertAppCheck } from '../../shared/appCheck.js';
import { writeAuditEventInTransaction } from '../../shared/audit.js';
import { FUNCTIONS_REGION } from '../../../../shared/config/region.js';
import {
  WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE,
  WORKFORCE_INVALID_MESSAGE,
  WORKFORCE_SELF_DENIED_MESSAGE,
  WORKFORCE_SHIFT_OVERLAP_MESSAGE,
  applyClockOut,
  applyCorrectionApproval,
  applyCorrectionRequest,
  assertActiveMember,
  assertActiveOwnerMember,
  attendanceCollectionPath,
  attendanceIdFor,
  buildAttendanceSummary,
  buildNewAttendance,
  buildNewShift,
  nowIso,
  parseApproveCorrectionInput,
  parseClockInInput,
  parseClockOutInput,
  parseRequestCorrectionInput,
  parseScheduleShiftInput,
  requireUid,
  shiftCollectionPath,
  toAttendance,
  toShift,
} from './service.js';

const CALL_OPTIONS = { region: FUNCTIONS_REGION, cors: true } as const;
const MAX_SHIFTS_PER_DAY = 100;
const MAX_ATTENDANCE_RECORDS = 200;

function isOwner(memberData: DocumentData | undefined): boolean {
  return memberData?.membershipType === 'owner';
}

function actorTypeFor(memberData: DocumentData | undefined): 'owner' | 'staff' {
  return isOwner(memberData) ? 'owner' : 'staff';
}

function assertSelfOrOwner(
  memberData: DocumentData | undefined,
  uid: string,
  staffUid: string,
): void {
  if (!isOwner(memberData) && uid !== staffUid) {
    throw new HttpsError('permission-denied', WORKFORCE_SELF_DENIED_MESSAGE);
  }
}

function dayBounds(fromDay: string, toDay: string): { from: string; to: string } {
  const iso = (day: string): string =>
    `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00.000Z`;
  return { from: iso(fromDay), to: iso(toDay) };
}

/**
 * Owner command: schedule one Shift for one Staff member on one date. Two
 * overlapping Shifts for the same Staff member are rejected server-side
 * (REQ-HRM-001).
 */
export const callableWorkforceScheduleShift = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseScheduleShiftInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const shiftRef = db.collection(shiftCollectionPath(input.tenantId)).doc();
    const existingQuery = db
      .collection(shiftCollectionPath(input.tenantId))
      .where('staffUid', '==', input.staffUid)
      .where('date', '==', input.date)
      .limit(MAX_SHIFTS_PER_DAY);

    const shift = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const existingSnap = await transaction.get(existingQuery);
      assertActiveOwnerMember(memberSnap.data());

      const existing: Array<Pick<Shift, 'startAt' | 'endAt'>> =
        existingSnap.docs.map((docSnap) => ({
          startAt: docSnap.get('startAt'),
          endAt: docSnap.get('endAt'),
        }));
      if (hasOverlappingShift(existing, input)) {
        throw new HttpsError(
          'failed-precondition',
          WORKFORCE_SHIFT_OVERLAP_MESSAGE,
        );
      }

      const next = buildNewShift(input, shiftRef.id, nowIso());
      transaction.set(shiftRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'ShiftScheduled',
        targetType: 'shift',
        targetId: shiftRef.id,
        detail: { staffUid: input.staffUid, date: input.date },
      });
      return next;
    });

    return shiftCommandResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      shift,
    });
  },
);

/** Record clock in. A Staff member may only clock in for themselves. */
export const callableWorkforceClockIn = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseClockInInput(request.data);

  const db = getDb();
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const attendanceId = attendanceIdFor(input.staffUid, input.clockInAt);
  const attendanceRef = db.doc(
    `${attendanceCollectionPath(input.tenantId)}/${attendanceId}`,
  );

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    const attendanceSnap = await transaction.get(attendanceRef);
    assertActiveMember(memberSnap.data());
    assertSelfOrOwner(memberSnap.data(), uid, input.staffUid);
    if (attendanceSnap.exists) {
      return {
        replayed: true,
        attendance: toAttendance(attendanceId, attendanceSnap.data() ?? {}),
      };
    }
    const next = buildNewAttendance(input, attendanceId, nowIso());
    transaction.set(attendanceRef, next);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: actorTypeFor(memberSnap.data()),
      role: actorTypeFor(memberSnap.data()),
      action: 'AttendanceClockedIn',
      targetType: 'attendance',
      targetId: attendanceId,
      detail: { staffUid: input.staffUid },
    });
    return { replayed: false, attendance: next };
  });

  return attendanceResultSchema.parse({
    schemaVersion: WORKFORCE_CONTRACT_VERSION,
    status: outcome.replayed ? 'replayed' : 'applied',
    attendance: outcome.attendance,
  });
});

/** Record clock out. A Staff member may only clock out their own record. */
export const callableWorkforceClockOut = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseClockOutInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const attendanceRef = db.doc(
      `${attendanceCollectionPath(input.tenantId)}/${input.attendanceId}`,
    );

    const attendance = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const attendanceSnap = await transaction.get(attendanceRef);
      assertActiveMember(memberSnap.data());
      if (!attendanceSnap.exists) {
        throw new HttpsError(
          'not-found',
          WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE,
        );
      }
      const current = toAttendance(input.attendanceId, attendanceSnap.data() ?? {});
      assertSelfOrOwner(memberSnap.data(), uid, current.staffUid);
      const next = applyClockOut(current, input.clockOutAt, nowIso());
      transaction.set(attendanceRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: actorTypeFor(memberSnap.data()),
        role: actorTypeFor(memberSnap.data()),
        action: 'AttendanceClockedOut',
        targetType: 'attendance',
        targetId: input.attendanceId,
        detail: { staffUid: current.staffUid },
      });
      return next;
    });

    return attendanceResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      attendance,
    });
  },
);

/**
 * Staff requests a correction. The record stays `pending` until an authorized
 * approver acts, and every request appends to history (REQ-HRM-002).
 */
export const callableWorkforceRequestCorrection = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseRequestCorrectionInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const attendanceRef = db.doc(
      `${attendanceCollectionPath(input.tenantId)}/${input.attendanceId}`,
    );

    const attendance = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const attendanceSnap = await transaction.get(attendanceRef);
      assertActiveMember(memberSnap.data());
      if (!attendanceSnap.exists) {
        throw new HttpsError(
          'not-found',
          WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE,
        );
      }
      const current = toAttendance(input.attendanceId, attendanceSnap.data() ?? {});
      assertSelfOrOwner(memberSnap.data(), uid, current.staffUid);
      const next = applyCorrectionRequest(current, input, uid, nowIso());
      transaction.set(attendanceRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: actorTypeFor(memberSnap.data()),
        role: actorTypeFor(memberSnap.data()),
        action: 'AttendanceCorrectionRequested',
        targetType: 'attendance',
        targetId: input.attendanceId,
        reason: input.reason,
        detail: { staffUid: current.staffUid },
      });
      return next;
    });

    return attendanceResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      attendance,
    });
  },
);

/** Owner command: approve a pending correction and keep history. */
export const callableWorkforceApproveCorrection = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseApproveCorrectionInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const attendanceRef = db.doc(
      `${attendanceCollectionPath(input.tenantId)}/${input.attendanceId}`,
    );

    const attendance = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      const attendanceSnap = await transaction.get(attendanceRef);
      assertActiveOwnerMember(memberSnap.data());
      if (!attendanceSnap.exists) {
        throw new HttpsError(
          'not-found',
          WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE,
        );
      }
      const current = toAttendance(input.attendanceId, attendanceSnap.data() ?? {});
      const next = applyCorrectionApproval(
        current,
        uid,
        input.reason ?? null,
        nowIso(),
      );
      transaction.set(attendanceRef, next);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'AttendanceCorrectionApproved',
        targetType: 'attendance',
        targetId: input.attendanceId,
        reason: input.reason ?? null,
        detail: { staffUid: current.staffUid },
      });
      return next;
    });

    return attendanceResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      attendance,
    });
  },
);

/**
 * Active member query: worked minutes for one Staff member. Staff may only
 * read their own summary. No payroll figure is produced (REQ-HRM-003).
 */
export const callableWorkforceGetAttendanceSummary = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const parsed = attendanceSummaryInputSchema.safeParse(request.data ?? {});
    if (!parsed.success) {
      throw new HttpsError('invalid-argument', WORKFORCE_INVALID_MESSAGE);
    }
    const input: AttendanceSummaryInput = parsed.data;

    const db = getDb();
    const memberSnap = await db
      .doc(`tenants/${input.tenantId}/members/${uid}`)
      .get();
    assertActiveMember(memberSnap.data());
    assertSelfOrOwner(memberSnap.data(), uid, input.staffUid);

    const bounds = dayBounds(input.fromDay, input.toDay);
    const snapshot = await db
      .collection(attendanceCollectionPath(input.tenantId))
      .where('staffUid', '==', input.staffUid)
      .where('clockInAt', '>=', bounds.from)
      .where('clockInAt', '<=', `${bounds.to.slice(0, 11)}23:59:59.999Z`)
      .limit(MAX_ATTENDANCE_RECORDS)
      .get();
    const records: Attendance[] = snapshot.docs.map((docSnap) =>
      toAttendance(docSnap.id, docSnap.data()),
    );

    return attendanceSummarySchema.parse(
      buildAttendanceSummary(
        input.tenantId,
        input.staffUid,
        input.fromDay,
        input.toDay,
        records,
      ),
    );
  },
);
