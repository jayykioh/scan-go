import { describe, expect, it } from 'vitest';
import {
  createOrderIdempotencyKey,
  evaluateOfflineSubmission,
  mapStoredOrder,
  mapStoredTracking,
  OFFLINE_SUBMIT_MESSAGE,
} from './ordering.adapter';
import {
  ORDER_TRACKING_TOKEN_FIXTURE,
  pendingOrderFixture,
  publicOrderTrackingFixture,
} from '@shared/fixtures/order.fixture';

describe('evaluateOfflineSubmission', () => {
  it('blocks submission and shows a connection problem when offline', () => {
    const decision = evaluateOfflineSubmission(false);
    expect(decision.blocked).toBe(true);
    expect(decision.online).toBe(false);
    expect(decision.message).toBe(OFFLINE_SUBMIT_MESSAGE);
  });

  it('allows submission when online', () => {
    const decision = evaluateOfflineSubmission(true);
    expect(decision.blocked).toBe(false);
    expect(decision.message).toBeNull();
  });
});

describe('mapStoredTracking', () => {
  it('maps one public tracking document with integer VND', () => {
    const tracking = mapStoredTracking(
      ORDER_TRACKING_TOKEN_FIXTURE,
      publicOrderTrackingFixture,
    );
    expect(tracking.status).toBe('pending');
    expect(Number.isInteger(tracking.totalVnd)).toBe(true);
    expect('customerPhone' in tracking).toBe(false);
  });
});

describe('createOrderIdempotencyKey', () => {
  it('builds a unique retry-safe key for one Order submit', () => {
    const first = createOrderIdempotencyKey();
    const second = createOrderIdempotencyKey();
    expect(first.startsWith('ord-')).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe('mapStoredOrder', () => {
  it('maps one stored Order snapshot', () => {
    const order = mapStoredOrder(pendingOrderFixture.orderId, pendingOrderFixture);
    expect(order.status).toBe('pending');
    expect(order.totalVnd).toBe(100000);
    expect(Number.isInteger(order.totalVnd)).toBe(true);
  });
});
