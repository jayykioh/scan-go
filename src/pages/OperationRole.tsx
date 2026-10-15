import React, { Suspense } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useOperation } from '../layouts/OperationLayout';
import { ArrowLeft, LogIn } from 'lucide-react';
import { lazyRetry } from '../utils/lazyRetry';

const CashierView = lazyRetry(() => import('../components/CashierView'), 'CashierView');
const KitchenView = lazyRetry(() => import('../components/KitchenView'), 'KitchenView');
const CustomerView = lazyRetry(() => import('../components/CustomerView'), 'CustomerView');
const StaffView = lazyRetry(() => import('../components/StaffView'), 'StaffView');

function RoleLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-white" role="status">
      <div className="text-center">
        <span className="mx-auto block size-7 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900" aria-hidden="true" />
        <p className="mt-3 text-xs font-bold text-zinc-900 uppercase tracking-widest">Đang tải...</p>
      </div>
    </div>
  );
}

/**
 * A Tenant-scoped page cannot operate without a resolved Tenant: the callables
 * refuse it and the server error is not something an operator can act on.
 * Customer stays reachable because it runs on the demo data.
 */
function NeedsTenant() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-white p-8 text-center">
      <div>
        <p className="text-sm font-bold text-zinc-900">Cần đăng nhập và chọn cửa hàng để vận hành</p>
        <p className="mt-1 text-xs text-zinc-500">Trang Khách hàng vẫn mở được ở chế độ demo.</p>
      </div>
      <Link
        to="/login"
        className="inline-flex items-center gap-2 border-hard bg-zinc-950 px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-hard"
      >
        <LogIn className="w-4 h-4" /> Đăng nhập
      </Link>
    </div>
  );
}

const PAGES = [
  { id: 'cashier', label: 'Thu Ngân' },
  { id: 'kitchen', label: 'KDS (Bếp)' },
  { id: 'staff', label: 'Nhân viên' },
  { id: 'customer', label: 'Khách hàng' },
];

/** Pages that read Tenant-scoped server data and therefore need a Tenant. */
const TENANT_SCOPED = new Set(['cashier', 'kitchen', 'staff']);

export default function OperationRole() {
  const { role: urlRole } = useParams<{ role: string }>();
  const ctx = useOperation();

  const page = PAGES.some((entry) => entry.id === urlRole) ? urlRole! : 'customer';
  const tenantScoped = TENANT_SCOPED.has(page);
  // Wait for the Tenant read before deciding: a page must not flash "cần đăng
  // nhập" while the identity is still restoring.
  const waitingForTenant = tenantScoped && !ctx.activeTenantResolved;
  const needsTenant = tenantScoped && ctx.activeTenantResolved && !ctx.activeTenantId;

  const renderPage = () => {
    if (waitingForTenant) return <RoleLoading />;
    if (needsTenant) return <NeedsTenant />;
    switch (page) {
      case 'cashier':
        return <CashierView tenantConfig={ctx.tenantConfig} tables={ctx.tables} loyaltyMembers={ctx.loyaltyMembers} tenantId={ctx.activeTenantId ?? undefined} />;
      case 'kitchen':
        return <KitchenView tenantConfig={ctx.tenantConfig} setMenuItems={ctx.setMenuItems} onboardCompleted={ctx.kitchenOnboarded} setOnboardCompleted={ctx.setKitchenOnboarded} tables={ctx.tables} tenantId={ctx.activeTenantId ?? undefined} />;
      case 'staff':
        return <StaffView staffAccounts={ctx.staffAccounts} currentStaff={ctx.currentStaff} setCurrentStaff={ctx.setCurrentStaff} tenantConfig={ctx.tenantConfig} tables={ctx.tables} tenantId={ctx.activeTenantId ?? undefined} deviceId="operation-staff-device" />;
      default:
        return <CustomerView tenantConfig={ctx.tenantConfig} menuItems={ctx.menuItems} orders={ctx.orders} simulationTableId={ctx.simulationTableId} setSimulationTableId={ctx.setSimulationTableId} tables={ctx.tables} />;
    }
  };

  return (
    <div className="h-dvh bg-[#F5F5F7] text-zinc-900 flex flex-col font-sans antialiased animate-fadeIn overflow-hidden">
      <header className="z-20 flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-3 select-none">
        <Link
          to="/operation"
          aria-label="Về danh sách trang vận hành"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-sm transition-transform hover:scale-105"
        >
          <ArrowLeft className="w-5 h-5 text-zinc-600" />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Vận hành</p>
          <p className="truncate text-sm font-bold text-zinc-900">{ctx.tenantConfig.shopName}</p>
        </div>
      </header>

      <main className="flex-1 min-h-0 w-full p-3 sm:p-5 flex justify-center">
        <div
          data-testid="operation-frame"
          className={`flex min-h-0 w-full flex-col overflow-hidden border border-zinc-200 bg-white shadow-sm ${
            page === 'customer' ? 'max-w-[430px]' : 'max-w-5xl'
          }`}
        >
          <Suspense fallback={<RoleLoading />}>{renderPage()}</Suspense>
        </div>
      </main>
    </div>
  );
}
