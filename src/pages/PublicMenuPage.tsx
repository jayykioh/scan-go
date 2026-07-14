import React, { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerView from '../components/CustomerView';
import { usePersistentState } from '../hooks/usePersistentState';
import { LoyaltyMember, MenuItem, Order, TableConfig, TenantConfig } from '../types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS } from '../mockData';

const defaultTenant: TenantConfig = {
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
};

const defaultTables: TableConfig[] = [
  { id: '1', name: 'Bàn 01' },
  { id: '2', name: 'Bàn 02' },
  { id: '3', name: 'Bàn 03' },
];

export default function PublicMenuPage() {
  const { tableId = '1' } = useParams<{ tableId: string }>();
  const [tenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', defaultTenant);
  const [tables] = usePersistentState<TableConfig[]>('scango:tables:v1', defaultTables);
  const [menuItems] = usePersistentState<MenuItem[]>('scango:menu:v1', MOCK_MENU_ITEMS.quan_an);
  const [orders, setOrders] = usePersistentState<Order[]>('scango:orders:v1', [], {
    deserialize: (value: string) => (JSON.parse(value) as Order[]).map(order => ({ ...order, timestamp: new Date(String(order.timestamp)) })),
  });
  const [loyaltyMembers, setLoyaltyMembers] = usePersistentState<LoyaltyMember[]>('scango:loyalty:v1', MOCK_LOYALTY_MEMBERS);

  const resolvedTableId = useMemo(() => {
    if (tables.some(table => table.id === tableId)) return tableId;
    return tables[0]?.id || tableId;
  }, [tableId, tables]);
  const [activeTableId, setActiveTableId] = useState(resolvedTableId);

  return (
    <main className="min-h-dvh bg-[#eef0f4] text-zinc-950 flex justify-center sm:py-6">
      <div className="w-full max-w-[430px] min-h-dvh sm:min-h-[860px] sm:rounded-[44px] overflow-hidden bg-white shadow-2xl border border-white/80">
        {tables.some(table => table.id === tableId) ? (
          <CustomerView
            tenantConfig={tenantConfig}
            menuItems={menuItems}
            orders={orders}
            setOrders={setOrders}
            loyaltyMembers={loyaltyMembers}
            setLoyaltyMembers={setLoyaltyMembers}
            simulationTableId={activeTableId}
            setSimulationTableId={setActiveTableId}
            tables={tables}
            directMenu
          />
        ) : (
          <div className="min-h-dvh flex flex-col items-center justify-center p-8 text-center bg-zinc-50">
            <h1 className="text-3xl font-black tracking-[-0.05em] text-zinc-950">Không tìm thấy bàn</h1>
            <p className="mt-3 text-sm text-zinc-500">Link menu này không còn khả dụng. Vui lòng quét lại QR tại bàn.</p>
            <Link to="/" className="mt-6 rounded-full bg-zinc-950 px-5 py-3 text-sm font-black text-white">Về trang chủ</Link>
          </div>
        )}
      </div>
    </main>
  );
}
