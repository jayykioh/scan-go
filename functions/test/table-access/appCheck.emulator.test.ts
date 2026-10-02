/**
 * Table Access public callable App Check boundary (NFR-SEC-001, CON-002).
 *
 * The Functions Emulator skips App Check, so this test toggles the environment
 * and calls the real callable handler through `.run()`. It proves a public
 * Table Access call outside the emulator skip path rejects a missing token,
 * while the emulator path still reaches input validation.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import { afterEach, describe, expect, it } from 'vitest';
import { callableTableResolvePublic } from '../../src/modules/table-access/index.js';

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

function runResolvePublic(data: unknown): Promise<unknown> {
  return callableTableResolvePublic.run({
    data,
    rawRequest: {},
    acceptsStreaming: false,
  } as never);
}

afterEach(restoreEnv);

describe('callableTableResolvePublic App Check boundary', () => {
  it('rejects a missing App Check token outside the emulator skip path', async () => {
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.ENFORCE_APP_CHECK;

    await expect(
      runResolvePublic({ token: 'token-1', tenantId: null }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('skips the token check on the emulator path', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.ENFORCE_APP_CHECK;

    await expect(runResolvePublic({})).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
