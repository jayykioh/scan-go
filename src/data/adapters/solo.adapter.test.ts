import { describe, expect, it, vi } from 'vitest';
import type { CatalogCommandResult } from '@contracts/catalog.contract';
import type { PaymentCorrectionResult } from '@contracts/correction.contract';
import type { FulfilmentCommandResult } from '@contracts/fulfilment.contract';
import type { OrderCancellationResult } from '@contracts/order.contract';
import type { PaymentConfirmationResult } from '@contracts/payment.contract';
import { pendingOrderFixture } from '@shared/fixtures/order.fixture';
import {
  createSoloIdempotencyKey,
  resolveSoloOrderCommand,
  runSoloAvailability,
  runSoloOrderAction,
  runSoloOrderCancel,
  runSoloOrderRevert,
  type SoloOrderPorts,
} from './solo.adapter';

/**
 * Solo one-operator seam tests (REQ-SOLO-001). The dispatch layer must call the
 * same shared module commands as the dedicated views and must never set an Order
 * status on its own.
 */
function fakePorts(): SoloOrderPorts {
  return {
    startCooking: vi.fn(
      async (): Promise<FulfilmentCommandResult> =>
        ({
          order: { ...pendingOrderFixture, status: 'cooking' },
        }) as FulfilmentCommandResult,
    ),
    markReady: vi.fn(
      async (): Promise<FulfilmentCommandResult> =>
        ({
          order: { ...pendingOrderFixture, status: 'ready' },
        }) as FulfilmentCommandResult,
    ),
    confirmPayment: vi.fn(
      async (): Promise<PaymentConfirmationResult> =>
        ({ orderStatus: 'paid' }) as PaymentConfirmationResult,
    ),
    cancelUnpaidOrder: vi.fn(
      async (): Promise<OrderCancellationResult> =>
        ({ status: 'cancelled' }) as OrderCancellationResult,
    ),
    revertPaidOrder: vi.fn(
      async (): Promise<PaymentCorrectionResult> =>
        ({ status: 'corrected', kind: 'reversal' }) as PaymentCorrectionResult,
    ),
    setAvailability: vi.fn(
      async (): Promise<CatalogCommandResult> => ({}) as CatalogCommandResult,
    ),
  };
}

describe('resolveSoloOrderCommand', () => {
  it('maps the shared order lifecycle to one operator commands', () => {
    expect(resolveSoloOrderCommand('pending')).toBe('startCooking');
    expect(resolveSoloOrderCommand('cooking')).toBe('markReady');
    expect(resolveSoloOrderCommand('ready')).toBe('confirmPayment');
    expect(resolveSoloOrderCommand('paid')).toBeNull();
    expect(resolveSoloOrderCommand('served')).toBeNull();
    expect(resolveSoloOrderCommand('cancelled')).toBeNull();
  });
});

describe('runSoloOrderAction', () => {
  it('dispatches cooking to Fulfilment and returns the server status', async () => {
    const ports = fakePorts();
    const outcome = await runSoloOrderAction(ports, {
      orderId: pendingOrderFixture.orderId,
      status: 'pending',
      amountVnd: pendingOrderFixture.totalVnd,
    });
    expect(outcome).toEqual({ command: 'startCooking', orderStatus: 'cooking' });
    expect(ports.startCooking).toHaveBeenCalledWith(pendingOrderFixture.orderId);
    expect(ports.confirmPayment).not.toHaveBeenCalled();
  });

  it('dispatches ready to the Payment callable with the order amount', async () => {
    const ports = fakePorts();
    const outcome = await runSoloOrderAction(ports, {
      orderId: pendingOrderFixture.orderId,
      status: 'ready',
      amountVnd: 105000,
    });
    expect(outcome).toEqual({ command: 'confirmPayment', orderStatus: 'paid' });
    expect(ports.confirmPayment).toHaveBeenCalledWith({
      orderId: pendingOrderFixture.orderId,
      amountVnd: 105000,
      method: 'cash',
    });
  });

  it('runs no command for a paid or cancelled Order', async () => {
    const ports = fakePorts();
    expect(
      await runSoloOrderAction(ports, {
        orderId: pendingOrderFixture.orderId,
        status: 'paid',
        amountVnd: 100000,
      }),
    ).toBeNull();
    expect(ports.startCooking).not.toHaveBeenCalled();
    expect(ports.markReady).not.toHaveBeenCalled();
    expect(ports.confirmPayment).not.toHaveBeenCalled();
  });
});

describe('runSoloOrderCancel and runSoloAvailability', () => {
  it('routes cancellation to Ordering with the reason', async () => {
    const ports = fakePorts();
    await runSoloOrderCancel(ports, pendingOrderFixture.orderId, 'Khách đổi ý');
    expect(ports.cancelUnpaidOrder).toHaveBeenCalledWith({
      orderId: pendingOrderFixture.orderId,
      reason: 'Khách đổi ý',
    });
  });

  it('routes a paid Order revert to the compensating Payment correction', async () => {
    const ports = fakePorts();
    await runSoloOrderRevert(
      ports,
      pendingOrderFixture.orderId,
      'Solo hoàn tác hóa đơn',
    );
    expect(ports.revertPaidOrder).toHaveBeenCalledWith({
      orderId: pendingOrderFixture.orderId,
      reason: 'Solo hoàn tác hóa đơn',
    });
    expect(ports.cancelUnpaidOrder).not.toHaveBeenCalled();
  });

  it('routes availability to Catalog', async () => {
    const ports = fakePorts();
    await runSoloAvailability(ports, 'item-pho-bo-001', false);
    expect(ports.setAvailability).toHaveBeenCalledWith(
      'item-pho-bo-001',
      false,
    );
  });
});

describe('solo helpers', () => {
  it('builds a unique retry-safe idempotency key', () => {
    const first = createSoloIdempotencyKey('pay');
    const second = createSoloIdempotencyKey('pay');
    expect(first.startsWith('solo-pay-')).toBe(true);
    expect(first).not.toBe(second);
  });
});
