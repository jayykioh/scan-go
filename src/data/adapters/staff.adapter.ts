import { httpsCallable } from 'firebase/functions';
import {
  staffCommandResultSchema,
  staffListResultSchema,
  type StaffAccount,
  type StaffCommandResult,
  type StaffCreateInput,
  type StaffListResult,
  type StaffResetPinInput,
  type StaffSetActiveInput,
  type StaffUpdateInput,
} from '@contracts/staff.contract';
import { getFirebaseFunctions } from '../../services/firebase/client';

/**
 * Owner-only Staff account commands. Memberships are private to their user, so
 * every read and write goes through a server callable; the client never reads
 * or writes `tenants/{tenantId}/members` directly (docs/RULES_FIREBASE.md §1).
 */
async function requireFunctions() {
  const functions = getFirebaseFunctions();
  if (!functions) {
    throw new Error('Firebase chưa được cấu hình.');
  }
  return functions;
}

export async function listStaff(tenantId: string): Promise<StaffAccount[]> {
  const functions = await requireFunctions();
  const callable = httpsCallable<
    { tenantId: string },
    StaffListResult
  >(functions, 'callableStaffList');
  const result = await callable({ tenantId });
  return staffListResultSchema.parse(result.data).staff;
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
