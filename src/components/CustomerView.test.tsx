// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it, vi } from 'vitest';
import CustomerView from './CustomerView';
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

describe('CustomerView public menu', () => {
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

    fireEvent.click(screen.getByRole('button', { name: /track/i }));
    fireEvent.change(screen.getByRole('combobox', { name: /main topic/i }), { target: { value: 'amenities' } });
    fireEvent.change(screen.getByPlaceholderText(/what went wrong/i), { target: { value: 'The restroom needs attention' } });
    fireEvent.click(screen.getByRole('button', { name: /send feedback/i }));

    await screen.findByText(/thank you for the feedback/i);
    expect(onSubmitFeedback).toHaveBeenCalledWith({ kind: 'issue', message: '[Facilities / cleanliness] The restroom needs attention' });
  });
});
