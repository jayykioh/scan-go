import { describe, expect, it } from 'vitest';
import { planStaffDirectoryBackfill } from './staff-directory-backfill.js';

const TENANT_ID = 'tenant-a';

const staffData = (overrides: Record<string, unknown> = {}) => ({
  uid: 'staff-a',
  email: 'cashier@example.com',
  displayName: 'Cashier',
  membershipType: 'staff',
  roles: ['cashier'],
  permissions: [],
  isActive: true,
  staffPinHash: 'must-never-be-projected',
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
  ...overrides,
});

describe('planStaffDirectoryBackfill', () => {
  it('projects a staff membership that has no directory row', () => {
    const plan = planStaffDirectoryBackfill(
      TENANT_ID,
      [{ uid: 'staff-a', data: staffData() }],
      new Set(),
    );

    expect(plan.skipped).toEqual([]);
    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]).toMatchObject({
      tenantId: TENANT_ID,
      uid: 'staff-a',
      entry: { roles: ['cashier'], isActive: true, hasPin: true },
    });
    expect(JSON.stringify(plan.rows[0].entry)).not.toContain(
      'must-never-be-projected',
    );
  });

  it('never projects an Owner or a non-staff membership', () => {
    const plan = planStaffDirectoryBackfill(
      TENANT_ID,
      [
        {
          uid: 'owner-a',
          data: staffData({ uid: 'owner-a', membershipType: 'owner', roles: ['owner'] }),
        },
        { uid: 'legacy-a', data: { isActive: false } },
      ],
      new Set(),
    );

    expect(plan.rows).toEqual([]);
    expect(plan.skipped).toEqual([]);
  });

  it('leaves an existing directory row untouched so a rerun writes nothing', () => {
    const plan = planStaffDirectoryBackfill(
      TENANT_ID,
      [{ uid: 'staff-a', data: staffData() }],
      new Set(['staff-a']),
    );

    expect(plan.rows).toEqual([]);
  });

  it('reports an unprojectable membership instead of throwing', () => {
    const plan = planStaffDirectoryBackfill(
      TENANT_ID,
      [
        { uid: 'staff-a', data: staffData() },
        { uid: 'staff-b', data: staffData({ uid: 'staff-b', email: '' }) },
      ],
      new Set(),
    );

    expect(plan.rows.map((row) => row.uid)).toEqual(['staff-a']);
    expect(plan.skipped.map((entry) => entry.uid)).toEqual(['staff-b']);
  });
});
