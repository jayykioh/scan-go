// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ORDER_CONTRACT_VERSION,
  ORDER_HISTORY_PAGE_SIZE,
  type OrderHistoryPage,
  type OrderHistoryRow,
} from '@contracts/order.contract';
import {
  orderStatusEventFixture,
  pendingOrderFixture,
} from '@shared/fixtures/order.fixture';
import { listOrderHistory } from '../../data/adapters/ordering.adapter';
import OrderHistoryPageView from './OrderHistoryPage';

vi.mock('../../data/adapters/ordering.adapter', () => ({
  listOrderHistory: vi.fn(),
}));

vi.mock('../../data/tenantStore', () => ({
  useStoreTenantId: () => 'tenant-alpha',
}));

vi.mock('../../data/adapters/reporting.adapter', () => ({
  formatVnd: (amount: number) => `${amount.toLocaleString('vi-VN')}đ`,
}));

function row(
  index: number,
  overrides: Partial<OrderHistoryRow> = {},
): OrderHistoryRow {
  return {
    order: {
      ...pendingOrderFixture,
      orderId: `order-${String(index).padStart(3, '0')}`,
      tableNameSnapshot: `Bàn ${index}`,
    },
    paidAt: null,
    paymentMethod: null,
    cancellationReason: null,
    statusEvents: [orderStatusEventFixture],
    ...overrides,
  };
}

function page(overrides: Partial<OrderHistoryPage> = {}): OrderHistoryPage {
  return {
    schemaVersion: ORDER_CONTRACT_VERSION,
    tenantId: 'tenant-alpha',
    page: 1,
    pageSize: ORDER_HISTORY_PAGE_SIZE,
    hasMore: false,
    rows: Array.from({ length: ORDER_HISTORY_PAGE_SIZE }, (_, index) =>
      row(index + 1),
    ),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// REQ-ORD-007: real page, only the callable boundary is mocked.
describe('OrderHistoryPage', () => {
  it('renders fifteen Orders a page and moves to the next page', async () => {
    vi.mocked(listOrderHistory)
      .mockResolvedValueOnce(page({ hasMore: true }))
      .mockResolvedValueOnce(page({ page: 2, rows: [row(16)] }));

    render(<OrderHistoryPageView />);

    expect(await screen.findByText('Bàn 1')).toBeTruthy();
    expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(15);
    expect(screen.getByText('Trang 1')).toBeTruthy();
    expect(listOrderHistory).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-alpha', status: 'all', page: 1 }),
    );

    fireEvent.click(screen.getByRole('button', { name: /Tiếp/ }));

    expect(await screen.findByText('Trang 2')).toBeTruthy();
    expect(listOrderHistory).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'all', page: 2 }),
    );
  });

  it('shows the real payment state of each Order', async () => {
    vi.mocked(listOrderHistory).mockResolvedValue(
      page({
        rows: [
          row(1),
          row(2, {
            order: {
              ...pendingOrderFixture,
              orderId: 'order-paid',
              tableNameSnapshot: 'Bàn đã trả',
              status: 'paid',
            },
            paidAt: '2026-11-06T03:00:00.000Z',
            paymentMethod: 'cash',
          }),
        ],
      }),
    );

    render(<OrderHistoryPageView />);

    expect(await screen.findByText('Chưa thu')).toBeTruthy();
    expect(screen.getByText('Đã thu · Tiền mặt')).toBeTruthy();
  });

  it('filters by the status the till uses for unpaid Orders', async () => {
    vi.mocked(listOrderHistory).mockResolvedValue(page({ rows: [row(1)] }));

    render(<OrderHistoryPageView />);
    await screen.findByText('Bàn 1');

    fireEvent.click(
      screen.getByRole('button', { name: 'Chưa thanh toán' }),
    );

    await waitFor(() =>
      expect(listOrderHistory).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'unpaid', page: 1 }),
      ),
    );
  });

  it('expands one Order into its lines, payment, and status history', async () => {
    vi.mocked(listOrderHistory).mockResolvedValue(page({ rows: [row(1)] }));

    render(<OrderHistoryPageView />);
    const rowButton = await screen.findByRole('button', { name: /Bàn 1/ });

    fireEvent.click(rowButton);

    expect(screen.getByText('Món đã gọi')).toBeTruthy();
    expect(screen.getByText('Lịch sử trạng thái')).toBeTruthy();
    expect(screen.getByText(/2× Phở bò/)).toBeTruthy();
    expect(screen.getAllByText('Chờ xử lý').length).toBeGreaterThan(0);
  });

  it('reports a failed read instead of an empty history', async () => {
    vi.mocked(listOrderHistory).mockRejectedValue(
      new Error('Không tải được lịch sử đơn.'),
    );

    render(<OrderHistoryPageView />);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Không tải được lịch sử đơn.');
  });
});
