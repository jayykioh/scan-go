import React, { useEffect, useRef, useState } from 'react';
import {
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
} from 'react-router-dom';
import {
  Nfc,
  LayoutGrid,
  Users,
  Settings,
  LogOut,
  UtensilsCrossed,
  Table2,
  CircleDollarSign,
  CreditCard,
} from 'lucide-react';
import { motion } from 'framer-motion';
import type { TenantSummary } from '@contracts/identity.contract';
import { useAuthSession } from '../hooks/useAuthSession';
import { getBackendMode } from '../services/firebase/client';
import { signOutCurrentUser } from '../data/adapters/auth.adapter';
import {
  bootstrapTenant,
  createActiveTenantContext,
  createTenant,
  listMemberships,
  selectActiveTenant,
  subscribeActiveTenantContext,
  type ActiveTenantContext,
  type ActiveTenantContextHandle,
} from '../data/adapters/tenant.adapter';
import TenantSwitcher from '../components/TenantSwitcher';

export default function DashboardLayout() {
  const navigate = useNavigate();
  const { configured, loading: authLoading, user } = useAuthSession();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [tenantError, setTenantError] = useState<string | null>(null);
  const [activeContext, setActiveContext] =
    useState<ActiveTenantContext | null>(null);
  const activeContextRef = useRef<ActiveTenantContextHandle | null>(null);

  // One bounded listener slot for the active Tenant. Selecting a Tenant
  // replaces the context and disposes the prior listener.
  useEffect(() => {
    const handle = createActiveTenantContext(
      subscribeActiveTenantContext,
      setActiveContext,
    );
    activeContextRef.current = handle;
    return () => {
      handle.dispose();
      activeContextRef.current = null;
    };
  }, []);

  const activeTenantId =
    tenants.find((tenant) => tenant.isActiveTenant)?.tenantId ?? null;

  useEffect(() => {
    const handle = activeContextRef.current;
    if (!handle) return;
    if (!activeTenantId) {
      handle.dispose();
      setActiveContext(null);
      return;
    }
    handle.select(activeTenantId);
  }, [activeTenantId]);

  useEffect(() => {
    if (!configured || !user) return;
    let cancelled = false;
    setTenantLoading(true);
    setTenantError(null);

    (async () => {
      try {
        await bootstrapTenant();
        const result = await listMemberships();
        if (!cancelled) setTenants(result.tenants);
      } catch (error) {
        if (!cancelled) {
          setTenantError(
            error instanceof Error ? error.message : 'Không tải được cửa hàng.',
          );
        }
      } finally {
        if (!cancelled) setTenantLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configured, user]);

  const handleSelectTenant = async (tenantId: string) => {
    setTenantLoading(true);
    setTenantError(null);
    try {
      await selectActiveTenant(tenantId);
      const result = await listMemberships();
      setTenants(result.tenants);
    } catch (error) {
      setTenantError(
        error instanceof Error ? error.message : 'Không đổi được cửa hàng.',
      );
    } finally {
      setTenantLoading(false);
    }
  };

  const handleCreateTenant = async () => {
    const shopName = window.prompt('Tên cửa hàng mới', 'Cửa hàng mới');
    if (!shopName || !shopName.trim()) return;
    setTenantLoading(true);
    setTenantError(null);
    try {
      await createTenant(shopName.trim());
      const result = await listMemberships();
      setTenants(result.tenants);
    } catch (error) {
      setTenantError(
        error instanceof Error ? error.message : 'Không tạo được cửa hàng.',
      );
    } finally {
      setTenantLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (configured) await signOutCurrentUser();
    } catch {
      // Ignore sign-out errors and return to login.
    }
    navigate('/login');
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 font-mono font-bold uppercase tracking-widest text-xs transition-all cursor-pointer text-left border-hard shadow-hard ${
      isActive
        ? 'bg-white text-zinc-900 translate-x-1'
        : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
    }`;

  if (configured && !authLoading && !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex-1 flex min-h-dvh">
      <aside className="w-64 bg-zinc-950 text-white flex flex-col hidden md:flex border-r border-hard relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-noise pointer-events-none" />

        <div className="relative z-10 p-6 mb-4">
          <motion.div
            className="flex items-center gap-3"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.2 },
              },
            }}
          >
            <motion.div
              variants={{
                hidden: { opacity: 0, scale: 0.5, rotate: -90 },
                visible: {
                  opacity: 1,
                  scale: 1,
                  rotate: 0,
                  transition: { type: 'spring', stiffness: 200, damping: 15 },
                },
              }}
              className="w-10 h-10 bg-orange-600 flex items-center justify-center border-hard shadow-hard"
            >
              <Nfc className="w-5 h-5 text-white" />
            </motion.div>
            <motion.span
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: {
                  opacity: 1,
                  x: 0,
                  transition: { duration: 0.5, ease: 'easeOut' },
                },
              }}
              className="text-xl font-bold uppercase font-mono tracking-tighter"
            >
              ScanGo_
            </motion.span>
          </motion.div>
        </div>

        <nav className="relative z-10 flex-1 px-4 space-y-3">
          <NavLink end to="/dashboard" className={navLinkClass}>
            <LayoutGrid className="w-4 h-4" />
            Doanh thu
          </NavLink>
          <NavLink to="/dashboard/manage" className={navLinkClass}>
            <CircleDollarSign className="w-4 h-4" />
            Quản lý quán
          </NavLink>
          <NavLink to="/dashboard/menu" className={navLinkClass}>
            <UtensilsCrossed className="w-4 h-4" />
            Thực đơn
          </NavLink>
          <NavLink to="/dashboard/tables" className={navLinkClass}>
            <Table2 className="w-4 h-4" />
            Sơ đồ Bàn
          </NavLink>
          <NavLink to="/dashboard/staff" className={navLinkClass}>
            <Users className="w-4 h-4" />
            Nhân sự
          </NavLink>
          <NavLink to="/dashboard/subscription" className={navLinkClass}>
            <CreditCard className="w-4 h-4" />
            Gói Dịch Vụ
          </NavLink>
          <NavLink to="/dashboard/settings" className={navLinkClass}>
            <Settings className="w-4 h-4" />
            Cấu hình
          </NavLink>
        </nav>

        {configured && user && (
          <div className="relative z-10 px-4 pb-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest truncate">
                {user.phoneNumber ?? user.uid}
              </p>
              <span
                className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 border ${
                  getBackendMode() === 'local'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-zinc-700 text-zinc-500'
                }`}
              >
                {getBackendMode() === 'local' ? 'local' : 'cloud'}
              </span>
            </div>
            <TenantSwitcher
              tenants={tenants}
              loading={tenantLoading}
              error={tenantError}
              onSelect={handleSelectTenant}
              onCreate={handleCreateTenant}
            />
            {activeContext && (
              <p className="font-mono text-[9px] text-zinc-600 uppercase tracking-widest truncate">
                Bối cảnh: {activeContext.shopName}
              </p>
            )}
          </div>
        )}

        <div className="relative z-10 p-4 border-t border-hard">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full text-zinc-500 hover:text-red-500 font-mono font-bold uppercase tracking-widest text-xs transition-colors cursor-pointer text-left"
          >
            <LogOut className="w-4 h-4" />
            Thoát
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative overflow-y-auto bg-zinc-50">
        <Outlet />
      </main>
    </div>
  );
}
