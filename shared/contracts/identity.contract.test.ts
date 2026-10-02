import { describe, expect, it } from 'vitest';
import {
  bootstrapTenantResultSchema,
  firebaseIdentitySchema,
  membershipSchema,
  staffPinDeniedStateSchema,
  staffPinVerifyResultSchema,
  staffSessionSchema,
} from './identity.contract.js';
import {
  adminIdentityFixture,
  bootstrapTenantResultFixture,
  firebaseIdentityFixture,
  invalidStaffPinDeniedStateFixture,
  lockedStaffPinDeniedStateFixture,
  lockedStaffSessionFixture,
  ownerMembershipFixture,
  staffMembershipFixture,
  staffPinVerifyResultFixture,
  staffSessionFixture,
} from '../fixtures/identity.fixture.js';

describe('FirebaseIdentity contract', () => {
  it('accepts the identity fixtures', () => {
    expect(firebaseIdentitySchema.safeParse(firebaseIdentityFixture).success).toBe(
      true,
    );
    expect(firebaseIdentitySchema.safeParse(adminIdentityFixture).success).toBe(
      true,
    );
  });

  it('accepts the membership fixtures', () => {
    expect(membershipSchema.safeParse(ownerMembershipFixture).success).toBe(true);
    expect(membershipSchema.safeParse(staffMembershipFixture).success).toBe(true);
  });

  it('accepts the bootstrap result fixture', () => {
    expect(
      bootstrapTenantResultSchema.safeParse(bootstrapTenantResultFixture)
        .success,
    ).toBe(true);
  });

  it('rejects a missing uid and an unknown locale', () => {
    expect(
      firebaseIdentitySchema.safeParse({ ...firebaseIdentityFixture, uid: '' })
        .success,
    ).toBe(false);
    expect(
      firebaseIdentitySchema.safeParse({
        ...firebaseIdentityFixture,
        locale: 'fr',
      }).success,
    ).toBe(false);
  });

  it('ignores unknown keys from stored documents', () => {
    const parsed = firebaseIdentitySchema.safeParse({
      ...firebaseIdentityFixture,
      rogue: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && 'rogue' in parsed.data).toBe(false);
  });
});

describe('StaffSession contract', () => {
  it('accepts the active and locked session fixtures', () => {
    expect(staffSessionSchema.safeParse(staffSessionFixture).success).toBe(true);
    expect(staffSessionSchema.safeParse(lockedStaffSessionFixture).success).toBe(
      true,
    );
  });

  it('accepts the PIN verify result fixture', () => {
    expect(
      staffPinVerifyResultSchema.safeParse(staffPinVerifyResultFixture).success,
    ).toBe(true);
  });

  it('rejects a negative sessionVersion', () => {
    expect(
      staffSessionSchema.safeParse({
        ...staffSessionFixture,
        sessionVersion: -1,
      }).success,
    ).toBe(false);
  });
});

describe('StaffPinDeniedState contract', () => {
  it('accepts locked and invalid-PIN denied states', () => {
    expect(
      staffPinDeniedStateSchema.safeParse(lockedStaffPinDeniedStateFixture)
        .success,
    ).toBe(true);
    expect(
      staffPinDeniedStateSchema.safeParse(invalidStaffPinDeniedStateFixture)
        .success,
    ).toBe(true);
  });

  it('rejects an unknown reason and a negative remaining attempt count', () => {
    expect(
      staffPinDeniedStateSchema.safeParse({
        ...lockedStaffPinDeniedStateFixture,
        reason: 'exploded',
      }).success,
    ).toBe(false);
    expect(
      staffPinDeniedStateSchema.safeParse({
        ...invalidStaffPinDeniedStateFixture,
        remainingAttempts: -1,
      }).success,
    ).toBe(false);
  });
});
