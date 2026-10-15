import { useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig, StaffAccount } from '../types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS, MOCK_STAFF_ACCOUNTS } from '../mockData';
import { usePersistentState } from '../hooks/usePersistentState';
import { useActiveTenantIdState } from '../hooks/useActiveTenantId';
import {
  fromPersistedStaffAccounts,
  toPersistedStaffAccounts,
  type StaffSessionView,
} from '../data/adapters/auth.adapter';

export type OperationContextType = {
  tenantConfig: TenantConfig;
  tables: TableConfig[];
  menuItems: MenuItem[];
  setMenuItems: (val: any) => void;
  orders: Order[];
  staffAccounts: StaffAccount[];
  currentStaff: StaffSessionView | null;
  setCurrentStaff: (val: any) => void;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: (val: any) => void;
  kitchenOnboarded: boolean;
  setKitchenOnboarded: (val: any) => void;
  simulationTableId: string;
  setSimulationTableId: (val: string) => void;
  /** Active Tenant id resolved from identity; null in the offline demo. */
  activeTenantId: string | null;
  /** False until the active-Tenant read settles, so a page can wait for it. */
  activeTenantResolved: boolean;
};

export function useOperation() {
  return useOutletContext<OperationContextType>();
}

/**
 * Shared state for the operating pages (REQ-UX-002).
 *
 * The pages read their business data from the server callables; this layout
 * only carries the shop profile, the table list the demo falls back to, and
 * the signed-in Staff session the pages share while the operator switches
 * between them.
 */
export default function OperationLayout() {
  const [tenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', {
    shopName: 'Bún Phở Kinh Kỳ',
    industry: 'quan_an',
    pricingTier: 'Pro', // Default to Pro for the richest demo features
    paymentMode: 'Pay-Later',
    loyaltyEnabled: true,
    loyaltyRate: 1, // 1000đ = 1pt
    onboardingStep: 4,
    discountCode: 'MUANHIEU15K',
    discountMinItems: 3,
    discountMinAmount: 150000,
    discountAmount: 15000,
    discountEnabled: true,
    discountTriggerType: 'auto',
    discountConditionType: 'quantity',
    discountTargetDishId: 'all',
  });

  // Table list the operating pages fall back to when no Tenant is resolved.
  const [tables] = usePersistentState<TableConfig[]>('scango:tables:v1', [
    { id: '1', name: 'Bàn 01' },
    { id: '2', name: 'Bàn 02' },
    { id: '3', name: 'Bàn 03' },
    { id: '4', name: 'Bàn 04' },
    { id: '5', name: 'Bàn 05' },
    { id: '6', name: 'Bàn 06' },
  ]);

  const [kitchenOnboarded, setKitchenOnboarded] = usePersistentState('scango:kitchen-onboarded:v1', true);

  // Active Menu items matching the selected industry engine template
  const [menuItems, setMenuItems] = usePersistentState<MenuItem[]>('scango:menu:v1', MOCK_MENU_ITEMS.quan_an);

  // Demo Orders the Customer page shows when it runs without a server session.
  const [orders] = usePersistentState<Order[]>('scango:orders:v1', [
    {
      id: 'ord_1',
      tableId: '1',
      items: [
        { id: 'qa1_x1', menuId: 'qa1', name: 'Phở Bò Tái Lăn Kinh Kỳ', price: 65000, quantity: 1, selectedModifiers: ['Thêm quẩy'] }
      ],
      total: 65000,
      status: 'cooking',
      timestamp: new Date(Date.now() - 300000), // 5 mins ago
      customerPhone: '0987654321',
      paymentMode: 'Pay-Later',
    },
    {
      id: 'ord_2',
      tableId: '3',
      items: [
        { id: 'qa3_x1', menuId: 'qa3', name: 'Bún Chả Tre Thạch Thất', price: 50000, quantity: 2, selectedModifiers: [] },
        { id: 'qa6_x1', menuId: 'qa6', name: 'Trà Sâm Dứa Hương Lài', price: 5000, quantity: 1 }
      ],
      total: 105000,
      status: 'pending',
      timestamp: new Date(Date.now() - 60000), // 1 min ago
      paymentMode: 'Pay-Later',
    }
  ], {
    deserialize: (value: any) => (JSON.parse(value) as Order[]).map((order) => ({
      ...order,
      timestamp: new Date(String(order.timestamp)),
    })),
  });

  // Staff records never persist a plaintext PIN. The browser stores only the
  // display name, role booleans, and active flag; the server owns the hash,
  // lockout, and session (NFR-PRIV-001, REQ-AUTH-002).
  const [staffAccounts] = usePersistentState<StaffAccount[]>(
    'scango:staff:v1',
    MOCK_STAFF_ACCOUNTS,
    {
      deserialize: fromPersistedStaffAccounts,
      serialize: (accounts) => JSON.stringify(toPersistedStaffAccounts(accounts)),
    },
  );
  const [currentStaff, setCurrentStaff] = useState<StaffSessionView | null>(null);
  const [loyaltyMembers, setLoyaltyMembers] = usePersistentState<LoyaltyMember[]>('scango:loyalty:v1', MOCK_LOYALTY_MEMBERS);

  // Customer demo helper values
  const [simulationTableId, setSimulationTableId] = useState<string>('2');
  const { tenantId: activeTenantId, resolved: activeTenantResolved } =
    useActiveTenantIdState();

  const contextValue: OperationContextType = {
    tenantConfig,
    tables,
    menuItems, setMenuItems,
    orders,
    staffAccounts,
    currentStaff, setCurrentStaff,
    loyaltyMembers, setLoyaltyMembers,
    kitchenOnboarded, setKitchenOnboarded,
    simulationTableId, setSimulationTableId,
    activeTenantId,
    activeTenantResolved,
  };

  return <Outlet context={contextValue} />;
}
