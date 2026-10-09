import { describe, expect, it } from 'vitest';
import {
  deriveTableServiceState,
  tableStatusListResultSchema,
} from './tableStatus.contract.js';

describe('deriveTableServiceState (REQ-TBL-003)', () => {
  const facts = (
    activeOrderCount: number,
    readyOrderCount: number,
    unsettledOrderCount: number,
  ) => ({ activeOrderCount, readyOrderCount, unsettledOrderCount });

  it('is free when the table has no open Order', () => {
    expect(deriveTableServiceState(facts(0, 0, 0))).toBe('free');
  });

  it('is occupied while an Order is open', () => {
    expect(deriveTableServiceState(facts(1, 0, 0))).toBe('occupied');
  });

  it('is foodReady when a dish is waiting to be served', () => {
    expect(deriveTableServiceState(facts(2, 1, 0))).toBe('foodReady');
  });

  it('lets an unsettled served Order outrank a ready dish', () => {
    expect(deriveTableServiceState(facts(2, 1, 1))).toBe('awaitingPayment');
  });

  it('ignores a ready or unsettled count with no open Order', () => {
    expect(deriveTableServiceState(facts(0, 3, 3))).toBe('free');
  });
});

describe('TableStatusListResult contract', () => {
  it('accepts an empty plan', () => {
    expect(
      tableStatusListResultSchema.safeParse({
        schemaVersion: 1,
        tenantId: 'tenant-a',
        generatedAt: '2026-10-08T10:00:00.000Z',
        tables: [],
      }).success,
    ).toBe(true);
  });

  it('rejects a projection carrying money or Customer data', () => {
    expect(
      tableStatusListResultSchema.safeParse({
        schemaVersion: 1,
        tenantId: 'tenant-a',
        generatedAt: '2026-10-08T10:00:00.000Z',
        tables: [
          {
            tableId: 'table-1',
            state: 'occupied',
            activeOrderCount: 1,
            readyOrderCount: 0,
            unsettledOrderCount: 0,
            oldestActiveOrderAt: null,
            unpaidTotalVnd: 120000,
          },
        ],
      }).success,
    ).toBe(false);
  });
});
