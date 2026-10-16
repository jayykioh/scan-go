import type { DocumentData } from 'firebase-admin/firestore';

/**
 * Staff area scope (REQ-TBL-010).
 *
 * `assignedAreas` on the membership document is a server-written projection of
 * the Owner's area assignments (REQ-TBL-004). It is the only input a command
 * needs to decide whether a Staff member is scoped: an empty list means no
 * scope at all, which keeps the tenant-wide behaviour every shop has today.
 */
export function readAssignedAreas(
  memberData: DocumentData | undefined,
): string[] {
  const value = memberData?.assignedAreas;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (area): area is string => typeof area === 'string' && area.length > 0,
  );
}

/**
 * True when a scoped Staff member is not covered by the table's area. The table
 * carries the same projection, so no lookup is needed to answer it.
 */
export function isTableOutsideAssignedAreas(input: {
  assignedAreas: string[];
  areaWaiterUids: string[];
  uid: string;
}): boolean {
  if (input.assignedAreas.length === 0) {
    return false;
  }
  return !input.areaWaiterUids.includes(input.uid);
}
