import { describe, expect, it } from 'vitest';
import {
  signedInRedirect,
  SIGNED_IN_HOME_PATH,
  type AuthSessionState,
} from './useAuthSession';

function session(overrides: Partial<AuthSessionState>): AuthSessionState {
  return { configured: true, loading: false, user: null, ...overrides };
}

const signedIn = { uid: 'user-1' } as unknown as AuthSessionState['user'];

describe('signedInRedirect', () => {
  it('sends a settled session to its home instead of an entry screen', () => {
    expect(signedInRedirect(session({ user: signedIn }))).toBe(
      SIGNED_IN_HOME_PATH,
    );
  });

  it('leaves the entry screen alone while the session is still unknown', () => {
    expect(signedInRedirect(session({ loading: true, user: signedIn }))).toBe(
      null,
    );
  });

  it('leaves a signed-out visitor and an unconfigured build where they are', () => {
    expect(signedInRedirect(session({}))).toBe(null);
    expect(signedInRedirect(session({ configured: false }))).toBe(null);
  });
});
