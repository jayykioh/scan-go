import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePlanEntitlements } from '@contracts/subscription.contract';
import { clearReadCache } from '../readCache';

const mocks = vi.hoisted(() => ({
  currentUser: null as null | {
    uid: string;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
  },
  getDoc: vi.fn(),
  callable: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: (...args: unknown[]) => ({ path: args.join('/') }),
  getDoc: (...args: unknown[]) => mocks.getDoc(...args),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => {
    mocks.httpsCallable(...args);
    return mocks.callable;
  },
}));

vi.mock('../../services/firebase/client', () => ({
  getFirebaseAuth: () => ({ currentUser: mocks.currentUser }),
  getFirebaseFirestore: () => ({}),
  getFirebaseFunctions: () => ({}),
}));

import { getSubscription } from './subscription.adapter';

function tenantSnapshot(data: Record<string, unknown>) {
  return {
    exists: () => true,
    get: (field: string) => data[field],
  };
}

beforeEach(() => {
  clearReadCache();
  vi.resetAllMocks();
  mocks.currentUser = {
    uid: 'user-a',
    getIdTokenResult: async () => ({ claims: { admin: false } }),
  };
  mocks.callable.mockResolvedValue({
    data: {
      schemaVersion: 1,
      state: {
        schemaVersion: 1,
        tenantId: 'tenant-a',
        plan: 'pro',
        entitlements: resolvePlanEntitlements('pro'),
        updatedAt: '2026-10-03T00:00:00.000Z',
      },
    },
  });
});

describe('getSubscription', () => {
  it('reads and caches the minimal tenant plan state for a non-ADMIN user', async () => {
    mocks.getDoc.mockResolvedValue(
      tenantSnapshot({
        pricingTier: 'lite',
        updatedAt: '2026-10-03T00:00:00.000Z',
      }),
    );

    const first = await getSubscription('tenant-a');
    const second = await getSubscription('tenant-a');

    expect(first?.plan).toBe('lite');
    expect(first?.entitlements.features).toContain('loyalty');
    expect(second).toEqual(first);
    expect(mocks.getDoc).toHaveBeenCalledTimes(1);
    expect(mocks.httpsCallable).not.toHaveBeenCalled();
  });

  it('keeps ADMIN subscription reads on the callable', async () => {
    mocks.currentUser = {
      uid: 'admin-a',
      getIdTokenResult: async () => ({ claims: { admin: true } }),
    };

    const result = await getSubscription('tenant-a');

    expect(result?.plan).toBe('pro');
    expect(mocks.getDoc).not.toHaveBeenCalled();
    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      {},
      'callableSubscriptionGet',
    );
    expect(mocks.callable).toHaveBeenCalledWith({ tenantId: 'tenant-a' });
  });
});
