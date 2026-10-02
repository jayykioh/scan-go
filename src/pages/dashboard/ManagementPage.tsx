import { useCallback, useEffect, useState } from 'react';
import {
  BadgeInfo,
  Building2,
  History,
  Loader2,
  Phone,
  RefreshCw,
  ShieldCheck,
  Store,
  Archive,
  ArchiveRestore,
} from 'lucide-react';
import type {
  AdminAuditListResult,
  AdminCustomerPhoneListResult,
  AdminTenantSummary,
} from '@contracts/admin.contract';
import type { AuditEvent } from '@contracts/audit.contract';
import {
  changeAdminTenant,
  hasAdminClaim,
  listAdminAudit,
  listAdminCustomerPhones,
  listAdminTenants,
  openAdminTenant,
  phoneDisplayValue,
} from '../../data/adapters/admin.adapter';

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Thao tác ADMIN thất bại.';
}

/**
 * ADMIN console. The server verifies the platform claim on every call, and the
 * audit panel shows the audit event each ADMIN change records. Reads write no
 * audit (REQ-ADM-001, NFR-PRIV-001). This screen is UI-only gating; the server
 * stays authoritative.
 */
export default function ManagementPage() {
  const [checkingClaim, setCheckingClaim] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenants, setTenants] = useState<AdminTenantSummary[]>([]);
  const [selected, setSelected] = useState<AdminTenantSummary | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [phones, setPhones] = useState<AdminCustomerPhoneListResult | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const allowed = await hasAdminClaim();
      if (cancelled) return;
      setIsAdmin(allowed);
      setCheckingClaim(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listAdminTenants();
      setTenants(result.tenants);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) {
      void loadTenants();
    }
  }, [isAdmin, loadTenants]);

  const openTenant = async (tenantId: string) => {
    setLoading(true);
    setError(null);
    try {
      const opened = await openAdminTenant(tenantId);
      setSelected(opened.tenant);
      const [auditResult, phoneResult] = await Promise.all([
        listAdminAudit(tenantId),
        listAdminCustomerPhones(tenantId),
      ]);
      setAudit(auditResult.events);
      setPhones(phoneResult);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  const changeTenant = async (
    tenant: AdminTenantSummary,
    action: 'archive' | 'restore',
  ) => {
    const reason = window.prompt(
      action === 'archive' ? 'Lý do lưu trữ' : 'Lý do khôi phục',
      action === 'archive' ? 'ADMIN archive' : 'ADMIN restore',
    );
    if (!reason || !reason.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await changeAdminTenant(tenant.tenantId, action, reason.trim());
      setSelected(result.tenant);
      setTenants((current) =>
        current.map((entry) =>
          entry.tenantId === result.tenant.tenantId ? result.tenant : entry,
        ),
      );
      const auditResult = await listAdminAudit(result.tenant.tenantId);
      setAudit(auditResult.events);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  };

  if (checkingClaim) {
    return (
      <div className="p-12 flex items-center gap-3 text-zinc-500 font-mono text-xs uppercase tracking-widest">
        <Loader2 className="w-4 h-4 animate-spin" />
        Đang kiểm tra quyền ADMIN
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-6 md:p-12 max-w-2xl mx-auto">
        <div className="border-hard bg-white p-8 shadow-hard space-y-3">
          <ShieldCheck className="w-8 h-8 text-red-600" />
          <h1 className="text-2xl font-black uppercase tracking-tight text-zinc-950">
            Khu vực ADMIN
          </h1>
          <p className="text-sm text-zinc-600">
            Tài khoản này không có quyền ADMIN. Mọi truy cập đều bị máy chủ từ chối.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-12 w-full max-w-7xl mx-auto animate-fadeIn space-y-8">
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        <div className="space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-orange-700">
            <ShieldCheck className="w-3.5 h-3.5" />
            ADMIN có xác minh máy chủ
          </div>
          <h1 className="text-3xl md:text-5xl font-extrabold text-zinc-950 uppercase tracking-tighter leading-none">
            Mở mọi cửa hàng, mọi thay đổi ADMIN đều được ghi audit.
          </h1>
          <p className="text-sm md:text-base text-zinc-500 max-w-xl">
            Chỉ thay đổi ADMIN (lưu trữ, khôi phục) tạo sự kiện audit. Thao tác đọc
            không ghi audit. ADMIN không ghi trực tiếp vào dữ liệu nghiệp vụ.
          </p>
        </div>
        <button
          onClick={() => void loadTenants()}
          className="inline-flex items-center gap-2 border-hard bg-white px-4 py-3 font-mono text-xs font-bold uppercase tracking-widest shadow-hard hover:bg-zinc-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Tải lại
        </button>
      </header>

      {error && (
        <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
        <article className="border-hard bg-white p-6 shadow-hard space-y-4">
          <div className="flex items-center gap-3">
            <Store className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-black uppercase tracking-tight text-zinc-950">
              Cửa hàng ({tenants.length})
            </h2>
          </div>
          <div className="space-y-3 max-h-[32rem] overflow-y-auto">
            {tenants.length === 0 && (
              <p className="text-sm text-zinc-500">Chưa có cửa hàng.</p>
            )}
            {tenants.map((tenant) => (
              <div
                key={tenant.tenantId}
                className={`border p-4 space-y-2 ${
                  selected?.tenantId === tenant.tenantId
                    ? 'border-orange-400 bg-orange-50/50'
                    : 'border-zinc-100 bg-zinc-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-zinc-950">
                      {tenant.shopName}
                    </p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {tenant.tenantId} · {tenant.pricingTier} · {tenant.state}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                    {tenant.memberCount} thành viên
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => void openTenant(tenant.tenantId)}
                    className="inline-flex items-center gap-1 border border-zinc-300 bg-white px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-zinc-100"
                  >
                    <Building2 className="w-3.5 h-3.5" /> Mở
                  </button>
                  {tenant.state === 'archived' ? (
                    <button
                      onClick={() => void changeTenant(tenant, 'restore')}
                      className="inline-flex items-center gap-1 border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-700"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" /> Khôi phục
                    </button>
                  ) : (
                    <button
                      onClick={() => void changeTenant(tenant, 'archive')}
                      className="inline-flex items-center gap-1 border border-red-300 bg-red-50 px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest text-red-700"
                    >
                      <Archive className="w-3.5 h-3.5" /> Lưu trữ
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="border-hard bg-zinc-950 p-6 shadow-hard text-white space-y-4">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-black uppercase tracking-tight">
              Audit gần đây
            </h2>
          </div>
          {!selected ? (
            <p className="text-sm text-zinc-400">
              Mở một cửa hàng để xem audit và số điện thoại khách.
            </p>
          ) : (
            <div className="space-y-2 max-h-[32rem] overflow-y-auto">
              {audit.length === 0 && (
                <p className="text-sm text-zinc-400">Chưa có sự kiện audit.</p>
              )}
              {audit.map((event) => (
                <div
                  key={event.eventId}
                  className="border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-xs font-bold text-orange-400">
                    {event.action}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    {event.actorType} · {event.role ?? '—'} · {event.createdAt}
                  </p>
                  {event.reason && (
                    <p className="mt-1 text-xs text-zinc-300">
                      Lý do: {event.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </article>
      </section>

      {selected && (
        <section className="border-hard bg-white p-6 shadow-hard space-y-4">
          <div className="flex items-center gap-3">
            <Phone className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-black uppercase tracking-tight text-zinc-950">
              Số điện thoại khách (ADMIN)
            </h2>
          </div>
          <p className="text-xs text-zinc-500 inline-flex items-center gap-2">
            <BadgeInfo className="w-4 h-4" />
            Truy cập ADMIN không hạn chế theo quyền hệ thống.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(phones?.records ?? []).length === 0 && (
              <p className="text-sm text-zinc-500">Không có bản ghi khách.</p>
            )}
            {(phones?.records ?? []).map((record) => (
              <div
                key={record.memberId}
                className="border border-zinc-100 bg-zinc-50 p-3"
              >
                <p className="text-sm font-bold text-zinc-950">
                  {record.displayName ?? record.memberId}
                </p>
                <p className="font-mono text-xs text-zinc-600">
                  {phoneDisplayValue(record)}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
