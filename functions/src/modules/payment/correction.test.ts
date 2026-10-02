import { describe, expect, it } from 'vitest';
import {
  assertCorrectionAmount,
  assertCorrectionEligibleOrder,
  assertOriginalPaymentConfirmed,
  assertPaymentCorrectionAuthorized,
  buildCompensatingPayment,
  buildPaymentArchivePlan,
  buildPaymentCorrectionRequestHash,
  PAYMENT_CORRECTION_PERMISSION,
} from './service.js';
import { HttpsError } from 'firebase-functions/v2/https';
import { paymentRecordSchema } from '../../../../shared/contracts/payment.contract.js';
import {
  confirmedCashPaymentFixture,
  PAYMENT_ID_FIXTURE,
} from '../../../../shared/fixtures/payment.fixture.js';
import {
  ORDER_ID_FIXTURE,
  pendingOrderFixture,
} from '../../../../shared/fixtures/order.fixture.js';
import { TENANT_A_FIXTURE } from '../../../../shared/fixtures/identity.fixture.js';

const NOW = '2026-10-01T00:00:00.000Z';

/** Unit evidence for paid-order correction and Payment retention (REQ-PAY-001). */
describe('paid-order correction eligibility', () => {
  it('accepts only a paid Order', () => {
    expect(() =>
      assertCorrectionEligibleOrder({ ...pendingOrderFixture, status: 'paid' }),
    ).not.toThrow();
    expect(() => assertCorrectionEligibleOrder(pendingOrderFixture)).toThrow(
      HttpsError,
    );
    expect(() =>
      assertCorrectionEligibleOrder({
        ...pendingOrderFixture,
        status: 'cancelled',
      }),
    ).toThrow(HttpsError);
  });

  it('accepts only a confirmed original Payment', () => {
    expect(() =>
      assertOriginalPaymentConfirmed(confirmedCashPaymentFixture),
    ).not.toThrow();
    expect(() =>
      assertOriginalPaymentConfirmed({
        ...confirmedCashPaymentFixture,
        status: 'reversed',
      }),
    ).toThrow(HttpsError);
  });
});

describe('correction amount validation (integer VND)', () => {
  it('defaults to the full original amount', () => {
    expect(assertCorrectionAmount(undefined, 100000)).toBe(100000);
    expect(assertCorrectionAmount(40000, 100000)).toBe(40000);
  });

  it('rejects zero, negative, non-integer, and over-original amounts', () => {
    for (const value of [0, -1, 1.5, 100001]) {
      expect(() => assertCorrectionAmount(value, 100000)).toThrow(HttpsError);
    }
  });
});

describe('compensating Payment mapping', () => {
  it('links the immutable original without mutating it', () => {
    const original = confirmedCashPaymentFixture;
    const compensating = buildCompensatingPayment({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      originalPayment: original,
      kind: 'reversal',
      amountVnd: 100000,
      reason: 'Khách báo sai',
      actorUid: 'uid-cashier-001',
      idempotencyKey: 'idem-correct-0001',
      now: NOW,
    });

    expect(compensating.paymentId).toBe(`payment_${ORDER_ID_FIXTURE}__reversal`);
    expect(compensating.linkedPaymentId).toBe(PAYMENT_ID_FIXTURE);
    expect(compensating.correctionKind).toBe('reversal');
    expect(compensating.status).toBe('reversed');
    expect(compensating.reason).toBe('Khách báo sai');
    expect(compensating.providerId).toBeNull();
    expect(paymentRecordSchema.safeParse(compensating).success).toBe(true);
    // The original fixture is unchanged.
    expect(original.status).toBe('confirmed');
  });

  it('maps a refund to a refunded compensating record', () => {
    const compensating = buildCompensatingPayment({
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      originalPayment: confirmedCashPaymentFixture,
      kind: 'refund',
      amountVnd: 50000,
      reason: 'Hoàn một phần',
      actorUid: 'uid-cashier-001',
      idempotencyKey: 'idem-correct-0002',
      now: NOW,
    });
    expect(compensating.status).toBe('refunded');
    expect(compensating.amountVnd).toBe(50000);
  });
});

describe('correction request hash', () => {
  it('is stable and binds the reason and kind', () => {
    const base = {
      tenantId: TENANT_A_FIXTURE,
      orderId: ORDER_ID_FIXTURE,
      kind: 'reversal' as const,
      amountVnd: 100000,
      reason: 'Khách báo sai',
    };
    expect(buildPaymentCorrectionRequestHash(base)).toBe(
      buildPaymentCorrectionRequestHash(base),
    );
    expect(buildPaymentCorrectionRequestHash(base)).not.toBe(
      buildPaymentCorrectionRequestHash({ ...base, reason: 'Khác' }),
    );
  });
});

describe('correction authorization', () => {
  it('allows ADMIN, Owner, and a permitted Cashier', () => {
    expect(() => assertPaymentCorrectionAuthorized(undefined, true)).not.toThrow();
    expect(() =>
      assertPaymentCorrectionAuthorized(
        { membershipType: 'owner', isActive: true },
        false,
      ),
    ).not.toThrow();
    expect(() =>
      assertPaymentCorrectionAuthorized(
        {
          membershipType: 'staff',
          roles: ['cashier'],
          permissions: [PAYMENT_CORRECTION_PERMISSION],
          isActive: true,
        },
        false,
      ),
    ).not.toThrow();
  });

  it('denies a Cashier without the permission and an inactive member', () => {
    expect(() =>
      assertPaymentCorrectionAuthorized(
        { membershipType: 'staff', roles: ['cashier'], isActive: true },
        false,
      ),
    ).toThrow(HttpsError);
    expect(() =>
      assertPaymentCorrectionAuthorized(
        {
          membershipType: 'staff',
          roles: ['cashier'],
          permissions: [PAYMENT_CORRECTION_PERMISSION],
          isActive: false,
        },
        false,
      ),
    ).toThrow(HttpsError);
  });
});

describe('buildPaymentArchivePlan', () => {
  it('selects only confirmed Payments older than the cutoff', () => {
    const plan = buildPaymentArchivePlan({
      tenantId: TENANT_A_FIXTURE,
      candidates: [
        {
          paymentId: 'payment-old',
          status: 'confirmed',
          confirmedAt: '2020-02-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: null,
        },
        {
          paymentId: 'payment-reversed',
          status: 'reversed',
          confirmedAt: '2020-02-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: null,
        },
        {
          paymentId: 'payment-archived',
          status: 'confirmed',
          confirmedAt: '2020-02-01T00:00:00.000Z',
          createdAt: '2020-01-01T00:00:00.000Z',
          archivedAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      now: NOW,
      retentionYears: 5,
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.paymentId).toBe('payment-old');
    expect(plan.lines[0]?.archivePath).toBe(
      `tenants/${TENANT_A_FIXTURE}/archivedPayments/payment-old`,
    );
  });
});
