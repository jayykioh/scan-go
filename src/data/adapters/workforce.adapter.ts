import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type QueryConstraint,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  WORKFORCE_CONTRACT_VERSION,
  attendanceResultSchema,
  attendanceSchema,
  cancelShiftResultSchema,
  shiftCommandResultSchema,
  shiftSchema,
  type Attendance,
  type CancelShiftInput,
  type ClockInInput,
  type ClockOutInput,
  type ScheduleShiftInput,
  type Shift,
} from '@contracts/workforce.contract';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

/**
 * Workforce reads and commands (REQ-HRM-004, REQ-HRM-005). The Owner reads the
 * whole schedule; a Staff member's listener must carry `staffUid == uid`
 * because Firestore Rules deny anything wider. Every write is a callable: the
 * client never writes a Shift or an attendance record (docs/RULES_FIREBASE.md).
 */

export const WORKFORCE_READ_LIMIT = 300;

/** `undefined` reads the tenant's whole schedule: Owner and ADMIN only. */
export type WorkforceScope = { uid: string } | undefined;

export function mapStoredShift(
  tenantId: string,
  shiftId: string,
  data: DocumentData,
): Shift {
  return shiftSchema.parse({
    ...data,
    schemaVersion: data.schemaVersion ?? WORKFORCE_CONTRACT_VERSION,
    tenantId,
    shiftId,
    label: data.label ?? null,
    role: data.role ?? null,
  });
}

export function mapStoredAttendance(
  tenantId: string,
  attendanceId: string,
  data: DocumentData,
): Attendance {
  // Tolerant like the server's own reader: a record written before a field
  // existed must still list, rather than failing the whole listener.
  return attendanceSchema.parse({
    ...data,
    schemaVersion: data.schemaVersion ?? WORKFORCE_CONTRACT_VERSION,
    tenantId,
    attendanceId,
    shiftId: data.shiftId ?? null,
    clockOutAt: data.clockOutAt ?? null,
    source: data.source ?? 'staff',
    correctionState: data.correctionState ?? 'none',
    requestedClockInAt: data.requestedClockInAt ?? null,
    requestedClockOutAt: data.requestedClockOutAt ?? null,
    correctionReason: data.correctionReason ?? null,
    approverUid: data.approverUid ?? null,
    history: data.history ?? [],
  });
}

function scopeConstraints(scope: WorkforceScope): QueryConstraint[] {
  return scope ? [where('staffUid', '==', scope.uid)] : [];
}

/** Shifts inside a tenant-local day range, live. */
export function subscribeShifts(
  tenantId: string,
  scope: WorkforceScope,
  fromDay: string,
  toDay: string,
  onChange: (shifts: Shift[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange([]);
    onError?.(new Error('Firebase chưa được cấu hình.'));
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(db, 'tenants', tenantId, 'shifts'),
      ...scopeConstraints(scope),
      where('date', '>=', fromDay),
      where('date', '<=', toDay),
      orderBy('date'),
      limit(WORKFORCE_READ_LIMIT),
    ),
    (snapshot) => {
      onChange(
        snapshot.docs.map((docSnap) =>
          mapStoredShift(tenantId, docSnap.id, docSnap.data()),
        ),
      );
    },
    (error) => onError?.(error),
  );
}

/**
 * Attendance records inside a UTC instant window, live. The caller pads the
 * window by a day so a record near a local midnight is never missed.
 */
export function subscribeAttendance(
  tenantId: string,
  scope: WorkforceScope,
  fromIso: string,
  toIso: string,
  onChange: (records: Attendance[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const db = getFirebaseFirestore();
  if (!db) {
    onChange([]);
    onError?.(new Error('Firebase chưa được cấu hình.'));
    return () => undefined;
  }
  return onSnapshot(
    query(
      collection(db, 'tenants', tenantId, 'attendance'),
      ...scopeConstraints(scope),
      where('clockInAt', '>=', fromIso),
      where('clockInAt', '<=', toIso),
      orderBy('clockInAt', 'desc'),
      limit(WORKFORCE_READ_LIMIT),
    ),
    (snapshot) => {
      onChange(
        snapshot.docs.map((docSnap) =>
          mapStoredAttendance(tenantId, docSnap.id, docSnap.data()),
        ),
      );
    },
    (error) => onError?.(error),
  );
}

async function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

/** Owner command: plan one interval for several Staff members in one save. */
export async function scheduleShifts(
  input: ScheduleShiftInput,
): Promise<Shift[]> {
  const functions = await requireFunctions();
  const callable = httpsCallable<ScheduleShiftInput, unknown>(
    functions,
    'callableWorkforceScheduleShift',
  );
  const result = await callable(input);
  return shiftCommandResultSchema.parse(result.data).shifts;
}

/** Owner command: cancel a planned Shift that has no attendance. */
export async function cancelShift(input: CancelShiftInput): Promise<string> {
  const functions = await requireFunctions();
  const callable = httpsCallable<CancelShiftInput, unknown>(
    functions,
    'callableWorkforceCancelShift',
  );
  const result = await callable(input);
  return cancelShiftResultSchema.parse(result.data).shiftId;
}

/** Staff command: accept the Shift assigned to them; the server stamps it. */
export async function clockInToShift(input: ClockInInput): Promise<Attendance> {
  const functions = await requireFunctions();
  const callable = httpsCallable<ClockInInput, unknown>(
    functions,
    'callableWorkforceClockIn',
  );
  const result = await callable(input);
  return attendanceResultSchema.parse(result.data).attendance;
}

/** Staff command: end the open record; the server stamps it. */
export async function clockOutOfShift(
  input: ClockOutInput,
): Promise<Attendance> {
  const functions = await requireFunctions();
  const callable = httpsCallable<ClockOutInput, unknown>(
    functions,
    'callableWorkforceClockOut',
  );
  const result = await callable(input);
  return attendanceResultSchema.parse(result.data).attendance;
}
