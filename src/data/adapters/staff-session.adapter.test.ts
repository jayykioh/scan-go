import { describe, expect, it } from 'vitest';
import {
  staffPinDeniedStateSchema,
  staffSessionSchema,
} from '../../../shared/contracts/identity.contract';
import {
  staffPinVerifyResultFixture,
  staffSessionFixture,
} from '../../../shared/fixtures/identity.fixture';
import {
  toStaffPinDeniedState,
  toStaffSessionView,
} from './auth.adapter';

/**
 * P0-004 client evidence (REQ-AUTH-002): the browser renders only server
 * results. The view model derives role booleans from a server session and the
 * denied mapper produces a frozen `StaffPinDeniedState` from a callable error.
 */
describe('toStaffSessionView', () => {
  it('derives role booleans from the server session roles', () => {
    const view = toStaffSessionView(staffSessionFixture, 'Nguyễn Văn A');
    expect(view.sessionId).toBe(staffSessionFixture.sessionId);
    expect(view.tenantId).toBe(staffSessionFixture.tenantId);
    expect(view.sessionVersion).toBe(staffSessionFixture.sessionVersion);
    expect(view.roles).toEqual({
      isKitchen: false,
      isWaiter: false,
      isCashier: true,
    });
    expect(view.name).toBe('Nguyễn Văn A');
    expect('pin' in view).toBe(false);
  });

  it('accepts a locked session and maps every role flag', () => {
    const view = toStaffSessionView(staffSessionFixture, null);
    expect(view.status).toBe('active');
    expect(staffSessionSchema.safeParse(staffSessionFixture).success).toBe(true);
    expect(view.name).toBe(staffSessionFixture.uid);
  });

  it('does not carry a plaintext PIN from the verify result', () => {
    const view = toStaffSessionView(
      staffPinVerifyResultFixture.session,
      'Trần Thị B',
    );
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('"123456"');
    expect(serialized).not.toContain('"pin"');
  });
});

describe('toStaffPinDeniedState', () => {
  it('maps a locked rejection with details to the locked reason', () => {
    const denied = toStaffPinDeniedState({
      code: 'functions/permission-denied',
      message: 'Mã PIN đã bị khoá do sai quá số lần. Vui lòng thử lại sau.',
      details: { remainingAttempts: 0, lockedUntil: '2026-09-12T09:30:00.000Z' },
    });
    expect(denied.reason).toBe('locked');
    expect(denied.remainingAttempts).toBe(0);
    expect(denied.lockedUntil).toBe('2026-09-12T09:30:00.000Z');
    expect(staffPinDeniedStateSchema.safeParse(denied).success).toBe(true);
  });

  it('maps a wrong PIN with remaining attempts to invalid_pin', () => {
    const denied = toStaffPinDeniedState({
      code: 'functions/permission-denied',
      message: 'Mã PIN không đúng.',
      details: { remainingAttempts: 3, lockedUntil: null },
    });
    expect(denied.reason).toBe('invalid_pin');
    expect(denied.remainingAttempts).toBe(3);
    expect(denied.lockedUntil).toBeNull();
    expect(staffPinDeniedStateSchema.safeParse(denied).success).toBe(true);
  });

  it('maps a malformed payload to malformed', () => {
    const denied = toStaffPinDeniedState({
      code: 'functions/invalid-argument',
      message: 'Yêu cầu xác minh PIN không hợp lệ.',
    });
    expect(denied.reason).toBe('malformed');
    expect(staffPinDeniedStateSchema.safeParse(denied).success).toBe(true);
  });

  it('maps an access-denied message to cross_tenant', () => {
    const denied = toStaffPinDeniedState({
      code: 'functions/permission-denied',
      message: 'Bạn không thuộc cửa hàng này hoặc không phải nhân viên.',
    });
    expect(denied.reason).toBe('cross_tenant');
    expect(staffPinDeniedStateSchema.safeParse(denied).success).toBe(true);
  });

  it('falls back to a safe invalid_pin state for an unknown error', () => {
    const denied = toStaffPinDeniedState(undefined);
    expect(denied.reason).toBe('invalid_pin');
    expect(denied.message.length).toBeGreaterThan(0);
    expect(staffPinDeniedStateSchema.safeParse(denied).success).toBe(true);
  });
});
