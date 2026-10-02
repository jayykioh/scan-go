import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  assertNoSecretMaterial,
  fakePaymentAdapter,
  manualPaymentAdapter,
  registerPaymentProviderAdapter,
  resolvePaymentProviderAdapter,
  type PaymentProviderAdapter,
} from './provider.js';
import {
  paymentProviderPayloadSchema,
  paymentProviderSettleInputSchema,
  paymentProviderSettlementSchema,
} from '../../../../shared/contracts/payment.contract.js';

const NOW = '2026-10-01T00:00:00.000Z';

const payload = {
  providerEventId: 'evt-001',
  tenantId: 'tenant-alpha',
  orderId: 'order-001',
  amountVnd: 100000,
  outcome: 'settled' as const,
};

/**
 * Unit evidence for the replaceable Payment provider seam (P0-L08, REQ-PAY-001).
 */
describe('provider adapter resolution and replacement', () => {
  it('resolves the registered manual and fake adapters', () => {
    expect(resolvePaymentProviderAdapter('manual').id).toBe('manual');
    expect(resolvePaymentProviderAdapter('fake').id).toBe('fake');
    expect(manualPaymentAdapter.id).toBe('manual');
    expect(fakePaymentAdapter.id).toBe('fake');
  });

  it('maps a payload through the adapter contract without changing the shape', () => {
    const settlement = manualPaymentAdapter.mapPayload({
      providerId: 'manual',
      payload,
      now: NOW,
    });
    expect(settlement.tenantId).toBe('tenant-alpha');
    expect(settlement.amountVnd).toBe(100000);
    expect(settlement.mappedAt).toBe(NOW);
    expect(paymentProviderSettlementSchema.safeParse(settlement).success).toBe(
      true,
    );
  });

  it('replaces provider mapping through the registry', () => {
    const replacement: PaymentProviderAdapter = {
      id: 'fake',
      mapPayload: (input) => ({
        ...fakePaymentAdapter.mapPayload(input),
        outcome: 'failed',
      }),
    };
    registerPaymentProviderAdapter(replacement);
    try {
      expect(resolvePaymentProviderAdapter('fake').mapPayload({
        providerId: 'fake',
        payload,
        now: NOW,
      }).outcome).toBe('failed');
    } finally {
      registerPaymentProviderAdapter(fakePaymentAdapter);
    }
  });

  it('rejects an unknown provider id', () => {
    expect(() =>
      resolvePaymentProviderAdapter('unknown' as 'manual'),
    ).toThrow(HttpsError);
  });
});

describe('payload validation and secret exclusion', () => {
  it('rejects a malformed payload and an unknown key', () => {
    expect(paymentProviderPayloadSchema.safeParse({ ...payload, amountVnd: 1.5 })
      .success).toBe(false);
    expect(
      paymentProviderPayloadSchema.safeParse({ ...payload, secretKey: 'x' })
        .success,
    ).toBe(false);
    expect(
      paymentProviderSettleInputSchema.safeParse({
        tenantId: 'tenant-alpha',
        providerId: 'momo',
        payload,
      }).success,
    ).toBe(false);
  });

  it('accepts a valid settlement input', () => {
    const parsed = paymentProviderSettleInputSchema.safeParse({
      tenantId: 'tenant-alpha',
      providerId: 'fake',
      payload,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects secret-like keys at any depth, including arrays', () => {
    expect(() => assertNoSecretMaterial(payload)).not.toThrow();
    expect(() =>
      assertNoSecretMaterial({ provider: { apiKey: 'x' } }),
    ).toThrow(HttpsError);
    expect(() =>
      assertNoSecretMaterial({ events: [{ signature: 'x' }] }),
    ).toThrow(HttpsError);
    expect(() =>
      assertNoSecretMaterial({ privateKey: 'x' }),
    ).toThrow(HttpsError);
  });
});
