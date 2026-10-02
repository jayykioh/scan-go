import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  automaticPaymentAdapter,
  buildProviderSignature,
  fakePaymentAdapter,
  manualPaymentAdapter,
  resolvePaymentSigningSecret,
} from './provider.js';

const SECRET = 'unit-test-signing-secret';
const PAYLOAD = {
  providerEventId: 'evt-1',
  tenantId: 'tenant-a',
  orderId: 'order-1',
  amountVnd: 100000,
  outcome: 'settled' as const,
};

let previousSecret: string | undefined;

beforeAll(() => {
  previousSecret = process.env.PAYMENT_PROVIDER_SIGNING_SECRET;
  process.env.PAYMENT_PROVIDER_SIGNING_SECRET = SECRET;
});

afterAll(() => {
  if (previousSecret === undefined) {
    delete process.env.PAYMENT_PROVIDER_SIGNING_SECRET;
  } else {
    process.env.PAYMENT_PROVIDER_SIGNING_SECRET = previousSecret;
  }
});

describe('automatic payment adapter signature seam', () => {
  it('resolves the configured secret and signs deterministically', () => {
    expect(resolvePaymentSigningSecret()).toBe(SECRET);
    expect(buildProviderSignature(PAYLOAD, SECRET)).toBe(
      buildProviderSignature(PAYLOAD, SECRET),
    );
  });

  it('accepts a valid signature and rejects a forged one', () => {
    const signature = buildProviderSignature(PAYLOAD, SECRET);
    expect(
      automaticPaymentAdapter.verifySignature?.({ payload: PAYLOAD, signature }),
    ).toBe(true);
    expect(
      automaticPaymentAdapter.verifySignature?.({
        payload: PAYLOAD,
        signature: 'deadbeef',
      }),
    ).toBe(false);
    expect(
      automaticPaymentAdapter.verifySignature?.({
        payload: { ...PAYLOAD, amountVnd: 1 },
        signature,
      }),
    ).toBe(false);
  });

  it('keeps signature verification off the default manual adapter', () => {
    expect(manualPaymentAdapter.verifySignature).toBeUndefined();
    expect(fakePaymentAdapter.verifySignature).toBeUndefined();
  });
});
