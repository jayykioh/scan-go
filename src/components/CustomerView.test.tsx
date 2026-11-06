// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CustomerView, { paginateMenu } from './CustomerView';
import type { Order, TenantConfig } from '../types';
import type { PromotionEvaluationResult } from '../../shared/contracts/promotion.contract';

const tenantConfig: TenantConfig = {
  shopName: 'Bếp Nhà',
  industry: 'quan_an',
  pricingTier: 'Pro',
  paymentMode: 'Pay-Later',
  loyaltyEnabled: true,
  loyaltyRate: 1,
  onboardingStep: 4,
};

function renderCustomer(props: Partial<React.ComponentProps<typeof CustomerView>> = {}) {
  return render(
    <CustomerView
      tenantConfig={tenantConfig}
      menuItems={[]}
      orders={[]}
      simulationTableId="table-token"
      setSimulationTableId={() => {}}
      tables={[{ id: 'table-token', name: 'Bàn 1' }]}
      directMenu
      {...props}
    />,
  );
}

const emptyPromotion: PromotionEvaluationResult = {
  schemaVersion: 2,
  tenantId: 'tenant-1',
  subtotalVnd: 0,
  discountVnd: 0,
  giftValueVnd: 0,
  totalVnd: 0,
  appliedPromotion: null,
  lines: [],
  giftLines: [],
  pointsRedeemed: 0,
  codeRequired: false,
  ineligibilityReasons: [],
  consideredPromotionIds: [],
  evaluatedAt: new Date().toISOString(),
};

afterEach(cleanup);

const dish = { id: 'item-1', name: 'Phở', category: 'Món ăn', type: 'Đồ ăn', price: 65000, costPrice: 0, image: 'https://example.test/pho.png', description: '', inStock: true, stockCount: 10, toppings: [] };

function addDish() {
  fireEvent.click(screen.getByRole('button', { name: /Phở Phở 65\.000đ/i }));
  fireEvent.click(screen.getByRole('button', { name: /add to cart/i }));
}

function openCart() {
  fireEvent.click(screen.getByRole('button', { name: /1 items.*65\.000đ/i }));
}

describe('CustomerView public menu', () => {
  it('keeps the menu after submitting and lets the customer order again', async () => {
    const onSubmitOrder = vi.fn().mockResolvedValue(undefined);
    renderCustomer({ menuItems: [dish], onSubmitOrder });
    addDish();
    openCart();
    fireEvent.click(screen.getByRole('button', { name: /^place order$/i }));
    await waitFor(() => expect(onSubmitOrder).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /^cart$/i })).toBeNull());
    expect(screen.getByRole('button', { name: 'Order food' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText(/all done/i)).toBeNull();
    addDish();
    openCart();
    fireEvent.click(screen.getByRole('button', { name: /^place order$/i }));
    await waitFor(() => expect(onSubmitOrder).toHaveBeenCalledTimes(2));
  });

  it('keeps the cart and feedback draft when switching pages, then keeps the sent confirmation', async () => {
    const onSubmitFeedback = vi.fn().mockResolvedValue(undefined);
    renderCustomer({ menuItems: [dish], onSubmitFeedback });
    addDish();
    fireEvent.click(screen.getByRole('button', { name: 'Reviews / Feedback' }));
    fireEvent.click(screen.getByRole('button', { name: '4/5' }));
    fireEvent.change(screen.getByPlaceholderText(/what went wrong/i), { target: { value: 'Great food' } });
    fireEvent.click(screen.getByRole('button', { name: 'Order food' }));
    expect(screen.getByRole('button', { name: /1 items.*65\.000đ/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reviews / Feedback' }));
    expect((screen.getByPlaceholderText(/what went wrong/i) as HTMLTextAreaElement).value).toBe('Great food');
    expect(screen.getByRole('button', { name: '4/5' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    await screen.findByText(/thank you for the feedback/i);
    expect(onSubmitFeedback).toHaveBeenCalledWith({ kind: 'review', rating: 4, message: '[Service / staff] Great food' });
    fireEvent.click(screen.getByRole('button', { name: 'Order food' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reviews / Feedback' }));
    expect(screen.getByText(/thank you for the feedback/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /send feedback/i })).toBeNull();
  });

  it.each([false, true])('retains cart on offline or rejected submission (online=%s)', async (isOnline) => {
    const onSubmitOrder = vi.fn().mockRejectedValue(new Error('Try again'));
    renderCustomer({ menuItems: [dish], onSubmitOrder, isOnline });
    addDish();
    openCart();
    fireEvent.click(screen.getByRole('button', { name: isOnline ? /^place order$/i : /^offline$/i }));
    await screen.findAllByRole('alert');
    expect(screen.getByRole('button', { name: 'Order food' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { name: /^cart$/i })).toBeTruthy();
    expect(onSubmitOrder).toHaveBeenCalledTimes(isOnline ? 1 : 0);
  });

  it.each(['paid', 'cancelled'] as const)('keeps %s orders visible without including another table', (status) => {
    const order = { id: 'order-123456', tableId: 'table-token', items: [], total: 10000, status, timestamp: new Date(), paymentMode: 'Pay-Later' } as Order;
    renderCustomer({ orders: [order, { ...order, id: 'other-999999', tableId: 'other-table' }] });
    expect(screen.getByText('#123456')).toBeTruthy();
    expect(screen.getByText(status === 'paid' ? 'Paid' : 'Cancelled')).toBeTruthy();
    expect(screen.queryByText('#999999')).toBeNull();
  });

  it('prevents another feedback submission while sending and keeps the draft on failure', async () => {
    let rejectSubmission!: (error: Error) => void;
    const onSubmitFeedback = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectSubmission = reject; }));
    renderCustomer({ onSubmitFeedback });
    fireEvent.click(screen.getByRole('button', { name: 'Reviews / Feedback' }));
    fireEvent.change(screen.getByPlaceholderText(/what went wrong/i), { target: { value: 'Please check my order' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));
    const sendingButton = screen.getByRole('button', { name: /sending/i }) as HTMLButtonElement;
    expect(sendingButton.disabled).toBe(true);
    fireEvent.click(sendingButton);
    expect(onSubmitFeedback).toHaveBeenCalledTimes(1);
    rejectSubmission(new Error('Feedback unavailable'));
    await screen.findByText('Feedback unavailable');
    expect((screen.getByPlaceholderText(/what went wrong/i) as HTMLTextAreaElement).value).toBe('Please check my order');
    expect((screen.getByRole('button', { name: /send feedback/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not offer fake phone lookup or reveal client-side loyalty data', () => {
    renderCustomer();
    fireEvent.click(screen.getAllByRole('button', { name: /^member$/i })[0]);
    expect(screen.queryByPlaceholderText(/phone number/i)).toBeNull();
    expect(screen.queryByText('340 points')).toBeNull();
    expect(screen.getByText(/verification/i)).toBeTruthy();
  });

  it('starts on the table picker in simulation mode', () => {
    renderCustomer({ directMenu: false });
    expect(screen.getByRole('heading', { name: /choose a table/i })).toBeTruthy();
  });

  it('opens the menu after selecting a table', () => {
    renderCustomer({ directMenu: false });
    fireEvent.click(screen.getAllByRole('button', { name: /Bàn 1Open menu/i })[0]);
    expect(screen.getAllByRole('heading', { name: /Order quickly/i }).length).toBeGreaterThan(0);
  });

  it('keeps promotion pricing server-authoritative', async () => {
    const onEvaluatePromotion = vi.fn().mockResolvedValue(emptyPromotion);
    renderCustomer({
      menuItems: [{ id: 'item-1', name: 'Phở', category: 'Món ăn', type: 'Đồ ăn', price: 65000, costPrice: 0, image: 'https://example.test/pho.png', description: '', inStock: true, stockCount: 10, toppings: [] }],
      onEvaluatePromotion,
    });
    const itemButton = screen.getAllByRole('button', { name: /Phở Phở 65\.000đ/i })[0];
    fireEvent.click(itemButton);
    const addButton = await screen.findByRole('button', { name: /Phở/i });
    fireEvent.click(addButton);
    expect(onEvaluatePromotion).not.toHaveBeenCalled();
    expect(screen.queryByText(/deal of the day/i)).toBeNull();
  });

  it('submits selected feedback area through the existing feedback handler', async () => {
    const order = { id: 'order-123456', tableId: 'table-token', items: [], total: 0, status: 'served', timestamp: new Date(), paymentMode: 'Pay-Later' } as Order;
    const onSubmitFeedback = vi.fn().mockResolvedValue(undefined);
    renderCustomer({ orders: [order], onSubmitFeedback });

    fireEvent.click(screen.getByRole('button', { name: 'Reviews / Feedback' }));
    fireEvent.change(screen.getByRole('combobox', { name: /main topic/i }), { target: { value: 'amenities' } });
    fireEvent.change(screen.getByPlaceholderText(/what went wrong/i), { target: { value: 'The restroom needs attention' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    await screen.findByText(/thank you for the feedback/i);
    expect(onSubmitFeedback).toHaveBeenCalledWith({ kind: 'issue', message: '[Facilities / cleanliness] The restroom needs attention' });
  });
});

const dishes = (count: number) => Array.from({ length: count }, (_, index) => ({
  ...dish,
  id: `item-${index + 1}`,
  name: `Món ${index + 1}`,
  description: `Mô tả ${index + 1}`,
  price: 10000 + index + 1,
  image: '',
}));

describe('CustomerView menu paging', () => {
  it('shows two dishes a row, ten a page, and pages through the rest', () => {
    renderCustomer({ menuItems: dishes(12) });
    expect(screen.getAllByTestId('menu-card')).toHaveLength(10);
    expect(screen.getByTestId('menu-page-label').textContent).toBe('Page 1 of 2');

    fireEvent.click(screen.getByTestId('menu-page-next'));
    expect(screen.getAllByTestId('menu-card')).toHaveLength(2);
    expect(screen.getByText('Món 11')).toBeTruthy();
    expect(screen.getByTestId('menu-page-label').textContent).toBe('Page 2 of 2');

    fireEvent.click(screen.getByTestId('menu-page-prev'));
    expect(screen.getAllByTestId('menu-card')).toHaveLength(10);
  });

  it('opens the dish detail sheet from a card', () => {
    renderCustomer({ menuItems: dishes(1) });
    fireEvent.click(screen.getByTestId('menu-card'));
    const sheet = screen.getByTestId('menu-item-sheet');
    expect(sheet.textContent).toContain('Món 1');
    expect(sheet.textContent).toContain('Mô tả 1');
    expect(sheet.textContent).toContain('10.001đ');
    expect(screen.getByRole('button', { name: /add to cart/i })).toBeTruthy();
  });

  it('returns to the first page when the search changes', () => {
    renderCustomer({ menuItems: dishes(12) });
    fireEvent.click(screen.getByTestId('menu-page-next'));
    fireEvent.change(screen.getByPlaceholderText(/search dishes/i), { target: { value: 'Món 1' } });
    expect(screen.getAllByTestId('menu-card')).toHaveLength(4);
    expect(screen.queryByTestId('menu-page-label')).toBeNull();
  });

  it('shows a placeholder instead of a broken image for a dish without a photo', () => {
    renderCustomer({ menuItems: dishes(1) });
    expect(screen.queryAllByRole('img')).toHaveLength(0);
    expect(screen.getByTestId('menu-card')).toBeTruthy();
  });

  it('clamps the page to the filtered list', () => {
    expect(paginateMenu([1, 2, 3], 9)).toEqual({ items: [1, 2, 3], page: 1, pageCount: 1 });
    expect(paginateMenu(Array.from({ length: 25 }, (_, index) => index), 9)).toMatchObject({ page: 3, pageCount: 3 });
    expect(paginateMenu([], 3)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
});
