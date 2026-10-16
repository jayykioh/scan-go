import { describe, expect, it } from 'vitest';
import {
  isTableOutsideAssignedAreas,
  readAssignedAreas,
} from './areaScope.js';

/** REQ-TBL-010: the area scope a command reads off the membership document. */
describe('readAssignedAreas', () => {
  it('reads the projection and drops values that are not usable labels', () => {
    expect(readAssignedAreas({ assignedAreas: ['Sân vườn', 7, ''] })).toEqual([
      'Sân vườn',
    ]);
  });

  it('treats a missing or malformed projection as no scope at all', () => {
    expect(readAssignedAreas(undefined)).toEqual([]);
    expect(readAssignedAreas({})).toEqual([]);
    expect(readAssignedAreas({ assignedAreas: 'Sân vườn' })).toEqual([]);
  });
});

describe('isTableOutsideAssignedAreas', () => {
  it('never restricts a member with no assignment', () => {
    expect(
      isTableOutsideAssignedAreas({
        assignedAreas: [],
        areaWaiterUids: ['someone-else'],
        uid: 'waiter-1',
      }),
    ).toBe(false);
  });

  it('allows the table when the member is in its area coverage', () => {
    expect(
      isTableOutsideAssignedAreas({
        assignedAreas: ['Sân vườn'],
        areaWaiterUids: ['waiter-1', 'waiter-2'],
        uid: 'waiter-1',
      }),
    ).toBe(false);
  });

  it('rejects a table of another area, including an unassigned one', () => {
    expect(
      isTableOutsideAssignedAreas({
        assignedAreas: ['Sân vườn'],
        areaWaiterUids: ['waiter-2'],
        uid: 'waiter-1',
      }),
    ).toBe(true);
    expect(
      isTableOutsideAssignedAreas({
        assignedAreas: ['Sân vườn'],
        areaWaiterUids: [],
        uid: 'waiter-1',
      }),
    ).toBe(true);
  });
});
