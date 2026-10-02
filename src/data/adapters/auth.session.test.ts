import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'firebase/auth';
import { bootstrapTenantResultFixture } from '../../../shared/fixtures/identity.fixture';

/**
 * P0-002A session evidence (REQ-AUTH-001, REQ-TEN-001): sign-in restores the
 * authenticated session and the flow reuses the idempotent Tenant bootstrap, so
 * a returning Owner never creates another first Tenant.
 */
const mocks = vi.hoisted(() => ({
  signInWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  bootstrapTenant: vi.fn(),
  getFirebaseAuth: vi.fn(),
  getFirebaseFunctions: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: (...args: unknown[]) =>
    mocks.onAuthStateChanged(...args),
  signInWithEmailAndPassword: (...args: unknown[]) =>
    mocks.signInWithEmailAndPassword(...args),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('./tenant.adapter', () => ({
  bootstrapTenant: (...args: unknown[]) => mocks.bootstrapTenant(...args),
}));

const fakeAuth = { currentUser: null };
vi.mock('../../services/firebase/client', () => ({
  getFirebaseAuth: () => mocks.getFirebaseAuth(),
  getFirebaseFunctions: () => mocks.getFirebaseFunctions(),
}));

import {
  signInOwnerAndRestoreTenant,
  subscribeToIdentity,
} from './auth.adapter';

const OWNER_USER = {
  uid: 'uid-owner',
  email: 'owner@example.com',
} as User;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getFirebaseAuth.mockReturnValue(fakeAuth);
  mocks.getFirebaseFunctions.mockReturnValue({});
});

describe('subscribeToIdentity', () => {
  it('restores the authenticated session from onAuthStateChanged', () => {
    let captured: ((user: User | null) => void) | undefined;
    mocks.onAuthStateChanged.mockImplementation(
      (_auth: unknown, listener: (user: User | null) => void) => {
        captured = listener;
        return () => undefined;
      },
    );
    const listener = vi.fn();

    const unsubscribe = subscribeToIdentity(listener);
    expect(mocks.onAuthStateChanged).toHaveBeenCalledTimes(1);

    captured?.(OWNER_USER);
    expect(listener).toHaveBeenCalledWith(OWNER_USER);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });
});

describe('signInOwnerAndRestoreTenant', () => {
  it('signs in and reuses the existing first Tenant on every sign-in', async () => {
    mocks.signInWithEmailAndPassword.mockResolvedValue({ user: OWNER_USER });
    mocks.bootstrapTenant.mockResolvedValue(bootstrapTenantResultFixture);

    const first = await signInOwnerAndRestoreTenant(
      'owner@example.com',
      'password123',
    );
    const second = await signInOwnerAndRestoreTenant(
      'owner@example.com',
      'password123',
    );

    expect(first.user).toBe(OWNER_USER);
    expect(first.tenant).toEqual(bootstrapTenantResultFixture);
    // A second sign-in returns the same first Tenant instead of creating one.
    expect(second.tenant.membership.tenantId).toBe(
      first.tenant.membership.tenantId,
    );
    // Only the idempotent bootstrap callable provisions the session Tenant.
    expect(mocks.bootstrapTenant).toHaveBeenCalledTimes(2);
  });
});
