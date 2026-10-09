import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogOut, Mail, ShieldCheck } from 'lucide-react';
import type { TenantSummary } from '@contracts/identity.contract';
import { useAuthSession } from '../hooks/useAuthSession';
import { useToast } from '../contexts/ToastContext';
import {
  isFirebaseConfigured,
  mapAuthError,
  signInWithEmail,
  signOutCurrentUser,
  type StaffSessionView,
} from '../data/adapters/auth.adapter';
import {
  listMemberships,
  selectActiveTenant,
} from '../data/adapters/tenant.adapter';
import StaffView from '../components/StaffView';
import type { TenantConfig } from '../types';

const STAFF_TENANT_CONFIG: TenantConfig = {
  shopName: '',
  industry: 'quan_an',
  pricingTier: 'Pro',
  paymentMode: 'Pay-Later',
  loyaltyEnabled: false,
  loyaltyRate: 1,
  onboardingStep: 4,
};

/**
 * Staff entry point (REQ-AUTH-002, REQ-AUTH-003). A Staff member signs in with
 * the Firebase Auth account the Owner created, then verifies the tenant-scoped
 * PIN. Staff never use the Owner bootstrap, so no Tenant is provisioned here.
 */
export default function StaffLoginPage() {
  const { configured, loading, user } = useAuthSession();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [memberships, setMemberships] = useState<TenantSummary[]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentStaff, setCurrentStaff] = useState<StaffSessionView | null>(null);

  // Keep the latest toast in a ref so a new toast never restarts the Tenant
  // resolution effect and remounts the operating view.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  useEffect(() => {
    if (!user) {
      setMemberships([]);
      setTenantId(null);
      setCurrentStaff(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    void (async () => {
      try {
        const result = await listMemberships();
        const staffTenants = result.tenants.filter(
          (tenant) => tenant.membershipType === 'staff' && tenant.isActive,
        );
        if (cancelled) return;
        setMemberships(staffTenants);
        if (staffTenants.length > 0) {
          await selectActiveTenant(staffTenants[0].tenantId);
          if (!cancelled) setTenantId(staffTenants[0].tenantId);
        }
      } catch (error) {
        if (!cancelled) toastRef.current.error(mapAuthError(error));
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (error) {
      toast.error(mapAuthError(error));
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOutCurrentUser();
    } catch {
      // Ignore sign-out errors.
    }
    setEmail('');
    setPassword('');
  };

  const activeTenant = memberships.find((tenant) => tenant.tenantId === tenantId);

  if (!configured) {
    return (
      <SimpleNotice
        title="Nhân viên"
        message="Firebase chưa được cấu hình. Thêm VITE_FIREBASE_* vào .env.local."
      />
    );
  }

  if (loading || resolving) {
    return (
      <SimpleNotice
        title="Nhân viên"
        message="Đang tải..."
        loading
      />
    );
  }

  if (!user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-md bg-white border-hard shadow-[8px_8px_0_0_#09090b] p-8">
          <div className="mb-8">
            <div className="w-12 h-12 bg-zinc-950 flex items-center justify-center border-hard mb-4">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900 uppercase tracking-tighter">
              Đăng nhập nhân viên
            </h1>
            <p className="font-mono text-xs text-zinc-500 mt-2">
              Dùng tài khoản chủ quán đã tạo cho bạn.
            </p>
          </div>
          <form onSubmit={handleSignIn} className="space-y-5">
            <div className="space-y-2">
              <label className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={signingIn}
                className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:border-orange-600 transition-colors rounded-none font-mono text-sm disabled:opacity-50"
                placeholder="nhanvien@quan.vn"
              />
            </div>
            <div className="space-y-2">
              <label className="font-mono text-[10px] font-bold uppercase text-zinc-900 tracking-widest">
                Mật khẩu
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={signingIn}
                className="w-full px-4 py-3 bg-white border-hard focus:outline-none focus:border-orange-600 transition-colors rounded-none font-mono text-sm disabled:opacity-50"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={signingIn}
              className="w-full bg-zinc-950 text-white font-bold py-4 border-hard shadow-hard hover:-translate-y-1 active:translate-y-1 active:shadow-none transition-all cursor-pointer flex items-center justify-center gap-2 uppercase tracking-widest text-xs disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              {signingIn ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </form>
          <p className="font-mono text-xs text-zinc-500 mt-8">
            Là chủ quán?{' '}
            <Link
              to="/login"
              className="font-bold text-zinc-900 hover:text-orange-600 underline underline-offset-4"
            >
              Vào trang quản lý
            </Link>
          </p>
        </div>
      </div>
    );
  }

  if (memberships.length === 0 || !tenantId || !activeTenant) {
    return (
      <SimpleNotice
        title="Chưa phải nhân viên"
        message={`Tài khoản ${user.email ?? user.uid} chưa được gán vào cửa hàng nào. Liên hệ chủ quán.`}
        action={
          <button
            onClick={() => void handleSignOut()}
            className="mt-4 bg-zinc-950 text-white font-bold py-3 px-6 border-hard shadow-hard uppercase tracking-widest text-xs"
          >
            Đăng xuất
          </button>
        }
      />
    );
  }

  return (
    <div className="min-h-dvh flex flex-col bg-zinc-100">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-950 text-white">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            Nhân viên
          </p>
          <p className="text-sm font-bold truncate">
            {activeTenant.shopName || activeTenant.tenantId}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {memberships.length > 1 && (
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="bg-zinc-800 text-white text-xs font-bold px-2 py-1.5 border border-zinc-700"
            >
              {memberships.map((tenant) => (
                <option key={tenant.tenantId} value={tenant.tenantId}>
                  {tenant.shopName || tenant.tenantId}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => void handleSignOut()}
            className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest text-zinc-300 hover:text-red-400"
          >
            <LogOut className="w-4 h-4" />
            Thoát
          </button>
        </div>
      </header>
      <main className="flex-1 flex items-stretch justify-center p-4 lg:p-6">
        <div className="flex w-full max-w-md flex-col bg-white border-hard shadow-hard min-h-[32rem] lg:max-w-none">
          <StaffView
            staffAccounts={[]}
            currentStaff={currentStaff}
            setCurrentStaff={setCurrentStaff}
            tenantConfig={{ ...STAFF_TENANT_CONFIG, shopName: activeTenant.shopName }}
            tables={[]}
            tenantId={tenantId}
            deviceId="staff-browser"
            fallbackName={user.displayName ?? user.email ?? undefined}
          />
        </div>
      </main>
    </div>
  );
}

function SimpleNotice({
  title,
  message,
  loading,
  action,
}: {
  title: string;
  message: string;
  loading?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-md bg-white border-hard shadow-hard p-8 text-center space-y-3">
        {loading && <Loader2 className="w-6 h-6 animate-spin mx-auto text-orange-600" />}
        <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-950">
          {title}
        </h1>
        <p className="text-sm text-zinc-600">{message}</p>
        {action}
      </div>
    </div>
  );
}
