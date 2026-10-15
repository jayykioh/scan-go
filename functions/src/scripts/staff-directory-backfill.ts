/**
 * Planning for the Owner Staff directory backfill (REQ-AUTH-003).
 *
 * `tenants/{tenantId}/staffDirectory` is a projection of the private
 * membership documents: it is what lets the Owner list Staff through Firestore
 * Rules without reading a PIN hash. It was introduced after memberships already
 * existed, so memberships created before it have no directory row and the Owner
 * Staff list is empty for them. This module decides which rows are missing.
 *
 * Kept free of `firebase-admin` initialization so it stays unit-testable,
 * mirroring `seed-args.ts` and `admin-claim.ts`.
 */
import type { DocumentData } from 'firebase-admin/firestore';
import type { StaffDirectoryEntry } from '../../../shared/contracts/staff.contract.js';
import { toStaffDirectoryEntry } from '../modules/staff/service.js';

export interface MemberSnapshot {
  uid: string;
  data: DocumentData;
}

export interface StaffDirectoryBackfillRow {
  tenantId: string;
  uid: string;
  entry: StaffDirectoryEntry;
}

export interface StaffDirectoryBackfillPlan {
  rows: StaffDirectoryBackfillRow[];
  /** A membership whose stored shape cannot be projected, reported not thrown. */
  skipped: Array<{ uid: string; reason: string }>;
}

/**
 * Plan the missing directory rows for one Tenant. Only a `staff` membership is
 * projected — an Owner must never appear in the Staff list — and a row that
 * already exists is left untouched, so running this twice writes nothing the
 * second time.
 */
export function planStaffDirectoryBackfill(
  tenantId: string,
  members: readonly MemberSnapshot[],
  existingDirectoryUids: ReadonlySet<string>,
): StaffDirectoryBackfillPlan {
  const rows: StaffDirectoryBackfillRow[] = [];
  const skipped: StaffDirectoryBackfillPlan['skipped'] = [];

  for (const member of members) {
    if (member.data.membershipType !== 'staff') {
      continue;
    }
    if (existingDirectoryUids.has(member.uid)) {
      continue;
    }
    try {
      rows.push({
        tenantId,
        uid: member.uid,
        entry: toStaffDirectoryEntry(tenantId, member.uid, member.data),
      });
    } catch (error) {
      skipped.push({
        uid: member.uid,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { rows, skipped };
}
