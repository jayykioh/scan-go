// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publicMenuItemFixture } from '@shared/fixtures/catalog.fixture';
import { verifiedFeedbackFixture } from '@shared/fixtures/feedback.fixture';
import { createdOrderResultFixture, publicOrderTrackingFixture } from '@shared/fixtures/order.fixture';
import { activeTableLinkContextFixture } from '@shared/fixtures/table.fixture';
import { subscribePublicMenu } from '../data/adapters/catalog.adapter';
import { submitFeedback } from '../data/adapters/feedback.adapter';
import { createOrderIdempotencyKey, submitOrder, subscribeOrderTracking } from '../data/adapters/ordering.adapter';
import { resolvePublicTable } from '../data/adapters/table.adapter';
import * as viewMappers from '../data/adapters/view-mappers';
import PublicMenuPage from './PublicMenuPage';

vi.mock('../data/adapters/catalog.adapter', () => ({ subscribePublicMenu: vi.fn() }));
vi.mock('../data/adapters/feedback.adapter', () => ({ submitFeedback: vi.fn() }));
vi.mock('../data/adapters/table.adapter', () => ({
  resolvePublicTable: vi.fn(),
  buildQrPayload: (origin: string, token: string) => `${origin}/menu/${token}`,
}));
vi.mock('../data/adapters/ordering.adapter', async (importOriginal) => ({
  ...await importOriginal<typeof import('../data/adapters/ordering.adapter')>(),
  createOrderIdempotencyKey: vi.fn(),
  submitOrder: vi.fn(),
  subscribeOrderTracking: vi.fn(),
}));
vi.mock('../data/adapters/promotion.adapter', async () => {
  const { promotionEvaluationFixture } = await import('@shared/fixtures/promotion.fixture');
  return { evaluatePromotions: vi.fn().mockResolvedValue({
    ...promotionEvaluationFixture,
    subtotalVnd: 45000,
    discountVnd: 0,
    totalVnd: 45000,
    appliedPromotion: null,
  }) };
});
vi.mock('../data/adapters/i18n.adapter', async () => {
  const { translateI18n } = await import('@contracts/i18n.contract');
  return { resolveInterfaceLocale: () => 'en', translate: translateI18n };
});
vi.mock('../hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

const table = activeTableLinkContextFixture;
const tracking = publicOrderTrackingFixture;
const storageKey = `scango:order:idempotency:v1:${table.token}`;

async function openMenu() {
  render(
    <MemoryRouter initialEntries={[`/menu/${table.token}`]}>
      <Routes><Route path="/menu/:tableId" element={<PublicMenuPage />} /></Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: /Phở bò Phở bò/i });
}

async function openCart() {
  fireEvent.click(screen.getByRole('button', { name: /Phở bò Phở bò/i }));
  fireEvent.click(await screen.findByRole('button', { name: /add to cart/i }));
  fireEvent.click(screen.getByRole('button', { name: /1 items/i }));
  await screen.findByRole('button', { name: /^place order$/i });
}

async function placeOrder() {
  await openCart();
  fireEvent.click(screen.getByRole('button', { name: /^place order$/i }));
  await waitFor(() => expect(screen.queryByRole('heading', { name: /^cart$/i })).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.mocked(resolvePublicTable).mockResolvedValue(table);
  vi.mocked(subscribePublicMenu).mockImplementation((_tenantId, onItems) => {
    onItems([publicMenuItemFixture]);
    return vi.fn();
  });
  vi.mocked(subscribeOrderTracking).mockReturnValue(vi.fn());
  vi.mocked(createOrderIdempotencyKey).mockReset().mockReturnValueOnce('order-key-first').mockReturnValue('order-key-second');
  vi.mocked(submitOrder).mockReset().mockResolvedValue(createdOrderResultFixture);
  vi.mocked(submitFeedback).mockResolvedValue(verifiedFeedbackFixture);
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

// REQ-ORD-001/003/004 and REQ-FDB-001: real page, view and mappers; only external boundaries are mocked.
describe('PublicMenuPage public ordering integration', () => {
  it('keeps the menu and inline tracking after submitting for the opaque table token, not its display name', async () => {
    const mapTracking = vi.spyOn(viewMappers, 'toTrackingOrder');
    await openMenu();
    expect(screen.getByRole('button', { name: /^Order food$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Reviews \/ Feedback$/ })).toBeTruthy();
    expect(table.token).not.toBe(table.tableName);
    expect(table.token).not.toBe(table.tableId);

    await placeOrder();

    expect(resolvePublicTable).toHaveBeenCalledWith(table.token);
    expect(subscribePublicMenu).toHaveBeenCalledWith(table.tenantId, expect.any(Function), expect.any(Object));
    expect(submitOrder).toHaveBeenCalledWith({
      token: table.token,
      paymentMode: 'payLater',
      idempotencyKey: 'order-key-first',
      lines: [{ menuItemId: publicMenuItemFixture.menuItemId, quantity: 1, selectedOptionIds: [] }],
      promotionCode: null,
      customerNote: null,
    });
    expect(mapTracking).toHaveBeenLastCalledWith(tracking, table.token);
    expect(mapTracking.mock.results.at(-1)?.value.tableId).toBe(table.token);
    expect(screen.getByPlaceholderText('Search dishes...')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Phở bò Phở bò/i })).toBeTruthy();
    expect(screen.getByText(`#${tracking.orderId.slice(-6).toUpperCase()}`)).toBeTruthy();
    expect(window.sessionStorage.getItem(storageKey)).toBeNull();

    const onTracking = vi.mocked(subscribeOrderTracking).mock.calls[0][1];
    act(() => onTracking({ ...tracking, itemSummary: 'Fresh server tracking update', status: 'ready' }));
    expect(screen.getByText(/Fresh server tracking update/)).toBeTruthy();
    expect(screen.getByPlaceholderText('Search dishes...')).toBeTruthy();
  });

  it('sends feedback with the resolved tenant and the latest submitted order tracking token', async () => {
    await openMenu();
    await placeOrder();
    fireEvent.click(screen.getByRole('button', { name: /^Reviews \/ Feedback$/ }));
    fireEvent.click(screen.getByRole('button', { name: '5/5' }));
    fireEvent.click(screen.getByRole('button', { name: /^Order food$/ }));
    const nextTracking = { ...tracking, orderId: 'order-second-002', trackingToken: 'tracking-second-token' };
    vi.mocked(submitOrder).mockResolvedValueOnce({ ...createdOrderResultFixture, tracking: nextTracking });
    await placeOrder();

    fireEvent.click(screen.getByRole('button', { name: /^Reviews \/ Feedback$/ }));
    expect(screen.getByRole('button', { name: '5/5' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    await screen.findByText(/thank you for the feedback/i);
    expect(submitFeedback).toHaveBeenCalledExactlyOnceWith({
      tenantId: table.tenantId,
      trackingToken: nextTracking.trackingToken,
      kind: 'review',
      rating: 5,
    });
    expect(subscribeOrderTracking).toHaveBeenLastCalledWith(nextTracking.trackingToken, expect.any(Function), expect.any(Function));
    fireEvent.click(screen.getByRole('button', { name: /^Order food$/ }));
    expect(screen.getByRole('button', { name: /Phở bò Phở bò/i })).toBeTruthy();
  });

  it('uses a fresh key for a second order but preserves that key and cart when retrying a failed submission', async () => {
    await openMenu();
    await placeOrder();
    vi.mocked(submitOrder).mockRejectedValueOnce(new Error('Please retry this order'));
    await openCart();
    fireEvent.click(screen.getByRole('button', { name: /^place order$/i }));
    await screen.findByText('Please retry this order');

    const first = vi.mocked(submitOrder).mock.calls[0][0];
    const second = vi.mocked(submitOrder).mock.calls[1][0];
    expect(second.idempotencyKey).not.toBe(first.idempotencyKey);
    expect(second.idempotencyKey).toBe('order-key-second');
    expect(window.sessionStorage.getItem(storageKey)).toBe(second.idempotencyKey);

    fireEvent.click(screen.getByRole('button', { name: /^place order$/i }));
    await waitFor(() => expect(submitOrder).toHaveBeenCalledTimes(3));
    expect(vi.mocked(submitOrder).mock.calls[2][0]).toEqual(second);
    await waitFor(() => expect(window.sessionStorage.getItem(storageKey)).toBeNull());
    expect(createOrderIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(screen.getByPlaceholderText('Search dishes...')).toBeTruthy();
  });
});
