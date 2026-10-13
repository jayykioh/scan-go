import {
  collection,
  limit,
  onSnapshot,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  staffCommandResultSchema,
  staffDirectoryEntrySchema,
  type StaffAccount,
  type StaffCommandResult,
  type StaffCreateInput,
  type StaffDirectoryEntry,
  type StaffResetPinInput,
  type StaffSetActiveInput,
  type StaffUpdateInput,
} from '@contracts/staff.contract';
import {
  getFirebaseFirestore,
  getFirebaseFunctions,
} from '../../services/firebase/client';

/**
 * Owner-only Staff reads use a server-written, PIN-free directory projection;
 * account mutations remain callable commands. The client never reads or writes
 * `tenants/{tenantId}/members` directly (docs/RULES_FIREBASE.md §1).
 */
async function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

export const STAFF_DIRECTORY_LISTENER_LIMIT = 100;

/** Read the Owner-only, PIN-free directory projection through Firestore Rules. */
export function subscribeStaffDirectory(
  tenantId: string,
  onChange: (staff: StaffDirectoryEntry[]) => void,
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
      collection(db, 'tenants', tenantId, 'staffDirectory'),
      limit(STAFF_DIRECTORY_LISTENER_LIMIT),
    ),
    (snapshot) => {
      const rows = snapshot.docs.map((docSnap) =>
        staffDirectoryEntrySchema.parse({
          ...docSnap.data(),
          tenantId,
          uid: docSnap.id,
        }),
      );
      rows.sort((left, right) =>
        (left.displayName ?? '').localeCompare(right.displayName ?? ''),
      );
      onChange(rows);
    },
    (error) => onError?.(error),
  );
}

export async function createStaff(
  input: StaffCreateInput,
): Promise<StaffAccount> {
  const functions = await requireFunctions();
  const callable = httpsCallable<StaffCreateInput, StaffCommandResult>(
    functions,
    'callableStaffCreate',
  );
  const result = await callable(input);
  return staffCommandResultSchema.parse(result.data).staff;
}

export async function updateStaff(
  input: StaffUpdateInput,
): Promise<StaffAccount> {
  const functions = await requireFunctions();
  const callable = httpsCallable<StaffUpdateInput, StaffCommandResult>(
    functions,
    'callableStaffUpdate',
  );
  const result = await callable(input);
  return staffCommandResultSchema.parse(result.data).staff;
}

export async function setStaffActive(
  input: StaffSetActiveInput,
): Promise<StaffAccount> {
  const functions = await requireFunctions();
  const callable = httpsCallable<StaffSetActiveInput, StaffCommandResult>(
    functions,
    'callableStaffSetActive',
  );
  const result = await callable(input);
  return staffCommandResultSchema.parse(result.data).staff;
}

export async function resetStaffPin(
  input: StaffResetPinInput,
): Promise<StaffAccount> {
  const functions = await requireFunctions();
  const callable = httpsCallable<StaffResetPinInput, StaffCommandResult>(
    functions,
    'callableStaffResetPin',
  );
  const result = await callable(input);
  return staffCommandResultSchema.parse(result.data).staff;
}
