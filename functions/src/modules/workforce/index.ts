import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentData } from 'firebase-admin/firestore';
import {
  WORKFORCE_CONTRACT_VERSION,
  attendanceResultSchema,
  attendanceSummaryInputSchema,
  attendanceSummarySchema,
  cancelShiftResultSchema,
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
  WORKFORCE_ALREADY_ON_SHIFT_MESSAGE,
  WORKFORCE_ATTENDANCE_NOT_FOUND_MESSAGE,
  WORKFORCE_INVALID_MESSAGE,
  WORKFORCE_SELF_DENIED_MESSAGE,
  WORKFORCE_SHIFT_HAS_ATTENDANCE_MESSAGE,
  WORKFORCE_SHIFT_NOT_FOUND_MESSAGE,
  WORKFORCE_SHIFT_NOT_YOURS_MESSAGE,
  WORKFORCE_SHIFT_OVERLAP_MESSAGE,
  applyClockOut,
  applyCorrectionApproval,
  applyCorrectionRequest,
  assertActiveMember,
  assertActiveOwnerMember,
  attendanceCollectionPath,
  attendanceIdFor,
  attendanceIdForShift,
  buildAttendanceSummary,
  buildNewAttendance,
  buildNewShift,
  nowIso,
  parseApproveCorrectionInput,
  parseCancelShiftInput,
  parseClockInInput,
  parseClockOutInput,
  parseRequestCorrectionInput,
  parseScheduleShiftInput,
  requireUid,
  shiftCollectionPath,
  shiftDocPath,
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
 * Owner command: plan one interval for one or more Staff members on one date
 * (REQ-HRM-001, REQ-HRM-004). Every Staff member's existing Shifts are checked
 * inside one transaction, so a batch either lands whole or not at all. A Staff
 * member can never schedule a Shift.
 */
export const callableWorkforceScheduleShift = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseScheduleShiftInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const shiftsRef = db.collection(shiftCollectionPath(input.tenantId));

    const shifts = await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveOwnerMember(memberSnap.data());

      const existingPerStaff: Array<Array<Pick<Shift, 'startAt' | 'endAt'>>> = [];
      for (const staffUid of input.staffUids) {
        const existingSnap = await transaction.get(
          shiftsRef
            .where('staffUid', '==', staffUid)
            .where('date', '==', input.date)
            .limit(MAX_SHIFTS_PER_DAY),
        );
        existingPerStaff.push(
          existingSnap.docs.map((docSnap) => ({
            startAt: docSnap.get('startAt'),
            endAt: docSnap.get('endAt'),
          })),
        );
      }
      if (existingPerStaff.some((existing) => hasOverlappingShift(existing, input))) {
        throw new HttpsError(
          'failed-precondition',
          WORKFORCE_SHIFT_OVERLAP_MESSAGE,
        );
      }

      const now = nowIso();
      const created = input.staffUids.map((staffUid) => {
        const shift = buildNewShift(
          input,
          staffUid,
          shiftsRef.doc().id,
          now,
        );
        transaction.set(shiftsRef.doc(shift.shiftId), shift);
        writeAuditEventInTransaction(transaction, {
          tenantId: input.tenantId,
          actorUid: uid,
          actorType: 'owner',
          role: 'owner',
          action: 'ShiftScheduled',
          targetType: 'shift',
          targetId: shift.shiftId,
          detail: { staffUid, date: input.date },
        });
        return shift;
      });
      return created;
    });

    return shiftCommandResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      shifts,
    });
  },
);

/**
 * Owner command: cancel a planned Shift (REQ-HRM-004). A Shift that already
 * carries attendance is kept, so a worked record never loses the Shift it was
 * counted against.
 */
export const callableWorkforceCancelShift = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseCancelShiftInput(request.data);

    const db = getDb();
    const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
    const shiftRef = db.doc(shiftDocPath(input.tenantId, input.shiftId));
    const attendanceQuery = db
      .collection(attendanceCollectionPath(input.tenantId))
      .where('shiftId', '==', input.shiftId)
      .limit(1);

    await db.runTransaction(async (transaction) => {
      const memberSnap = await transaction.get(memberRef);
      assertActiveOwnerMember(memberSnap.data());
      const shiftSnap = await transaction.get(shiftRef);
      if (!shiftSnap.exists) {
        throw new HttpsError(
          'not-found',
          WORKFORCE_SHIFT_NOT_FOUND_MESSAGE,
        );
      }
      const attendanceSnap = await transaction.get(attendanceQuery);
      if (!attendanceSnap.empty) {
        throw new HttpsError(
          'failed-precondition',
          WORKFORCE_SHIFT_HAS_ATTENDANCE_MESSAGE,
        );
      }
      transaction.delete(shiftRef);
      writeAuditEventInTransaction(transaction, {
        tenantId: input.tenantId,
        actorUid: uid,
        actorType: 'owner',
        role: 'owner',
        action: 'ShiftCancelled',
        targetType: 'shift',
        targetId: input.shiftId,
        detail: {
          staffUid: shiftSnap.get('staffUid'),
          date: shiftSnap.get('date'),
        },
      });
    });

    return cancelShiftResultSchema.parse({
      schemaVersion: WORKFORCE_CONTRACT_VERSION,
      status: 'applied',
      shiftId: input.shiftId,
    });
  },
);

/**
 * Record clock in at the server's instant, against the Staff member's own
 * assigned Shift (REQ-HRM-005). A Staff member may only clock in for
 * themselves; an open record blocks a second one so minutes cannot double.
 */
export const callableWorkforceClockIn = onCall(CALL_OPTIONS, async (request) => {
  const uid = requireUid(request.auth?.uid);
  assertAppCheck(request);
  const input = parseClockInInput(request.data);

  const db = getDb();
  const now = nowIso();
  const memberRef = db.doc(`tenants/${input.tenantId}/members/${uid}`);
  const attendanceId = input.shiftId
    ? attendanceIdForShift(input.staffUid, input.shiftId)
    : attendanceIdFor(input.staffUid, now);
  const attendanceRef = db.doc(
    `${attendanceCollectionPath(input.tenantId)}/${attendanceId}`,
  );
  // An open record can only ever be the newest one: while it is open, every
  // later clock in is refused, so the most recent record decides. This reuses
  // the (staffUid, clockInAt desc) index that already exists.
  const latestQuery = db
    .collection(attendanceCollectionPath(input.tenantId))
    .where('staffUid', '==', input.staffUid)
    .orderBy('clockInAt', 'desc')
    .limit(1);

  const outcome = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(memberRef);
    assertActiveMember(memberSnap.data());
    assertSelfOrOwner(memberSnap.data(), uid, input.staffUid);

    if (input.shiftId) {
      const shiftSnap = await transaction.get(
        db.doc(shiftDocPath(input.tenantId, input.shiftId)),
      );
      if (!shiftSnap.exists) {
        throw new HttpsError(
          'not-found',
          WORKFORCE_SHIFT_NOT_FOUND_MESSAGE,
        );
      }
      if (shiftSnap.get('staffUid') !== input.staffUid) {
        throw new HttpsError(
          'permission-denied',
          WORKFORCE_SHIFT_NOT_YOURS_MESSAGE,
        );
      }
    }

    const attendanceSnap = await transaction.get(attendanceRef);
    if (attendanceSnap.exists) {
      return {
        replayed: true,
        attendance: toAttendance(attendanceId, attendanceSnap.data() ?? {}),
      };
    }
    const latestSnap = await transaction.get(latestQuery);
    const latest = latestSnap.docs[0];
    if (latest && (latest.get('clockOutAt') ?? null) === null) {
      throw new HttpsError(
        'failed-precondition',
        WORKFORCE_ALREADY_ON_SHIFT_MESSAGE,
      );
    }

    const next = buildNewAttendance(input, attendanceId, now);
    transaction.set(attendanceRef, next);
    writeAuditEventInTransaction(transaction, {
      tenantId: input.tenantId,
      actorUid: uid,
      actorType: actorTypeFor(memberSnap.data()),
      role: actorTypeFor(memberSnap.data()),
      action: 'AttendanceClockedIn',
      targetType: 'attendance',
      targetId: attendanceId,
      detail: { staffUid: input.staffUid, shiftId: input.shiftId ?? null },
    });
    return { replayed: false, attendance: next };
  });

  return attendanceResultSchema.parse({
    schemaVersion: WORKFORCE_CONTRACT_VERSION,
    status: outcome.replayed ? 'replayed' : 'applied',
    attendance: outcome.attendance,
  });
});

/** Record clock out at the server's instant. Self or Owner only. */
export const callableWorkforceClockOut = onCall(
  CALL_OPTIONS,
  async (request) => {
    const uid = requireUid(request.auth?.uid);
    assertAppCheck(request);
    const input = parseClockOutInput(request.data);

    const db = getDb();
    const now = nowIso();
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
      const next = applyClockOut(current, now, uid, now);
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
