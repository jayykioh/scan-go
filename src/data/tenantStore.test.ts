import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatalogMenuItem } from '@contracts/catalog.contract';
import type { StaffDirectoryEntry } from '@contracts/staff.contract';

type TestUser = {
  uid: string;
  getIdTokenResult: () => Promise<{ claims: { admin: boolean } }>;
};

type TestMembership = {
  isActive: boolean;
  membershipType: string;
  roles: string[];
  sessionVersion: number;
};

const mocks = vi.hoisted(() => ({
  stopMenu: vi.fn(),
  stopMembership: vi.fn(),
  authListener: vi.fn(),
  profileListener: vi.fn(),
  membershipListener: vi.fn(),
  currentUser: null as TestUser | null,
  currentTenantId: 'tenant-a',
  currentMembership: null as TestMembership | null,
  menuCallbacks: [] as Array<(items: CatalogMenuItem[]) => void>,
  staffDirectoryCallbacks: [] as Array<(items: StaffDirectoryEntry[]) => void>,
  stopStaffDirectory: vi.fn(),
  subscribeOwnerMenu: vi.fn(),
  subscribePublicMenu: vi.fn(),
  subscribeIngredients: vi.fn(),
  subscribeRecipes: vi.fn(),
  subscribeTenantTables: vi.fn(),
  subscribeStaffDirectory: vi.fn(),
  listPromotions: vi.fn(),
  readCampaignSuggestions: vi.fn(),
  getLoyaltyConfig: vi.fn(),
  getSubscription: vi.fn(),
  subscribeActiveTenantId: vi.fn(),
  subscribeCurrentMembership: vi.fn(),
}));

vi.mock('../services/firebase/client', () => ({
  getFirebaseAuth: () => ({}),
}));

vi.mock('firebase/auth', () => ({
  onIdTokenChanged: (
    _auth: unknown,
    listener: (user: TestUser | null) => void,
  ) => {
    mocks.authListener.mockImplementation(listener);
    listener(mocks.currentUser);
    return () => undefined;
  },
}));

vi.mock('./adapters/tenant.adapter', () => ({
  getActiveTenantId: async () => 'tenant-a',
  subscribeActiveTenantId: (
    _uid: string,
    onChange: (tenantId: string | null) => void,
  ) => {
    mocks.profileListener.mockImplementation(onChange);
    onChange(mocks.currentTenantId);
    return () => undefined;
  },
  subscribeCurrentMembership: (
    _tenantId: string,
    _uid: string,
    onChange: (membership: TestMembership | null) => void,
  ) => {
    mocks.membershipListener.mockImplementation(onChange);
    onChange(mocks.currentMembership);
    return mocks.stopMembership;
  },
}));

vi.mock('./adapters/catalog.adapter', () => ({
  subscribeOwnerMenu: (
    tenantId: string,
    onChange: (items: CatalogMenuItem[]) => void,
  ) => mocks.subscribeOwnerMenu(tenantId, onChange),
  subscribePublicMenu: (...args: unknown[]) =>
    mocks.subscribePublicMenu(...args),
}));

vi.mock('./adapters/inventory.adapter', () => ({
  subscribeIngredients: (...args: unknown[]) =>
    mocks.subscribeIngredients(...args),
  subscribeRecipes: (...args: unknown[]) => mocks.subscribeRecipes(...args),
}));

vi.mock('./adapters/table.adapter', () => ({
  subscribeTenantTables: (...args: unknown[]) =>
    mocks.subscribeTenantTables(...args),
}));

vi.mock('./adapters/staff.adapter', () => ({
  subscribeStaffDirectory: (...args: unknown[]) =>
    mocks.subscribeStaffDirectory(...args),
}));

vi.mock('./adapters/promotion.adapter', () => ({
  listPromotions: (...args: unknown[]) => mocks.listPromotions(...args),
}));

vi.mock('./firestoreRead', () => ({
  readCampaignSuggestions: (...args: unknown[]) =>
    mocks.readCampaignSuggestions(...args),
}));

vi.mock('./adapters/loyalty.adapter', () => ({
  getLoyaltyConfig: (...args: unknown[]) => mocks.getLoyaltyConfig(...args),
}));

vi.mock('./adapters/subscription.adapter', () => ({
  getSubscription: (...args: unknown[]) => mocks.getSubscription(...args),
}));

function makeUser(uid: string): TestUser {
  return {
    uid,
    getIdTokenResult: async () => ({ claims: { admin: false } }),
  };
}

function makeMembership(roles: string[] = ['owner']): TestMembership {
  return {
    isActive: true,
    membershipType: 'owner',
    roles,
    sessionVersion: 1,
  };
}

beforeEach(async () => {
  await vi.resetModules();
  vi.resetAllMocks();
  mocks.currentUser = makeUser('user-a');
  mocks.currentTenantId = 'tenant-a';
  mocks.currentMembership = makeMembership();
  mocks.menuCallbacks = [];
  mocks.staffDirectoryCallbacks = [];
  mocks.subscribeStaffDirectory.mockImplementation(
    (_tenantId: string, onChange: (items: StaffDirectoryEntry[]) => void) => {
      mocks.staffDirectoryCallbacks.push(onChange);
      onChange([
        {
          schemaVersion: 1,
          tenantId: 'tenant-a',
          uid: 'staff-a',
          email: 'staff@example.com',
          displayName: 'Staff A',
          roles: ['cashier'],
          isActive: true,
          hasPin: true,
          createdAt: '2026-10-03T00:00:00.000Z',
          updatedAt: '2026-10-03T00:00:00.000Z',
        },
      ]);
      return mocks.stopStaffDirectory;
    },
  );
  mocks.subscribeOwnerMenu.mockImplementation(
    (tenantId: string, onChange: (items: CatalogMenuItem[]) => void) => {
      mocks.menuCallbacks.push(onChange);
      onChange([
        { menuItemId: `${mocks.currentUser?.uid}-${tenantId}` },
      ] as unknown as CatalogMenuItem[]);
      return mocks.stopMenu;
    },
  );
  mocks.subscribeActiveTenantId.mockImplementation(
    (_uid: string, onChange: (tenantId: string | null) => void) => {
      onChange(mocks.currentTenantId);
      return () => undefined;
    },
  );
  mocks.subscribeCurrentMembership.mockImplementation(
    (
      _tenantId: string,
      _uid: string,
      onChange: (membership: TestMembership | null) => void,
    ) => {
      onChange(mocks.currentMembership);
      return mocks.stopMembership;
    },
  );
});

describe('tenant read cache', () => {
  it('reuses a live slice and its cached value after the last screen unmounts', async () => {
    const store = await import('./tenantStore');
    const releaseFirstScreen = store.acquireSlice('menuItems');
    await vi.waitFor(() => {
      expect(store.getStoreState().menuItems).toEqual([
        { menuItemId: 'user-a-tenant-a' },
      ]);
    });

    releaseFirstScreen();
    expect(mocks.stopMenu).not.toHaveBeenCalled();

    const releaseSecondScreen = store.acquireSlice('menuItems');
    expect(store.getStoreState().menuItems).toEqual([
      { menuItemId: 'user-a-tenant-a' },
    ]);
    expect(mocks.subscribeOwnerMenu).toHaveBeenCalledTimes(1);
    expect(mocks.stopMenu).not.toHaveBeenCalled();
    releaseSecondScreen();
  });

  it('reuses the live Staff directory projection after screen remount', async () => {
    const store = await import('./tenantStore');
    const releaseFirstScreen = store.acquireSlice('staffDirectory');

    await vi.waitFor(() => {
      expect(store.getStoreState().staffDirectory[0]?.uid).toBe('staff-a');
    });
    releaseFirstScreen();

    const releaseSecondScreen = store.acquireSlice('staffDirectory');
    expect(store.getStoreState().staffDirectory[0]?.displayName).toBe('Staff A');
    expect(mocks.subscribeStaffDirectory).toHaveBeenCalledTimes(1);
    expect(mocks.stopStaffDirectory).not.toHaveBeenCalled();
    releaseSecondScreen();
  });

  it('isolates same-tenant account switches and ignores old listener callbacks', async () => {
    const store = await import('./tenantStore');
    const release = store.acquireSlice('menuItems');
    await vi.waitFor(() => {
      expect(store.getStoreState().menuItems).toEqual([
        { menuItemId: 'user-a-tenant-a' },
      ]);
    });
    const oldListener = mocks.menuCallbacks[0];

    mocks.currentUser = makeUser('user-b');
    mocks.authListener(mocks.currentUser);
    expect(store.getStoreState()).toMatchObject({
      userId: 'user-b',
      tenantId: null,
      menuItems: [],
    });

    await vi.waitFor(() => {
      expect(store.getStoreState().menuItems).toEqual([
        { menuItemId: 'user-b-tenant-a' },
      ]);
    });
    oldListener?.([{ menuItemId: 'stale-user-a' } as CatalogMenuItem]);
    expect(store.getStoreState().menuItems).toEqual([
      { menuItemId: 'user-b-tenant-a' },
    ]);
    release();
  });

  it('clears on tenant and membership-role changes and ignores prior results', async () => {
    const store = await import('./tenantStore');
    const release = store.acquireSlice('menuItems');
    await vi.waitFor(() => {
      expect(store.getStoreState().menuItems).toEqual([
        { menuItemId: 'user-a-tenant-a' },
      ]);
    });
    const oldTenantListener = mocks.menuCallbacks[0];

    mocks.currentTenantId = 'tenant-b';
    mocks.profileListener('tenant-b');
    await vi.waitFor(() => {
      expect(store.getStoreState()).toMatchObject({
        userId: 'user-a',
        tenantId: 'tenant-b',
        menuItems: [{ menuItemId: 'user-a-tenant-b' }],
      });
    });

    oldTenantListener?.([{ menuItemId: 'stale-tenant-a' } as CatalogMenuItem]);
    expect(store.getStoreState().menuItems).toEqual([
      { menuItemId: 'user-a-tenant-b' },
    ]);

    const beforeRoleChange = mocks.menuCallbacks.length;
    mocks.currentMembership = makeMembership(['kitchen']);
    mocks.membershipListener(mocks.currentMembership);
    await vi.waitFor(() => {
      expect(mocks.menuCallbacks.length).toBe(beforeRoleChange + 1);
    });
    expect(store.getStoreState()).toMatchObject({
      tenantId: 'tenant-b',
      menuItems: [{ menuItemId: 'user-a-tenant-b' }],
    });
    release();
  });
});
