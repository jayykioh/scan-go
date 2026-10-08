import { describe, expect, it } from 'vitest';
import {
  assertActiveOwnerMember,
  buildStaffMembershipDocument,
  computeNextSessionVersion,
  parseStaffCreateInput,
  parseStaffResetPinInput,
  toStaffAccount,
} from './service.js';

const NOW = '2026-10-02T03:00:00.000Z';

describe('staff membership document', () => {
  it('stores a staff membership without the plaintext PIN', () => {
    const doc = buildStaffMembershipDocument({
      uid: 'uid-1',
      email: 'kitchen@shop.vn',
      displayName: 'Bếp Minh',
      roles: ['kitchen'],
      permissions: ['order.read'],
      pinHash: 'scrypt$abc$def',
      now: NOW,
    });
    expect(doc.membershipType).toBe('staff');
    expect(doc.isActive).toBe(true);
    expect(doc.sessionVersion).toBe(1);
    expect(doc.staffPinHash).toBe('scrypt$abc$def');
    expect(doc).not.toHaveProperty('pin');
  });
});

describe('toStaffAccount', () => {
  it('maps a stored membership to the frozen contract', () => {
    const staff = toStaffAccount('tenant-a', 'uid-1', {
      membershipType: 'staff',
      email: 'kitchen@shop.vn',
      displayName: 'Bếp Minh',
      roles: ['kitchen', 'unknown_role'],
      permissions: ['order.read'],
      isActive: true,
      staffPinHash: 'scrypt$abc$def',
      lastLoginAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(staff.roles).toEqual(['kitchen']);
    expect(staff.hasPin).toBe(true);
    expect(staff.isActive).toBe(true);
    expect(staff.lastLoginAt).toBe(NOW);
  });

  it('reports hasPin false and a safe role default when fields are missing', () => {
    const staff = toStaffAccount('tenant-a', 'uid-2', {});
    expect(staff.hasPin).toBe(false);
    expect(staff.roles).toEqual(['cashier']);
    expect(staff.isActive).toBe(true);
  });
});

describe('input parsing', () => {
  it('accepts a valid staff create payload', () => {
    const input = parseStaffCreateInput({
      tenantId: 'tenant-a',
      email: 'waiter@shop.vn',
      password: 'secret123',
      displayName: 'Phục vụ Lan',
      roles: ['waiter'],
      pin: '123456',
    });
    expect(input.permissions).toEqual([]);
    expect(input.roles).toEqual(['waiter']);
  });

  it('rejects a bad email or a non-numeric PIN', () => {
    expect(() =>
      parseStaffCreateInput({
        tenantId: 'tenant-a',
        email: 'not-an-email',
        password: 'secret123',
        displayName: 'X',
        roles: ['cashier'],
        pin: '123456',
      }),
    ).toThrow();
    expect(() =>
      parseStaffResetPinInput({
        tenantId: 'tenant-a',
        uid: 'uid-1',
        pin: 'abc',
      }),
    ).toThrow();
  });
});

describe('owner gate', () => {
  it('allows an active owner and denies staff or inactive members', () => {
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'staff', isActive: true }),
    ).toThrow();
    expect(() =>
      assertActiveOwnerMember({ membershipType: 'owner', isActive: false }),
    ).toThrow();
    expect(() => assertActiveOwnerMember(undefined)).toThrow();
  });
});

describe('session versioning', () => {
  it('increments a valid version and starts at one otherwise', () => {
    expect(computeNextSessionVersion(3)).toBe(4);
    expect(computeNextSessionVersion(undefined)).toBe(1);
    expect(computeNextSessionVersion('x')).toBe(1);
  });
});
