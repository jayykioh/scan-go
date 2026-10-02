/**
 * Ordering public write callable App Check boundary (NFR-SEC-001, CON-002).
 *
 * The Functions Emulator skips App Check, so this test toggles the environment
 * and calls the real callable handler through `.run()`. It proves the public
 * Order submission outside the emulator skip path rejects a missing token,
 * while the emulator path still reaches input validation.
 *
 * Run with the root script:
 *   npm run test:emulator
 */
import { afterEach, describe, expect, it } from 'vitest';
import { callableOrderSubmit } from '../../src/modules/ordering/index.js';

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

function runOrderSubmit(data: unknown): Promise<unknown> {
  return callableOrderSubmit.run({
    data,
    rawRequest: {},
    acceptsStreaming: false,
  } as never);
}

afterEach(restoreEnv);

describe('callableOrderSubmit App Check boundary', () => {
  it('rejects a missing App Check token outside the emulator skip path', async () => {
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.ENFORCE_APP_CHECK;

    await expect(
      runOrderSubmit({
        token: 'token-1',
        paymentMode: 'payLater',
        idempotencyKey: 'idem-public-0001',
        lines: [{ menuItemId: 'item-pho-bo-001', quantity: 1, selectedOptionIds: [] }],
      }),
    ).rejects.toMatchObject({ code: 'failed-precondition' });
  });

  it('skips the token check on the emulator path', async () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    delete process.env.ENFORCE_APP_CHECK;

    await expect(runOrderSubmit({})).rejects.toMatchObject({
      code: 'invalid-argument',
    });
  });
});
