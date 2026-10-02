import { describe, expect, it } from 'vitest';

import {
  assertCashierOrOwnerMember,
  assertPaymentAmount,
  assertPaymentIdempotencyMatch,
  assertPaymentImmutable,
  buildPaymentConfirmRequestHash,
  buildPaymentRecord,
  buildVietQrInstruction,
  mapStoredPayment,
  parsePaymentConfirmInput,
  parsePaymentInstructionInput,
  parseVietQrMerchantConfig,
  type PaymentIdempotencyRecord,
} from './service.js';
import { paymentRecordSchema } from '../../../../shared/contracts/payment.contract.js';
import {
  PAYMENT_ACTOR_UID_FIXTURE,
  PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
  PAYMENT_ID_FIXTURE,
  confirmedCashPaymentFixture,
  vietQrInstructionFixture,
  vietQrMerchantFixture,
} from '../../../../shared/fixtures/payment.fixture.js';
import { ORDER_ID_FIXTURE } from '../../../../shared/fixtures/order.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

describe('buildVietQrInstruction', () => {
  it('maps merchant fields and the dynamic Order amount into one payload', () => {
    const instruction = buildVietQrInstruction({
      merchant: vietQrMerchantFixture,
      orderId: ORDER_ID_FIXTURE,
      amountVnd: 100000,
    });

    expect(instruction.method).toBe('vietQr');
    expect(instruction.bankBin).toBe(vietQrMerchantFixture.bankBin);
    expect(instruction.accountNo).toBe(vietQrMerchantFixture.accountNo);
    expect(instruction.accountName).toBe(vietQrMerchantFixture.accountName);
    expect(instruction.amountVnd).toBe(100000);
    expect(Number.isInteger(instruction.amountVnd)).toBe(true);
    expect(instruction.addInfo).toBe(`SCANGO ${ORDER_ID_FIXTURE}`);
    expect(instruction.qrPayload).toContain('970436-1234567890-compact2');
    expect(instruction.qrPayload).toContain('amount=100000');
    expect(instruction.qrPayload).toContain(
      `addInfo=${encodeURIComponent(`SCANGO ${ORDER_ID_FIXTURE}`)}`,
    );
    expect(instruction).toEqual(vietQrInstructionFixture);
  });

  it('rejects a non-integer or negative amount', () => {
    expect(() =>
      buildVietQrInstruction({
        merchant: vietQrMerchantFixture,
        orderId: ORDER_ID_FIXTURE,
        amountVnd: 1000.5,
      }),
    ).toThrow();
    expect(() =>
      buildVietQrInstruction({
        merchant: vietQrMerchantFixture,
        orderId: ORDER_ID_FIXTURE,
        amountVnd: -1,
      }),
    ).toThrow();
  });
});

describe('tenant merchant parsing', () => {
  it('accepts a full merchant map and rejects an invalid bank BIN', () => {
    expect(parseVietQrMerchantConfig(vietQrMerchantFixture)).not.toBeNull();
    expect(
      parseVietQrMerchantConfig({ ...vietQrMerchantFixture, bankBin: 'abc' }),
    ).toBeNull();
    expect(parseVietQrMerchantConfig(undefined)).toBeNull();
  });
});

describe('VND settlement snapshot', () => {
  it('stores the server Order total, never a floating or client amount', () => {
    const payment = buildPaymentRecord({
      paymentId: PAYMENT_ID_FIXTURE,
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      amountVnd: 100000,
      method: 'cash',
      vietQrInstruction: null,
      actorUid: PAYMENT_ACTOR_UID_FIXTURE,
      idempotencyKey: PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
      now: '2026-09-12T07:20:00.000Z',
    });
    expect(paymentRecordSchema.safeParse(payment).success).toBe(true);
    expect(payment.amountVnd).toBe(100000);
    expect(Number.isInteger(payment.amountVnd)).toBe(true);
    expect(payment.status).toBe('confirmed');
    expect(payment.confirmedAt).toBe('2026-09-12T07:20:00.000Z');
  });

  it('rejects an amount that differs from the Order total', () => {
    expect(() => assertPaymentAmount(100000, 100000)).not.toThrow();
    expect(() => assertPaymentAmount(99000, 100000)).toThrow();
    expect(() => assertPaymentAmount(-1, 100000)).toThrow();
  });

  it('maps a stored document back to the frozen contract', () => {
    const mapped = mapStoredPayment(
      PAYMENT_ID_FIXTURE,
      confirmedCashPaymentFixture,
    );
    expect(mapped.paymentId).toBe(PAYMENT_ID_FIXTURE);
    expect(mapped.method).toBe('cash');
    expect(mapped.amountVnd).toBe(100000);
  });
});

describe('immutable payment guard', () => {
  it('accepts the same settlement and rejects a second settlement', () => {
    expect(() =>
      assertPaymentImmutable(confirmedCashPaymentFixture, {
        orderId: ORDER_ID_FIXTURE,
        amountVnd: 100000,
        method: 'cash',
        status: 'confirmed',
      }),
    ).not.toThrow();

    expect(() =>
      assertPaymentImmutable(confirmedCashPaymentFixture, {
        orderId: ORDER_ID_FIXTURE,
        amountVnd: 200000,
        method: 'cash',
        status: 'confirmed',
      }),
    ).toThrow();
    expect(() =>
      assertPaymentImmutable(confirmedCashPaymentFixture, {
        orderId: ORDER_ID_FIXTURE,
        amountVnd: 100000,
        method: 'vietQr',
        status: 'confirmed',
      }),
    ).toThrow();
  });
});

describe('payment idempotency', () => {
  const record: PaymentIdempotencyRecord = {
    command: 'confirmPayment',
    requestHash: 'hash-a',
    tenantId: TENANT_A_FIXTURE,
    orderId: ORDER_ID_FIXTURE,
    paymentId: PAYMENT_ID_FIXTURE,
    status: 'applied',
    createdAt: '2026-09-12T07:20:00.000Z',
  };

  it('builds a stable request hash per settlement request', () => {
    const first = buildPaymentConfirmRequestHash({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      method: 'cash',
      amountVnd: 100000,
    });
    const second = buildPaymentConfirmRequestHash({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      method: 'cash',
      amountVnd: 100000,
    });
    const vietQr = buildPaymentConfirmRequestHash({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      method: 'vietQr',
      amountVnd: 100000,
    });
    expect(second).toBe(first);
    expect(vietQr).not.toBe(first);
  });

  it('replays a matching hash and rejects a changed request', () => {
    expect(() => assertPaymentIdempotencyMatch(record, 'hash-a')).not.toThrow();
    expect(() => assertPaymentIdempotencyMatch(record, 'hash-b')).toThrow();
  });
});

describe('Cashier authorization against a membership document', () => {
  it('allows Owner and an active cashier Staff member', () => {
    expect(() =>
      assertCashierOrOwnerMember({ membershipType: 'owner', isActive: true }),
    ).not.toThrow();
    expect(() =>
      assertCashierOrOwnerMember({
        membershipType: 'staff',
        roles: ['cashier'],
        isActive: true,
      }),
    ).not.toThrow();
  });

  it('denies Kitchen, Waiter, inactive Staff, and missing membership', () => {
    expect(() =>
      assertCashierOrOwnerMember({
        membershipType: 'staff',
        roles: ['kitchen'],
        isActive: true,
      }),
    ).toThrow();
    expect(() =>
      assertCashierOrOwnerMember({
        membershipType: 'staff',
        roles: ['waiter'],
        isActive: true,
      }),
    ).toThrow();
    expect(() =>
      assertCashierOrOwnerMember({
        membershipType: 'staff',
        roles: ['cashier'],
        isActive: false,
      }),
    ).toThrow();
    expect(() => assertCashierOrOwnerMember(undefined)).toThrow();
  });
});

describe('payment callable input validation', () => {
  it('rejects a malformed settlement request', () => {
    expect(() => parsePaymentConfirmInput({ tenantId: TENANT_A_FIXTURE })).toThrow();
    expect(() =>
      parsePaymentConfirmInput({
        tenantId: TENANT_A_FIXTURE,
        orderId: ORDER_ID_FIXTURE,
        method: 'momo',
        amountVnd: 100000,
        idempotencyKey: PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
      }),
    ).toThrow();
    expect(() =>
      parsePaymentConfirmInput({
        tenantId: TENANT_A_FIXTURE,
        orderId: ORDER_ID_FIXTURE,
        method: 'cash',
        amountVnd: 1000.5,
        idempotencyKey: PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
      }),
    ).toThrow();
  });

  it('accepts a valid settlement request and instruction request', () => {
    const parsed = parsePaymentConfirmInput({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      method: 'vietQr',
      amountVnd: 100000,
      idempotencyKey: PAYMENT_IDEMPOTENCY_KEY_FIXTURE,
    });
    expect(parsed.method).toBe('vietQr');
    expect(
      parsePaymentInstructionInput({
        tenantId: TENANT_A_FIXTURE,
        orderId: ORDER_ID_FIXTURE,
      }).orderId,
    ).toBe(ORDER_ID_FIXTURE);
  });
});
