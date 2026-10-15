/**
 * PayOS provider seam unit evidence (REQ-PAY-003, REQ-PAY-004).
 *
 * The signature is the whole security boundary of the webhook: PayOS signs the
 * `data` object with the merchant checksum key, and a body that does not verify
 * must never reach the settlement transaction. The outbound request shape is
 * checked with an injected `fetch`, so no test touches the network.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  PAYOS_API_BASE_URL,
  PAYOS_DESCRIPTION_MAX_LENGTH,
  PAYOS_EMULATOR_CONFIG,
  buildPayosCreateLinkBody,
  createPayosPaymentLink,
  payosDescription,
  payosSignatureString,
  readPayosSettlementFacts,
  resolvePayosConfig,
  signPayosPayload,
  verifyPayosSignature,
} from './payos.js';

const CHECKSUM_KEY = 'checksum-key-under-test';

describe('resolvePayosConfig', () => {
  it('returns null in production when any credential is missing', () => {
    expect(resolvePayosConfig({})).toBeNull();
    expect(
      resolvePayosConfig({
        PAYOS_CLIENT_ID: 'id',
        PAYOS_API_KEY: 'key',
      }),
    ).toBeNull();
    expect(
      resolvePayosConfig({
        PAYOS_CLIENT_ID: 'id',
        PAYOS_API_KEY: 'key',
        PAYOS_CHECKSUM_KEY: '   ',
      }),
    ).toBeNull();
  });

  it('reads the three bound secrets in production', () => {
    expect(
      resolvePayosConfig({
        PAYOS_CLIENT_ID: 'id',
        PAYOS_API_KEY: 'key',
        PAYOS_CHECKSUM_KEY: 'checksum',
      }),
    ).toEqual({ clientId: 'id', apiKey: 'key', checksumKey: 'checksum' });
  });

  it('always uses the fixed test credentials in the emulator', () => {
    expect(
      resolvePayosConfig({
        FUNCTIONS_EMULATOR: 'true',
        PAYOS_CLIENT_ID: 'real-id',
        PAYOS_API_KEY: 'real-key',
        PAYOS_CHECKSUM_KEY: 'real-checksum',
      }),
    ).toEqual(PAYOS_EMULATOR_CONFIG);
  });
});

describe('payosSignatureString', () => {
  it('sorts keys alphabetically and joins them with &', () => {
    expect(payosSignatureString({ b: 2, a: 1, c: 'x' })).toBe('a=1&b=2&c=x');
  });

  it('omits null and undefined values, which PayOS also omits', () => {
    expect(
      payosSignatureString({
        amount: 100000,
        counterAccountBankId: null,
        virtualAccountNumber: undefined,
      }),
    ).toBe('amount=100000');
  });
});

describe('verifyPayosSignature', () => {
  const data = { orderCode: 1001, amount: 100000, reference: 'REF-1' };

  it('accepts the signature the checksum key produces', () => {
    expect(
      verifyPayosSignature(data, signPayosPayload(data, CHECKSUM_KEY), CHECKSUM_KEY),
    ).toBe(true);
  });

  it('accepts a signature in a different case', () => {
    const signature = signPayosPayload(data, CHECKSUM_KEY).toUpperCase();
    expect(verifyPayosSignature(data, signature, CHECKSUM_KEY)).toBe(true);
  });

  it('rejects a wrong, missing, or foreign-key signature', () => {
    expect(verifyPayosSignature(data, 'deadbeef', CHECKSUM_KEY)).toBe(false);
    expect(verifyPayosSignature(data, null, CHECKSUM_KEY)).toBe(false);
    expect(verifyPayosSignature(data, '', CHECKSUM_KEY)).toBe(false);
    expect(
      verifyPayosSignature(
        data,
        signPayosPayload(data, 'another-key'),
        CHECKSUM_KEY,
      ),
    ).toBe(false);
  });

  it('rejects a body whose amount was changed after signing', () => {
    const signature = signPayosPayload(data, CHECKSUM_KEY);
    expect(
      verifyPayosSignature({ ...data, amount: 1 }, signature, CHECKSUM_KEY),
    ).toBe(false);
  });
});

describe('buildPayosCreateLinkBody', () => {
  it('signs exactly the five documented fields and keeps them in the body', () => {
    const body = buildPayosCreateLinkBody(
      { clientId: 'id', apiKey: 'key', checksumKey: CHECKSUM_KEY },
      {
        orderCode: 1001,
        amountVnd: 100000,
        description: 'SCANGO order-1',
        returnUrl: 'https://shop.example/staff',
        cancelUrl: 'https://shop.example/staff',
      },
    );

    expect(body).toMatchObject({
      orderCode: 1001,
      amount: 100000,
      description: 'SCANGO order-1',
      returnUrl: 'https://shop.example/staff',
      cancelUrl: 'https://shop.example/staff',
    });
    expect(body.signature).toBe(
      signPayosPayload(
        {
          amount: 100000,
          cancelUrl: 'https://shop.example/staff',
          description: 'SCANGO order-1',
          orderCode: 1001,
          returnUrl: 'https://shop.example/staff',
        },
        CHECKSUM_KEY,
      ),
    );
  });
});

describe('payosDescription', () => {
  it('stays inside the provider length cap', () => {
    const description = payosDescription('a'.repeat(40));
    expect(description.length).toBeLessThanOrEqual(PAYOS_DESCRIPTION_MAX_LENGTH);
    expect(description.startsWith('SCANGO ')).toBe(true);
  });
});

describe('createPayosPaymentLink', () => {
  const config = { clientId: 'id', apiKey: 'key', checksumKey: CHECKSUM_KEY };

  it('posts the signed body to the PayOS payment-requests endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          code: '00',
          data: {
            checkoutUrl: 'https://pay.payos.vn/web/abc',
            qrCode: '00020101021238',
            paymentLinkId: 'link-abc',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;

    const result = await createPayosPaymentLink(
      config,
      {
        orderCode: 1001,
        amountVnd: 100000,
        description: 'SCANGO order-1',
        returnUrl: 'https://shop.example/staff',
        cancelUrl: 'https://shop.example/staff',
      },
      fetchImpl,
    );

    expect(result).toEqual({
      checkoutUrl: 'https://pay.payos.vn/web/abc',
      qrCode: '00020101021238',
      paymentLinkId: 'link-abc',
    });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0] as [string, RequestInit];
    expect(url).toBe(`${PAYOS_API_BASE_URL}/v2/payment-requests`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'x-client-id': 'id',
      'x-api-key': 'key',
    });
    expect(JSON.parse(String(init.body))).toMatchObject({ orderCode: 1001 });
  });

  it('refuses a provider error code and a transport failure', async () => {
    const providerError = vi.fn(async () =>
      new Response(JSON.stringify({ code: '201', desc: 'invalid' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as unknown as typeof fetch;
    const transportFailure = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    const input = {
      orderCode: 1001,
      amountVnd: 100000,
      description: 'SCANGO order-1',
      returnUrl: 'https://shop.example/staff',
      cancelUrl: 'https://shop.example/staff',
    };
    await expect(
      createPayosPaymentLink(config, input, providerError),
    ).rejects.toThrow();
    await expect(
      createPayosPaymentLink(config, input, transportFailure),
    ).rejects.toThrow();
  });
});

describe('readPayosSettlementFacts', () => {
  const settled = {
    code: '00',
    success: true,
    data: {
      orderCode: 1001,
      amount: 100000,
      reference: 'REF-1',
      paymentLinkId: 'link-abc',
    },
    signature: 'ignored-here',
  };

  it('reads the order code, amount, and provider reference', () => {
    expect(readPayosSettlementFacts(settled)).toEqual({
      orderCode: 1001,
      amountVnd: 100000,
      providerEventId: 'REF-1',
    });
  });

  it('ignores a non-settled or incomplete event', () => {
    expect(readPayosSettlementFacts({ ...settled, code: '01' })).toBeNull();
    expect(readPayosSettlementFacts({ ...settled, success: false })).toBeNull();
    expect(
      readPayosSettlementFacts({
        ...settled,
        data: { orderCode: 1001, amount: 100000 },
      }),
    ).toBeNull();
    expect(
      readPayosSettlementFacts({
        ...settled,
        data: { orderCode: 'x', amount: 100000, reference: 'REF-1' },
      }),
    ).toBeNull();
  });
});
