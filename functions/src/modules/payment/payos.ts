/**
 * PayOS provider seam (REQ-PAY-003, REQ-PAY-004).
 *
 * PayOS is a Vietnamese payment gateway: the server asks it for a payment link
 * per Order, the Cashier shows the returned QR, and PayOS calls our webhook when
 * the transfer lands. Both directions are authenticated with the same
 * HMAC-SHA256 `PAYOS_CHECKSUM_KEY`: outbound over the request fields, inbound
 * over the webhook `data` object. The key never leaves this process.
 *
 * Everything here is provider-shaped, so it stays out of the ScanGo payment
 * contract. The HTTP call takes an injectable `fetch` so the request shape is
 * unit-testable without the network.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const PAYOS_API_BASE_URL = 'https://api-merchant.payos.vn';
/** PayOS caps `description`; the mapping key is `orderCode`, not this text. */
export const PAYOS_DESCRIPTION_MAX_LENGTH = 25;
/** First `orderCode` handed out. PayOS needs a positive integer, unique per merchant. */
export const PAYOS_ORDER_CODE_START = 1000;

export const PAYOS_UNCONFIGURED_MESSAGE =
  'PayOS chưa được cấu hình. Thiếu khoá kết nối trên máy chủ.';
export const PAYOS_LINK_FAILED_MESSAGE =
  'Không tạo được link thanh toán PayOS. Vui lòng thử lại.';
export const PAYOS_WEBHOOK_INVALID_MESSAGE =
  'Webhook PayOS không hợp lệ.';
export const PAYOS_LINK_NOT_FOUND_MESSAGE =
  'Không tìm thấy link thanh toán PayOS cho đơn này.';

export interface PayosConfig {
  clientId: string;
  apiKey: string;
  checksumKey: string;
}

/**
 * Credentials the Functions emulator always uses. `firebase emulators:exec`
 * never resolves a bound secret that does not exist, and a real secret in the
 * environment must not silently change the key a test signs with, so the
 * emulator path is fixed rather than inherited (REQ-PAY-004).
 */
export const PAYOS_EMULATOR_CONFIG: PayosConfig = {
  clientId: 'scango-emulator-payos-client',
  apiKey: 'scango-emulator-payos-key',
  checksumKey: 'scango-emulator-payos-checksum',
};

/**
 * Resolve the PayOS credentials from the runtime environment. Outside the
 * emulator PayOS is available exactly when all three secrets are bound, so an
 * operator who has not set them gets a clear refusal instead of a
 * half-configured provider.
 */
export function resolvePayosConfig(
  env: Record<string, string | undefined> = process.env,
): PayosConfig | null {
  if (env.FUNCTIONS_EMULATOR === 'true') {
    return PAYOS_EMULATOR_CONFIG;
  }
  const clientId = env.PAYOS_CLIENT_ID?.trim();
  const apiKey = env.PAYOS_API_KEY?.trim();
  const checksumKey = env.PAYOS_CHECKSUM_KEY?.trim();
  if (!clientId || !apiKey || !checksumKey) {
    return null;
  }
  return { clientId, apiKey, checksumKey };
}

/**
 * The string PayOS signs: every non-null key sorted alphabetically as
 * `key=value`, joined with `&`. PayOS's own SDK builds it the same way, so one
 * function serves both the outbound request and the inbound webhook.
 *
 * shortcut: an object or array value is JSON-stringified without sorting its
 * own keys, which is what PayOS sends today; upgrade to a recursive sort if the
 * provider ever nests a field in a signed payload.
 */
export function payosSignatureString(data: Record<string, unknown>): string {
  return Object.keys(data)
    .filter((key) => data[key] !== null && data[key] !== undefined)
    .sort()
    .map((key) => `${key}=${payosSignatureValue(data[key])}`)
    .join('&');
}

function payosSignatureValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export function signPayosPayload(
  data: Record<string, unknown>,
  checksumKey: string,
): string {
  return createHmac('sha256', checksumKey)
    .update(payosSignatureString(data))
    .digest('hex');
}

/**
 * The customer-visible transfer label. `orderCode` is what PayOS matches on, so
 * this text only has to be recognisable and inside the provider's length cap.
 */
export function payosDescription(orderId: string): string {
  return `SCANGO ${orderId}`.slice(0, PAYOS_DESCRIPTION_MAX_LENGTH);
}

/**
 * Constant-time verification of a PayOS signature. A missing, malformed, or
 * mismatched signature returns false and never throws, so a forged webhook can
 * never reach the settlement transaction.
 */
export function verifyPayosSignature(
  data: Record<string, unknown>,
  signature: string | null | undefined,
  checksumKey: string,
): boolean {
  if (typeof signature !== 'string' || signature.length === 0) {
    return false;
  }
  const expected = Buffer.from(signPayosPayload(data, checksumKey), 'utf8');
  const provided = Buffer.from(signature.trim().toLowerCase(), 'utf8');
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

/** The outbound payment-request body PayOS expects, signature included. */
export function buildPayosCreateLinkBody(
  config: PayosConfig,
  input: {
    orderCode: number;
    amountVnd: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  },
): Record<string, unknown> {
  const signed = {
    amount: input.amountVnd,
    cancelUrl: input.cancelUrl,
    description: input.description,
    orderCode: input.orderCode,
    returnUrl: input.returnUrl,
  };
  return {
    ...signed,
    signature: signPayosPayload(signed, config.checksumKey),
  };
}

const payosCreateLinkResponseSchema = z.object({
  code: z.string(),
  desc: z.string().optional(),
  data: z
    .object({
      checkoutUrl: z.string().min(1),
      qrCode: z.string().min(1).nullable().optional(),
      paymentLinkId: z.string().min(1).nullable().optional(),
    })
    .optional(),
});

export interface PayosCreateLinkResult {
  checkoutUrl: string;
  qrCode: string | null;
  paymentLinkId: string | null;
}

/**
 * Create one PayOS payment link. A non-`00` provider code, a malformed body, or
 * a transport failure all surface as the same `failed-precondition`, so the
 * Cashier sees a retryable refusal rather than a provider internals leak.
 */
export async function createPayosPaymentLink(
  config: PayosConfig,
  input: {
    orderCode: number;
    amountVnd: number;
    description: string;
    returnUrl: string;
    cancelUrl: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PayosCreateLinkResult> {
  const response = await fetchImpl(
    `${PAYOS_API_BASE_URL}/v2/payment-requests`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-client-id': config.clientId,
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify(buildPayosCreateLinkBody(config, input)),
    },
  ).catch(() => null);

  if (!response || !response.ok) {
    throw new Error(PAYOS_LINK_FAILED_MESSAGE);
  }
  const parsed = payosCreateLinkResponseSchema.safeParse(
    await response.json().catch(() => null),
  );
  if (!parsed.success || parsed.data.code !== '00' || !parsed.data.data) {
    throw new Error(PAYOS_LINK_FAILED_MESSAGE);
  }
  return {
    checkoutUrl: parsed.data.data.checkoutUrl,
    qrCode: parsed.data.data.qrCode ?? null,
    paymentLinkId: parsed.data.data.paymentLinkId ?? null,
  };
}

/**
 * The subset of the PayOS webhook this server acts on. The envelope tolerates an
 * extra top-level key rather than refusing the notification: nothing outside
 * `data` is persisted, the signature already authenticates `data`, and a 400 on a
 * field PayOS added would leave a real transfer unrecorded. `signature` stays
 * required, so an unsigned body still never reaches the settlement path.
 */
export const payosWebhookSchema = z.object({
  code: z.string(),
  desc: z.string().optional(),
  success: z.boolean().optional(),
  data: z.record(z.string(), z.unknown()),
  signature: z.string().min(1),
});

export type PayosWebhook = z.infer<typeof payosWebhookSchema>;

export interface PayosSettlementFacts {
  orderCode: number;
  amountVnd: number;
  /** PayOS transaction reference; the immutable provider-side identity. */
  providerEventId: string;
}

/**
 * Read the settlement facts out of a verified webhook. `success` and `code`
 * must both report a landed transfer, and `reference` is the provider event id
 * the Payment record is keyed on, so a replayed webhook is the same event.
 */
export function readPayosSettlementFacts(
  webhook: PayosWebhook,
): PayosSettlementFacts | null {
  if (webhook.code !== '00' || webhook.success === false) {
    return null;
  }
  const orderCode = webhook.data.orderCode;
  const amount = webhook.data.amount;
  const reference = webhook.data.reference;
  if (
    typeof orderCode !== 'number' ||
    !Number.isInteger(orderCode) ||
    orderCode <= 0 ||
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 0 ||
    typeof reference !== 'string' ||
    reference.length === 0
  ) {
    return null;
  }
  return { orderCode, amountVnd: amount, providerEventId: reference };
}
