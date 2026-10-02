import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  authorizationDecisionSchema,
  staffAuthorizationRequestSchema,
} from '../../../../shared/contracts/authorization.contract.js';
import {
  ownerRegistrationInputSchema,
  staffSessionSchema,
} from '../../../../shared/contracts/identity.contract.js';
import {
  computeNextSessionVersion,
  decideAuthorization,
  isSessionVersionCurrent,
  mapAuthorizationMembership,
  type AuthorizationMembership,
} from '../tenant/service.js';
import {
  REGISTRATION_EMAIL_REQUIRED_MESSAGE,
  REGISTRATION_INVALID_MESSAGE,
  STAFF_PIN_INVALID_REQUEST_MESSAGE,
  buildStaffSession,
  computePinFailureState,
  hashPin,
  isPinLocked,
  parseOwnerRegistrationInput,
  parseStaffAuthorizationInput,
  parseStaffPinVerifyInput,
  parseStaffSessionRevokeInput,
  pinRemainingAttempts,
  requireRegistrationEmail,
  verifyPinHash,
  type PinPolicy,
} from './service.js';

function captureHttpsError(run: () => unknown): HttpsError {
  try {
    run();
  } catch (error) {
    if (error instanceof HttpsError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an HttpsError to be thrown.');
}

describe('ownerRegistrationInputSchema', () => {
  it('accepts a valid shop name and an optional display name', () => {
    expect(
      ownerRegistrationInputSchema.safeParse({
        shopName: 'Phở Kinh Kỳ',
        displayName: 'Nguyễn Văn Nam',
      }).success,
    ).toBe(true);
    expect(
      ownerRegistrationInputSchema.safeParse({
        shopName: 'Phở Kinh Kỳ',
        displayName: null,
      }).success,
    ).toBe(true);
    expect(
      ownerRegistrationInputSchema.safeParse({ shopName: 'Phở Kinh Kỳ' })
        .success,
    ).toBe(true);
  });

  it('trims the shop and display names', () => {
    const parsed = ownerRegistrationInputSchema.parse({
      shopName: '  Quán Mới  ',
      displayName: '  Chủ quán  ',
    });
    expect(parsed.shopName).toBe('Quán Mới');
    expect(parsed.displayName).toBe('Chủ quán');
  });

  it('rejects an empty, missing, or over-long shop name', () => {
    expect(
      ownerRegistrationInputSchema.safeParse({ shopName: '   ' }).success,
    ).toBe(false);
    expect(ownerRegistrationInputSchema.safeParse({}).success).toBe(false);
    expect(
      ownerRegistrationInputSchema.safeParse({
        shopName: 'x'.repeat(121),
      }).success,
    ).toBe(false);
  });

  it('rejects a non-string shop or display name', () => {
    expect(
      ownerRegistrationInputSchema.safeParse({ shopName: 42 }).success,
    ).toBe(false);
    expect(
      ownerRegistrationInputSchema.safeParse({
        shopName: 'Quán',
        displayName: 7,
      }).success,
    ).toBe(false);
  });
});

describe('parseOwnerRegistrationInput', () => {
  it('returns the validated and trimmed contract input', () => {
    expect(
      parseOwnerRegistrationInput({ shopName: ' Quán Mới ', displayName: null }),
    ).toEqual({ shopName: 'Quán Mới', displayName: null });
  });

  it('maps a malformed callable payload to invalid-argument', () => {
    const error = captureHttpsError(() => parseOwnerRegistrationInput('nope'));
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe(REGISTRATION_INVALID_MESSAGE);
  });

  it('maps an invalid field to invalid-argument without a partial result', () => {
    const error = captureHttpsError(() =>
      parseOwnerRegistrationInput({ shopName: '' }),
    );
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe(REGISTRATION_INVALID_MESSAGE);
  });

  it('rejects an empty payload', () => {
    const error = captureHttpsError(() => parseOwnerRegistrationInput(undefined));
    expect(error.code).toBe('invalid-argument');
  });
});

describe('requireRegistrationEmail', () => {
  it('returns the authenticated email', () => {
    expect(requireRegistrationEmail('owner@example.com')).toBe(
      'owner@example.com',
    );
  });

  it('maps a missing email to failed-precondition', () => {
    const error = captureHttpsError(() => requireRegistrationEmail(null));
    expect(error.code).toBe('failed-precondition');
    expect(error.message).toBe(REGISTRATION_EMAIL_REQUIRED_MESSAGE);
  });
});

const POLICY: PinPolicy = {
  length: 6,
  maxFailedAttempts: 5,
  lockMinutes: 15,
  sessionHours: 8,
};

const NOW = new Date('2026-09-12T09:00:00.000Z');

describe('PIN hashing and verification', () => {
  it('stores a salted scrypt hash without the plaintext PIN', async () => {
    const hash = await hashPin('123456');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hash).not.toContain('123456');
  });

  it('verifies the correct PIN and rejects a wrong PIN', async () => {
    const hash = await hashPin('123456');
    await expect(verifyPinHash('123456', hash)).resolves.toBe(true);
    await expect(verifyPinHash('654321', hash)).resolves.toBe(false);
  });

  it('uses a fixed salt deterministically for reproducible hashes', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const first = await hashPin('123456', salt);
    const second = await hashPin('123456', salt);
    expect(first).toBe(second);
    await expect(verifyPinHash('123456', first)).resolves.toBe(true);
  });

  it('rejects a missing or malformed stored hash without throwing', async () => {
    await expect(verifyPinHash('123456', null)).resolves.toBe(false);
    await expect(verifyPinHash('123456', '')).resolves.toBe(false);
    await expect(verifyPinHash('123456', 'plaintext')).resolves.toBe(false);
    await expect(
      verifyPinHash('123456', 'bcrypt$aa$bb'),
    ).resolves.toBe(false);
  });
});

describe('PIN lockout state', () => {
  it('reports a lock only while pinLockedUntil is in the future', () => {
    expect(isPinLocked('2026-09-12T09:15:00.000Z', NOW)).toBe(true);
    expect(isPinLocked('2026-09-12T08:45:00.000Z', NOW)).toBe(false);
    expect(isPinLocked(null, NOW)).toBe(false);
    expect(isPinLocked('not-a-date', NOW)).toBe(false);
  });

  it('counts failures and locks for lockMinutes at the attempt limit', () => {
    const first = computePinFailureState(0, POLICY, NOW);
    expect(first).toEqual({ failedAttempts: 1, lockedUntil: null });

    const fourth = computePinFailureState(3, POLICY, NOW);
    expect(fourth).toEqual({ failedAttempts: 4, lockedUntil: null });

    const fifth = computePinFailureState(4, POLICY, NOW);
    expect(fifth.failedAttempts).toBe(5);
    expect(fifth.lockedUntil).toBe('2026-09-12T09:15:00.000Z');
  });

  it('computes the remaining attempts from the configured maximum', () => {
    expect(pinRemainingAttempts(1, 5)).toBe(4);
    expect(pinRemainingAttempts(5, 5)).toBe(0);
    expect(pinRemainingAttempts(6, 5)).toBe(0);
  });
});

describe('Staff session build', () => {
  it('binds tenant, device, sessionVersion, and the configured expiry', () => {
    const session = buildStaffSession({
      sessionId: 'session-fixed',
      tenantId: 'tenant-alpha',
      uid: 'staff-uid',
      deviceId: 'device-1',
      roles: ['cashier'],
      permissions: ['order.settle'],
      sessionVersion: 3,
      policy: POLICY,
      issuedAt: '2026-09-12T09:00:00.000Z',
    });

    expect(session.sessionId).toBe('session-fixed');
    expect(session.tenantId).toBe('tenant-alpha');
    expect(session.deviceId).toBe('device-1');
    expect(session.sessionVersion).toBe(3);
    expect(session.status).toBe('active');
    expect(session.issuedAt).toBe('2026-09-12T09:00:00.000Z');
    expect(session.expiresAt).toBe('2026-09-12T17:00:00.000Z');
    expect(session.pinPolicy).toEqual(POLICY);
    expect(staffSessionSchema.safeParse(session).success).toBe(true);
  });
});

describe('Staff PIN and authorization input parsing', () => {
  it('maps a malformed PIN verify request to invalid-argument', () => {
    const error = captureHttpsError(() => parseStaffPinVerifyInput('nope'));
    expect(error.code).toBe('invalid-argument');
    expect(error.message).toBe(STAFF_PIN_INVALID_REQUEST_MESSAGE);
  });

  it('accepts a well-formed PIN verify request', () => {
    expect(
      parseStaffPinVerifyInput({
        tenantId: 'tenant-alpha',
        deviceId: 'device-1',
        pin: '123456',
      }),
    ).toEqual({
      tenantId: 'tenant-alpha',
      deviceId: 'device-1',
      pin: '123456',
    });
  });

  it('rejects an authorization request without a sessionVersion', () => {
    expect(() =>
      parseStaffAuthorizationInput({
        tenantId: 'tenant-alpha',
        permission: 'order.settle',
      }),
    ).toThrow(HttpsError);
  });

  it('accepts a strict authorization request with a sessionVersion', () => {
    expect(
      parseStaffAuthorizationInput({
        tenantId: 'tenant-alpha',
        permission: 'order.settle',
        sessionVersion: 3,
      }),
    ).toEqual({
      tenantId: 'tenant-alpha',
      permission: 'order.settle',
      sessionVersion: 3,
    });
    expect(
      staffAuthorizationRequestSchema.safeParse({
        tenantId: 'tenant-alpha',
        permission: 'order.settle',
        sessionVersion: 3,
      }).success,
    ).toBe(true);
  });

  it('rejects a malformed revoke request', () => {
    expect(() => parseStaffSessionRevokeInput({ tenantId: 't' })).toThrow(
      HttpsError,
    );
  });
});

describe('sessionVersion revocation', () => {
  it('increments a valid stored version and defaults a missing one', () => {
    expect(computeNextSessionVersion(3)).toBe(4);
    expect(computeNextSessionVersion(0)).toBe(1);
    expect(computeNextSessionVersion(undefined)).toBe(1);
    expect(computeNextSessionVersion(-2)).toBe(1);
  });

  it('matches only the current membership version', () => {
    expect(isSessionVersionCurrent(3, 3)).toBe(true);
    expect(isSessionVersionCurrent(3, 2)).toBe(false);
  });
});

describe('authorization decision matrix', () => {
  function decide(
    overrides: Partial<{
      membership: AuthorizationMembership | undefined;
      sessionVersion: number | null;
      isAdmin: boolean;
      permission: string | null;
    }> = {},
  ) {
    return decideAuthorization({
      uid: 'staff-uid',
      tenantId: 'tenant-alpha',
      permission: 'order.settle',
      sessionVersion: 3,
      membership: {
        isActive: true,
        membershipType: 'staff',
        roles: ['cashier'],
        permissions: ['order.settle'],
        sessionVersion: 3,
      },
      isAdmin: false,
      decidedAt: '2026-09-12T09:00:00.000Z',
      ...overrides,
    });
  }

  it('allows a current, active membership with the named permission', () => {
    const decision = decide();
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('allowed');
    expect(decision.role).toBe('cashier');
    expect(decision.grantedPermissions).toEqual(['order.settle']);
    expect(authorizationDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it('denies a missing permission despite an active membership', () => {
    const decision = decide({ permission: 'menu.manage' });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
  });

  it('denies a membership with no role', () => {
    const decision = decide({
      membership: {
        isActive: true,
        membershipType: 'staff',
        roles: [],
        permissions: ['order.settle'],
        sessionVersion: 3,
      },
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('missing_permission');
    expect(decision.role).toBeNull();
  });

  it('denies an absent, inactive, or revoked membership', () => {
    expect(decide({ membership: undefined }).reason).toBe('no_membership');
    expect(
      decide({
        membership: {
          isActive: false,
          membershipType: 'staff',
          roles: ['cashier'],
          permissions: ['order.settle'],
          sessionVersion: 3,
        },
      }).reason,
    ).toBe('inactive_membership');
    expect(decide({ sessionVersion: 999 }).reason).toBe('session_revoked');
  });

  it('allows and audits an ADMIN bypass without tenant membership', () => {
    const decision = decide({ membership: undefined, isAdmin: true });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('admin_bypass');
    expect(decision.isAdminBypass).toBe(true);
    expect(decision.isAudited).toBe(true);
    expect(authorizationDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it('maps stored membership data with safe defaults', () => {
    expect(mapAuthorizationMembership(undefined)).toBeUndefined();
    expect(
      mapAuthorizationMembership({
        membershipType: 'staff',
        roles: ['kitchen'],
        permissions: ['order.transition'],
        isActive: true,
        sessionVersion: 2,
      }),
    ).toEqual({
      isActive: true,
      membershipType: 'staff',
      roles: ['kitchen'],
      permissions: ['order.transition'],
      sessionVersion: 2,
    });
    expect(
      mapAuthorizationMembership({ membershipType: 'strange' })?.membershipType,
    ).toBe('owner');
  });
});
