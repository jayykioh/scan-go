import { describe, expect, it } from 'vitest';
import {
  isTenantOwner,
  ownerConsoleRedirect,
  STAFF_HOME_PATH,
  type ActiveMembership,
} from './useActiveMembership';

function membership(overrides: Partial<ActiveMembership>): ActiveMembership {
  return {
    userId: 'owner-1',
    tenantId: 'tenant-a',
    name: 'Chủ quán',
    membershipType: 'owner',
    roles: ['owner'],
    isActive: true,
    resolved: true,
    ...overrides,
  };
}

describe('isTenantOwner', () => {
  it('accepts an active Owner membership that has resolved', () => {
    expect(isTenantOwner(membership({}))).toBe(true);
  });

  it('rejects a Staff, inactive, unknown, or unresolved membership', () => {
    expect(
      isTenantOwner(membership({ membershipType: 'staff', roles: ['waiter'] })),
    ).toBe(false);
    expect(isTenantOwner(membership({ isActive: false }))).toBe(false);
    expect(isTenantOwner(membership({ membershipType: null }))).toBe(false);
    expect(isTenantOwner(membership({ resolved: false }))).toBe(false);
  });
});

describe('ownerConsoleRedirect', () => {
  it('sends a Staff membership to the Staff working surface', () => {
    expect(
      ownerConsoleRedirect(
        membership({ membershipType: 'staff', roles: ['cashier'] }),
      ),
    ).toBe(STAFF_HOME_PATH);
  });

  it('lets the Owner through', () => {
    expect(ownerConsoleRedirect(membership({}))).toBe(null);
  });

  it('leaves an unresolved, inactive, or unknown membership where it is', () => {
    expect(ownerConsoleRedirect(membership({ resolved: false }))).toBe(null);
    expect(ownerConsoleRedirect(membership({ isActive: false }))).toBe(null);
    expect(ownerConsoleRedirect(membership({ membershipType: null }))).toBe(
      null,
    );
  });
});
