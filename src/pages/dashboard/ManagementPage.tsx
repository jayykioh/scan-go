import React from 'react';
import { BadgeInfo, CalendarDays, CircleDollarSign, Store, TrendingUp, Users, Table2, ReceiptText } from 'lucide-react';
import { usePersistentState } from '../../hooks/usePersistentState';
import { Order, StaffAccount, TableConfig, TenantConfig } from '../../types';

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

const defaultStaff: StaffAccount[] = [];

const money = (value: number) => value.toLocaleString('vi-VN') + 'đ';

const asDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));

export default function ManagementPage() {
  const [tenantConfig] = usePersistentState<TenantConfig>('scango:tenant:v1', defaultTenant);
  const [orders] = usePersistentState<Order[]>('scango:orders:v1', []);
  const [tables] = usePersistentState<TableConfig[]>('scango:tables:v1', defaultTables);
  const [staffAccounts] = usePersistentState<StaffAccount[]>('scango:staff:v1', defaultStaff);

  const paidOrders = orders.filter(order => order.status === 'paid');
  const revenue = paidOrders.reduce((sum, order) => sum + order.total, 0);
  const todayKey = new Date().toDateString();
  const todayRevenue = paidOrders.reduce((sum, order) => {
    return asDate(order.timestamp).toDateString() === todayKey ? sum + order.total : sum;
  }, 0);
  const unpaidOrders = orders.filter(order => order.status !== 'paid').length;
  const averageTicket = paidOrders.length > 0 ? Math.round(revenue / paidOrders.length) : 0;
  const activeTables = tables.length;
  const activeStaff = staffAccounts.filter(staff => staff.isActive).length;

  const revenueByTable = paidOrders.reduce<Record<string, number>>((acc, order) => {
    acc[order.tableId] = (acc[order.tableId] || 0) + order.total;
    return acc;
  }, {});

  const topTables = Object.entries(revenueByTable)
    .map(([tableId, total]) => ({
      tableId,
      total,
      name: tables.find(table => table.id === tableId)?.name || `Bàn ${tableId}`,
    }))
    .sort((left, right) => right.total - left.total)
    .slice(0, 3);

  const shopFacts = [
    { label: 'Tên quán', value: tenantConfig.shopName },
    { label: 'Loại hình', value: tenantConfig.industry === 'quan_an' ? 'Quán ăn / Phở' : tenantConfig.industry === 'quan_cafe' ? 'Quán cà phê / trà sữa' : tenantConfig.industry === 'nha_hang' ? 'Nhà hàng / quán nhậu' : tenantConfig.industry },
    { label: 'Gói dịch vụ', value: tenantConfig.pricingTier },
    { label: 'Thanh toán', value: tenantConfig.paymentMode === 'Pay-First' ? 'Trả trước' : 'Trả sau' },
    { label: 'Bật loyalty', value: tenantConfig.loyaltyEnabled ? `Có - ${tenantConfig.loyaltyRate} điểm / 10.000đ` : 'Không' },
    { label: 'Trạng thái onboarding', value: tenantConfig.onboardingStep >= 4 ? 'Hoàn tất' : `Bước ${tenantConfig.onboardingStep}/4` },
  ];

  return (
    <div className="p-6 md:p-12 w-full max-w-7xl mx-auto animate-fadeIn space-y-8">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-none border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-orange-700">
            <CircleDollarSign className="w-3.5 h-3.5" />
            Quản lý doanh thu & thông tin quán
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-950 uppercase tracking-tighter leading-none">
            Theo dõi tiền vào quán, cấu hình quán, và trạng thái vận hành.
          </h1>
          <p className="text-sm md:text-base text-zinc-500 max-w-xl">
            Trang này gom các chỉ số quan trọng nhất cho chủ quán: doanh thu đã thu, đơn chờ xử lý, số bàn đang dùng, và cấu hình quán hiện tại.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-40 rounded-none border-hard bg-white p-4 shadow-hard">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Doanh thu hôm nay</p>
            <p className="mt-2 text-2xl font-black text-zinc-950">{money(todayRevenue)}</p>
          </div>
          <div className="min-w-40 rounded-none border-hard bg-zinc-950 p-4 shadow-hard text-white">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Tổng đã thu</p>
            <p className="mt-2 text-2xl font-black text-orange-400">{money(revenue)}</p>
          </div>
        </div>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Tổng doanh thu', value: money(revenue), icon: CircleDollarSign },
          { label: 'Đơn chờ xử lý', value: unpaidOrders.toString(), icon: ReceiptText },
          { label: 'Giá trị đơn trung bình', value: money(averageTicket), icon: TrendingUp },
          { label: 'Bàn / Nhân sự active', value: `${activeTables} / ${activeStaff}`, icon: Users },
        ].map(item => (
          <article key={item.label} className="rounded-none border-hard bg-white p-5 shadow-hard flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-none bg-orange-50 text-orange-600 border border-orange-100">
              <item.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{item.label}</p>
              <p className="mt-2 text-2xl font-black text-zinc-950 leading-none">{item.value}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <article className="rounded-none border-hard bg-white p-6 md:p-8 shadow-hard space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-none bg-zinc-950 text-white">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-zinc-950">Thông tin quán</h2>
              <p className="text-sm text-zinc-500">Thông tin vận hành đang được dùng trong simulator và dashboard.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {shopFacts.map(fact => (
              <div key={fact.label} className="rounded-none border border-zinc-100 bg-zinc-50 p-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">{fact.label}</p>
                <p className="mt-2 text-sm font-bold text-zinc-950 leading-snug">{fact.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-none border border-orange-100 bg-orange-50/60 p-5">
            <div className="flex items-center gap-2 text-orange-700 font-mono text-[10px] font-bold uppercase tracking-[0.18em]">
              <BadgeInfo className="w-4 h-4" />
              Gợi ý nhanh
            </div>
            <p className="mt-3 text-sm text-zinc-700 leading-relaxed">
              Nếu muốn theo dõi doanh thu chi tiết hơn, có thể nối thêm biểu đồ theo ngày, theo ca, hoặc tách doanh thu theo từng bàn ngay trong trang này.
            </p>
          </div>
        </article>

        <article className="rounded-none border-hard bg-zinc-950 p-6 md:p-8 shadow-hard text-white space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-none bg-orange-600 text-white">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight text-white">Bảng theo dõi nhanh</h2>
              <p className="text-sm text-zinc-400">Các bàn mang lại doanh thu cao nhất trong dữ liệu hiện tại.</p>
            </div>
          </div>

          <div className="space-y-3">
            {topTables.length === 0 ? (
              <div className="rounded-none border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                Chưa có đơn đã thanh toán để thống kê theo bàn.
              </div>
            ) : (
              topTables.map((table, index) => (
                <div key={table.tableId} className="rounded-none border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-400">Top {index + 1}</p>
                    <h3 className="mt-1 text-lg font-black text-white">{table.name}</h3>
                  </div>
                  <p className="text-lg font-black text-orange-400">{money(table.total)}</p>
                </div>
              ))
            )}
          </div>

          <div className="rounded-none border border-white/10 bg-white/5 p-5 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-[0.18em] text-zinc-400">
              <Table2 className="w-4 h-4" />
              Tình trạng quán
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-none bg-black/20 p-3">
                <p className="text-zinc-400 text-[10px] font-mono font-bold uppercase tracking-widest">Số bàn</p>
                <p className="mt-1 text-xl font-black">{tables.length}</p>
              </div>
              <div className="rounded-none bg-black/20 p-3">
                <p className="text-zinc-400 text-[10px] font-mono font-bold uppercase tracking-widest">Đơn đã thu</p>
                <p className="mt-1 text-xl font-black">{paidOrders.length}</p>
              </div>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}