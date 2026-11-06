import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ORDER_CONTRACT_VERSION,
  ORDER_HISTORY_PAGE_SIZE,
  type OrderHistoryPage,
} from '@contracts/order.contract';
import {
  orderStatusEventFixture,
  pendingOrderFixture,
} from '@shared/fixtures/order.fixture';

const mocks = vi.hoisted(() => ({
  getFirebaseFunctions: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: (...args: unknown[]) => mocks.httpsCallable(...args),
}));

vi.mock('../../services/firebase/client', () => ({
  getFirebaseFunctions: () => mocks.getFirebaseFunctions(),
  getFirebaseFirestore: () => null,
}));

import { listOrderHistory } from './ordering.adapter';

const pageFixture: OrderHistoryPage = {
  schemaVersion: ORDER_CONTRACT_VERSION,
  tenantId: 'tenant-alpha',
  page: 2,
  pageSize: ORDER_HISTORY_PAGE_SIZE,
  hasMore: false,
  rows: [
    {
      order: pendingOrderFixture,
      paidAt: null,
      paymentMethod: null,
      cancellationReason: null,
      statusEvents: [orderStatusEventFixture],
    },
  ],
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('listOrderHistory (REQ-ORD-007)', () => {
  it('calls the bounded history callable and parses its page', async () => {
    const callable = vi.fn().mockResolvedValue({ data: pageFixture });
    mocks.getFirebaseFunctions.mockReturnValue({});
    mocks.httpsCallable.mockReturnValue(callable);

    const result = await listOrderHistory({
      tenantId: 'tenant-alpha',
      fromDay: '20261101',
      toDay: '20261107',
      status: 'unpaid',
      page: 2,
    });

    expect(mocks.httpsCallable).toHaveBeenCalledWith(
      {},
      'callableOrderListHistory',
    );
    expect(callable).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha',
      fromDay: '20261101',
      toDay: '20261107',
      status: 'unpaid',
      page: 2,
    });
    expect(result.page).toBe(2);
    expect(result.rows[0]?.statusEvents).toHaveLength(1);
  });

  it('rejects when Firebase is not configured', async () => {
    mocks.getFirebaseFunctions.mockReturnValue(null);

    await expect(
      listOrderHistory({
        tenantId: 'tenant-alpha',
        fromDay: '20261101',
        toDay: '20261107',
        status: 'all',
        page: 1,
      }),
    ).rejects.toThrow('Firebase chưa được cấu hình.');
  });
});
