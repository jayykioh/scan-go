// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import type { PopularTable } from '@contracts/reporting.contract';
import { I18N_STORAGE_KEY } from '../../../data/adapters/i18n.adapter';
import TablePerformance, {
  TABLE_PERFORMANCE_READ_LIMIT,
} from './TablePerformance';

// jsdom reports an English browser locale, so pin the cached choice: the panel
// reads the locale once at mount (same pattern as OwnerView).
beforeEach(() => {
  window.localStorage.setItem(I18N_STORAGE_KEY, 'vi');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function table(overrides: Partial<PopularTable> = {}): PopularTable {
  return {
    tableId: 'table-01',
    tableName: 'Bàn 1',
    createdOrderCount: 3,
    cancelledOrderCount: 0,
    paidOrderCount: 2,
    revenueVnd: 200000,
    costVnd: 88000,
    grossProfitVnd: 112000,
    reversedVnd: 0,
    refundedVnd: 0,
    ...overrides,
  };
}

describe('TablePerformance', () => {
  it('shows one row per table with its orders, revenue and gross profit', () => {
    render(<TablePerformance tables={[table()]} />);

    const body = screen.getAllByRole('row').slice(1);
    expect(body).toHaveLength(1);
    expect(within(body[0]).getByText('Bàn 1')).toBeTruthy();
    expect(within(body[0]).getByText('2')).toBeTruthy();
    expect(within(body[0]).getByText(/200\.000/)).toBeTruthy();
    expect(within(body[0]).getByText(/112\.000/)).toBeTruthy();
  });

  it('renders one row per table when several tables have data', () => {
    render(
      <TablePerformance
        tables={[
          table({ tableId: 'a', tableName: 'Bàn 1', revenueVnd: 300000 }),
          table({ tableId: 'b', tableName: 'Bàn 2', revenueVnd: 100000 }),
          table({ tableId: 'takeaway', tableName: 'Mang về', revenueVnd: 50000 }),
        ]}
      />,
    );

    const body = screen.getAllByRole('row').slice(1);
    expect(body.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      'Bàn 1',
      'Bàn 2',
      'Mang về',
    ]);
  });

  it('shows the empty state instead of a table when the period has no table', () => {
    render(<TablePerformance tables={[]} />);

    expect(screen.queryByRole('table')).toBeNull();
    expect(
      screen.getByText('Chưa có bàn nào có đơn đã thu trong kỳ này.'),
    ).toBeTruthy();
  });

  it('always states the ordering and the read limit', () => {
    render(<TablePerformance tables={[table()]} />);

    expect(screen.getByText('Xếp theo doanh thu · tối đa 50 bàn')).toBeTruthy();
    expect(screen.queryByText('Có thể còn bàn khác ngoài 50 bàn này.')).toBeNull();
  });

  it('warns that more tables may exist once the read limit is reached', () => {
    const many = Array.from({ length: TABLE_PERFORMANCE_READ_LIMIT }, (_, i) =>
      table({ tableId: `t-${i}`, tableName: `Bàn ${i}` }),
    );

    render(<TablePerformance tables={many} />);

    expect(screen.getByText('Có thể còn bàn khác ngoài 50 bàn này.')).toBeTruthy();
  });

  it('marks a losing table differently from a profitable one', () => {
    render(
      <TablePerformance
        tables={[
          table({ tableId: 'win', tableName: 'Bàn lời', grossProfitVnd: 50000 }),
          table({ tableId: 'lose', tableName: 'Bàn lỗ', grossProfitVnd: -20000 }),
        ]}
      />,
    );

    const body = screen.getAllByRole('row').slice(1);
    const winProfit = within(body[0]).getAllByRole('cell')[3];
    const loseProfit = within(body[1]).getAllByRole('cell')[3];

    expect(winProfit.className).toContain('text-emerald-600');
    expect(loseProfit.className).toContain('text-red-600');
    expect(loseProfit.textContent).toMatch(/-20\.000/);
  });

  it('names the table and gives every column a scoped header', () => {
    render(<TablePerformance tables={[table()]} />);

    const grid = screen.getByRole('table', {
      name: 'Hiệu suất theo bàn',
    });
    expect(grid).toBeTruthy();

    const headers = within(grid).getAllByRole('columnheader');
    expect(headers.map((header) => header.textContent)).toEqual([
      'Bàn',
      'Đơn đã thu',
      'Doanh thu',
      'Lợi nhuận gộp',
    ]);
    for (const header of headers) {
      expect(header.getAttribute('scope')).toBe('col');
    }
  });

  it('renders English labels when the cached locale is English', () => {
    window.localStorage.setItem(I18N_STORAGE_KEY, 'en');

    render(<TablePerformance tables={[table()]} />);

    const grid = screen.getByRole('table', { name: 'Performance by table' });
    expect(
      within(grid)
        .getAllByRole('columnheader')
        .map((header) => header.textContent),
    ).toEqual(['Table', 'Paid orders', 'Revenue', 'Gross profit']);
    expect(
      screen.getByText('Ordered by revenue · up to 50 tables'),
    ).toBeTruthy();
  });
});
