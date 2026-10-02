import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import {
  PAYMENT_CONTRACT_VERSION,
  paymentProviderSettlementSchema,
  type PaymentProviderId,
  type PaymentProviderPayload,
  type PaymentProviderSettlement,
} from '../../../../shared/contracts/payment.contract.js';
import { stableStringify } from '../../shared/idempotency.js';

export const PAYMENT_PROVIDER_INVALID_MESSAGE =
  'Dữ liệu nhà cung cấp thanh toán không hợp lệ.';
export const PAYMENT_PROVIDER_SECRET_MESSAGE =
  'Dữ liệu nhà cung cấp chứa trường bí mật.';
export const PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE =
  'Nhà cung cấp thanh toán chưa khả dụng.';
export const PAYMENT_PROVIDER_SIGNATURE_INVALID_MESSAGE =
  'Chữ ký nhà cung cấp thanh toán không hợp lệ.';
export const PAYMENT_PROVIDER_SIGNATURE_MISSING_MESSAGE =
  'Thiếu khóa ký nhà cung cấp thanh toán.';

const SECRET_KEY_PATTERN =
  /(secret|token|password|passcode|api[_-]?key|signature|private[_-]?key|credential)/i;

/**
 * Reject any value whose object keys look like secret material. Evidence must
 * never persist a secret even when an adapter returns one by mistake
 * (P0-L08, docs/RULES_FIREBASE.md §7).
 */
export function assertNoSecretMaterial(value: unknown, path = ''): void {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoSecretMaterial(entry, `${path}[${index}]`),
    );
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new HttpsError('invalid-argument', PAYMENT_PROVIDER_SECRET_MESSAGE);
    }
    assertNoSecretMaterial(child, path ? `${path}.${key}` : key);
  }
}

export interface MapProviderPayloadInput {
  providerId: PaymentProviderId;
  payload: PaymentProviderPayload;
  now: string;
}

/**
 * Replaceable provider seam. The Payment module depends on this interface, not
 * on a concrete provider, so mapping can change without touching Ordering
 * records (P0-L08, REQ-PAY-001).
 */
export interface PaymentProviderAdapter {
  readonly id: PaymentProviderId;
  mapPayload(input: MapProviderPayloadInput): PaymentProviderSettlement;
  /**
   * Verify the provider signature over the normalized payload. Absent for the
   * default manual adapter, which never handles automatic events
   * (REQ-PAY-002, P0-L08 extension).
   */
  verifySignature?(input: {
    payload: PaymentProviderPayload;
    signature: string;
  }): boolean;
}

function toSettlement(
  input: MapProviderPayloadInput,
): PaymentProviderSettlement {
  return paymentProviderSettlementSchema.parse({
    schemaVersion: PAYMENT_CONTRACT_VERSION,
    providerId: input.providerId,
    providerEventId: input.payload.providerEventId,
    tenantId: input.payload.tenantId,
    orderId: input.payload.orderId,
    amountVnd: input.payload.amountVnd,
    outcome: input.payload.outcome,
    mappedAt: input.now,
  });
}

/** Default manual adapter. The normalized mapping is already provider-neutral. */
export const manualPaymentAdapter: PaymentProviderAdapter = {
  id: 'manual',
  mapPayload: toSettlement,
};

/** Test/drill adapter used to prove contract replacement. */
export const fakePaymentAdapter: PaymentProviderAdapter = {
  id: 'fake',
  mapPayload: (input) =>
    toSettlement({
      ...input,
      payload: {
        ...input.payload,
        outcome: input.payload.outcome === 'settled' ? 'settled' : 'failed',
      },
    }),
};

/**
 * Resolve the HMAC signing secret. Production must set
 * `PAYMENT_PROVIDER_SIGNING_SECRET`; the emulator falls back to a known test
 * secret so the signed-event seam stays testable. The secret never leaves the
 * server and is never persisted (REQ-PAY-002, RULES_FIREBASE §7).
 */
export function resolvePaymentSigningSecret(): string | null {
  const configured = process.env.PAYMENT_PROVIDER_SIGNING_SECRET;
  if (configured && configured.length > 0) {
    return configured;
  }
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return 'scango-emulator-signing-secret';
  }
  return null;
}

export function buildProviderSignature(
  payload: PaymentProviderPayload,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(stableStringify(payload))
    .digest('hex');
}

/**
 * Automatic confirmation adapter. It verifies an HMAC signature over the
 * normalized payload before the caller posts anything, so a forged event never
 * reaches the Payment module (REQ-PAY-002). It is never the default provider.
 */
export const automaticPaymentAdapter: PaymentProviderAdapter = {
  id: 'automatic',
  mapPayload: toSettlement,
  verifySignature: ({ payload, signature }) => {
    const secret = resolvePaymentSigningSecret();
    if (!secret) {
      throw new HttpsError(
        'failed-precondition',
        PAYMENT_PROVIDER_SIGNATURE_MISSING_MESSAGE,
      );
    }
    const expected = Buffer.from(buildProviderSignature(payload, secret), 'utf8');
    const provided = Buffer.from(signature, 'utf8');
    if (expected.length !== provided.length) {
      return false;
    }
    return timingSafeEqual(expected, provided);
  },
};

const registry = new Map<PaymentProviderId, PaymentProviderAdapter>([
  [manualPaymentAdapter.id, manualPaymentAdapter],
  [fakePaymentAdapter.id, fakePaymentAdapter],
  [automaticPaymentAdapter.id, automaticPaymentAdapter],
]);

/** Register or replace one provider mapping without changing callers. */
export function registerPaymentProviderAdapter(
  adapter: PaymentProviderAdapter,
): void {
  registry.set(adapter.id, adapter);
}

export function resolvePaymentProviderAdapter(
  id: PaymentProviderId,
): PaymentProviderAdapter {
  const adapter = registry.get(id);
  if (!adapter) {
    throw new HttpsError(
      'failed-precondition',
      PAYMENT_PROVIDER_UNAVAILABLE_MESSAGE,
    );
  }
  return adapter;
}
