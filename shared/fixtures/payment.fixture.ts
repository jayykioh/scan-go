import {
  PAYMENT_CONTRACT_VERSION,
  paymentIdFor,
  type PaymentConfirmationResult,
  type PaymentRecord,
  type VietQrInstruction,
  type VietQrMerchantConfig,
} from '../contracts/payment.contract.js';
import { TENANT_A_FIXTURE } from './identity.fixture.js';
import { ORDER_ID_FIXTURE } from './order.fixture.js';

export const PAYMENT_ID_FIXTURE = paymentIdFor(ORDER_ID_FIXTURE);
export const PAYMENT_IDEMPOTENCY_KEY_FIXTURE = 'idem-payment-0001';
export const PAYMENT_ACTOR_UID_FIXTURE = 'uid-cashier-001';
export const PAYMENT_CONFIRMED_AT_FIXTURE = '2026-09-12T07:20:00.000Z';

export const vietQrMerchantFixture: VietQrMerchantConfig = {
  bankBin: '970436',
  accountNo: '1234567890',
  accountName: 'SCANGO CAFE',
  template: 'compact2',
};

export const vietQrInstructionFixture: VietQrInstruction = {
  schemaVersion: PAYMENT_CONTRACT_VERSION,
  method: 'vietQr',
  bankBin: vietQrMerchantFixture.bankBin,
  accountNo: vietQrMerchantFixture.accountNo,
  accountName: vietQrMerchantFixture.accountName,
  template: vietQrMerchantFixture.template,
  amountVnd: 100000,
  addInfo: `SCANGO ${ORDER_ID_FIXTURE}`,
  qrPayload:
    'https://img.vietqr.io/image/970436-1234567890-compact2.png' +
    '?amount=100000' +
    `&addInfo=${encodeURIComponent(`SCANGO ${ORDER_ID_FIXTURE}`)}` +
    `&accountName=${encodeURIComponent('SCANGO CAFE')}`,
};

export const confirmedCashPaymentFixture: PaymentRecord = {
  schemaVersion: PAYMENT_CONTRACT_VERSION,
  paymentId: PAYMENT_ID_FIXTURE,
  tenantId: TENANT_A_FIXTURE,
  orderId: ORDER_ID_FIXTURE,
  amountVnd: 100000,
  method: 'cash',
  status: 'confirmed',
  vietQrInstruction: null,
  actorUid: PAYMENT_ACTOR_UID_FIXTURE,
  idempotencyKey: PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
  linkedPaymentId: null,
  correctionKind: null,
  reason: null,
  providerId: null,
  providerRef: null,
  confirmedAt: PAYMENT_CONFIRMED_AT_FIXTURE,
  createdAt: PAYMENT_CONFIRMED_AT_FIXTURE,
};

export const confirmedVietQrPaymentFixture: PaymentRecord = {
  ...confirmedCashPaymentFixture,
  method: 'vietQr',
  vietQrInstruction: vietQrInstructionFixture,
};

export const paymentConfirmationResultFixture: PaymentConfirmationResult = {
  schemaVersion: PAYMENT_CONTRACT_VERSION,
  status: 'confirmed',
  payment: confirmedCashPaymentFixture,
  orderStatus: 'paid',
};
