import { describe, expect, it } from 'vitest';
import { mapAuthError } from './auth.adapter';

describe('mapAuthError', () => {
  it('maps known Firebase Auth codes to stable messages', () => {
    expect(mapAuthError({ code: 'auth/email-already-in-use' })).toBe(
      'Email này đã được đăng ký.',
    );
    expect(mapAuthError({ code: 'auth/invalid-credential' })).toBe(
      'Email hoặc mật khẩu không đúng.',
    );
    expect(mapAuthError({ code: 'auth/weak-password' })).toBe(
      'Mật khẩu phải có ít nhất 6 ký tự.',
    );
  });

  it('prefers the server message for a callable error', () => {
    expect(
      mapAuthError({
        code: 'functions/failed-precondition',
        message: 'Tài khoản Owner phải dùng email và mật khẩu.',
      }),
    ).toBe('Tài khoản Owner phải dùng email và mật khẩu.');
  });

  it('falls back to the error message for an unknown code', () => {
    expect(
      mapAuthError({ code: 'auth/unknown-code', message: 'Chi tiết lỗi.' }),
    ).toBe('Chi tiết lỗi.');
  });

  it('handles a plain Error and an unknown value', () => {
    expect(mapAuthError(new Error('Lỗi mạng.'))).toBe('Lỗi mạng.');
    expect(mapAuthError(undefined)).toBe('Đã xảy ra lỗi. Vui lòng thử lại.');
  });
});
