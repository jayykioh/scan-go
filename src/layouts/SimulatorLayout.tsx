import React, { useEffect, useRef, useState } from 'react';
import { Outlet, useOutletContext } from 'react-router-dom';
import { TenantConfig, MenuItem, Order, LoyaltyMember, TableConfig, StaffAccount } from '../types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS, INDUSTRY_TEMPLATES, MOCK_STAFF_ACCOUNTS, MOCK_INGREDIENTS } from '../mockData';
import { usePersistentState } from '../hooks/usePersistentState';
import { Ingredient } from '../types';

export type SimulatorContextType = {
  tenantConfig: TenantConfig;
  setTenantConfig: (val: any) => void;
  tables: TableConfig[];
  setTables: (val: any) => void;
  menuItems: MenuItem[];
  setMenuItems: (val: any) => void;
  orders: Order[];
  setOrders: (val: any) => void;
  ingredients: Ingredient[];
  setIngredients: (val: any) => void;
  staffAccounts: StaffAccount[];
  setStaffAccounts: (val: any) => void;
  currentStaff: StaffAccount | null;
  setCurrentStaff: (val: any) => void;
  loyaltyMembers: LoyaltyMember[];
  setLoyaltyMembers: (val: any) => void;
  ownerOnboarded: boolean;
  setOwnerOnboarded: (val: any) => void;
  soloOnboarded: boolean;
  setSoloOnboarded: (val: any) => void;
  cashierOnboarded: boolean;
  setCashierOnboarded: (val: any) => void;
  kitchenOnboarded: boolean;
  setKitchenOnboarded: (val: any) => void;
  simulationTableId: string;
  setSimulationTableId: (val: string) => void;
  nfcTriggeredAlert: string | null;
  handleOwnerNfcAllocation: (tableId: string) => void;
  triggerAutoOrderSimulation: () => void;
  handleClearAllOrders: () => void;
  handleResetSim: () => void;
};

export function useSimulator() {
  return useOutletContext<SimulatorContextType>();
}

export default function SimulatorLayout() {
  // Global shared state
  const [tenantConfig, setTenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', {
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

  // Active tables configured by owner
  const [tables, setTables] = usePersistentState<TableConfig[]>('scango:tables:v1', [
    { id: '1', name: 'Bàn 01' },
    { id: '2', name: 'Bàn 02' },
    { id: '3', name: 'Bàn 03' },
    { id: '4', name: 'Bàn 04' },
    { id: '5', name: 'Bàn 05' },
    { id: '6', name: 'Bàn 06' },
  ]);

  // Track if each actor has done onboarding/signin
  const [ownerOnboarded, setOwnerOnboarded] = usePersistentState('scango:owner-onboarded:v1', true);
  const [soloOnboarded, setSoloOnboarded] = usePersistentState('scango:solo-onboarded:v1', false);
  const [cashierOnboarded, setCashierOnboarded] = usePersistentState('scango:cashier-onboarded:v1', true);
  const [kitchenOnboarded, setKitchenOnboarded] = usePersistentState('scango:kitchen-onboarded:v1', true);

  // Active Menu items matching the selected industry engine template
  const [menuItems, setMenuItems] = usePersistentState<MenuItem[]>('scango:menu:v1', MOCK_MENU_ITEMS.quan_an);
  const [ingredients, setIngredients] = usePersistentState<Ingredient[]>('scango:ingredients:v1', MOCK_INGREDIENTS);

  // Active orders synced across all actors
  const [orders, setOrders] = usePersistentState<Order[]>('scango:orders:v1', [
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

  const [staffAccounts, setStaffAccounts] = usePersistentState<StaffAccount[]>('scango:staff:v1', MOCK_STAFF_ACCOUNTS, {
    deserialize: (value: string) => {
      const parsed = JSON.parse(value) as unknown[];
      const migrated = parsed
        .map((entry: any): StaffAccount | null => {
          if (entry?.roles && typeof entry.pin === 'string') {
            return {
              id: String(entry.id),
              name: String(entry.name || 'Nhân viên'),
              pin: entry.pin,
              roles: {
                isKitchen: Boolean(entry.roles.isKitchen),
                isWaiter: Boolean(entry.roles.isWaiter),
                isCashier: Boolean(entry.roles.isCashier),
              },
              isActive: entry.isActive !== false,
            };
          }

          if (entry?.role) {
            const role = String(entry.role).toLowerCase();
            return {
              id: String(entry.id || Date.now()),
              name: String(entry.name || 'Nhân viên'),
              pin: '0000',
              roles: {
                isKitchen: role.includes('bếp') || role.includes('đầu'),
                isWaiter: role.includes('phục'),
                isCashier: role.includes('thu') || role.includes('quản'),
              },
              isActive: entry.status !== 'Nghỉ phép',
            };
          }

          return null;
        })
        .filter((entry): entry is StaffAccount => entry !== null);

      return migrated.length > 0 ? migrated : MOCK_STAFF_ACCOUNTS;
    },
  });
  const [currentStaff, setCurrentStaff] = useState<StaffAccount | null>(null);
  const [loyaltyMembers, setLoyaltyMembers] = usePersistentState<LoyaltyMember[]>('scango:loyalty:v1', MOCK_LOYALTY_MEMBERS);

  // Customer dynamic simulator helper values
  const [simulationTableId, setSimulationTableId] = useState<string>('2');
  const [nfcTriggeredAlert, setNfcTriggeredAlert] = useState<string | null>(null);

  const previousIndustry = useRef(tenantConfig.industry);

  // Load a new menu template only when the operator changes industry.
  useEffect(() => {
    if (previousIndustry.current === tenantConfig.industry) return;
    previousIndustry.current = tenantConfig.industry;

    const selectedList = MOCK_MENU_ITEMS[tenantConfig.industry] || MOCK_MENU_ITEMS.quan_an;
    setMenuItems(selectedList);

    // Update payment method based on standard template behavior
    const templateConfig = INDUSTRY_TEMPLATES[tenantConfig.industry];
    if (templateConfig) {
      setTenantConfig((prev: any) => ({
        ...prev,
        paymentMode: templateConfig.default_payment_mode,
      }));
    }
  }, [tenantConfig.industry]);

  // Handle Owner simulated NFC sticker allocation
  const handleOwnerNfcAllocation = (tableId: string) => {
    setNfcTriggeredAlert(tableId);
    setTimeout(() => {
      setNfcTriggeredAlert(null);
    }, 3000);
  };

  // Helper: auto-simulate a mock client order to show real-time synchronization
  const triggerAutoOrderSimulation = () => {
    const randTable = ['1', '2', '3'][Math.floor(Math.random() * 3)];
    
    // Pick 1-2 random menu items
    const selectedMenuPreset = MOCK_MENU_ITEMS[tenantConfig.industry] || MOCK_MENU_ITEMS.quan_an;
    const item1 = selectedMenuPreset[0];
    const item2 = selectedMenuPreset[1];

    const randomOrder: Order = {
      id: `ord_sim_${Date.now()}`,
      tableId: randTable,
      items: [
        { id: `${item1.id}_s1`, menuId: item1.id, name: item1.name, price: item1.price, quantity: 1, selectedModifiers: [] },
        { id: `${item2.id}_s2`, menuId: item2.id, name: item2.name, price: item2.price, quantity: 1, selectedModifiers: [] }
      ],
      total: item1.price + item2.price,
      status: 'pending',
      timestamp: new Date(),
      customerPhone: '0901234567',
      paymentMode: tenantConfig.paymentMode,
    };

    setOrders((prev: any) => [...prev, randomOrder]);
  };

  // Settle all cash orders to clear workflow
  const handleClearAllOrders = () => {
    setOrders([]);
  };

  const handleResetSim = () => {
    setTenantConfig({
      shopName: 'Bún Phở Kinh Kỳ',
      industry: 'quan_an',
      pricingTier: 'Pro',
      paymentMode: 'Pay-Later',
      loyaltyEnabled: true,
      loyaltyRate: 1,
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
    setTables([
      { id: '1', name: 'Bàn 01' },
      { id: '2', name: 'Bàn 02' },
      { id: '3', name: 'Bàn 03' },
      { id: '4', name: 'Bàn 04' },
      { id: '5', name: 'Bàn 05' },
      { id: '6', name: 'Bàn 06' },
    ]);
    setMenuItems(MOCK_MENU_ITEMS.quan_an);
    setOrders([
      {
        id: 'ord_1',
        tableId: '1',
        items: [{ id: 'qa1_x1', menuId: 'qa1', name: 'Phở Bò Tái Lăn Kinh Kỳ', price: 65000, quantity: 1, selectedModifiers: ['Thêm quẩy'] }],
        total: 65000,
        status: 'cooking',
        timestamp: new Date(),
        customerPhone: '0987654321',
        paymentMode: 'Pay-Later',
      }
    ]);
    setIngredients(MOCK_INGREDIENTS);
    setLoyaltyMembers(MOCK_LOYALTY_MEMBERS);
    setStaffAccounts(MOCK_STAFF_ACCOUNTS);
    setCurrentStaff(null);
    setOwnerOnboarded(true);
    setSoloOnboarded(false);
    setCashierOnboarded(true);
    setKitchenOnboarded(true);
    setSimulationTableId('2');
    setNfcTriggeredAlert(null);
  };

  const contextValue: SimulatorContextType = {
    tenantConfig, setTenantConfig,
    tables, setTables,
    menuItems, setMenuItems,
    orders, setOrders,
    ingredients, setIngredients,
    staffAccounts, setStaffAccounts,
    currentStaff, setCurrentStaff,
    loyaltyMembers, setLoyaltyMembers,
    ownerOnboarded, setOwnerOnboarded,
    soloOnboarded, setSoloOnboarded,
    cashierOnboarded, setCashierOnboarded,
    kitchenOnboarded, setKitchenOnboarded,
    simulationTableId, setSimulationTableId,
    nfcTriggeredAlert,
    handleOwnerNfcAllocation,
    triggerAutoOrderSimulation,
    handleClearAllOrders,
    handleResetSim
  };

  return <Outlet context={contextValue} />;
}
