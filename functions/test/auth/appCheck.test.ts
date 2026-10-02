/**
 * App Check boundary unit evidence (NFR-SEC-001, CON-002).
 *
 * The Functions Emulator skips App Check, so this unit test toggles the
 * environment to prove the production path rejects a missing token while the
 * emulator path still allows emulator callables to run.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertAppCheck,
  isAppCheckEnforced,
} from '../../src/shared/appCheck.js';

const ORIGINAL_EMULATOR = process.env.FUNCTIONS_EMULATOR;
const ORIGINAL_ENFORCE = process.env.ENFORCE_APP_CHECK;

function restoreEnv(): void {
  if (ORIGINAL_EMULATOR === undefined) {
    delete process.env.FUNCTIONS_EMULATOR;
  } else {
    process.env.FUNCTIONS_EMULATOR = ORIGINAL_EMULATOR;
  }
  if (ORIGINAL_ENFORCE === undefined) {
    delete process.env.ENFORCE_APP_CHECK;
  } else {
    process.env.ENFORCE_APP_CHECK = ORIGINAL_ENFORCE;
  }
}

function captureError(run: () => void): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error('Expected assertAppCheck to reject.');
}

afterEach(restoreEnv);

describe('assertAppCheck outside the emulator path', () => {
  it('rejects a callable request without an App Check token', () => {
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.ENFORCE_APP_CHECK;

    expect(isAppCheckEnforced()).toBe(true);
    const error = captureError(() => assertAppCheck({}));
    expect(error).toBeInstanceOf(HttpsError);
    expect((error as HttpsError).code).toBe('failed-precondition');
  });

  it('accepts a request with a valid App Check token', () => {
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.ENFORCE_APP_CHECK;

    expect(() => assertAppCheck({ app: {} })).not.toThrow();
  });

  it('skips enforcement when ENFORCE_APP_CHECK is explicit false', () => {
    delete process.env.FUNCTIONS_EMULATOR;
    process.env.ENFORCE_APP_CHECK = 'false';

    expect(isAppCheckEnforced()).toBe(false);
    expect(() => assertAppCheck({})).not.toThrow();
  });
});

describe('assertAppCheck in the emulator path', () => {
  it('skips a missing token so emulator callables still work', () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.ENFORCE_APP_CHECK;

    expect(isAppCheckEnforced()).toBe(false);
    expect(() => assertAppCheck({})).not.toThrow();
  });
});
