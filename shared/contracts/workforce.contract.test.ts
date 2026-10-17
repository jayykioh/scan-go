import { describe, expect, it } from 'vitest';
import {
  clockInInputSchema,
  computeWorkedMinutes,
  scheduleShiftInputSchema,
} from './workforce.contract.js';

const batch = {
  tenantId: 'tenant-a',
  staffUids: ['uid-a', 'uid-b'],
  date: '20260914',
  startAt: '2026-09-14T01:00:00.000Z',
  endAt: '2026-09-14T05:00:00.000Z',
};

describe('scheduleShiftInputSchema (REQ-HRM-004)', () => {
  it('accepts one interval for several Staff members', () => {
    const parsed = scheduleShiftInputSchema.parse({ ...batch, label: 'Ca sáng' });
    expect(parsed.staffUids).toEqual(['uid-a', 'uid-b']);
    expect(parsed.label).toBe('Ca sáng');
  });

  it('rejects a Staff member named twice in one save', () => {
    const parsed = scheduleShiftInputSchema.safeParse({
      ...batch,
      staffUids: ['uid-a', 'uid-a'],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an end that is not after its start and an empty batch', () => {
    expect(
      scheduleShiftInputSchema.safeParse({
        ...batch,
        endAt: batch.startAt,
      }).success,
    ).toBe(false);
    expect(
      scheduleShiftInputSchema.safeParse({ ...batch, staffUids: [] }).success,
    ).toBe(false);
  });
});

describe('clockInInputSchema (REQ-HRM-005)', () => {
  it('takes no client-supplied instant, so the server stamps the time', () => {
    expect(
      clockInInputSchema.safeParse({
        tenantId: 'tenant-a',
        staffUid: 'uid-a',
        shiftId: 'shift-1',
      }).success,
    ).toBe(true);
    expect(
      clockInInputSchema.safeParse({
        tenantId: 'tenant-a',
        staffUid: 'uid-a',
        clockInAt: '2026-09-14T01:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('computeWorkedMinutes (REQ-HRM-003)', () => {
  it('counts a closed interval and never a negative or open one', () => {
    expect(
      computeWorkedMinutes({
        clockInAt: '2026-09-14T01:00:00.000Z',
        clockOutAt: '2026-09-14T02:30:00.000Z',
      }),
    ).toBe(90);
    expect(
      computeWorkedMinutes({
        clockInAt: '2026-09-14T01:00:00.000Z',
        clockOutAt: null,
      }),
    ).toBe(0);
    expect(
      computeWorkedMinutes({
        clockInAt: '2026-09-14T02:00:00.000Z',
        clockOutAt: '2026-09-14T01:00:00.000Z',
      }),
    ).toBe(0);
  });
});
