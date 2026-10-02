import { describe, expect, it } from 'vitest';
import { mapStoredPayment } from './payment.adapter';
import {
  PAYMENT_ID_FIXTURE,
  confirmedCashPaymentFixture,
} from '@shared/fixtures/payment.fixture';

describe('mapStoredPayment', () => {
  it('maps one stored Payment document to the frozen contract', () => {
    const payment = mapStoredPayment(
      PAYMENT_ID_FIXTURE,
      confirmedCashPaymentFixture,
    );
    expect(payment.paymentId).toBe(PAYMENT_ID_FIXTURE);
    expect(payment.status).toBe('confirmed');
    expect(payment.method).toBe('cash');
    expect(payment.amountVnd).toBe(100000);
    expect(Number.isInteger(payment.amountVnd)).toBe(true);
    expect(payment.vietQrInstruction).toBeNull();
  });
});
