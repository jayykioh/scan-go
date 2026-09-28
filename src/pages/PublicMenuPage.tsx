import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import CustomerView from '../components/CustomerView';
import { usePersistentState } from '../hooks/usePersistentState';
import { LoyaltyMember, MenuItem, Order, TableConfig, TenantConfig } from '../types';
import { MOCK_LOYALTY_MEMBERS, MOCK_MENU_ITEMS } from '../mockData';
import { createOrderingAdapter } from '../data/adapters/ordering.adapter';
import type { PublicMenuItem } from '../../shared/contracts/catalog.contract';

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
  const [publicItems, setPublicItems] = useState<ReadonlyArray<PublicMenuItem>>([]);
  const [publicTableValid, setPublicTableValid] = useState<boolean | null>(null);

  const orderingAdapter = useMemo(() => createOrderingAdapter({
    tables: {
      async resolveTableLink(token) {
        const table = tables.find(candidate => candidate.id === token);
        return table ? { token, tenantId: 'tenant-demo', tableId: table.id, tableName: table.name, active: true } : null;
      },
    },
    catalog: {
      async listPublicMenuItems(tenantId) {
        return menuItems.map(item => ({
          id: item.id,
          tenantId,
          name: item.name,
          description: item.description,
          category: item.category,
          imageUrl: item.image,
          unitPriceVnd: item.price,
          available: item.inStock,
          modifiers: (item.toppings ?? []).map(modifier => ({ id: modifier.name, name: modifier.name, priceDeltaVnd: modifier.price })),
        }));
      },
    },
    commands: {
      async submit(request, validation) {
        const now = new Date().toISOString();
        const table = tables.find(candidate => candidate.id === validation.tableId)!;
        return {
          orderId: `ord_${Date.now()}`,
          tenantId: validation.tenantId,
          tableId: validation.tableId,
          tableName: table.name,
          paymentMode: validation.paymentMode,
          paymentConfirmed: false,
          visibleToKitchen: validation.paymentMode === 'Pay-Later',
          status: 'pending',
          lines: validation.lines,
          totalVnd: validation.totalVnd,
          trackingToken: `tracking:${request.idempotencyKey}`,
          createdAtUtc: now,
          updatedAtUtc: now,
        };
      },
    },
    isOnline: () => navigator.onLine,
    rateLimit: { async allow() { return true; } },
  }), [menuItems, tables]);

  useEffect(() => {
    let active = true;
    orderingAdapter.loadPublicMenu(tableId).then(result => {
      if (!active) return;
      setPublicTableValid(Boolean(result));
      setPublicItems(result?.items ?? []);
    });
    return () => { active = false; };
  }, [orderingAdapter, tableId]);

  const adapterMenuItems: MenuItem[] = publicItems.map(item => ({
    id: item.id,
    name: item.name,
    price: item.unitPriceVnd,
    costPrice: 0,
    category: item.category,
    image: item.imageUrl,
    description: item.description,
    inStock: item.available,
    stockCount: item.available ? 1 : 0,
    toppings: item.modifiers.map(modifier => ({ name: modifier.name, price: modifier.priceDeltaVnd })),
  }));

  return (
    <main className="min-h-dvh bg-[#eef0f4] text-zinc-950 flex justify-center sm:py-6">
      <div className="w-full max-w-[430px] min-h-dvh sm:min-h-[860px] sm:rounded-[44px] overflow-hidden bg-white shadow-2xl border border-white/80">
        {publicTableValid === null ? (
          <div className="min-h-dvh flex items-center justify-center text-sm font-bold text-zinc-500">Đang tải menu…</div>
        ) : publicTableValid ? (
          <CustomerView
            tenantConfig={tenantConfig}
            menuItems={adapterMenuItems}
            orders={orders}
            setOrders={setOrders}
            loyaltyMembers={loyaltyMembers}
            setLoyaltyMembers={setLoyaltyMembers}
            simulationTableId={activeTableId}
            setSimulationTableId={setActiveTableId}
            tables={tables}
            directMenu
            orderingAdapter={orderingAdapter}
            tableToken={tableId}
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
