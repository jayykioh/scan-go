import { beforeEach, describe, expect, it, vi } from 'vitest';

interface StoredStaffDocument {
  id: string;
  data: () => Record<string, unknown>;
}
interface StaffSnapshot {
  docs: StoredStaffDocument[];
}

const mocks = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  next: null as null | ((snapshot: StaffSnapshot) => void),
  unsubscribe: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: (...args: unknown[]) => ({ path: args.slice(1).join('/') }),
  limit: (value: number) => ({ limit: value }),
  query: (...args: unknown[]) => ({ clauses: args }),
  onSnapshot: (
    target: unknown,
    next: (snapshot: StaffSnapshot) => void,
    _onError: (error: Error) => void,
  ) => {
    mocks.onSnapshot(target);
    mocks.next = next;
    return mocks.unsubscribe;
  },
}));

vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('../../services/firebase/client', () => ({
  getFirebaseFirestore: () => ({}),
  getFirebaseFunctions: () => null,
}));

import { subscribeStaffDirectory } from './staff.adapter';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.next = null;
});

describe('subscribeStaffDirectory', () => {
  it('reads a bounded safe projection directly and maps document ids', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeStaffDirectory('tenant-a', onChange);

    expect(mocks.onSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.onSnapshot.mock.calls[0]?.[0]).toMatchObject({
      clauses: [
        { path: 'tenants/tenant-a/staffDirectory' },
        { limit: 100 },
      ],
    });

    mocks.next?.({
      docs: [
        {
          id: 'staff-b',
          data: () => ({
            schemaVersion: 1,
            tenantId: 'tenant-a',
            email: 'b@example.com',
            displayName: 'B Staff',
            roles: ['cashier'],
            isActive: true,
            hasPin: true,
            createdAt: '2026-10-03T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
          }),
        },
        {
          id: 'staff-a',
          data: () => ({
            schemaVersion: 1,
            tenantId: 'tenant-a',
            email: 'a@example.com',
            displayName: 'A Staff',
            roles: ['kitchen'],
            isActive: true,
            hasPin: false,
            createdAt: '2026-10-03T00:00:00.000Z',
            updatedAt: '2026-10-03T00:00:00.000Z',
          }),
        },
      ],
    });

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ uid: 'staff-a', displayName: 'A Staff' }),
      expect.objectContaining({ uid: 'staff-b', displayName: 'B Staff' }),
    ]);
    unsubscribe();
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
