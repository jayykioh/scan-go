// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportingSummaryResultFixture } from '@shared/fixtures/reporting.fixture';
import { getReportingSummary } from '../../data/adapters/reporting.adapter';
import OverviewPage from './OverviewPage';

vi.mock('../../data/adapters/reporting.adapter', () => ({
  formatVnd: (amount: number) => `${amount.toLocaleString('vi-VN')}đ`,
  getReportingSummary: vi.fn(),
}));

vi.mock('../../data/tenantStore', () => ({
  useStoreTenantId: () => 'tenant-alpha',
  useStoreSlice: () => [null, { loading: false, error: null }],
}));

vi.mock('../../data/adapters/i18n.adapter', async () => {
  const { translateI18n } = await import('@contracts/i18n.contract');
  return { resolveInterfaceLocale: () => 'vi', translate: translateI18n };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );
}

// REQ-RPT-001: the quick periods stay, and a custom day range is a real read.
describe('OverviewPage custom range', () => {
  it('reads the quick day period by default', async () => {
    vi.mocked(getReportingSummary).mockResolvedValue(
      reportingSummaryResultFixture,
    );

    renderPage();

    await screen.findByText('Biểu đồ Doanh Thu');
    expect(getReportingSummary).toHaveBeenCalledWith({
      tenantId: 'tenant-alpha',
      period: 'day',
      range: undefined,
    });
  });

  it('reads the chosen from/to days and keeps the quick periods intact', async () => {
    vi.mocked(getReportingSummary).mockResolvedValue(
      reportingSummaryResultFixture,
    );

    renderPage();
    await screen.findByText('Biểu đồ Doanh Thu');

    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-11-30' },
    });

    await waitFor(() =>
      expect(getReportingSummary).toHaveBeenLastCalledWith({
        tenantId: 'tenant-alpha',
        period: 'custom',
        range: { fromDay: '20261101', toDay: '20261130' },
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Tuần' }));
    await waitFor(() =>
      expect(getReportingSummary).toHaveBeenLastCalledWith({
        tenantId: 'tenant-alpha',
        period: 'week',
        range: undefined,
      }),
    );
  });

  it('reports a reversed range without another read', async () => {
    vi.mocked(getReportingSummary).mockResolvedValue(
      reportingSummaryResultFixture,
    );

    renderPage();
    await screen.findByText('Biểu đồ Doanh Thu');
    const callsBefore = vi.mocked(getReportingSummary).mock.calls.length;

    fireEvent.change(screen.getByLabelText('Từ ngày'), {
      target: { value: '2026-11-30' },
    });
    fireEvent.change(screen.getByLabelText('Đến ngày'), {
      target: { value: '2026-11-01' },
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
    );
    expect(getReportingSummary).toHaveBeenCalledTimes(callsBefore);
  });

  it('lists each day so revenue is readable without hovering the chart', async () => {
    vi.mocked(getReportingSummary).mockResolvedValue(
      reportingSummaryResultFixture,
    );

    renderPage();
    await screen.findByText('Biểu đồ Doanh Thu');

    fireEvent.click(screen.getByText('Chi tiết theo ngày'));

    expect(screen.getByRole('columnheader', { name: 'Ngày' })).toBeTruthy();
    expect(screen.getByText('12/09/2026')).toBeTruthy();
  });
});
