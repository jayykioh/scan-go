import React from 'react';
import { Store, Check, Plus } from 'lucide-react';
import type { TenantSummary } from '@contracts/identity.contract';

interface TenantSwitcherProps {
  tenants: TenantSummary[];
  loading: boolean;
  error: string | null;
  onSelect: (tenantId: string) => void;
  onCreate: () => void;
}

export default function TenantSwitcher({
  tenants,
  loading,
  error,
  onSelect,
  onCreate,
}: TenantSwitcherProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          Cửa hàng
        </p>
        <button
          type="button"
          onClick={onCreate}
          disabled={loading}
          title="Tạo cửa hàng mới"
          className="text-zinc-500 hover:text-orange-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {loading && (
        <p className="font-mono text-[10px] text-zinc-500 uppercase">
          Đang tải...
        </p>
      )}

      {error && (
        <p className="font-mono text-[10px] text-red-400 uppercase leading-relaxed">
          {error}
        </p>
      )}

      {!loading && !error && tenants.length === 0 && (
        <p className="font-mono text-[10px] text-zinc-500 uppercase">
          Chưa có cửa hàng
        </p>
      )}

      <ul className="space-y-2">
        {tenants.map((tenant) => (
          <li key={tenant.tenantId}>
            <button
              type="button"
              onClick={() => onSelect(tenant.tenantId)}
              className={`w-full flex items-center gap-2 px-3 py-2 border-hard text-left font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer ${
                tenant.isActiveTenant
                  ? 'bg-orange-600 text-white translate-x-0.5'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white'
              }`}
            >
              <Store className="w-3 h-3 shrink-0" />
              <span className="truncate flex-1">{tenant.shopName}</span>
              {tenant.isActiveTenant && <Check className="w-3 h-3 shrink-0" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
